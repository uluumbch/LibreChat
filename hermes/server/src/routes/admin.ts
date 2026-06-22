import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { asyncHandler, badRequest, notFound } from '../errors';
import { requireAdmin, requireAuth } from '../auth/middleware';
import { gatewayPool } from '../hermes/pool';
import { toApiUser } from '../users/profile';
import { requireParam } from '../http';

const tierBody = z.object({
  tier: z.enum(['free', 'dedicated']),
  /** Reserve a specific pool gateway for this user (dedicated tier only). */
  dedicatedGatewayId: z.string().min(1).nullable().optional(),
});

export const adminRouter: Router = Router();
adminRouter.use(requireAuth, requireAdmin);

/**
 * Grant or revoke a user's service tier — the operator seam for the paid upgrade until billing
 * exists. Setting `dedicated` (optionally pinned to a reserved gateway) raises their quota and
 * routes their new conversations to that gateway; `free` clears any binding.
 */
adminRouter.patch(
  '/users/:id/tier',
  asyncHandler(async (req, res) => {
    const id = requireParam(req, 'id');
    const input = tierBody.parse(req.body);
    if (input.dedicatedGatewayId && !gatewayPool.byGatewayId(input.dedicatedGatewayId)) {
      throw badRequest(`Unknown gateway: ${input.dedicatedGatewayId}`, 'unknown_gateway');
    }
    const target = await prisma.user.findUnique({ where: { id } });
    if (!target) {
      throw notFound('User not found');
    }
    const updated = await prisma.user.update({
      where: { id },
      data: {
        tier: input.tier,
        dedicatedGatewayId: input.tier === 'dedicated' ? input.dedicatedGatewayId ?? null : null,
      },
    });
    res.json(toApiUser(updated));
  }),
);
