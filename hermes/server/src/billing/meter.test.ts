import test from 'node:test';
import assert from 'node:assert/strict';
import { creditsForUsage, tokensUsed } from './meter';

test('tokensUsed prefers totalTokens, else sums input + output', () => {
  assert.equal(tokensUsed({ totalTokens: 4200 }), 4200);
  assert.equal(tokensUsed({ inputTokens: 1000, outputTokens: 500 }), 1500);
  assert.equal(tokensUsed({}), 0);
});

test('creditsForUsage is free for empty usage', () => {
  assert.equal(creditsForUsage({}, 1), 0);
  assert.equal(creditsForUsage({ totalTokens: 0 }, 1), 0);
});

test('creditsForUsage charges at least 1 credit for any usage', () => {
  // At 1 credit / 1k tokens, 120 tokens rounds to 0 but is floored to 1.
  assert.equal(creditsForUsage({ totalTokens: 120 }, 1), 1);
});

test('creditsForUsage scales with tokens at the given rate', () => {
  assert.equal(creditsForUsage({ totalTokens: 1000 }, 1), 1);
  assert.equal(creditsForUsage({ totalTokens: 4800 }, 1), 5);
  assert.equal(creditsForUsage({ inputTokens: 31000, outputTokens: 17000 }, 1), 48);
  assert.equal(creditsForUsage({ totalTokens: 1000 }, 2), 2);
});
