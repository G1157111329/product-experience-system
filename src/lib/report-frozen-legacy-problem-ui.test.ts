import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '..', '..');
const issueRow = readFileSync(resolve(root, 'src/app/(main)/reports/[id]/components/issue-row.tsx'), 'utf8');
const functionEffects = readFileSync(resolve(root, 'src/app/(main)/reports/[id]/components/report-function-effect-tab.tsx'), 'utf8');

test('frozen report recipe steps retain historical step problem points as read-only context', () => {
  assert.match(issueRow, /步骤问题点/);
  assert.match(functionEffects, /步骤问题点/);
});

test('frozen report labels comparison-origin issues as comparison items', () => {
  assert.match(issueRow, /source_assembly_id/);
  assert.match(issueRow, /对比项/);
});
