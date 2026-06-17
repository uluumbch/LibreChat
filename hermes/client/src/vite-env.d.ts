/// <reference types="vite/client" />

declare module 'sse.js' {
  export interface SSEOptions {
    headers?: Record<string, string>;
    payload?: string;
    method?: string;
    withCredentials?: boolean;
  }
  export class SSE extends EventTarget {
    constructor(url: string, options?: SSEOptions);
    readyState: number;
    stream(): void;
    close(): void;
    addEventListener(type: string, listener: (event: MessageEvent) => void): void;
  }
}
