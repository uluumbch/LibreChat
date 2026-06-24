// End-to-end smoke test for the Hermes-Chat BFF. Requires the BFF, Postgres, and a Hermes gateway
// (real or scripts/mock-hermes.mjs) to be running. Run: `node scripts/smoke.mjs`.
const BASE = process.env.BASE ?? 'http://localhost:8090';
let failures = 0;

function check(name, condition, detail = '') {
  const ok = Boolean(condition);
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures += 1;
  return ok;
}

async function register(email) {
  const res = await fetch(`${BASE}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'password123', name: 'Test' }),
  });
  if (!res.ok) throw new Error(`register ${email} failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return { token: data.token, user: data.user };
}

async function api(token, method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : undefined;
  } catch {
    json = text;
  }
  return { status: res.status, json };
}

async function chatStream(token, conversationId, text) {
  const res = await fetch(`${BASE}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ conversationId, text }),
  });
  if (!res.ok || !res.body) throw new Error(`chat failed: ${res.status} ${await res.text()}`);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let eventName = 'message';
  let dataLines = [];
  const events = [];
  const flush = () => {
    if (dataLines.length) events.push({ event: eventName, data: dataLines.join('\n') });
    eventName = 'message';
    dataLines = [];
  };
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let i;
    while ((i = buffer.indexOf('\n')) !== -1) {
      let line = buffer.slice(0, i);
      buffer = buffer.slice(i + 1);
      if (line.endsWith('\r')) line = line.slice(0, -1);
      if (line === '') flush();
      else if (line.startsWith('event:')) eventName = line.slice(6).trim();
      else if (line.startsWith('data:')) dataLines.push(line.slice(5).replace(/^ /, ''));
    }
  }
  flush();
  return events;
}

async function main() {
  const ts = Date.now();
  const a = await register(`a_${ts}@test.dev`);
  check('register user A', a.token && a.user, `model=${a.user?.hermesProfile?.model}`);
  check('default profile model', a.user?.hermesProfile?.model === 'hermes-agent');

  const models = await api(a.token, 'GET', '/api/discovery/models');
  check('GET /discovery/models', models.status === 200 && models.json.items?.length >= 1);
  const toolsets = await api(a.token, 'GET', '/api/discovery/toolsets');
  check('GET /discovery/toolsets', toolsets.status === 200 && toolsets.json.items?.length >= 1, `${toolsets.json?.items?.length} toolsets`);

  const conv = await api(a.token, 'POST', '/api/conversations', {});
  check('create conversation', conv.status === 201 && conv.json.id);
  const convId = conv.json.id;

  const events = await chatStream(a.token, convId, 'What is the capital of France?');
  const types = events.map((e) => e.event);
  check('stream: created', types.includes('created'));
  check('stream: deltas', types.filter((t) => t === 'delta').length > 0, `${types.filter((t) => t === 'delta').length} deltas`);
  check('stream: tool_steps', types.filter((t) => t === 'tool_step').length >= 2, `${types.filter((t) => t === 'tool_step').length} steps`);
  check('stream: title', types.includes('title'));
  check('stream: final', types.includes('final'));
  const finalEv = events.find((e) => e.event === 'final');
  const finalData = finalEv ? JSON.parse(finalEv.data) : null;
  check('final assistant content', finalData?.message?.content?.length > 0, `parts=${finalData?.message?.content?.map((p) => p.type).join(',')}`);
  check('final usage', finalData?.usage?.totalTokens > 0, `total=${finalData?.usage?.totalTokens}`);

  const msgs = await api(a.token, 'GET', `/api/conversations/${convId}/messages`);
  const roles = msgs.json.items?.map((m) => m.role);
  check('history persisted', roles?.includes('user') && roles?.includes('assistant'), `roles=${roles?.join(',')}`);
  const assistant = msgs.json.items?.find((m) => m.role === 'assistant');
  check('assistant has tool_step part', assistant?.content?.some((p) => p.type === 'tool_step'));

  const convAfter1 = await api(a.token, 'GET', `/api/conversations/${convId}`);
  const sid1 = convAfter1.json?.hermesSessionId;
  check('hermes session assigned', typeof sid1 === 'string' && sid1.length > 0, `sid=${sid1}`);
  await chatStream(a.token, convId, 'And its population?');
  const convAfter2 = await api(a.token, 'GET', `/api/conversations/${convId}`);
  check('session reused across turns', convAfter2.json?.hermesSessionId === sid1);
  const msgs2 = await api(a.token, 'GET', `/api/conversations/${convId}/messages`);
  check('second turn persisted (4 messages total)', (msgs2.json.items?.length ?? 0) === 4, `count=${msgs2.json.items?.length}`);

  const list = await api(a.token, 'GET', '/api/conversations');
  const listed = list.json.items?.find((c) => c.id === convId);
  check('conversation auto-titled', listed && listed.title !== 'New Chat', `title=${listed?.title}`);

  const upd = await api(a.token, 'PATCH', '/api/profile', { instructions: 'Be terse.', memoryEnabled: false });
  check('update profile', upd.status === 200 && upd.json.hermesProfile?.instructions === 'Be terse.' && upd.json.hermesProfile?.memoryEnabled === false);

  const b = await register(`b_${ts}@test.dev`);
  const bList = await api(b.token, 'GET', '/api/conversations');
  check("per-user isolation (B can't see A's conversations)", (bList.json.items?.length ?? -1) === 0, `B sees ${bList.json.items?.length}`);

  const noauth = await fetch(`${BASE}/api/conversations`);
  check('auth required (401 without token)', noauth.status === 401);

  console.log(`\n${failures === 0 ? 'ALL PASSED ✓' : `${failures} CHECK(S) FAILED ✗`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('ERROR', err);
  process.exit(1);
});
