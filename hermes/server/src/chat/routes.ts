import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, notFound } from '../errors';
import { getUserId, requireAuth } from '../auth/middleware';
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
    const base = {
      userId: getUserId(req),
      conversationId: input.conversationId,
      text: input.text,
      res,
    };
    // The Runs API can't accept image input, so image turns always use the Sessions engine.
    const hasImages = (input.images?.length ?? 0) > 0;
    if (input.agentic && !hasImages) {
      await runChatTurnViaRuns(base);
    } else {
      await runChatTurn({ ...base, images: input.images });
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
