import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { asyncHandler, unauthorized } from '../errors';
import { getUserId, requireAuth } from '../auth/middleware';
import { assertModelSelectable } from '../llm/catalog';
import { toApiUser } from '../users/profile';

const updateBody = z.object({
  model: z.string().max(120).optional(),
  instructions: z.string().max(8000).nullable().optional(),
  memoryEnabled: z.boolean().optional(),
  enabledToolsets: z.array(z.string().max(80)).max(64).optional(),
  enabledSkills: z.array(z.string().max(80)).max(64).optional(),
});

export const profileRouter: Router = Router();
profileRouter.use(requireAuth);

profileRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({ where: { id: getUserId(req) } });
    if (!user) {
      throw unauthorized();
    }
    res.json(toApiUser(user));
  }),
);

profileRouter.patch(
  '/',
  asyncHandler(async (req, res) => {
    const input = updateBody.parse(req.body);
    if (input.model) {
      const current = await prisma.user.findUnique({
        where: { id: getUserId(req) },
        select: { allowedModels: true },
      });
      await assertModelSelectable(input.model, current?.allowedModels ?? []);
    }
    const user = await prisma.user.update({
      where: { id: getUserId(req) },
      data: {
        ...(input.model !== undefined ? { model: input.model } : {}),
        ...(input.instructions !== undefined ? { instructions: input.instructions } : {}),
        ...(input.memoryEnabled !== undefined ? { memoryEnabled: input.memoryEnabled } : {}),
        ...(input.enabledToolsets !== undefined ? { enabledToolsets: input.enabledToolsets } : {}),
        ...(input.enabledSkills !== undefined ? { enabledSkills: input.enabledSkills } : {}),
      },
    });
    res.json(toApiUser(user));
  }),
);
