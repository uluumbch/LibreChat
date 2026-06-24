let accessToken: string | null = null;
let onUnauthorized: (() => void) | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

export function setOnUnauthorized(callback: (() => void) | null): void {
  onUnauthorized = callback;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string | undefined;

  constructor(status: number, message: string, code?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

async function refreshAccessToken(): Promise<boolean> {
  try {
    const res = await fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' });
    if (!res.ok) {
      return false;
    }
    const data = (await res.json()) as { token: string };
    accessToken = data.token;
    return true;
  } catch {
    return false;
  }
}

type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE';

async function rawFetch(path: string, method: Method, body: unknown, retry: boolean): Promise<Response> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }
  const res = await fetch(path, {
    method,
    headers,
    credentials: 'include',
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401 && retry) {
    if (await refreshAccessToken()) {
      return rawFetch(path, method, body, false);
    }
    onUnauthorized?.();
  }
  return res;
}

export async function apiRequest<T>(method: Method, path: string, body?: unknown): Promise<T> {
  const res = await rawFetch(path, method, body, true);
  if (!res.ok) {
    let message = res.statusText;
    let code: string | undefined;
    try {
      const data = (await res.json()) as { error?: string; code?: string };
      message = data.error ?? message;
      code = data.code;
    } catch {
      // non-JSON error body
    }
    throw new ApiError(res.status, message, code);
  }
  if (res.status === 204) {
    return undefined as T;
  }
  return (await res.json()) as T;
}
