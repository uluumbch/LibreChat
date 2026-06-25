import type {
  AccountStatus,
  CreditBalance,
  HermesProfile,
  User as ApiUser,
  UserTier,
} from '@hermes/shared';
import type { User as DbUser } from '@prisma/client';
import { config } from '../config';

function toTier(tier: string): UserTier {
  return tier === 'dedicated' ? 'dedicated' : 'free';
}

export function toHermesProfile(user: DbUser): HermesProfile {
  return {
    model: user.model ?? config.defaultModel,
    instructions: user.instructions ?? null,
    memoryEnabled: user.memoryEnabled,
    enabledToolsets: user.enabledToolsets,
    enabledSkills: user.enabledSkills,
    composioEnabled: user.composioEnabled,
    composioToolkits: user.composioToolkits,
    enabledCommands: user.enabledCommands,
  };
}

export function toCreditBalance(user: DbUser): CreditBalance {
  return {
    purchased: user.creditsPurchased,
    used: user.creditsUsed,
    remaining: Math.max(0, user.creditsPurchased - user.creditsUsed),
    lastTopupAt: user.lastTopupAt ? user.lastTopupAt.toISOString() : null,
  };
}

export function toApiUser(user: DbUser): ApiUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name ?? null,
    role: user.role,
    status: user.status as AccountStatus,
    emailVerified: user.emailVerified,
    credits: toCreditBalance(user),
    tier: toTier(user.tier),
    hermesProfile: toHermesProfile(user),
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}
