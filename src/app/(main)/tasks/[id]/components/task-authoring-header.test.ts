import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(
  'src/app/(main)/tasks/[id]/components/task-authoring-header.tsx',
  'utf8',
);

test('task authoring header uses the unified recipe and function terminology', () => {
  assert.match(source, /label: '食谱\/功能'/);
  assert.doesNotMatch(source, /单一食谱功能/);
});
