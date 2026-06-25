/**
 * Resolves a curated slash command at the start of a chat turn. Anything that isn't a
 * recognized command the user may use falls through as a normal message (`passthrough`) —
 * so unknown slashes (incl. Hermes internals like `/usage`) just reach the LLM as plain text.
 */
import type { User as DbUser } from '@prisma/client';
import { commandsForUser, getEnabledCommands, resolveUserCommand } from '../commands/catalog';
import { runServerAction } from '../commands/actions';

export interface ParsedCommand {
  name: string;
  args: string;
}

/** Match a leading `/<token>` and the rest as args. Token: letters/digits/`-`/`_`. */
export function parseLeadingCommand(text: string): ParsedCommand | null {
  const match = /^\/([a-z0-9][a-z0-9_-]*)(?:\s+([\s\S]*))?$/i.exec(text.trim());
  if (!match) {
    return null;
  }
  return { name: match[1]!.toLowerCase(), args: (match[2] ?? '').trim() };
}

export type TurnCommand =
  | { kind: 'passthrough' }
  | { kind: 'prompt'; gatewayText: string }
  | { kind: 'skillScope'; gatewayText: string; overrideToolsets?: string[]; overrideSkills?: string[] }
  | { kind: 'serverAction'; replyText: string };

/** Expand a prompt template: substitute `{{args}}`, else append args when present. */
export function expandPrompt(template: string, args: string): string {
  if (template.includes('{{args}}')) {
    return template.split('{{args}}').join(args);
  }
  return args ? `${template}\n\n${args}` : template;
}

/**
 * Resolve the turn's command. `user` is the full record (needed for server actions). When the
 * leading token isn't a command this user may use, returns `passthrough` (send text unchanged).
 */
export async function resolveTurnCommand(user: DbUser, text: string): Promise<TurnCommand> {
  const parsed = parseLeadingCommand(text);
  if (!parsed) {
    return { kind: 'passthrough' };
  }
  const row = await resolveUserCommand(user, parsed.name);
  if (!row) {
    return { kind: 'passthrough' };
  }

  if (row.type === 'prompt') {
    const template = row.promptTemplate ?? '';
    return { kind: 'prompt', gatewayText: expandPrompt(template, parsed.args) || text };
  }

  if (row.type === 'skill_scope') {
    const gatewayText =
      [row.promptPrefix ?? '', parsed.args].filter((s) => s.trim().length > 0).join('\n\n') || text;
    return {
      kind: 'skillScope',
      gatewayText,
      overrideToolsets: row.scopeToolsets.length > 0 ? row.scopeToolsets : undefined,
      overrideSkills: row.scopeSkills.length > 0 ? row.scopeSkills : undefined,
    };
  }

  // server_action: run the coded handler; no LLM call.
  const enabled = await getEnabledCommands();
  const commands = commandsForUser(enabled, user.enabledCommands);
  const actionKey = (row.actionKey ?? 'help') as Parameters<typeof runServerAction>[0];
  return { kind: 'serverAction', replyText: runServerAction(actionKey, { user, commands, args: parsed.args }) };
}
