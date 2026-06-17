import type { Response } from 'express';
import type { ChatStreamEvent } from '@hermes/shared';

/** Writes our normalized chat-stream events to an Express response as SSE frames. */
export class SseWriter {
  private closed = false;

  constructor(private readonly res: Response) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      // Disable proxy buffering so events flush immediately.
      'X-Accel-Buffering': 'no',
    });
    res.flushHeaders();
  }

  send(event: ChatStreamEvent): void {
    if (this.closed) {
      return;
    }
    this.res.write(`event: ${event.type}\n`);
    this.res.write(`data: ${JSON.stringify(event)}\n\n`);
  }

  comment(text: string): void {
    if (this.closed) {
      return;
    }
    this.res.write(`: ${text}\n\n`);
  }

  close(): void {
    if (this.closed) {
      return;
    }
    this.closed = true;
    this.res.end();
  }
}
