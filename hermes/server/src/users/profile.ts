import type { HermesProfile, User as ApiUser } from '@hermes/shared';
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

export function toApiUser(user: DbUser): ApiUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name ?? null,
    role: user.role,
    emailVerified: user.emailVerified,
    hermesProfile: toHermesProfile(user),
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}
