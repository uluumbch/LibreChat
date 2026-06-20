import crypto from 'node:crypto';
import type { Response } from 'express';
import { ChatStreamEventType } from '@hermes/shared';
import { prisma } from '../db';
import { logger } from '../logger';
import { HttpError, notFound } from '../errors';
import { gatewayPool } from '../hermes/pool';
import { sessionKeyFor } from '../users/provision';
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
  const { userId, conversationId, text, res } = params;

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

  const release = await ctx.pooled.acquire();
  try {
    const created = await ctx.pooled.client.createRun(
      {
        input: text,
        instructions: ctx.user.instructions ?? undefined,
        session_id: sessionId,
        conversation_history: history,
        model: ctx.pooled.model,
      },
      { sessionKey: sessionKeyFor(userId) },
    );
    runId = created.run_id;
    activeRuns.set(runId, { gatewayId: ctx.pooled.id, userId });

    const response = await ctx.pooled.client.runEvents(runId, { signal: controller.signal });
    if (!response.ok || !response.body) {
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
