import type { HermesProfile, User as ApiUser, UserTier } from '@hermes/shared';
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
  };
}

export function toApiUser(user: DbUser): ApiUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name ?? null,
    role: user.role,
    emailVerified: user.emailVerified,
    tier: toTier(user.tier),
    hermesProfile: toHermesProfile(user),
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}
