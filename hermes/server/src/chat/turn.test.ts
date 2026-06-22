import assert from 'node:assert/strict';
import { test } from 'node:test';

// turn.ts transitively imports config, which validates env at module load — provide a minimal env.
process.env.DATABASE_URL ??= 'postgresql://localhost:5432/test';
process.env.JWT_SECRET ??= 'test-secret';
process.env.JWT_REFRESH_SECRET ??= 'test-refresh-secret';
process.env.HERMES_GATEWAYS ??=
  '[{"id":"default","model":"hermes-agent","baseURL":"http://localhost:8642","apiKey":"test"}]';

const { toHermesMessage, selectGateway } = await import('./turn');
const { GatewayPool } = await import('../hermes/pool');

function pool() {
  return new GatewayPool([
    { id: 'g1', model: 'm', baseURL: 'http://localhost:8642', apiKey: 'k' },
    { id: 'g2', model: 'm', baseURL: 'http://localhost:8642', apiKey: 'k' },
  ]);
}
const freeUser = { tier: 'free', dedicatedGatewayId: null, model: 'm' };
const dedicatedUser = { tier: 'dedicated', dedicatedGatewayId: 'g2', model: 'm' };

/** The wire shape Hermes actually receives (undefined fields dropped by JSON). */
function wire(text: string, images?: Array<{ url: string; detail?: 'low' | 'high' | 'auto' }>) {
  return JSON.parse(JSON.stringify(toHermesMessage(text, images)));
}

test('text-only turns send a plain string', () => {
  assert.equal(toHermesMessage('hello'), 'hello');
  assert.equal(toHermesMessage('hello', []), 'hello');
});

test('image turns send OpenAI-style multimodal parts', () => {
  assert.deepEqual(wire('what is this?', [{ url: 'https://example.com/a.png' }]), [
    { type: 'text', text: 'what is this?' },
    { type: 'image_url', image_url: { url: 'https://example.com/a.png' } },
  ]);
});

test('image detail is forwarded when provided', () => {
  assert.deepEqual(wire('look', [{ url: 'data:image/jpeg;base64,AAAA', detail: 'high' }]), [
    { type: 'text', text: 'look' },
    { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,AAAA', detail: 'high' } },
  ]);
});

test('image-only turns omit the empty text part', () => {
  assert.deepEqual(wire('', [{ url: 'https://example.com/a.png' }]), [
    { type: 'image_url', image_url: { url: 'https://example.com/a.png' } },
  ]);
});

test('multiple images preserve order', () => {
  const parts = wire('two', [
    { url: 'https://example.com/1.png' },
    { url: 'https://example.com/2.png' },
  ]);
  assert.deepEqual(parts, [
    { type: 'text', text: 'two' },
    { type: 'image_url', image_url: { url: 'https://example.com/1.png' } },
    { type: 'image_url', image_url: { url: 'https://example.com/2.png' } },
  ]);
});

test('selectGateway keeps an existing conversation on its pinned gateway', () => {
  const chosen = selectGateway(pool(), { hermesGatewayId: 'g2', model: 'm' }, dedicatedUser);
  assert.equal(chosen.id, 'g2');
});

test('selectGateway routes a dedicated user to their reserved gateway', () => {
  const chosen = selectGateway(pool(), { hermesGatewayId: null, model: 'm' }, dedicatedUser);
  assert.equal(chosen.id, 'g2');
});

test('selectGateway falls back to the shared pool for free users', () => {
  const chosen = selectGateway(pool(), { hermesGatewayId: null, model: 'm' }, freeUser);
  assert.equal(chosen.model, 'm');
  assert.ok(['g1', 'g2'].includes(chosen.id));
});

test('selectGateway falls back when a dedicated binding is stale', () => {
  const stale = { tier: 'dedicated', dedicatedGatewayId: 'ghost', model: 'm' };
  const chosen = selectGateway(pool(), { hermesGatewayId: null, model: 'm' }, stale);
  assert.ok(['g1', 'g2'].includes(chosen.id));
});
