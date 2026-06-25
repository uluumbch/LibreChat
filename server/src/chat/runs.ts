import crypto from 'node:crypto';
import type { Response } from 'express';
import { ChatStreamEventType } from '@hermes/shared';
import { prisma } from '../db';
import { logger } from '../logger';
import { HttpError, notFound, serviceBusy } from '../errors';
import { gatewayPool } from '../hermes/pool';
import { sessionKeyFor } from '../users/provision';
import { composioTurnFields } from '../composio/client';
import { llmTurnFields } from '../llm/turnFields';
import { toApiMessage } from '../messages/mapper';
import { SseWriter } from './sse';
import { parseSse } from './parse';
import { RunsAccumulator } from './translateRuns';
import {
  buildConversationHistory,
  deriveTitle,
  ensureSession,
  loadTurnContext,
  persistAssistantMessage,
  persistUserMessage,
} from './turn';

export interface RunsChatTurnParams {
  userId: string;
  conversationId: string;
  text: string;
  res: Response;
  /** When set (expanded prompt command), sent to the gateway instead of `text`. */
  gatewayText?: string;
  /** Per-turn toolset/skill allowlists (skill-scope command) — replace user defaults. */
  overrideToolsets?: string[];
  overrideSkills?: string[];
}

interface ActiveRun {
  gatewayId: string;
  userId: string;
}

/** In-flight runs, so the approval route can resolve a pending gate by runId. */
const activeRuns = new Map<string, ActiveRun>();

/**
 * Agentic-engine chat turn (opt-in): runs the turn through Hermes' Runs API, which surfaces
 * approval gates and reasoning. The events SSE stays open across an approval pause — the client
 * resolves the gate via respondToApproval(), Hermes resumes, and more events flow on the same stream.
 */
export async function runChatTurnViaRuns(params: RunsChatTurnParams): Promise<void> {
  const { userId, conversationId, text, res, gatewayText, overrideToolsets, overrideSkills } = params;

  const ctx = await loadTurnContext(userId, conversationId);
  const sessionId = await ensureSession(ctx);
  // The Runs API takes prior turns as conversation_history — build it before persisting this turn's
  // user message so the current input isn't duplicated into history.
  const history = await buildConversationHistory(ctx.conversation.id);
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

  const controller = new AbortController();
  res.on('close', () => controller.abort());

  const accumulator = new RunsAccumulator();
  let finishReason = 'stop';
  let errored = false;
  let runId: string | null = null;

  const llmFields = await llmTurnFields(ctx.conversation.model ?? ctx.user.model);

  const release = await ctx.pooled.acquire();
  try {
    const created = await ctx.pooled.client.createRun(
      {
        input: gatewayText ?? text,
        instructions: ctx.user.instructions ?? undefined,
        session_id: sessionId,
        conversation_history: history,
        // Built-in pool model by default; an admin-managed model overrides via `...llmFields`
        // (which also carries provider/api_key/base_url for the per-turn credential injection).
        model: ctx.pooled.model,
        allowed_toolsets: overrideToolsets ?? (ctx.user.enabledToolsets.length > 0 ? ctx.user.enabledToolsets : undefined),
        allowed_skills: overrideSkills ?? (ctx.user.enabledSkills.length > 0 ? ctx.user.enabledSkills : undefined),
        ...composioTurnFields(ctx.user, userId),
        ...llmFields,
      },
      { sessionKey: sessionKeyFor(userId) },
    );
    runId = created.run_id;
    activeRuns.set(runId, { gatewayId: ctx.pooled.id, userId });

    const response = await ctx.pooled.client.runEvents(runId, { signal: controller.signal });
    if (!response.ok || !response.body) {
      if (response.status === 429) {
        throw serviceBusy();
      }
      throw new HttpError(502, `Hermes run events failed: ${response.status}`, 'hermes_upstream');
    }
    for await (const raw of parseSse(response.body)) {
      for (const event of accumulator.handle(raw)) {
        writer.send(event);
      }
      if (accumulator.done) {
        break;
      }
    }
    ctx.pooled.markHealthy();
    finishReason = accumulator.finishReason;
    errored = accumulator.errored;
  } catch (err) {
    if (controller.signal.aborted) {
      finishReason = 'aborted';
      if (runId) {
        void ctx.pooled.client.stopRun(runId).catch(() => undefined);
      }
    } else {
      errored = true;
      if (err instanceof HttpError && err.code === 'hermes_unreachable') {
        ctx.pooled.markUnhealthy();
      }
      logger.error({ err }, 'agentic chat turn failed');
      writer.send({
        type: ChatStreamEventType.Error,
        message: err instanceof HttpError ? err.message : 'Chat failed',
        code: err instanceof HttpError ? err.code : undefined,
      });
    }
  } finally {
    if (runId) {
      activeRuns.delete(runId);
    }
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

/** Resolve a pending approval gate for a run the requesting user owns. */
export async function respondToApproval(
  userId: string,
  runId: string,
  choice: string,
): Promise<void> {
  const active = activeRuns.get(runId);
  if (!active || active.userId !== userId) {
    throw notFound('Run not found or no longer pending');
  }
  const pooled = gatewayPool.byGatewayId(active.gatewayId);
  if (!pooled) {
    throw new HttpError(502, 'Gateway unavailable', 'hermes_unreachable');
  }
  await pooled.client.respondApproval(runId, choice);
}
