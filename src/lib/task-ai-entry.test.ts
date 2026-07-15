import assert from 'node:assert/strict';
import test from 'node:test';

// @ts-expect-error -- Node's native TypeScript runner requires the explicit extension, while the project resolver disallows it.
import { getTaskAiEntryPrompt, TASK_AI_ENTRY_OPTIONS } from './task-ai-entry.ts';

test('task AI entry choices provide direct exploration prompts', () => {
  assert.deepEqual(
    TASK_AI_ENTRY_OPTIONS.map((entry) => entry.id),
    ['senses', 'recipes'],
  );

  const senses = getTaskAiEntryPrompt('senses');
  const recipes = getTaskAiEntryPrompt('recipes');
  assert.match(senses, /五感体验/);
  assert.match(senses, /不要直接写入/);
  assert.match(recipes, /食谱功能/);
  assert.match(recipes, /不要直接写入/);
});
