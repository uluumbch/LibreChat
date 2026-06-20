import crypto from 'node:crypto';
import type { Response } from 'express';
import type { ChatImageInput } from '@hermes/shared';
import { ChatStreamEventType, HermesStreamEvent } from '@hermes/shared';
import { prisma } from '../db';
import { logger } from '../logger';
import { HttpError } from '../errors';
import { sessionKeyFor } from '../users/provision';
import { toApiMessage } from '../messages/mapper';
import { SseWriter } from './sse';
import { parseSse } from './parse';
import { TurnAccumulator } from './translate';
import {
  deriveTitle,
  ensureSession,
  loadTurnContext,
  persistAssistantMessage,
  persistUserMessage,
} from './turn';

export interface RunChatTurnParams {
  userId: string;
  conversationId: string;
  text: string;
  images?: ChatImageInput[];
  res: Response;
}

/**
 * Sessions-engine chat turn (M1 default): streams Hermes' session `/chat/stream` events, translates
 * them into our normalized SSE protocol, and persists the assembled assistant message.
 */
export async function runChatTurn(params: RunChatTurnParams): Promise<void> {
  const { userId, conversationId, text, res } = params;

  const ctx = await loadTurnContext(userId, conversationId);
  const sessionId = await ensureSession(ctx);
  const { userMessage, isFirstTurn } = await persistUserMessage(ctx, text);

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
      { message: text, instructions: ctx.user.instructions ?? undefined },
      { sessionKey: sessionKeyFor(userId), signal: controller.signal },
    );
    if (!response.ok || !response.body) {
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
  } catch (err) {
    if (controller.signal.aborted) {
      finishReason = 'aborted';
    } else {
      errored = true;
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
