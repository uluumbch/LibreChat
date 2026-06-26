import test from 'node:test';
import assert from 'node:assert/strict';
import { dailyCostSeries, dailyUsageSeries, dayLabel, modelCostUsd } from './usage';

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

test('modelCostUsd recomputes from per-1M prices', () => {
  // 1,000,000 input @ $3 + 500,000 output @ $15 = 3.00 + 7.50 = 10.50
  assert.equal(modelCostUsd(1_000_000, 500_000, 3, 15), 10.5);
  assert.equal(modelCostUsd(0, 0, 3, 15), 0);
});

test('modelCostUsd is null when either price is unset', () => {
  assert.equal(modelCostUsd(1000, 1000, null, 15), null);
  assert.equal(modelCostUsd(1000, 1000, 3, null), null);
  assert.equal(modelCostUsd(1000, 1000, null, null), null);
});

test('dailyCostSeries sums recomputed USD per day; unpriced/pool add zero', () => {
  const prices = new Map([
    ['gpt', { inputUsdPerMTok: 3, outputUsdPerMTok: 15 }],
    ['cheap', { inputUsdPerMTok: null, outputUsdPerMTok: null }],
  ]);
  const rows = [
    { createdAt: daysAgo(0), model: 'gpt', inputTokens: 1_000_000, outputTokens: 0 }, // $3
    { createdAt: daysAgo(0), model: 'cheap', inputTokens: 1_000_000, outputTokens: 0 }, // unpriced → $0
    { createdAt: daysAgo(0), model: null, inputTokens: 5000, outputTokens: 5000 }, // pool → $0
  ];
  const series = dailyCostSeries(rows, 7, prices);
  const today = series[series.length - 1]!;
  assert.equal(today.cost, 3);
  assert.equal(today.messages, 3);
});
