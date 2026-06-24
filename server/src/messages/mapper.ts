import type { Message as ApiMessage, MessageContentPart, MessageRole } from '@hermes/shared';
import type { Message as DbMessage } from '@prisma/client';
import { fromJson } from '../json';

export function toApiMessage(message: DbMessage): ApiMessage {
  return {
    id: message.id,
    conversationId: message.conversationId,
    userId: message.userId,
    role: message.role as MessageRole,
    text: message.text,
    content: fromJson<MessageContentPart[]>(message.content),
    parentMessageId: message.parentMessageId ?? null,
    finishReason: message.finishReason ?? null,
    error: message.error,
    createdAt: message.createdAt.toISOString(),
  };
}
