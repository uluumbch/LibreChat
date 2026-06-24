import { config } from '../config';

/** Free credit grant a new account starts with. */
export const STARTER_CREDITS = 2000;

/**
 * Defaults written into a new user's row at signup — the per-user "profile" (preferences)
 * plus the starter credit grant. No Hermes OS profile is created; isolation happens at the
 * session layer.
 */
export function provisionDefaults(startingCredits = STARTER_CREDITS): {
  model: string;
  instructions: string | null;
  memoryEnabled: boolean;
  enabledToolsets: string[];
  enabledSkills: string[];
  creditsPurchased: number;
} {
  return {
    model: config.defaultModel,
    instructions: null,
    memoryEnabled: true,
    enabledToolsets: [],
    enabledSkills: [],
    creditsPurchased: startingCredits,
  };
}

/** Stable per-user memory scope passed to Hermes as `X-Hermes-Session-Key`. */
export function sessionKeyFor(userId: string): string {
  return `user:${userId}`;
}
