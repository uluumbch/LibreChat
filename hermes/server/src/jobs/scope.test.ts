import test from 'node:test';
import assert from 'node:assert/strict';
import type { HermesJob } from '@hermes/shared';
import { JOB_NAME_RE, toJobSummary, userJobPrefix, userJobTag } from './scope';

test('userJobTag is stable and 8 hex chars', () => {
  const a = userJobTag('user-1');
  assert.match(a, /^[0-9a-f]{8}$/);
  assert.equal(a, userJobTag('user-1'));
  assert.notEqual(a, userJobTag('user-2'));
});

test('userJobPrefix wraps the tag and JOB_NAME_RE recovers it', () => {
  const prefix = userJobPrefix('user-1');
  const match = JOB_NAME_RE.exec(`${prefix}Morning digest`);
  assert.ok(match);
  assert.equal(match[1], userJobTag('user-1'));
});

test('JOB_NAME_RE ignores unscoped names', () => {
  assert.equal(JOB_NAME_RE.exec('Plain job'), null);
});

test('toJobSummary strips the owner prefix from the display name', () => {
  const prefix = userJobPrefix('user-1');
  const job: HermesJob = {
    id: 'j1',
    name: `${prefix}Morning digest`,
    prompt: 'summarize inbox',
    schedule_display: 'every day · 9:00 AM',
    enabled: true,
    next_run_at: '2026-06-24T09:00:00.000Z',
  };
  const summary = toJobSummary(job, prefix);
  assert.equal(summary.name, 'Morning digest');
  assert.equal(summary.prompt, 'summarize inbox');
  assert.equal(summary.enabled, true);
  assert.equal(summary.nextRunAt, '2026-06-24T09:00:00.000Z');
});
