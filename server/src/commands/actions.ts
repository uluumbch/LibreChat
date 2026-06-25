/**
 * Coded handlers for `server_action` slash commands. An admin attaches one of these
 * by `actionKey`; the server runs it and returns the reply directly (no LLM call).
 * The set is fixed in code — admins choose a key, they cannot author behavior.
 */
import type { User as DbUser } from '@prisma/client';
import type { ServerActionKey } from '@hermes/shared';
import type { CommandRow } from './catalog';

export interface ServerActionContext {
  user: DbUser;
  /** The commands available to this user — lets /help enumerate them. */
  commands: CommandRow[];
  /** Args typed after the command token, if any. */
  args: string;
}

export type ServerActionHandler = (ctx: ServerActionContext) => string;

const handlers: Record<ServerActionKey, ServerActionHandler> = {
  credits: ({ user }) => {
    const remaining = Math.max(0, user.creditsPurchased - user.creditsUsed);
    return `You have **${remaining.toLocaleString()}** credits remaining (of ${user.creditsPurchased.toLocaleString()} purchased).`;
  },
  help: ({ commands }) => {
    if (commands.length === 0) {
      return 'No slash commands are available to you yet.';
    }
    const lines = commands
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((c) => `- **/${c.name}** — ${c.description}`);
    return ['Available commands:', ...lines].join('\n');
  },
};

export function runServerAction(key: ServerActionKey, ctx: ServerActionContext): string {
  return handlers[key](ctx);
}
