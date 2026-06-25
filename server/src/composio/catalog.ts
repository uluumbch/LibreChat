/**
 * The Composio toolkits enabled product-wide, managed by the admin
 * (admin panel → Composio toolkits). Presence of a `composio_toolkits` row =
 * enabled; only enabled toolkits are grantable per user (User.composioToolkits)
 * and connectable from a user's settings.
 *
 * The available catalog (what an admin can enable) is fetched live from Composio
 * (see ComposioClient.listToolkits); this module owns the *enabled* set in our DB.
 */
import { prisma } from '../db';

export interface CatalogToolkit {
  slug: string;
  name: string;
}

/** All globally-enabled toolkits (admin-curated), ordered by name. */
export async function getEnabledToolkits(): Promise<CatalogToolkit[]> {
  const rows = await prisma.composioToolkit.findMany({
    select: { slug: true, name: true },
    orderBy: { name: 'asc' },
  });
  return rows;
}

/** Just the enabled slugs, as a Set for membership checks. */
export async function getEnabledSlugs(): Promise<Set<string>> {
  const rows = await prisma.composioToolkit.findMany({ select: { slug: true } });
  return new Set(rows.map((r) => r.slug));
}

export async function isEnabledToolkit(slug: string): Promise<boolean> {
  const row = await prisma.composioToolkit.findUnique({ where: { slug }, select: { slug: true } });
  return row != null;
}

/** Display name for a slug — the cached catalog name, else a passed fallback, else the slug. */
export async function toolkitName(slug: string, fallback?: string): Promise<string> {
  const row = await prisma.composioToolkit.findUnique({ where: { slug }, select: { name: true } });
  return row?.name ?? fallback ?? slug;
}
