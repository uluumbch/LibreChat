import { Router } from 'express';
import { z } from 'zod';
import type { CursorPage, Message as ApiMessage } from '@hermes/shared';
import { prisma } from '../db';
import { asyncHandler, notFound } from '../errors';
import { getUserId, requireAuth } from '../auth/middleware';
import { requireParam } from '../http';
import { toApiMessage } from '../messages/mapper';

const listQuery = z.object({
  before: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

export const messagesRouter: Router = Router();
messagesRouter.use(requireAuth);

/** History for a conversation, returned oldest→newest; `nextCursor` pages further back. */
messagesRouter.get(
  '/:conversationId/messages',
  asyncHandler(async (req, res) => {
    const userId = getUserId(req);
    const conversationId = requireParam(req, 'conversationId');
    const { before, limit = 50 } = listQuery.parse(req.query);

    const conversation = await prisma.conversation.findFirst({
      where: { id: conversationId, userId },
      select: { id: true },
    });
    if (!conversation) {
      throw notFound('Conversation not found');
    }

    const rows = await prisma.message.findMany({
      where: { conversationId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(before ? { cursor: { id: before }, skip: 1 } : {}),
    });
    const hasMore = rows.length > limit;
    const pageDesc = hasMore ? rows.slice(0, limit) : rows;
    const body: CursorPage<ApiMessage> = {
      items: pageDesc.slice().reverse().map(toApiMessage),
      nextCursor: hasMore ? pageDesc[pageDesc.length - 1]!.id : null,
    };
    res.json(body);
  }),
);
