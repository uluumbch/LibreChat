import test from 'node:test';
import assert from 'node:assert/strict';
import { dailyUsageSeries, dayLabel } from './usage';

function daysAgo(n: number): Date {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() - n);
  return d;
}

test('dailyUsageSeries returns one bucket per day, most recent last', () => {
  const series = dailyUsageSeries([], 14);
  assert.equal(series.length, 14);
  assert.equal(series[13]!.label, dayLabel(new Date()));
  assert.ok(series.every((p) => p.credits === 0 && p.messages === 0));
});

test('dailyUsageSeries sums credits and counts replies into the right day', () => {
  const series = dailyUsageSeries(
    [
      { createdAt: daysAgo(0), credits: 5 },
      { createdAt: daysAgo(0), credits: 3 },
      { createdAt: daysAgo(1), credits: 10 },
    ],
    7,
  );
  const today = series[series.length - 1]!;
  const yesterday = series[series.length - 2]!;
  assert.deepEqual({ credits: today.credits, messages: today.messages }, { credits: 8, messages: 2 });
  assert.deepEqual(
    { credits: yesterday.credits, messages: yesterday.messages },
    { credits: 10, messages: 1 },
  );
});

test('dailyUsageSeries ignores rows outside the window', () => {
  const series = dailyUsageSeries([{ createdAt: daysAgo(30), credits: 99 }], 7);
  assert.equal(
    series.reduce((sum, p) => sum + p.credits, 0),
    0,
  );
});
