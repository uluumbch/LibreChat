import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { test } from 'node:test';

// secrets.ts imports config, which validates env at module load — provide a minimal env + a key.
process.env.DATABASE_URL ??= 'postgresql://localhost:5432/test';
process.env.JWT_SECRET ??= 'test-secret';
process.env.JWT_REFRESH_SECRET ??= 'test-refresh-secret';
process.env.HERMES_GATEWAYS ??=
  '[{"id":"default","model":"hermes-agent","baseURL":"http://localhost:8642","apiKey":"test"}]';
process.env.SECRETS_KEY ??= crypto.randomBytes(32).toString('hex');

const { encrypt, decrypt, secretsConfigured } = await import('./secrets');

test('configured when SECRETS_KEY is set', () => {
  assert.equal(secretsConfigured(), true);
});

test('round-trips a secret', () => {
  const plain = 'sk-test-abc123-DEADBEEF';
  const blob = encrypt(plain);
  assert.notEqual(blob, plain);
  assert.match(blob, /^gcm:/);
  assert.equal(decrypt(blob), plain);
});

test('produces distinct ciphertext per call (random IV)', () => {
  assert.notEqual(encrypt('same'), encrypt('same'));
});

test('rejects a tampered blob', () => {
  const blob = encrypt('secret');
  const parts = blob.split(':');
  // Flip a byte in the ciphertext segment.
  const ct = Buffer.from(parts[3]!, 'base64');
  ct[0] = (ct[0]! ^ 0xff) & 0xff;
  parts[3] = ct.toString('base64');
  assert.throws(() => decrypt(parts.join(':')));
});

test('rejects a malformed blob', () => {
  assert.throws(() => decrypt('not-a-real-blob'));
});
