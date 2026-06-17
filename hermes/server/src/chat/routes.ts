import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../errors';
import { getUserId, requireAuth } from '../auth/middleware';
import { runChatTurn } from './stream';

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
});

export const chatRouter: Router = Router();

chatRouter.post(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const input = sendSchema.parse(req.body);
    await runChatTurn({
      userId: getUserId(req),
      conversationId: input.conversationId,
      text: input.text,
      images: input.images,
      res,
    });
  }),
);
