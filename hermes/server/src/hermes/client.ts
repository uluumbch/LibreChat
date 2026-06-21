import type {
  HermesCapabilitiesResponse,
  HermesCreateSessionRequest,
  HermesHealthResponse,
  HermesJobCreateRequest,
  HermesJobResponse,
  HermesJobsResponse,
  HermesModelsResponse,
  HermesRunCreatedResponse,
  HermesRunRequest,
  HermesSession,
  HermesSessionChatRequest,
  HermesSkillsResponse,
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
      const detail = await res.text().catch(() => '');
      throw new HttpError(
        502,
        `Hermes ${path} failed: ${res.status}${detail ? ` — ${detail.slice(0, 500)}` : ''}`,
        'hermes_upstream',
      );
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

  /** Read a session's metadata (incl. token/message/tool-call counts and cost). */
  async getSession(id: string): Promise<HermesSession> {
    const data = await this.requestJson<CreateSessionResponse>(
      `/api/sessions/${encodeURIComponent(id)}`,
    );
    if ('session' in data && data.session) {
      return data.session;
    }
    return data as HermesSession;
  }

  /** Branch a session: Hermes carries the transcript forward via lineage and returns the child. */
  async forkSession(sourceId: string, body: { title?: string; id?: string } = {}): Promise<HermesSession> {
    const data = await this.requestJson<CreateSessionResponse>(
      `/api/sessions/${encodeURIComponent(sourceId)}/fork`,
      { method: 'POST', body: JSON.stringify(body) },
    );
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

  /* ----- Runs API (agentic engine: approval gates + reasoning) ----- */

  /** Start an agent run; returns the run id immediately (the run streams via runEvents). */
  createRun(body: HermesRunRequest, opts: { sessionKey: string }): Promise<HermesRunCreatedResponse> {
    return this.requestJson('/v1/runs', {
      method: 'POST',
      headers: { [HERMES_SESSION_KEY_HEADER]: opts.sessionKey },
      body: JSON.stringify(body),
    });
  }

  /** SSE stream of a run's structured lifecycle events (data-only frames). */
  runEvents(runId: string, opts: { signal?: AbortSignal } = {}): Promise<Response> {
    return fetch(this.url(`/v1/runs/${encodeURIComponent(runId)}/events`), {
      method: 'GET',
      headers: this.headers({ Accept: 'text/event-stream' }),
      signal: opts.signal,
    });
  }

  /** Resolve a pending approval gate for a run. */
  respondApproval(runId: string, choice: string): Promise<unknown> {
    return this.requestJson(`/v1/runs/${encodeURIComponent(runId)}/approval`, {
      method: 'POST',
      body: JSON.stringify({ choice }),
    });
  }

  /** Interrupt a running agent. */
  stopRun(runId: string): Promise<unknown> {
    return this.requestJson(`/v1/runs/${encodeURIComponent(runId)}/stop`, { method: 'POST' });
  }

  /* ----- Jobs API (scheduled cron; gateway-global — scoped per user in the BFF) ----- */

  listJobs(): Promise<HermesJobsResponse> {
    return this.requestJson('/api/jobs');
  }

  createJob(body: HermesJobCreateRequest): Promise<HermesJobResponse> {
    return this.requestJson('/api/jobs', { method: 'POST', body: JSON.stringify(body) });
  }

  getJob(id: string): Promise<HermesJobResponse> {
    return this.requestJson(`/api/jobs/${encodeURIComponent(id)}`);
  }

  deleteJob(id: string): Promise<unknown> {
    return this.requestJson(`/api/jobs/${encodeURIComponent(id)}`, { method: 'DELETE' });
  }

  jobAction(id: string, action: 'pause' | 'resume' | 'run'): Promise<unknown> {
    return this.requestJson(`/api/jobs/${encodeURIComponent(id)}/${action}`, { method: 'POST' });
  }

  listModels(): Promise<HermesModelsResponse> {
    return this.requestJson('/v1/models');
  }

  listToolsets(): Promise<HermesToolsetsResponse> {
    return this.requestJson('/v1/toolsets');
  }

  listSkills(): Promise<HermesSkillsResponse> {
    return this.requestJson('/v1/skills');
  }

  capabilities(): Promise<HermesCapabilitiesResponse> {
    return this.requestJson('/v1/capabilities');
  }

  health(): Promise<HermesHealthResponse> {
    return this.requestJson('/health');
  }
}
