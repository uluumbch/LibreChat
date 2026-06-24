import type { AccountStatus, CreditBalance, HermesProfile, User as ApiUser } from '@hermes/shared';
import type { User as DbUser } from '@prisma/client';
import { config } from '../config';

export function toHermesProfile(user: DbUser): HermesProfile {
  return {
    model: user.model ?? config.defaultModel,
    instructions: user.instructions ?? null,
    memoryEnabled: user.memoryEnabled,
    enabledToolsets: user.enabledToolsets,
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
    hermesProfile: toHermesProfile(user),
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}
