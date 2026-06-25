/**
 * First-party LLM models the admin has registered and enabled product-wide
 * (admin panel → LLM providers). A model is usable only when BOTH the model row
 * and its parent provider are enabled. Enabled models are grantable per user
 * (User.allowedModels) and selectable from a user's settings.
 *
 * This module owns the catalog queries; provider API keys live encrypted on the
 * provider row and are only decrypted at turn time (see turnFields.ts).
 */
import { prisma } from '../db';
import { badRequest } from '../errors';
import { gatewayPool } from '../hermes/pool';
import type { LlmProviderKind } from '@hermes/shared';

export interface CatalogModel {
  slug: string;
  label: string;
  /** Provider display name (for grouping in the admin UI). */
  provider: string;
}

/** A model resolved for a turn: upstream id + the (still-encrypted) provider credentials. */
export interface ResolvedModel {
  slug: string;
  modelId: string;
  provider: {
    kind: LlmProviderKind;
    baseUrl: string | null;
    apiKeyEnc: string;
  };
}

/** All globally-enabled models (model enabled AND provider enabled), ordered by label. */
export async function getEnabledModels(): Promise<CatalogModel[]> {
  const rows = await prisma.llmModel.findMany({
    where: { enabled: true, provider: { enabled: true } },
    select: { slug: true, label: true, provider: { select: { name: true } } },
    orderBy: { label: 'asc' },
  });
  return rows.map((r) => ({ slug: r.slug, label: r.label, provider: r.provider.name }));
}

/** Just the enabled slugs, as a Set for membership checks. */
export async function getEnabledSlugs(): Promise<Set<string>> {
  const rows = await prisma.llmModel.findMany({
    where: { enabled: true, provider: { enabled: true } },
    select: { slug: true },
  });
  return new Set(rows.map((r) => r.slug));
}

/** Throw `model_not_enabled` if any slug isn't a globally-enabled model (used to vet admin grants). */
export async function assertModelsEnabled(slugs: string[] | undefined): Promise<void> {
  if (!slugs || slugs.length === 0) return;
  const enabled = await getEnabledSlugs();
  const bad = slugs.filter((s) => !enabled.has(s));
  if (bad.length > 0) {
    throw badRequest(`Model(s) not enabled: ${bad.join(', ')}`, 'model_not_enabled');
  }
}

/**
 * True when `model` is selectable by a user with the given grants: either a built-in pool model, or
 * an enabled first-party model the user has been granted. Empty/unset model counts as selectable.
 */
export async function isModelSelectable(
  model: string | null | undefined,
  allowedModels: string[],
): Promise<boolean> {
  if (!model) return true;
  if (gatewayPool.hasModel(model)) return true;
  return allowedModels.includes(model) && (await getEnabledSlugs()).has(model);
}

/** Throw `unknown_model` unless `model` is selectable under the given grants. No-op when unset. */
export async function assertModelSelectable(
  model: string | undefined,
  allowedModels: string[],
): Promise<void> {
  if (!(await isModelSelectable(model, allowedModels))) {
    throw badRequest(`Unknown model: ${model}`, 'unknown_model');
  }
}

/** Resolve an enabled model to its upstream id + provider credentials, or null when not usable. */
export async function resolveModel(slug: string): Promise<ResolvedModel | null> {
  const row = await prisma.llmModel.findFirst({
    where: { slug, enabled: true, provider: { enabled: true } },
    select: {
      slug: true,
      modelId: true,
      provider: { select: { kind: true, baseUrl: true, apiKeyEnc: true } },
    },
  });
  if (!row) return null;
  return {
    slug: row.slug,
    modelId: row.modelId,
    provider: {
      kind: row.provider.kind as LlmProviderKind,
      baseUrl: row.provider.baseUrl,
      apiKeyEnc: row.provider.apiKeyEnc,
    },
  };
}
