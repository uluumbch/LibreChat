import { Router } from 'express';
import crypto from 'node:crypto';
import { z } from 'zod';
import type { Conversation as ApiConversation, CursorPage } from '@hermes/shared';
import { prisma } from '../db';
import { config } from '../config';
import { asyncHandler, badRequest, notFound } from '../errors';
import { getUserId, requireAuth } from '../auth/middleware';
import { gatewayPool } from '../hermes/pool';
import { requireParam } from '../http';
import { toJsonInput } from '../json';
import { toApiConversation } from '../conversations/mapper';

const listQuery = z.object({
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

const createBody = z.object({
  title: z.string().max(200).optional(),
  model: z.string().max(120).optional(),
});

const updateBody = z.object({ title: z.string().min(1).max(200) });

export const conversationsRouter: Router = Router();
conversationsRouter.use(requireAuth);

conversationsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const userId = getUserId(req);
    const { cursor, limit = 30 } = listQuery.parse(req.query);
    const rows = await prisma.conversation.findMany({
      where: { userId },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const body: CursorPage<ApiConversation> = {
      items: page.map(toApiConversation),
      nextCursor: hasMore ? page[page.length - 1]!.id : null,
    };
    res.json(body);
  }),
);

conversationsRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const userId = getUserId(req);
    const input = createBody.parse(req.body);
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { model: true } });
    const model = input.model ?? user?.model ?? config.defaultModel;
    if (!gatewayPool.forModel(model)) {
      throw badRequest(`Unknown model: ${model}`, 'unknown_model');
    }
    const conversation = await prisma.conversation.create({
      data: { userId, title: input.title?.trim() || 'New Chat', model },
    });
    res.status(201).json(toApiConversation(conversation));
  }),
);

conversationsRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const conversation = await prisma.conversation.findFirst({
      where: { id: requireParam(req, 'id'), userId: getUserId(req) },
    });
    if (!conversation) {
      throw notFound('Conversation not found');
    }
    res.json(toApiConversation(conversation));
  }),
);

conversationsRouter.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const userId = getUserId(req);
    const input = updateBody.parse(req.body);
    const existing = await prisma.conversation.findFirst({
      where: { id: requireParam(req, 'id'), userId },
      select: { id: true },
    });
    if (!existing) {
      throw notFound('Conversation not found');
    }
    const conversation = await prisma.conversation.update({
      where: { id: existing.id },
      data: { title: input.title.trim() },
    });
    res.json(toApiConversation(conversation));
  }),
);

conversationsRouter.post(
  '/:id/fork',
  asyncHandler(async (req, res) => {
    const userId = getUserId(req);
    const source = await prisma.conversation.findFirst({
      where: { id: requireParam(req, 'id'), userId },
    });
    if (!source) {
      throw notFound('Conversation not found');
    }
    if (!source.hermesSessionId || !source.hermesGatewayId) {
      throw badRequest('Nothing to branch yet — send a message first', 'nothing_to_branch');
    }
    const pooled = gatewayPool.byGatewayId(source.hermesGatewayId);
    if (!pooled) {
      throw badRequest('Source gateway unavailable', 'gateway_unavailable');
    }

    // Fork the Hermes session so the branch carries the transcript forward (works for both the
    // Sessions and Runs engines). A unique title sidesteps Hermes' globally-unique-title rule.
    const forked = await pooled.client.forkSession(source.hermesSessionId, {
      title: `branch-${crypto.randomBytes(4).toString('hex')}`,
    });

    const sourceMessages = await prisma.message.findMany({
      where: { conversationId: source.id },
      orderBy: { createdAt: 'asc' },
    });
    const idMap = new Map(sourceMessages.map((m) => [m.id, crypto.randomUUID()]));

    const branch = await prisma.$transaction(async (tx) => {
      const created = await tx.conversation.create({
        data: {
          userId,
          title: `${source.title} (branch)`.slice(0, 200),
          model: source.model,
          hermesSessionId: forked.id,
          hermesGatewayId: source.hermesGatewayId,
        },
      });
      if (sourceMessages.length > 0) {
        await tx.message.createMany({
          data: sourceMessages.map((m) => ({
            id: idMap.get(m.id)!,
            conversationId: created.id,
            userId,
            role: m.role,
            text: m.text,
            content: toJsonInput(m.content),
            parentMessageId: m.parentMessageId ? (idMap.get(m.parentMessageId) ?? null) : null,
            finishReason: m.finishReason,
            error: m.error,
            createdAt: m.createdAt,
          })),
        });
      }
      return created;
    });

    res.status(201).json(toApiConversation(branch));
  }),
);

conversationsRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const userId = getUserId(req);
    const existing = await prisma.conversation.findFirst({
      where: { id: requireParam(req, 'id'), userId },
      select: { id: true },
    });
    if (!existing) {
      throw notFound('Conversation not found');
    }
    await prisma.conversation.delete({ where: { id: existing.id } });
    res.status(204).end();
  }),
);
