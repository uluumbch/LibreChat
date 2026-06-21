import assert from 'node:assert/strict';
import { test } from 'node:test';

// turn.ts transitively imports config, which validates env at module load — provide a minimal env.
process.env.DATABASE_URL ??= 'postgresql://localhost:5432/test';
process.env.JWT_SECRET ??= 'test-secret';
process.env.JWT_REFRESH_SECRET ??= 'test-refresh-secret';
process.env.HERMES_GATEWAYS ??=
  '[{"id":"default","model":"hermes-agent","baseURL":"http://localhost:8642","apiKey":"test"}]';

const { toHermesMessage } = await import('./turn');

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
