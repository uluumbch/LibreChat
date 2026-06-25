/**
 * The Composio toolkits (third-party services) this build exposes.
 *
 * Hardcoded for now to keep the surface small and predictable. The slugs are
 * Composio toolkit slugs (lowercase) used both as the auth-config target and the
 * gateway toolkit allowlist value.
 *
 * TODO: fetch the live catalog from Composio (`GET /toolkits`) so admins can pick
 * from the full set instead of this curated list.
 */
export interface CatalogToolkit {
  slug: string;
  name: string;
}

export const COMPOSIO_CATALOG: readonly CatalogToolkit[] = [
  { slug: 'googledrive', name: 'Google Drive' },
  { slug: 'notion', name: 'Notion' },
  { slug: 'googlesheets', name: 'Google Sheets' },
] as const;

const BY_SLUG = new Map(COMPOSIO_CATALOG.map((t) => [t.slug, t]));

/** Valid catalog slugs, for validating admin-supplied allowlists. */
export const COMPOSIO_SLUGS: readonly string[] = COMPOSIO_CATALOG.map((t) => t.slug);

export function isCatalogSlug(slug: string): boolean {
  return BY_SLUG.has(slug);
}

export function toolkitName(slug: string): string {
  return BY_SLUG.get(slug)?.name ?? slug;
}
