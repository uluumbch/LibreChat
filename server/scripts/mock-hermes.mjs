// Minimal mock of the Hermes Agent gateway for local dev / end-to-end testing of Hermes-Chat.
// Implements only the surfaces the BFF uses, and emits the real session `/chat/stream` event
// sequence (run.started → message.started → assistant.delta… → tool.started/completed →
// assistant.completed → run.completed → done). Run: `node scripts/mock-hermes.mjs`.
import http from 'node:http';
import { randomUUID } from 'node:crypto';

const KEY = process.env.MOCK_API_KEY ?? 'mock-key';
const PORT = Number(process.env.MOCK_PORT ?? 8642);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const now = () => Date.now() / 1000;

function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function authed(req) {
  return req.headers['authorization'] === `Bearer ${KEY}`;
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(data || '{}'));
      } catch {
        resolve({});
      }
    });
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);
  const { pathname } = url;

  if (req.method === 'GET' && pathname === '/health') {
    return json(res, 200, { status: 'ok', platform: 'hermes-agent', version: '0.16.0-mock' });
  }
  if (!authed(req)) {
    return json(res, 401, { error: 'unauthorized' });
  }
  if (req.method === 'GET' && pathname === '/v1/models') {
    return json(res, 200, { object: 'list', data: [{ id: 'hermes-agent', object: 'model' }] });
  }
  if (req.method === 'GET' && pathname === '/v1/toolsets') {
    return json(res, 200, {
      object: 'list',
      data: [
        { name: 'web', label: 'Web Search', tools: ['web_search', 'fetch_webpage'] },
        { name: 'terminal', label: 'Terminal', tools: ['run_command', 'read_file'] },
        { name: 'memory', label: 'Memory', tools: ['remember', 'recall'] },
      ],
    });
  }
  if (req.method === 'POST' && pathname === '/api/sessions') {
    const body = await readBody(req);
    const id = `sess_${randomUUID().slice(0, 8)}`;
    return json(res, 201, {
      object: 'hermes.session',
      session: { id, title: body.title ?? 'Session', model: body.model ?? 'hermes-agent', started_at: Date.now() },
    });
  }

  const chatMatch = pathname.match(/^\/api\/sessions\/([^/]+)\/chat\/stream$/);
  if (req.method === 'POST' && chatMatch) {
    const sessionId = decodeURIComponent(chatMatch[1]);
    const body = await readBody(req);
    const message = String(body.message ?? '');
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    let seq = 0;
    const messageId = `msg_${randomUUID().slice(0, 8)}`;
    const runId = `run_${randomUUID().slice(0, 8)}`;
    const send = (event, data) => {
      res.write(`event: ${event}\n`);
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    send('run.started', { session_id: sessionId, run_id: runId, seq: seq++, ts: now() });
    send('message.started', { message: { id: messageId, role: 'assistant' }, seq: seq++, ts: now() });

    const head = `You said: "${message}". Let me look that up.`;
    for (const word of head.split(' ')) {
      await sleep(35);
      send('assistant.delta', { message_id: messageId, delta: `${word} `, seq: seq++, ts: now() });
    }
    await sleep(120);
    send('tool.started', { message_id: messageId, tool_name: 'web_search', preview: `query: ${message.slice(0, 32)}`, seq: seq++, ts: now() });
    await sleep(350);
    send('tool.completed', { message_id: messageId, tool_name: 'web_search', preview: '3 results', seq: seq++, ts: now() });

    const tail = ' Based on what I found, here is a concise answer with a code sample:\n\n```js\nconsole.log("hello from hermes");\n```';
    for (const chunk of tail.split(' ')) {
      await sleep(35);
      send('assistant.delta', { message_id: messageId, delta: `${chunk} `, seq: seq++, ts: now() });
    }

    const content = head + tail;
    send('assistant.completed', { session_id: sessionId, message_id: messageId, content, completed: true, seq: seq++, ts: now() });
    send('run.completed', { session_id: sessionId, message_id: messageId, completed: true, usage: { input_tokens: 12, output_tokens: 48, total_tokens: 60 }, seq: seq++, ts: now() });
    send('done', {});
    res.end();
    return;
  }

  return json(res, 404, { error: 'not found' });
});

server.listen(PORT, () => {
  console.log(`mock hermes gateway listening on :${PORT}`);
});
