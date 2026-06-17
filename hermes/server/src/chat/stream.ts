import crypto from 'node:crypto';
import type { Response } from 'express';
import type { ChatImageInput, MessageContentPart } from '@hermes/shared';
import { ChatStreamEventType, ContentPartType, HermesStreamEvent } from '@hermes/shared';
import { prisma } from '../db';
import { logger } from '../logger';
import { HttpError, notFound, unauthorized } from '../errors';
import { gatewayPool } from '../hermes/pool';
import { sessionKeyFor } from '../users/provision';
import { toJsonInput } from '../json';
import { toApiMessage } from '../messages/mapper';
import { SseWriter } from './sse';
import { parseSse } from './parse';
import { TurnAccumulator } from './translate';

export interface RunChatTurnParams {
  userId: string;
  conversationId: string;
  text: string;
  images?: ChatImageInput[];
  res: Response;
}

function deriveTitle(text: string): string {
  const firstLine = text.trim().split('\n', 1)[0] ?? '';
  const compact = firstLine.replace(/\s+/g, ' ').trim();
  if (compact.length <= 48) {
    return compact || 'New Chat';
  }
  return `${compact.slice(0, 47)}…`;
}

/**
 * Drives a single chat turn end-to-end: ensures the conversation's Hermes session exists, persists
 * the user message, streams the assistant response while translating Hermes events into our
 * normalized SSE protocol, and persists the assembled assistant message.
 */
export async function runChatTurn(params: RunChatTurnParams): Promise<void> {
  const { userId, conversationId, text, res } = params;

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

  const pooled =
    (conversation.hermesGatewayId && gatewayPool.byGatewayId(conversation.hermesGatewayId)) ||
    gatewayPool.resolve(conversation.model ?? user.model);

  // Ensure a backing Hermes session.
  let sessionId = conversation.hermesSessionId;
  if (!sessionId) {
    const session = await pooled.client.createSession({
      title: conversation.title,
      model: pooled.model,
      system_prompt: user.instructions ?? undefined,
    });
    sessionId = session.id;
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { hermesSessionId: sessionId, hermesGatewayId: pooled.id, model: pooled.model },
    });
  }

  // Persist the user message and thread it after the latest message.
  const lastMessage = await prisma.message.findFirst({
    where: { conversationId: conversation.id },
    orderBy: { createdAt: 'desc' },
    select: { id: true },
  });
  const userContent: MessageContentPart[] = [{ type: ContentPartType.Text, text }];
  const userMessage = await prisma.message.create({
    data: {
      id: crypto.randomUUID(),
      conversationId: conversation.id,
      userId,
      role: 'user',
      text,
      content: toJsonInput(userContent),
      parentMessageId: lastMessage?.id ?? null,
    },
  });

  const assistantId = crypto.randomUUID();
  const writer = new SseWriter(res);
  writer.send({
    type: ChatStreamEventType.Created,
    conversationId: conversation.id,
    userMessageId: userMessage.id,
    assistantMessageId: assistantId,
  });

  // Auto-title the conversation on its first turn.
  if (!lastMessage && conversation.title === 'New Chat') {
    const title = deriveTitle(text);
    await prisma.conversation.update({ where: { id: conversation.id }, data: { title } });
    writer.send({ type: ChatStreamEventType.Title, title });
  }

  const controller = new AbortController();
  res.on('close', () => controller.abort());

  const accumulator = new TurnAccumulator();
  let finishReason = 'stop';
  let errored = false;

  const release = await pooled.acquire();
  try {
    const response = await pooled.client.chatStream(
      sessionId,
      { message: text, instructions: user.instructions ?? undefined },
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

  const assistantMessage = await prisma.message.create({
    data: {
      id: assistantId,
      conversationId: conversation.id,
      userId,
      role: 'assistant',
      text: accumulator.finalText(),
      content: toJsonInput(accumulator.contentParts()),
      parentMessageId: userMessage.id,
      finishReason,
      error: errored,
    },
  });
  // Bump the conversation's updatedAt so it sorts to the top of the list.
  await prisma.conversation.update({
    where: { id: conversation.id },
    data: { hermesSessionId: sessionId },
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
