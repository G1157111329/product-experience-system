import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
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
  snapshotResolution: 'anchored' as const,
  issues: [{
    id: 'issue-1',
    record_id: 'record-1',
    title: 'Mutated live title',
    description: 'Mutated live detail',
    status: 'verified_closed',
    improve_plan: 'Live rectification',
  }, {
    id: 'issue-post-freeze',
    title: 'Created after report freeze',
    status: 'pending',
  }],
  issueEvidence: {
    'issue-1': [{ id: 'material-2', name: 'Aggregated', type: 'image', url: '/uploads/aggregated.png' }],
  },
});

const internal = buildFrozenReportViewModel(fixture(), { audience: 'internal' });
const shared = buildFrozenReportViewModel(fixture(), { audience: 'share' });

assert.deepEqual(shared.tabs, internal.tabs);
assert.deepEqual(shared.header, internal.header);
assert.deepEqual(shared.summary, internal.summary);
assert.deepEqual(shared.issues, internal.issues);
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
assert.deepEqual(internal.issues.map((item) => item.id), ['issue-1']);
assert.deepEqual(internal.issues[0]?.evidence.map((item) => item.id), ['material-1']);
assert.deepEqual(internal.issues[0]?.liveOverlay, {
  status: 'verified_closed',
  rectification: 'Live rectification',
  reEvaluations: [],
  evidence: [{ id: 'material-2', name: 'Aggregated', type: 'image', url: '/uploads/aggregated.png' }],
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
  snapshotResolution: 'anchored',
  issues: [],
}, { audience: 'share' });
assert.equal(comparison.matrix?.kind, 'comparison');
assert.deepEqual(comparison.tabs, ['summary', 'issues', 'comparison_matrix']);

const dataV2 = buildFrozenReportViewModel({
  report: { id: 'report-v2', report_type: 'single_report', content: {} },
  snapshot: {
    snapshot_json: {
      matrix_projection: {
        groups: [{ rows: [{
          metrics: { temperature: { state: 'valid', value: 85 } },
          slots: { result: { status: 'pending' }, process: {}, issues: { count: 0 } },
          evidence: { primaryCount: 0, previewIds: [], media: [] },
        }] }],
      },
    },
  },
  snapshotResolution: 'anchored',
}, { audience: 'internal' });
assert.equal(dataV2.matrix?.kind, 'data_v2');

const empty = buildFrozenReportViewModel({
  report: { id: 'report-empty', report_type: 'single_report', content: {} },
  snapshot: { snapshot_json: {} },
  snapshotResolution: 'anchored',
}, { audience: 'internal' });
assert.equal(empty.matrix, null);

const legacy = buildFrozenReportViewModel({
  report: { id: 'legacy-report', report_type: 'single_report', content: {} },
  snapshot: { snapshot_json: {} },
  snapshotResolution: 'legacy_latest',
  issues: [{ id: 'legacy-issue', title: 'Legacy-only issue' }],
}, { audience: 'internal' });
assert.deepEqual(legacy.issues.map((item) => item.id), ['legacy-issue']);

const frozenProblems = buildFrozenReportViewModel({
  report: {
    id: 'report-problems',
    report_type: 'single_report',
    content: {
      recipes: [{
        id: 'recipe-problem',
        name: 'Frozen recipe',
        effect_problem_point: JSON.stringify([{
          text: 'Frozen effect problem',
          material_ids: ['effect-material'],
        }]),
        effect_materials: [{
          id: 'effect-material',
          file_url: '/uploads/frozen-effect.png',
        }],
        recipe_steps: [{
          id: 'step-problem',
          step_number: 1,
          operation: 'Frozen step operation',
          problem_points: [{ text: 'Frozen step problem', material_ids: ['step-material'] }],
          materials: [{ id: 'step-material', file_url: '/uploads/frozen-step.png' }],
        }],
      }],
    },
  },
  snapshot: {
    snapshot_json: {
      matrix_projection: {
        matrixProjectionVersion: 'v3',
        matrixId: 'matrix-problems',
        columns: [{ id: 'column-issue', label: 'Issue' }],
        rows: [{ id: 'leaf-problem', cells: { 'column-issue': 'fail' } }],
        issuePoints: [{
          id: 'matrix-point',
          leafRowId: 'leaf-problem',
          columnId: 'column-issue',
          issueText: 'Frozen V3 matrix problem',
          status: 'open',
          materialIds: ['matrix-material'],
        }],
        cellMedia: {
          'leaf-problem:column-issue': [{
            materialId: 'matrix-material',
            materialType: 'image',
            fileName: 'matrix.png',
            fileUrl: '/uploads/frozen-matrix.png',
          }],
        },
      },
    },
  },
  snapshotResolution: 'anchored',
  issues: [
    { id: 'live-effect', title: 'Frozen effect problem', source_type: 'recipe_problem', status: 'verified' },
    { id: 'live-step', title: 'Frozen step problem', source_type: 'recipe_problem', status: 'rectifying' },
    { id: 'live-matrix', source_cell_id: 'matrix-point', source_type: 'matrix_problem', title: 'Mutated matrix title', status: 'pending' },
  ],
}, { audience: 'internal' });

assert.deepEqual(
  frozenProblems.issues.map((issue) => ({
    id: issue.id,
    title: issue.title,
    evidence: issue.evidence.map((item) => item.id),
    status: issue.liveOverlay.status,
  })),
  [
    { id: 'live-effect', title: 'Frozen effect problem', evidence: ['effect-material'], status: 'verified' },
    { id: 'live-step', title: 'Frozen step problem', evidence: ['step-material'], status: 'rectifying' },
    { id: 'live-matrix', title: 'Frozen V3 matrix problem', evidence: ['matrix-material'], status: 'pending' },
  ],
);

const shareRouteSource = readFileSync(
  resolve(process.cwd(), 'src/app/api/reports/share/route.ts'),
  'utf8',
);
assert.doesNotMatch(shareRouteSource, /loadReEvaluationsMap/);
assert.doesNotMatch(shareRouteSource, /\.from\('issue_re_evaluations'\)/);
assert.doesNotMatch(shareRouteSource, /\.from\('issues'\)/);

console.log('report frozen view model tests passed');
