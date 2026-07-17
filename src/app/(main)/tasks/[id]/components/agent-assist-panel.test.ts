import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(
  'src/app/(main)/tasks/[id]/components/agent-assist-panel.tsx',
  'utf8',
);

test('preset prompts are automatically sent without filling the chat textbox', () => {
  assert.match(source, /autoSubmitPrompt\?: string/);
  assert.match(source, /void sendMessage\(autoSubmitPrompt\)/);
  assert.doesNotMatch(source, /setInput\(initialPrompt\)/);
});
