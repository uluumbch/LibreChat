import { Router } from 'express';
import crypto from 'node:crypto';
import { z } from 'zod';
import type {
  Conversation as ApiConversation,
  ConversationUsage,
  CursorPage,
  SearchResultItem,
} from '@hermes/shared';
import { prisma } from '../db';
import { config } from '../config';
import { asyncHandler, badRequest, notFound } from '../errors';
import { getUserId, requireAuth } from '../auth/middleware';
import { gatewayPool } from '../hermes/pool';
import { assertModelSelectable } from '../llm/catalog';
import { requireParam } from '../http';
import { toJsonInput } from '../json';
import { aggregateUsage } from '../billing/usage';
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

const searchQuery = z.object({ q: z.string().min(1).max(200) });

/** A short excerpt centered on the first match of `term` in `text`. */
function snippet(text: string, term: string): string {
  const idx = text.toLowerCase().indexOf(term.toLowerCase());
  if (idx < 0) {
    return text.slice(0, 120);
  }
  const start = Math.max(0, idx - 40);
  const end = Math.min(text.length, idx + term.length + 60);
  return `${start > 0 ? '…' : ''}${text.slice(start, end).trim()}${end < text.length ? '…' : ''}`;
}

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
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { model: true, allowedModels: true },
    });
    const model = input.model ?? user?.model ?? config.defaultModel;
    // A built-in pool model OR an admin-managed first-party model the user has been granted is valid;
    // `hasModel` alone would (wrongly) reject every granted first-party model since none are pooled.
    await assertModelSelectable(model, user?.allowedModels ?? []);
    const conversation = await prisma.conversation.create({
      data: { userId, title: input.title?.trim() || 'New Chat', model },
    });
    res.status(201).json(toApiConversation(conversation));
  }),
);

// Must precede GET /:id so "search" isn't captured as a conversation id.
conversationsRouter.get(
  '/search',
  asyncHandler(async (req, res) => {
    const userId = getUserId(req);
    const term = searchQuery.parse(req.query).q.trim();
    if (term.length === 0) {
      res.json({ items: [] });
      return;
    }
    const messageMatches = await prisma.message.findMany({
      where: { userId, text: { contains: term, mode: 'insensitive' } },
      orderBy: { createdAt: 'desc' },
      select: { conversationId: true, text: true },
      take: 100,
    });
    const snippetByConvo = new Map<string, string>();
    for (const message of messageMatches) {
      if (!snippetByConvo.has(message.conversationId)) {
        snippetByConvo.set(message.conversationId, snippet(message.text, term));
      }
    }
    const titleMatches = await prisma.conversation.findMany({
      where: { userId, title: { contains: term, mode: 'insensitive' } },
      select: { id: true },
      take: 30,
    });
    const ids = new Set<string>([...snippetByConvo.keys(), ...titleMatches.map((c) => c.id)]);
    if (ids.size === 0) {
      res.json({ items: [] });
      return;
    }
    const conversations = await prisma.conversation.findMany({
      where: { userId, id: { in: [...ids] } },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      take: 30,
    });
    const items: SearchResultItem[] = conversations.map((conversation) => ({
      conversation: toApiConversation(conversation),
      snippet: snippetByConvo.get(conversation.id),
    }));
    res.json({ items });
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

conversationsRouter.get(
  '/:id/usage',
  asyncHandler(async (req, res) => {
    const userId = getUserId(req);
    const conversation = await prisma.conversation.findFirst({
      where: { id: requireParam(req, 'id'), userId },
    });
    if (!conversation) {
      throw notFound('Conversation not found');
    }

    // Durable totals from our persisted message rows — survives Hermes' idle-session sweeps.
    const totals = await aggregateUsage({ conversationId: conversation.id });
    const usage: ConversationUsage = {
      messageCount: totals.messageCount,
      inputTokens: totals.inputTokens || undefined,
      outputTokens: totals.outputTokens || undefined,
      totalTokens: totals.totalTokens || undefined,
      creditsUsed: totals.creditsUsed,
    };

    // Best-effort overlay from the live session for fields we don't persist (tools, reasoning, cost).
    if (conversation.hermesSessionId && conversation.hermesGatewayId) {
      const pooled = gatewayPool.byGatewayId(conversation.hermesGatewayId);
      const session = pooled
        ? await pooled.client.getSession(conversation.hermesSessionId).catch(() => null)
        : null;
      if (session) {
        usage.toolCallCount = session.tool_call_count;
        usage.apiCallCount = session.api_call_count;
        usage.reasoningTokens = session.reasoning_tokens;
        usage.costUsd = session.actual_cost_usd ?? session.estimated_cost_usd;
      }
    }

    res.json(usage);
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
