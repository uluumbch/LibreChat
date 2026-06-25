/**
 * The curated slash commands enabled product-wide, managed by the admin
 * (admin panel → Slash commands). A row with `enabled = true` is available to
 * every user; per-user access is further narrowed by User.enabledCommands
 * (RESTRICT-ONLY: empty = inherit all enabled; non-empty = allowlist by name).
 */
import type { SlashCommand } from '@prisma/client';
import type { SlashCommandType } from '@hermes/shared';
import { prisma } from '../db';

export type CommandRow = Omit<SlashCommand, 'type'> & { type: SlashCommandType };

/** All globally-enabled commands (admin-curated), ordered for display. */
export async function getEnabledCommands(): Promise<CommandRow[]> {
  const rows = await prisma.slashCommand.findMany({
    where: { enabled: true },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  });
  return rows as CommandRow[];
}

/** Narrow the enabled catalog to what a given user may use (applies the allowlist). */
export function commandsForUser(
  enabled: CommandRow[],
  enabledCommands: string[],
): CommandRow[] {
  if (enabledCommands.length === 0) {
    return enabled;
  }
  const allow = new Set(enabledCommands);
  return enabled.filter((c) => allow.has(c.name));
}

/** Resolve one command the user is allowed to use, by name; null if unknown/forbidden. */
export async function resolveUserCommand(
  user: { enabledCommands: string[] },
  name: string,
): Promise<CommandRow | null> {
  const row = (await prisma.slashCommand.findUnique({ where: { name } })) as CommandRow | null;
  if (!row || !row.enabled) {
    return null;
  }
  if (user.enabledCommands.length > 0 && !user.enabledCommands.includes(name)) {
    return null;
  }
  return row;
}
