import { Router } from 'express';
import type { UserSlashCommand, UserSlashCommandsResponse } from '@hermes/shared';
import { prisma } from '../db';
import { asyncHandler, unauthorized } from '../errors';
import { getUserId, requireAuth } from '../auth/middleware';
import { commandsForUser, getEnabledCommands } from '../commands/catalog';

export const commandsRouter: Router = Router();
commandsRouter.use(requireAuth);

/**
 * GET /api/commands — the curated slash commands available to the signed-in user, for the
 * composer autocomplete. Only our commands (never Hermes internals); templates stay server-side.
 */
commandsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({
      where: { id: getUserId(req) },
      select: { enabledCommands: true },
    });
    if (!user) throw unauthorized();

    const enabled = await getEnabledCommands();
    const items: UserSlashCommand[] = commandsForUser(enabled, user.enabledCommands).map((c) => ({
      name: c.name,
      description: c.description,
      type: c.type,
    }));
    const body: UserSlashCommandsResponse = { items };
    res.json(body);
  }),
);
