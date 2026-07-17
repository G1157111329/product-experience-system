import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const pickerSource = readFileSync('src/components/material-picker.tsx', 'utf8');
const railSource = readFileSync(
  'src/app/(main)/tasks/[id]/components/material-evidence-rail.tsx',
  'utf8',
);

test('matrix picker uploads notify the shared task material library', () => {
  assert.match(pickerSource, /task-materials:changed/);
  assert.match(pickerSource, /detail:\s*\{\s*taskId\s*\}/);
  assert.match(railSource, /addEventListener\('task-materials:changed'/);
  assert.match(railSource, /event\.detail\?\.taskId === taskId/);
});
