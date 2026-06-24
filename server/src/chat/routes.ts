import { Router } from 'express';
import { z } from 'zod';
import { ChatStreamEventType } from '@hermes/shared';
import { prisma } from '../db';
import { config } from '../config';
import { asyncHandler, notFound } from '../errors';
import { getUserId, requireAuth } from '../auth/middleware';
import { userQuota } from '../users/quota';
import { SseWriter } from './sse';
import { runChatTurn } from './stream';
import { respondToApproval, runChatTurnViaRuns } from './runs';

const imageInputSchema = z.object({
  url: z
    .string()
    .max(8_000_000)
    .refine(
      (value) => /^https?:\/\//i.test(value) || /^data:image\//i.test(value),
      'Image URLs must be http(s) or data:image/…',
    ),
  detail: z.enum(['low', 'high', 'auto']).optional(),
});

const sendSchema = z
  .object({
    conversationId: z.string().uuid(),
    text: z.string().max(100_000),
    images: z.array(imageInputSchema).max(4).optional(),
    agentic: z.boolean().optional(),
  })
  .refine((body) => body.text.trim().length > 0 || (body.images?.length ?? 0) > 0, {
    message: 'Provide a message or at least one image',
    path: ['text'],
  });

const approvalSchema = z.object({
  choice: z.enum(['once', 'session', 'always', 'deny']),
});

export const chatRouter: Router = Router();

chatRouter.post(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const input = sendSchema.parse(req.body);
    const userId = getUserId(req);

    const account = await prisma.user.findUnique({
      where: { id: userId },
      select: { tier: true, creditsPurchased: true, creditsUsed: true },
    });

    // Out of credits: block before doing any work and nudge the user to top up.
    // Sent over the SSE channel (soft error) so the UI shows a calm CTA, not a hard failure.
    if (account && account.creditsPurchased - account.creditsUsed <= 0) {
      const writer = new SseWriter(res);
      writer.send({
        type: ChatStreamEventType.Error,
        message: "You're out of credits — ask your workspace admin to top up to keep chatting.",
        code: 'insufficient_credits',
      });
      writer.close();
      return;
    }

    // Per-user quota protects the shared pool; dedicated (paid) users get a higher allowance.
    // Denials go over the SSE channel so the UI shows them calmly.
    const policy = account?.tier === 'dedicated' ? config.quota.dedicated : config.quota.free;
    const lease = userQuota.tryAcquire(userId, policy);
    if (!lease.ok) {
      const writer = new SseWriter(res);
      writer.send({ type: ChatStreamEventType.Error, message: lease.message, code: lease.code });
      writer.close();
      return;
    }

    const base = { userId, conversationId: input.conversationId, text: input.text, res };
    // The Runs API can't accept image input, so image turns always use the Sessions engine.
    const hasImages = (input.images?.length ?? 0) > 0;
    try {
      if (input.agentic && !hasImages) {
        await runChatTurnViaRuns(base);
      } else {
        await runChatTurn({ ...base, images: input.images });
      }
    } finally {
      lease.release();
    }
  }),
);

/** Resolve a pending approval gate for an in-flight agentic run. */
chatRouter.post(
  '/runs/:runId/approval',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { runId } = req.params;
    if (!runId) {
      throw notFound('Run not found');
    }
    const { choice } = approvalSchema.parse(req.body);
    await respondToApproval(getUserId(req), runId, choice);
    res.json({ ok: true });
  }),
);
