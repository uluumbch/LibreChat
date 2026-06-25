import { test } from 'node:test';
import assert from 'node:assert/strict';
import { expandPrompt, parseLeadingCommand } from './commands';

test('parseLeadingCommand: bare command', () => {
  assert.deepEqual(parseLeadingCommand('/status'), { name: 'status', args: '' });
});

test('parseLeadingCommand: command with args', () => {
  assert.deepEqual(parseLeadingCommand('/summarize the last 3 turns'), {
    name: 'summarize',
    args: 'the last 3 turns',
  });
});

test('parseLeadingCommand: lowercases the name, trims surrounding space', () => {
  assert.deepEqual(parseLeadingCommand('  /Summarize  Foo  '), { name: 'summarize', args: 'Foo' });
});

test('parseLeadingCommand: non-command text is null (passthrough)', () => {
  assert.equal(parseLeadingCommand('hello world'), null);
  assert.equal(parseLeadingCommand('what is 2/3?'), null);
});

test('parseLeadingCommand: a lone slash is not a command', () => {
  assert.equal(parseLeadingCommand('/'), null);
  assert.equal(parseLeadingCommand('/ space first'), null);
});

test('expandPrompt: substitutes {{args}}', () => {
  assert.equal(expandPrompt('Translate to French: {{args}}', 'hello'), 'Translate to French: hello');
});

test('expandPrompt: appends args when no placeholder', () => {
  assert.equal(expandPrompt('Summarize this.', 'extra'), 'Summarize this.\n\nextra');
});

test('expandPrompt: template only when no args', () => {
  assert.equal(expandPrompt('Summarize this.', ''), 'Summarize this.');
});
