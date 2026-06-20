import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, notFound } from '../errors';
import { getUserId, requireAuth } from '../auth/middleware';
import { runChatTurn } from './stream';
import { respondToApproval, runChatTurnViaRuns } from './runs';

const sendSchema = z.object({
  conversationId: z.string().uuid(),
  text: z.string().min(1).max(100_000),
  images: z
    .array(
      z.object({
        url: z.string().url(),
        detail: z.enum(['low', 'high', 'auto']).optional(),
      }),
    )
    .max(8)
    .optional(),
  agentic: z.boolean().optional(),
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
    if (input.agentic) {
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
