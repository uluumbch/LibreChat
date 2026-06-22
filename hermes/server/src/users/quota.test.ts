import assert from 'node:assert/strict';
import { test } from 'node:test';

// quota.ts imports config, which validates env at module load — provide a minimal env.
process.env.DATABASE_URL ??= 'postgresql://localhost:5432/test';
process.env.JWT_SECRET ??= 'test-secret';
process.env.JWT_REFRESH_SECRET ??= 'test-refresh-secret';
process.env.HERMES_GATEWAYS ??=
  '[{"id":"default","model":"hermes-agent","baseURL":"http://localhost:8642","apiKey":"test"}]';

const { UserQuota } = await import('./quota');
type QuotaResult = ReturnType<InstanceType<typeof UserQuota>['tryAcquire']>;

function lease(result: QuotaResult): { release: () => void } {
  if (!result.ok) {
    throw new Error(`expected quota to allow, got ${result.code}`);
  }
  return result;
}

function denied(result: QuotaResult) {
  if (result.ok) {
    throw new Error('expected quota to deny');
  }
  return result;
}

test('caps concurrent turns per user without burning rate budget', () => {
  const quota = new UserQuota(2, 100, 100); // rate is generous; only concurrency should bite
  const a = lease(quota.tryAcquire('u'));
  lease(quota.tryAcquire('u'));
  assert.equal(denied(quota.tryAcquire('u')).code, 'too_many_requests');
  a.release();
  lease(quota.tryAcquire('u')); // a freed slot is reusable
});

test('rate-limits sustained turns and refills over time', () => {
  const quota = new UserQuota(100, 2, 1); // 2-token burst, refill 1/sec
  const t0 = 1_000_000;
  lease(quota.tryAcquire('u', t0));
  lease(quota.tryAcquire('u', t0));
  assert.equal(denied(quota.tryAcquire('u', t0)).code, 'rate_limited');
  lease(quota.tryAcquire('u', t0 + 1500)); // ~1.5 tokens refilled
});

test('release is idempotent so a double release cannot inflate concurrency', () => {
  const quota = new UserQuota(1, 100, 100);
  const a = lease(quota.tryAcquire('u'));
  denied(quota.tryAcquire('u'));
  a.release();
  a.release();
  lease(quota.tryAcquire('u'));
  assert.equal(denied(quota.tryAcquire('u')).code, 'too_many_requests');
});

test('quotas are independent per user', () => {
  const quota = new UserQuota(1, 100, 100);
  lease(quota.tryAcquire('alice'));
  assert.equal(denied(quota.tryAcquire('alice')).code, 'too_many_requests');
  lease(quota.tryAcquire('bob')); // bob has his own allowance
});
