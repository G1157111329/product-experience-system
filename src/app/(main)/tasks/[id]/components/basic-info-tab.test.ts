import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(
  'src/app/(main)/tasks/[id]/components/basic-info-tab.tsx',
  'utf8',
);

test('task report information uses constrained selectors for the four classified fields', () => {
  assert.match(source, /fetch\('\/api\/categories'\)/);
  assert.match(source, /aria-label="产品品类"/);
  assert.match(source, /aria-label="产品"/);
  assert.match(source, /aria-label="项目类型"/);
  assert.match(source, /shouldSelectProjectPhase\(task\.project_type\)/);
  assert.doesNotMatch(source, /key: 'product_category' as const, type: 'inline-text' as const/);
  assert.doesNotMatch(source, /key: 'project_type' as const, type: 'inline-text' as const/);
});
