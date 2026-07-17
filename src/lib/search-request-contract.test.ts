import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const tasks = readFileSync('src/app/(main)/tasks/page.tsx', 'utf8');
const standards = readFileSync('src/app/(main)/standards/components/experience-standards-section.tsx', 'utf8');

for (const [name, source] of [['tasks', tasks], ['standards', standards]] as const) {
  test(`${name} search debounces input and cancels stale requests`, () => {
    assert.match(source, /useDebouncedValue/);
    assert.match(source, /new AbortController\(\)/);
    assert.match(source, /controller\.abort\(\)/);
    assert.match(source, /signal:\s*signal/);
  });
}

test('task search keeps previous rows visible while refreshing', () => {
  assert.match(tasks, /loading && tasks\.length === 0/);
});

test('standard search keeps previous rows visible while refreshing', () => {
  assert.match(standards, /loading && standards\.length === 0/);
  assert.match(standards, /errorMessage && standards\.length === 0/);
  assert.match(standards, /errorMessage && standards\.length > 0/);
});
