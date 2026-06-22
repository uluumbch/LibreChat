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

const FREE = { maxConcurrentTurns: 2, turnsPerMinute: 100 };
const DEDICATED = { maxConcurrentTurns: 5, turnsPerMinute: 100 };

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
  const quota = new UserQuota();
  const a = lease(quota.tryAcquire('u', FREE));
  lease(quota.tryAcquire('u', FREE));
  assert.equal(denied(quota.tryAcquire('u', FREE)).code, 'too_many_requests');
  a.release();
  lease(quota.tryAcquire('u', FREE)); // a freed slot is reusable
});

test('rate-limits sustained turns and refills over time', () => {
  const quota = new UserQuota();
  const policy = { maxConcurrentTurns: 100, turnsPerMinute: 2 }; // 2-token burst, refill 2/min
  const t0 = 1_000_000;
  lease(quota.tryAcquire('u', policy, t0));
  lease(quota.tryAcquire('u', policy, t0));
  assert.equal(denied(quota.tryAcquire('u', policy, t0)).code, 'rate_limited');
  lease(quota.tryAcquire('u', policy, t0 + 31_000)); // ~1 token refilled after 31s
});

test('dedicated tier grants a higher concurrency allowance', () => {
  const quota = new UserQuota();
  for (let i = 0; i < 5; i += 1) {
    lease(quota.tryAcquire('u', DEDICATED));
  }
  assert.equal(denied(quota.tryAcquire('u', DEDICATED)).code, 'too_many_requests');
});

test('release is idempotent so a double release cannot inflate concurrency', () => {
  const quota = new UserQuota();
  const policy = { maxConcurrentTurns: 1, turnsPerMinute: 100 };
  const a = lease(quota.tryAcquire('u', policy));
  denied(quota.tryAcquire('u', policy));
  a.release();
  a.release();
  lease(quota.tryAcquire('u', policy));
  assert.equal(denied(quota.tryAcquire('u', policy)).code, 'too_many_requests');
});

test('quotas are independent per user', () => {
  const quota = new UserQuota();
  const policy = { maxConcurrentTurns: 1, turnsPerMinute: 100 };
  lease(quota.tryAcquire('alice', policy));
  assert.equal(denied(quota.tryAcquire('alice', policy)).code, 'too_many_requests');
  lease(quota.tryAcquire('bob', policy)); // bob has his own allowance
});
