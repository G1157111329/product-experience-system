import assert from 'node:assert/strict';
import { buildFrozenReportViewModel } from './report-frozen-view';

const fixture = () => ({
  report: {
    id: 'report-1',
    title: 'Frozen report',
    report_type: 'single_report',
    status: 'published',
    content: {
      ai_summary: { summary: 'Frozen summary' },
      records: [{
        id: 'record-1',
        check_item: 'Frozen issue title',
        problem_description: 'Frozen issue detail',
        evaluation_result: '不合格',
        materials: [{ id: 'material-1', file_url: '/uploads/frozen.png' }],
      }],
      recipes: [{ id: 'recipe-1', name: 'Juice', effect_description: 'Stable result' }],
    },
  },
  snapshot: {
    snapshot_json: {
      matrix_projection: {
        projectionVersion: 'v3',
        matrixId: 'matrix-1',
        columns: [{ id: 'column-1', label: 'Temperature' }],
        rows: [{ id: 'row-1', cells: { 'column-1': '85℃' } }],
      },
    },
  },
  issues: [{
    id: 'issue-1',
    record_id: 'record-1',
    title: 'Mutated live title',
    description: 'Mutated live detail',
    status: 'verified_closed',
    improve_plan: 'Live rectification',
  }],
  issueEvidence: {
    'issue-1': [{ id: 'material-2', name: 'Aggregated', type: 'image', url: '/uploads/aggregated.png' }],
  },
});

const internal = buildFrozenReportViewModel(fixture(), { audience: 'internal' });
const shared = buildFrozenReportViewModel(fixture(), { audience: 'share' });

assert.deepEqual(shared.tabs, internal.tabs);
assert.deepEqual(shared.issues.map((issue) => issue.id), internal.issues.map((issue) => issue.id));
assert.deepEqual(shared.functionEffects, internal.functionEffects);
assert.deepEqual(shared.matrix, internal.matrix);
assert.equal(shared.capabilities.canManageIssues, false);
assert.equal(shared.capabilities.canShare, false);
assert.equal(internal.capabilities.canManageIssues, true);
assert.equal(internal.capabilities.canShare, true);
assert.equal(internal.matrix?.kind, 'data_v3');
assert.deepEqual(internal.tabs, ['summary', 'issues', 'data_matrix', 'function_effect']);
assert.equal(internal.issues[0]?.title, 'Frozen issue title');
assert.equal(internal.issues[0]?.details, 'Frozen issue detail');
assert.deepEqual(internal.issues[0]?.evidence.map((item) => item.id), ['material-2']);
assert.deepEqual(internal.issues[0]?.liveOverlay, {
  status: 'verified_closed',
  rectification: 'Live rectification',
  reEvaluations: [],
});

const comparison = buildFrozenReportViewModel({
  report: { id: 'report-2', title: 'Comparison', report_type: 'comparison_report', content: null },
  snapshot: {
    snapshot_json: {
      objects: [{ id: 'object-1' }],
      item_nodes: [{ id: 'item-1' }],
      cells: [{ id: 'cell-1', effect_summary: 'Frozen comparison result' }],
    },
  },
  issues: [],
}, { audience: 'share' });
assert.equal(comparison.matrix?.kind, 'comparison');
assert.deepEqual(comparison.tabs, ['summary', 'issues', 'comparison_matrix']);

console.log('report frozen view model tests passed');
