import { config } from '../config';

/**
 * Defaults written into a new user's row at signup — the per-user "profile" (preferences).
 * No Hermes OS profile is created; isolation happens at the session layer.
 */
export function provisionDefaults(): {
  model: string;
  instructions: string | null;
  memoryEnabled: boolean;
  enabledToolsets: string[];
} {
  return {
    model: config.defaultModel,
    instructions: null,
    memoryEnabled: true,
    enabledToolsets: [],
  };
}

/** Stable per-user memory scope passed to Hermes as `X-Hermes-Session-Key`. */
export function sessionKeyFor(userId: string): string {
  return `user:${userId}`;
}
