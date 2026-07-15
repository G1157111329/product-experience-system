import assert from 'node:assert/strict';
import test from 'node:test';

// Node 24 executes this focused test with native TypeScript stripping.
// @ts-expect-error -- Node's native TypeScript runner requires the explicit extension, while the project resolver disallows it.
import { buildReportListEntries } from './report-merge.ts';

test('keeps ineligible same-model reports standalone while grouping eligible latest task reports', () => {
  const entries = buildReportListEntries([
    { id: 'model-old', task_id: 'task-a', product_model: 'YMJ-K40Z7', project_type: '\u524d\u671f\u7814\u7a76', created_at: '2026-06-01T00:00:00.000Z' },
    { id: 'model-latest', task_id: 'task-a', product_model: 'YMJ-K40Z7', project_type: '\u81ea\u7814', created_at: '2026-07-14T00:00:00.000Z' },
    { id: 'model-stage', task_id: 'task-b', product_model: 'YMJ-K40Z7', project_type: '\u6539\u578b\u964d\u672c\u4f18\u5316', created_at: '2026-07-12T00:00:00.000Z' },
    { id: 'same-model-odm', task_id: 'task-c', product_model: 'YMJ-K40Z7', project_type: 'ODM', created_at: '2026-07-13T00:00:00.000Z' },
    { id: 'standalone', task_id: 'task-d', product_model: 'ABC-01', project_type: '\u7ade\u54c1\u7814\u7a76', created_at: '2026-07-15T00:00:00.000Z' },
  ]);

  assert.deepEqual(entries.map((entry) => entry.kind), ['report', 'group', 'report']);

  const [newest, merged, odm] = entries;
  assert.equal(newest?.kind, 'report');
  assert.equal(newest?.report.id, 'standalone');
  assert.equal(merged?.kind, 'group');
  assert.equal(merged?.model, 'YMJ-K40Z7');
  assert.deepEqual(merged?.reports.map((report) => report.id), ['model-latest', 'model-stage']);
  assert.equal(odm?.kind, 'report');
  assert.equal(odm?.report.id, 'same-model-odm');
});
