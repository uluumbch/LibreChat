import crypto from 'node:crypto';
import type { Response } from 'express';
import type { ChatImageInput, MessageContentPart } from '@hermes/shared';
import { ChatStreamEventType, ContentPartType, HermesStreamEvent } from '@hermes/shared';
import { prisma } from '../db';
import { logger } from '../logger';
import { HttpError, serviceBusy } from '../errors';
import { sessionKeyFor } from '../users/provision';
import { composioTurnFields } from '../composio/client';
import { toApiMessage } from '../messages/mapper';
import { toJsonInput } from '../json';
import { SseWriter } from './sse';
import { parseSse } from './parse';
import { TurnAccumulator } from './translate';
import {
  deriveTitle,
  ensureSession,
  loadTurnContext,
  persistAssistantMessage,
  persistUserMessage,
  toHermesMessage,
} from './turn';

export interface RunChatTurnParams {
  userId: string;
  conversationId: string;
  text: string;
  images?: ChatImageInput[];
  res: Response;
  /** When set (e.g. an expanded prompt command), sent to the gateway instead of `text`; the
   *  persisted user message still shows the typed `text`. */
  gatewayText?: string;
  /** Per-turn toolset/skill allowlists (e.g. a skill-scope command) — replace the user defaults. */
  overrideToolsets?: string[];
  overrideSkills?: string[];
}

/**
 * Sessions-engine chat turn (M1 default): streams Hermes' session `/chat/stream` events, translates
 * them into our normalized SSE protocol, and persists the assembled assistant message.
 */
export async function runChatTurn(params: RunChatTurnParams): Promise<void> {
  const { userId, conversationId, text, images, res, gatewayText, overrideToolsets, overrideSkills } =
    params;

  const ctx = await loadTurnContext(userId, conversationId);
  const sessionId = await ensureSession(ctx);
  const { userMessage, isFirstTurn } = await persistUserMessage(ctx, text, images);

  const assistantId = crypto.randomUUID();
  const writer = new SseWriter(res);
  writer.send({
    type: ChatStreamEventType.Created,
    conversationId: ctx.conversation.id,
    userMessageId: userMessage.id,
    assistantMessageId: assistantId,
  });

  // Auto-title the conversation on its first turn.
  if (isFirstTurn && ctx.conversation.title === 'New Chat') {
    const title = deriveTitle(text);
    await prisma.conversation.update({ where: { id: ctx.conversation.id }, data: { title } });
    writer.send({ type: ChatStreamEventType.Title, title });
  }

  const controller = new AbortController();
  res.on('close', () => controller.abort());

  const accumulator = new TurnAccumulator();
  let finishReason = 'stop';
  let errored = false;

  const release = await ctx.pooled.acquire();
  try {
    const response = await ctx.pooled.client.chatStream(
      sessionId,
      {
        message: toHermesMessage(gatewayText ?? text, images),
        instructions: ctx.user.instructions ?? undefined,
        allowed_toolsets: overrideToolsets ?? (ctx.user.enabledToolsets.length > 0 ? ctx.user.enabledToolsets : undefined),
        allowed_skills: overrideSkills ?? (ctx.user.enabledSkills.length > 0 ? ctx.user.enabledSkills : undefined),
        ...composioTurnFields(ctx.user, userId),
      },
      { sessionKey: sessionKeyFor(userId), signal: controller.signal },
    );
    if (!response.ok || !response.body) {
      if (response.status === 429) {
        throw serviceBusy();
      }
      throw new HttpError(502, `Hermes chat failed: ${response.status}`, 'hermes_upstream');
    }
    for await (const raw of parseSse(response.body)) {
      for (const event of accumulator.handle(raw)) {
        writer.send(event);
      }
      if (raw.event === HermesStreamEvent.Done) {
        break;
      }
    }
    ctx.pooled.markHealthy();
  } catch (err) {
    if (controller.signal.aborted) {
      finishReason = 'aborted';
    } else {
      errored = true;
      if (err instanceof HttpError && err.code === 'hermes_unreachable') {
        ctx.pooled.markUnhealthy();
      }
      logger.error({ err }, 'chat turn failed');
      writer.send({
        type: ChatStreamEventType.Error,
        message: err instanceof HttpError ? err.message : 'Chat failed',
        code: err instanceof HttpError ? err.code : undefined,
      });
    }
  } finally {
    release();
  }

  const assistantMessage = await persistAssistantMessage({
    ctx,
    assistantId,
    userMessageId: userMessage.id,
    sessionId,
    text: accumulator.finalText(),
    content: accumulator.contentParts(),
    finishReason,
    errored,
    usage: accumulator.usage,
  });

  if (!errored) {
    writer.send({
      type: ChatStreamEventType.Final,
      message: toApiMessage(assistantMessage),
      usage: accumulator.usage,
    });
  }
  writer.close();
}

export interface ServerActionTurnParams {
  userId: string;
  conversationId: string;
  /** The text the user typed (e.g. `/credits`), persisted as the user message. */
  text: string;
  /** The canned reply to stream back, persisted as the assistant message. */
  replyText: string;
  res: Response;
}

/**
 * Run a `server_action` slash-command turn: persist the user message + a canned assistant reply
 * and stream it as a normal chat turn — no gateway/LLM call, no credits, no Hermes session.
 */
export async function runServerActionTurn(params: ServerActionTurnParams): Promise<void> {
  const { userId, conversationId, text, replyText, res } = params;

  const ctx = await loadTurnContext(userId, conversationId);
  const { userMessage, isFirstTurn } = await persistUserMessage(ctx, text);

  const assistantId = crypto.randomUUID();
  const writer = new SseWriter(res);
  writer.send({
    type: ChatStreamEventType.Created,
    conversationId: ctx.conversation.id,
    userMessageId: userMessage.id,
    assistantMessageId: assistantId,
  });

  if (isFirstTurn && ctx.conversation.title === 'New Chat') {
    const title = deriveTitle(text);
    await prisma.conversation.update({ where: { id: ctx.conversation.id }, data: { title } });
    writer.send({ type: ChatStreamEventType.Title, title });
  }

  const content: MessageContentPart[] = [{ type: ContentPartType.Text, text: replyText }];
  const assistantMessage = await prisma.message.create({
    data: {
      id: assistantId,
      conversationId: ctx.conversation.id,
      userId: ctx.user.id,
      role: 'assistant',
      text: replyText,
      content: toJsonInput(content),
      parentMessageId: userMessage.id,
      finishReason: 'stop',
      error: false,
    },
  });
  await prisma.conversation.update({
    where: { id: ctx.conversation.id },
    data: { updatedAt: new Date() },
  });

  writer.send({ type: ChatStreamEventType.Delta, text: replyText });
  writer.send({ type: ChatStreamEventType.Final, message: toApiMessage(assistantMessage) });
  writer.close();
}
