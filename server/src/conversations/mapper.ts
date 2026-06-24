import type { Conversation as ApiConversation } from '@hermes/shared';
import type { Conversation as DbConversation } from '@prisma/client';

export function toApiConversation(conversation: DbConversation): ApiConversation {
  return {
    id: conversation.id,
    title: conversation.title,
    userId: conversation.userId,
    hermesSessionId: conversation.hermesSessionId ?? null,
    hermesGatewayId: conversation.hermesGatewayId ?? null,
    model: conversation.model ?? null,
    createdAt: conversation.createdAt.toISOString(),
    updatedAt: conversation.updatedAt.toISOString(),
  };
}
