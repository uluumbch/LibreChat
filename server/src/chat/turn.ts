import crypto from 'node:crypto';
import type {
  ChatImageInput,
  HermesContentPart,
  MessageContentPart,
  NormalizedUsage,
} from '@hermes/shared';
import { ContentPartType } from '@hermes/shared';
import type { GatewayPool, PooledGateway } from '../hermes/pool';
import { prisma } from '../db';
import { config } from '../config';
import { notFound, unauthorized } from '../errors';
import { gatewayPool } from '../hermes/pool';
import { toJsonInput } from '../json';
import { creditsForUsage, tokensUsed } from '../billing/meter';

/** Shared turn helpers used by both chat engines (Sessions stream + agentic Runs). */

/**
 * Choose the gateway for a turn: an existing conversation stays pinned (Hermes sessions are
 * gateway-local); otherwise a dedicated (paid) user routes to their reserved gateway when set, and
 * everyone else — or a stale binding — falls back to the least-loaded shared gateway for the model.
 */
export function selectGateway(
  pool: GatewayPool,
  conversation: { hermesGatewayId: string | null; model: string | null },
  user: { tier: string; dedicatedGatewayId: string | null; model: string | null },
): PooledGateway {
  const pinned = conversation.hermesGatewayId
    ? pool.byGatewayId(conversation.hermesGatewayId)
    : undefined;
  const dedicated =
    user.tier === 'dedicated' && user.dedicatedGatewayId
      ? pool.byGatewayId(user.dedicatedGatewayId)
      : undefined;
  if (pinned ?? dedicated) {
    return (pinned ?? dedicated)!;
  }
  // A built-in pool model routes by model; an admin-managed model (not served by any pooled
  // gateway) runs on any least-loaded healthy gateway — its credentials are injected per turn.
  const model = conversation.model ?? user.model;
  return model && !pool.hasModel(model) ? pool.resolveAny() : pool.resolve(model);
}

export function deriveTitle(text: string): string {
  const firstLine = text.trim().split('\n', 1)[0] ?? '';
  const compact = firstLine.replace(/\s+/g, ' ').trim();
  if (compact.length <= 48) {
    return compact || 'New Chat';
  }
  return `${compact.slice(0, 47)}…`;
}

/** Resolve + authorize the user and conversation, and pick the pool gateway for this turn. */
export async function loadTurnContext(userId: string, conversationId: string) {
  const [user, conversation] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId } }),
    prisma.conversation.findFirst({ where: { id: conversationId, userId } }),
  ]);
  if (!user) {
    throw unauthorized();
  }
  if (!conversation) {
    throw notFound('Conversation not found');
  }
  const pooled = selectGateway(gatewayPool, conversation, user);
  return { user, conversation, pooled };
}

export type TurnContext = Awaited<ReturnType<typeof loadTurnContext>>;

/** Ensure the conversation has a backing Hermes session; returns its id. */
export async function ensureSession(ctx: TurnContext): Promise<string> {
  if (ctx.conversation.hermesSessionId) {
    return ctx.conversation.hermesSessionId;
  }
  // No title: Hermes' SessionDB enforces globally-unique session titles, so our
  // default "New Chat" would collide across conversations (400 invalid_title).
  const session = await ctx.pooled.client.createSession({
    model: ctx.pooled.model,
    system_prompt: ctx.user.instructions ?? undefined,
  });
  const selectedModel = ctx.conversation.model ?? ctx.user.model;
  await prisma.conversation.update({
    where: { id: ctx.conversation.id },
    data: { hermesSessionId: session.id, hermesGatewayId: ctx.pooled.id, model: selectedModel },
  });
  return session.id;
}

/** Build the Hermes chat `message` field: a plain prompt, or multimodal parts when images are present. */
export function toHermesMessage(
  text: string,
  images?: ChatImageInput[],
): string | HermesContentPart[] {
  if (!images || images.length === 0) {
    return text;
  }
  const parts: HermesContentPart[] = [];
  if (text) {
    parts.push({ type: 'text', text });
  }
  for (const image of images) {
    parts.push({ type: 'image_url', image_url: { url: image.url, detail: image.detail } });
  }
  return parts;
}

/** Persist the user's message (text + any inline images), threaded after the latest message. */
export async function persistUserMessage(ctx: TurnContext, text: string, images?: ChatImageInput[]) {
  const lastMessage = await prisma.message.findFirst({
    where: { conversationId: ctx.conversation.id },
    orderBy: { createdAt: 'desc' },
    select: { id: true },
  });
  const content: MessageContentPart[] = [];
  if (text) {
    content.push({ type: ContentPartType.Text, text });
  }
  if (images) {
    for (const image of images) {
      content.push({ type: ContentPartType.Image, url: image.url });
    }
  }
  const userMessage = await prisma.message.create({
    data: {
      id: crypto.randomUUID(),
      conversationId: ctx.conversation.id,
      userId: ctx.user.id,
      role: 'user',
      text,
      content: toJsonInput(content),
      parentMessageId: lastMessage?.id ?? null,
    },
  });
  return { userMessage, isFirstTurn: !lastMessage };
}

/** Prior turns as Hermes `conversation_history` (the Runs engine doesn't auto-load from the session). */
export async function buildConversationHistory(
  conversationId: string,
): Promise<Array<{ role: string; content: string }>> {
  const messages = await prisma.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: 'asc' },
    select: { role: true, text: true },
  });
  return messages
    .filter((m) => m.text.length > 0 && (m.role === 'user' || m.role === 'assistant'))
    .map((m) => ({ role: m.role, content: m.text }));
}

/**
 * Persist the assembled assistant message and bump the conversation's updatedAt. When the turn
 * succeeded and carries usage, also meter it: stamp the per-turn token/credit columns on the message
 * and decrement the user's credit balance — atomically, so usage history and balances never drift.
 */
export async function persistAssistantMessage(params: {
  ctx: TurnContext;
  assistantId: string;
  userMessageId: string;
  sessionId: string;
  text: string;
  content: MessageContentPart[];
  finishReason: string;
  errored: boolean;
  usage?: NormalizedUsage;
  model?: string | null;
}) {
  const {
    ctx,
    assistantId,
    userMessageId,
    sessionId,
    text,
    content,
    finishReason,
    errored,
    usage,
    model,
  } = params;

  const meter =
    !errored && usage && tokensUsed(usage) > 0
      ? {
          inputTokens: usage.inputTokens ?? null,
          outputTokens: usage.outputTokens ?? null,
          totalTokens: usage.totalTokens ?? tokensUsed(usage),
          creditsCharged: creditsForUsage(usage, config.credits.perThousandTokens),
        }
      : null;

  const [assistantMessage] = await prisma.$transaction([
    prisma.message.create({
      data: {
        id: assistantId,
        conversationId: ctx.conversation.id,
        userId: ctx.user.id,
        role: 'assistant',
        text,
        content: toJsonInput(content),
        parentMessageId: userMessageId,
        finishReason,
        error: errored,
        model: model ?? null,
        ...(meter ?? {}),
      },
    }),
    prisma.conversation.update({
      where: { id: ctx.conversation.id },
      data: { hermesSessionId: sessionId },
    }),
    ...(meter && meter.creditsCharged > 0
      ? [
          prisma.user.update({
            where: { id: ctx.user.id },
            data: { creditsUsed: { increment: meter.creditsCharged } },
          }),
        ]
      : []),
  ]);
  return assistantMessage;
}
