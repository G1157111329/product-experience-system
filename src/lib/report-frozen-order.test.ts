import assert from 'node:assert/strict';
import { buildFrozenReportViewModel } from './report-frozen-view';

const stableIssueOrder = buildFrozenReportViewModel({
  report: { id: 'stable-order-report', report_type: 'comparison_report', content: {} },
  snapshot: { snapshot_json: { report_content: {} } },
  snapshotResolution: 'anchored',
  issues: [
    { id: 'matrix', source_report_id: 'stable-order-report', source_type: 'matrix_issue', created_at: '2026-07-15T08:00:00.000Z' },
    { id: 'function-new', source_report_id: 'stable-order-report', source_type: 'recipe_problem', created_at: '2026-07-15T11:00:00.000Z' },
    { id: 'sensory', source_report_id: 'stable-order-report', source_type: 'record_fail', created_at: '2026-07-15T12:00:00.000Z' },
    { id: 'comparison', source_report_id: 'stable-order-report', source_type: 'recipe_problem', source_assembly_id: 'assembly-1', created_at: '2026-07-15T07:00:00.000Z' },
    { id: 'function-old', source_report_id: 'stable-order-report', source_type: 'recipe_problem', created_at: '2026-07-15T09:00:00.000Z' },
  ],
}, { audience: 'internal' });

assert.deepEqual(
  stableIssueOrder.issues.map((item) => item.id),
  ['sensory', 'function-old', 'function-new', 'comparison', 'matrix'],
  'all report surfaces share source-group order and oldest-first order inside each group',
);

const frozenIssueCreationWins = buildFrozenReportViewModel({
  report: { id: 'issue-time-report', report_type: 'single_report', content: {} },
  snapshot: { snapshot_json: { report_content: {
    records: [{ id: 'record-time', evaluation_result: 'fail', created_at: '2026-07-01T00:00:00.000Z' }],
    issues: [{ id: 'issue-time', record_id: 'record-time', source_type: 'record_fail', created_at: '2026-07-10T00:00:00.000Z' }],
  } } },
  snapshotResolution: 'anchored',
  issues: [{ id: 'issue-time', record_id: 'record-time', source_type: 'record_fail', created_at: '2026-07-11T00:00:00.000Z' }],
}, { audience: 'share' });

assert.equal(
  frozenIssueCreationWins.issues[0]?.createdAt,
  '2026-07-10T00:00:00.000Z',
  'frozen issue creation time must not be overwritten by its source record time',
);

console.log('frozen report ordering tests passed');
