export interface RawSseEvent {
  event: string;
  data: string;
}

/**
 * Parses a Server-Sent Events byte stream (e.g. a Hermes gateway response body) into discrete
 * `{ event, data }` records. Comment lines (`:`) and keepalives are ignored; multi-line `data:`
 * fields are joined with newlines per the SSE spec.
 */
export async function* parseSse(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<RawSseEvent, void, unknown> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let eventName = 'message';
  let dataLines: string[] = [];

  const dispatch = (): RawSseEvent | null => {
    if (dataLines.length === 0) {
      eventName = 'message';
      return null;
    }
    const record: RawSseEvent = { event: eventName, data: dataLines.join('\n') };
    eventName = 'message';
    dataLines = [];
    return record;
  };

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      buffer += decoder.decode(value, { stream: true });

      let newlineIndex = buffer.indexOf('\n');
      while (newlineIndex !== -1) {
        let line = buffer.slice(0, newlineIndex);
        buffer = buffer.slice(newlineIndex + 1);
        if (line.endsWith('\r')) {
          line = line.slice(0, -1);
        }

        if (line === '') {
          const record = dispatch();
          if (record) {
            yield record;
          }
        } else if (line.startsWith(':')) {
          // comment / keepalive — ignore
        } else if (line.startsWith('event:')) {
          eventName = line.slice('event:'.length).trim();
        } else if (line.startsWith('data:')) {
          dataLines.push(line.slice('data:'.length).replace(/^ /, ''));
        }

        newlineIndex = buffer.indexOf('\n');
      }
    }
    const tail = dispatch();
    if (tail) {
      yield tail;
    }
  } finally {
    reader.releaseLock();
  }
}
