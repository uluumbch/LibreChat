import type {
  HermesCapabilitiesResponse,
  HermesCreateSessionRequest,
  HermesHealthResponse,
  HermesModelsResponse,
  HermesSession,
  HermesSessionChatRequest,
  HermesToolsetsResponse,
} from '@hermes/shared';
import { HERMES_SESSION_ID_HEADER, HERMES_SESSION_KEY_HEADER } from '@hermes/shared';
import type { GatewayConfig } from '../config';
import { HttpError } from '../errors';

type CreateSessionResponse = { object?: string; session?: HermesSession } | HermesSession;

export interface ChatStreamOptions {
  sessionKey: string;
  signal?: AbortSignal;
}

export interface ChatCompletionsStreamOptions extends ChatStreamOptions {
  sessionId: string;
}

/** Typed HTTP client for a single Hermes gateway. */
export class HermesClient {
  constructor(private readonly gateway: GatewayConfig) {}

  get model(): string {
    return this.gateway.model;
  }

  private url(path: string): string {
    return `${this.gateway.baseURL.replace(/\/+$/, '')}${path}`;
  }

  private headers(extra?: Record<string, string>): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.gateway.apiKey}`,
      ...extra,
    };
  }

  private async requestJson<T>(path: string, init?: RequestInit): Promise<T> {
    let res: Response;
    try {
      res = await fetch(this.url(path), {
        ...init,
        headers: this.headers(init?.headers as Record<string, string> | undefined),
      });
    } catch {
      throw new HttpError(502, `Hermes gateway unreachable (${this.gateway.id})`, 'hermes_unreachable');
    }
    if (!res.ok) {
      throw new HttpError(502, `Hermes ${path} failed: ${res.status}`, 'hermes_upstream');
    }
    return (await res.json()) as T;
  }

  async createSession(body: HermesCreateSessionRequest): Promise<HermesSession> {
    const data = await this.requestJson<CreateSessionResponse>('/api/sessions', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    if ('session' in data && data.session) {
      return data.session;
    }
    return data as HermesSession;
  }

  /** Primary chat surface: streams the cleanest tool-progress events. */
  chatStream(
    sessionId: string,
    body: HermesSessionChatRequest,
    opts: ChatStreamOptions,
  ): Promise<Response> {
    return fetch(this.url(`/api/sessions/${encodeURIComponent(sessionId)}/chat/stream`), {
      method: 'POST',
      headers: this.headers({
        Accept: 'text/event-stream',
        [HERMES_SESSION_KEY_HEADER]: opts.sessionKey,
      }),
      body: JSON.stringify(body),
      signal: opts.signal,
    });
  }

  /** Fallback for multimodal (image) turns; shares the same session via the id header. */
  chatCompletionsStream(body: unknown, opts: ChatCompletionsStreamOptions): Promise<Response> {
    return fetch(this.url('/v1/chat/completions'), {
      method: 'POST',
      headers: this.headers({
        Accept: 'text/event-stream',
        [HERMES_SESSION_ID_HEADER]: opts.sessionId,
        [HERMES_SESSION_KEY_HEADER]: opts.sessionKey,
      }),
      body: JSON.stringify(body),
      signal: opts.signal,
    });
  }

  listModels(): Promise<HermesModelsResponse> {
    return this.requestJson('/v1/models');
  }

  listToolsets(): Promise<HermesToolsetsResponse> {
    return this.requestJson('/v1/toolsets');
  }

  capabilities(): Promise<HermesCapabilitiesResponse> {
    return this.requestJson('/v1/capabilities');
  }

  health(): Promise<HermesHealthResponse> {
    return this.requestJson('/health');
  }
}
