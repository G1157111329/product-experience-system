import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync('src/app/(main)/tasks/page.tsx', 'utf8');

test('task category bootstrap absorbs transient network failures', () => {
  const fetchCategories = source.match(/const fetchCategories = useCallback\(async \(\) => \{([\s\S]*?)\n  \}, \[\]\);/);

  assert.ok(fetchCategories, 'tasks page should define fetchCategories');
  assert.match(fetchCategories[1], /try\s*\{/);
  assert.match(fetchCategories[1], /readApiJson/);
  assert.match(fetchCategories[1], /catch/);
});
