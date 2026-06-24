import assert from 'node:assert/strict';
import { test } from 'node:test';

// pool.ts imports config, which validates env at module load — provide a minimal env.
process.env.DATABASE_URL ??= 'postgresql://localhost:5432/test';
process.env.JWT_SECRET ??= 'test-secret';
process.env.JWT_REFRESH_SECRET ??= 'test-refresh-secret';
process.env.HERMES_GATEWAYS ??=
  '[{"id":"default","model":"hermes-agent","baseURL":"http://localhost:8642","apiKey":"test"}]';

const { GatewayPool, PooledGateway } = await import('./pool');
const { HttpError } = await import('../errors');

function cfg(id: string, model: string) {
  return { id, model, baseURL: 'http://localhost:8642', apiKey: 'test' };
}

test('resolve spreads new conversations to the least-loaded gateway', async () => {
  const pool = new GatewayPool([cfg('g1', 'm1'), cfg('g2', 'm1')]);
  await pool.byGatewayId('g1')!.acquire(); // g1 now has one fewer free slot than g2
  assert.equal(pool.resolve('m1').id, 'g2');
});

test('resolve avoids unhealthy gateways even when they are less loaded', async () => {
  const pool = new GatewayPool([cfg('g1', 'm1'), cfg('g2', 'm1')]);
  pool.byGatewayId('g1')!.markUnhealthy();
  await pool.byGatewayId('g2')!.acquire(); // g2 is busier but healthy
  assert.equal(pool.resolve('m1').id, 'g2');
});

test('resolve falls back to the default model for unknown or null models', () => {
  const pool = new GatewayPool([cfg('a', 'hermes-agent'), cfg('b', 'fast')]);
  assert.equal(pool.resolve('fast').id, 'b');
  assert.equal(pool.resolve('nope').model, 'hermes-agent');
  assert.equal(pool.resolve(null).model, 'hermes-agent');
});

test('acquire is bounded and reports busy when saturated', async () => {
  const gateway = new PooledGateway(cfg('solo', 'm1'));
  const releases: Array<() => void> = [];
  for (let i = 0; i < 8; i += 1) {
    releases.push(await gateway.acquire(50));
  }
  await assert.rejects(
    gateway.acquire(30),
    (err: unknown) => err instanceof HttpError && err.code === 'hermes_busy',
  );
  releases[0]!();
  const release = await gateway.acquire(30); // a freed slot becomes reusable
  assert.equal(typeof release, 'function');
});

test('snapshot reports per-gateway load and health', async () => {
  const pool = new GatewayPool([cfg('g1', 'm1')]);
  await pool.byGatewayId('g1')!.acquire();
  pool.byGatewayId('g1')!.markUnhealthy();
  const [snap] = pool.snapshot();
  assert.equal(snap!.id, 'g1');
  assert.equal(snap!.healthy, false);
  assert.equal(snap!.activeRuns, 1);
  assert.equal(snap!.availableSlots, 7);
});
