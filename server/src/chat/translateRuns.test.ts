import test from 'node:test';
import assert from 'node:assert/strict';
import { ChatStreamEventType, ContentPartType } from '@hermes/shared';
import type { ChatStreamEvent } from '@hermes/shared';
import { RunsAccumulator } from './translateRuns';
import type { RawSseEvent } from './parse';

/** A Runs-API SSE frame: data-only, with the event type inside the JSON. */
function frame(obj: Record<string, unknown>): RawSseEvent {
  return { event: 'message', data: JSON.stringify(obj) };
}

function feed(acc: RunsAccumulator, frames: RawSseEvent[]): ChatStreamEvent[] {
  const events: ChatStreamEvent[] = [];
  for (const f of frames) {
    events.push(...acc.handle(f));
  }
  return events;
}

test('streams text deltas and assembles the final message + usage', () => {
  const acc = new RunsAccumulator();
  const events = feed(acc, [
    frame({ event: 'message.delta', run_id: 'r1', delta: 'Hello ' }),
    frame({ event: 'message.delta', run_id: 'r1', delta: 'world' }),
    frame({
      event: 'run.completed',
      run_id: 'r1',
      output: 'Hello world',
      usage: { input_tokens: 5, output_tokens: 2, total_tokens: 7 },
    }),
  ]);
  assert.equal(events.filter((e) => e.type === ChatStreamEventType.Delta).length, 2);
  assert.equal(acc.finalText(), 'Hello world');
  assert.equal(acc.done, true);
  assert.equal(acc.finishReason, 'stop');
  assert.deepEqual(acc.usage, { inputTokens: 5, outputTokens: 2, totalTokens: 7 });
  const parts = acc.contentParts();
  assert.equal(parts.length, 1);
  assert.equal(parts[0]?.type, ContentPartType.Text);
});

test('tool lifecycle becomes a completed tool step with duration', () => {
  const acc = new RunsAccumulator();
  const events = feed(acc, [
    frame({ event: 'tool.started', run_id: 'r1', tool: 'terminal', preview: 'ls' }),
    frame({ event: 'tool.completed', run_id: 'r1', tool: 'terminal', duration: 0.5 }),
    frame({ event: 'run.completed', run_id: 'r1', output: 'done' }),
  ]);
  assert.equal(events.filter((e) => e.type === ChatStreamEventType.ToolStep).length, 2);
  const tool = acc.contentParts().find((p) => p.type === ContentPartType.ToolStep);
  assert.ok(tool && tool.type === ContentPartType.ToolStep);
  assert.equal(tool.status, 'completed');
  assert.equal(tool.durationMs, 500);
});

test('emits an approval gate and hides "always" when not permanent', () => {
  const acc = new RunsAccumulator();
  const [event] = feed(acc, [
    frame({
      event: 'approval.request',
      run_id: 'r1',
      command: 'rm -rf /tmp/x',
      description: 'delete a file',
      choices: ['once', 'session', 'always', 'deny'],
      allow_permanent: false,
    }),
  ]);
  assert.ok(event && event.type === ChatStreamEventType.Approval);
  assert.equal(event.command, 'rm -rf /tmp/x');
  assert.equal(event.allowPermanent, false);
  assert.deepEqual(event.choices, ['once', 'session', 'deny']);
});

test('reasoning is captured as a separate part from visible text', () => {
  const acc = new RunsAccumulator();
  const events = feed(acc, [
    frame({ event: 'reasoning.available', run_id: 'r1', text: 'thinking…' }),
    frame({ event: 'message.delta', run_id: 'r1', delta: 'answer' }),
    frame({ event: 'run.completed', run_id: 'r1' }),
  ]);
  assert.ok(events.some((e) => e.type === ChatStreamEventType.Reasoning));
  const parts = acc.contentParts();
  assert.ok(parts.some((p) => p.type === ContentPartType.Reasoning));
  assert.ok(parts.some((p) => p.type === ContentPartType.Text));
  assert.equal(acc.finalText(), 'answer');
});

test('surfaces run.completed output when nothing streamed', () => {
  const acc = new RunsAccumulator();
  const events = feed(acc, [frame({ event: 'run.completed', run_id: 'r1', output: 'final only' })]);
  assert.equal(events.filter((e) => e.type === ChatStreamEventType.Delta).length, 1);
  assert.equal(acc.finalText(), 'final only');
});

test('run.failed produces an error event and marks the turn errored', () => {
  const acc = new RunsAccumulator();
  const [event] = feed(acc, [frame({ event: 'run.failed', run_id: 'r1', error: 'boom' })]);
  assert.ok(event && event.type === ChatStreamEventType.Error);
  assert.equal(event.message, 'boom');
  assert.equal(acc.errored, true);
  assert.equal(acc.finishReason, 'error');
});

test('ignores unknown events and malformed frames', () => {
  const acc = new RunsAccumulator();
  const events = feed(acc, [
    { event: 'message', data: 'not json' },
    frame({ event: 'some.unknown.event', run_id: 'r1' }),
  ]);
  assert.equal(events.length, 0);
});
