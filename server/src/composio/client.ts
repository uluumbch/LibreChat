/**
 * Server-side Composio client (REST over fetch — no SDK dependency).
 *
 * Composio (https://composio.dev) is a hosted auth + tool-execution bridge. The
 * server uses it for the *connection lifecycle* only (create auth configs,
 * initiate OAuth, list/disconnect a user's accounts). Actual tool execution
 * happens in the gateway's `composio` toolset. The user identity passed to
 * Composio is the LibreChatHermes DB user id, so connected accounts stay isolated.
 *
 * All HTTP shape assumptions for the Composio v3 API live in this file. If a
 * field name or path differs for your Composio version, fix it here — nothing
 * else depends on the wire format. Response parsing is intentionally lenient
 * (tries snake_case and camelCase) so minor shape drift doesn't break the flow.
 */
import { config } from '../config';
import { logger } from '../logger';
import { isCatalogSlug } from './catalog';

export interface InitiateResult {
  redirectUrl: string;
}

/** Thrown for Composio API failures; carries an HTTP-ish status for the route layer. */
export class ComposioError extends Error {
  status: number;
  constructor(message: string, status = 502) {
    super(message);
    this.name = 'ComposioError';
    this.status = status;
  }
}

function pick<T = unknown>(obj: unknown, ...keys: string[]): T | undefined {
  if (!obj || typeof obj !== 'object') return undefined;
  const rec = obj as Record<string, unknown>;
  for (const k of keys) {
    if (rec[k] !== undefined && rec[k] !== null) return rec[k] as T;
  }
  return undefined;
}

class ComposioClient {
  private get apiKey(): string | null {
    return config.composio.apiKey;
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey);
  }

  private async request(path: string, init?: RequestInit): Promise<unknown> {
    const key = this.apiKey;
    if (!key) {
      throw new ComposioError('Composio is not configured (COMPOSIO_API_KEY unset).', 503);
    }
    const url = `${config.composio.baseUrl}${path}`;
    let res: Response;
    try {
      res = await fetch(url, {
        ...init,
        headers: {
          'x-api-key': key,
          'content-type': 'application/json',
          ...(init?.headers ?? {}),
        },
      });
    } catch (err) {
      logger.error({ err, path }, 'composio: request failed');
      throw new ComposioError('Could not reach Composio.');
    }
    const text = await res.text();
    const body = text ? safeJson(text) : null;
    if (!res.ok) {
      const raw = pick<unknown>(body, 'message', 'error', 'detail');
      const detail =
        typeof raw === 'string'
          ? raw
          : raw
            ? JSON.stringify(raw)
            : text || `HTTP ${res.status}`;
      logger.warn({ path, status: res.status, detail }, 'composio: API error');
      throw new ComposioError(`Composio: ${detail}`, res.status >= 400 && res.status < 500 ? 400 : 502);
    }
    return body;
  }

  /** Find an existing auth config for a toolkit, or create a Composio-managed one. */
  private async ensureAuthConfig(toolkit: string): Promise<string> {
    // Reuse an existing config so we don't pile up duplicates per connect.
    const existing = await this.request(
      `/auth_configs?toolkit_slug=${encodeURIComponent(toolkit)}`,
    );
    const items = (pick<unknown[]>(existing, 'items', 'data') as unknown[]) ?? [];
    const found = items.find((it) => pick<string>(it, 'id'));
    const foundId = found ? pick<string>(found, 'id') : undefined;
    if (foundId) return foundId;

    const created = await this.request('/auth_configs', {
      method: 'POST',
      body: JSON.stringify({
        toolkit: { slug: toolkit },
        auth_config: { type: 'use_composio_managed_auth' },
      }),
    });
    const id =
      pick<string>(created, 'id') ??
      pick<string>(pick(created, 'auth_config', 'authConfig'), 'id');
    if (!id) {
      throw new ComposioError('Composio did not return an auth config id.');
    }
    return id;
  }

  /**
   * Begin OAuth for (user, toolkit). Returns the hosted Composio URL to send the
   * user to; after they authorize, Composio redirects back to our settings page.
   */
  async initiateConnection(userId: string, toolkit: string): Promise<InitiateResult> {
    if (!isCatalogSlug(toolkit)) {
      throw new ComposioError(`Unknown toolkit '${toolkit}'.`, 400);
    }
    const authConfigId = await this.ensureAuthConfig(toolkit);
    // Composio-managed OAuth uses the dedicated /link endpoint (the plain
    // /connected_accounts POST is rejected for managed auth configs).
    const body: Record<string, unknown> = {
      auth_config_id: authConfigId,
      user_id: userId,
    };
    if (config.composio.redirectUrl) {
      body.callback_url = config.composio.redirectUrl;
    }
    const created = await this.request('/connected_accounts/link', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    const redirectUrl =
      pick<string>(created, 'redirect_url', 'redirectUrl') ??
      pick<string>(pick(created, 'connection_data', 'connectionData', 'data'), 'redirect_url', 'redirectUrl');
    if (!redirectUrl) {
      throw new ComposioError('Composio did not return an OAuth redirect URL.');
    }
    return { redirectUrl };
  }

  /** Toolkit slugs the user currently has an ACTIVE connected account for. */
  async listConnectedToolkits(userId: string): Promise<Set<string>> {
    const result = await this.request(
      `/connected_accounts?user_ids=${encodeURIComponent(userId)}`,
    );
    const items = (pick<unknown[]>(result, 'items', 'data') as unknown[]) ?? [];
    const connected = new Set<string>();
    for (const it of items) {
      const status = (pick<string>(it, 'status') ?? '').toUpperCase();
      if (status && status !== 'ACTIVE') continue;
      const slug =
        pick<string>(pick(it, 'toolkit'), 'slug') ??
        pick<string>(it, 'toolkit_slug', 'toolkitSlug');
      if (slug) connected.add(slug.toLowerCase());
    }
    return connected;
  }

  /** Remove the user's connected account(s) for a toolkit. No-op if none exist. */
  async disconnect(userId: string, toolkit: string): Promise<void> {
    const result = await this.request(
      `/connected_accounts?user_ids=${encodeURIComponent(userId)}&toolkit_slugs=${encodeURIComponent(toolkit)}`,
    );
    const items = (pick<unknown[]>(result, 'items', 'data') as unknown[]) ?? [];
    for (const it of items) {
      const id = pick<string>(it, 'id');
      const slug = (
        pick<string>(pick(it, 'toolkit'), 'slug') ??
        pick<string>(it, 'toolkit_slug', 'toolkitSlug') ??
        ''
      ).toLowerCase();
      if (id && (slug === toolkit || !slug)) {
        await this.request(`/connected_accounts/${encodeURIComponent(id)}`, { method: 'DELETE' });
      }
    }
  }
}

/**
 * Per-turn Composio fields for the gateway chat/run body. Returns an empty object
 * (nothing sent) unless the admin enabled Composio for the user AND granted at
 * least one toolkit. The gateway then offers the `composio` toolset scoped to
 * this user; actual per-app access is still gated by the user's connected
 * accounts in Composio (an unconnected app surfaces a clear error at execute time).
 */
export function composioTurnFields(
  user: { composioEnabled: boolean; composioToolkits: string[] },
  userId: string,
): { composio_user_id?: string; composio_toolkits?: string[] } {
  if (!user.composioEnabled || user.composioToolkits.length === 0) return {};
  return { composio_user_id: userId, composio_toolkits: user.composioToolkits };
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export const composio = new ComposioClient();
