import assert from 'node:assert/strict';
import type { FrozenReportViewModel } from './report-frozen-view';
import { buildPrintReportViewModel, renderPrintReportHtml } from './server/report-print-renderer';

const pixel = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';

function frozenModel(matrix: FrozenReportViewModel['matrix']): FrozenReportViewModel {
  return {
    snapshotResolution: 'anchored',
    header: {
      id: `paper-${matrix?.kind ?? 'none'}`,
      title: 'Paper report',
      reportType: matrix?.kind === 'comparison' ? 'comparison_report' : 'single_report',
      status: 'published',
      productModel: 'Model P',
    },
    tabs: ['summary', 'issues', 'data_matrix', 'function_effect'],
    summary: { text: 'Frozen summary', aiSummary: null },
    issues: [{
      id: 'issue-1', title: 'Frozen issue', details: 'Frozen issue details', level: 'II', sourceType: 'record_fail',
      evidence: [{ id: 'issue-image', name: 'issue.jpg', type: 'image', url: pixel }],
      liveOverlay: {
        status: 'rectifying', rectification: 'Replace seal', evidence: [],
        reEvaluations: [{ id: 'reeval-1', description: 'Retest passed', materials: [{ id: 'reeval-image', name: 'reeval.jpg', type: 'image', url: pixel }] }],
      },
    }],
    matrix,
    functionEffects: [{
      id: 'effect-1', name: 'Juice effect', evaluation: 'Clear and stable', score: '8', problemPoints: [{ text: 'Foam remains' }],
      evidence: [{ id: 'effect-video', name: 'effect.mp4', type: 'video', url: '/api/materials/file/video-no-extension' }],
      steps: [],
    }],
    capabilities: { canManageIssues: false, canShare: false, canExport: true },
  };
}

const v2 = frozenModel({
  kind: 'data_v2',
  projection: {
    matrixId: 'v2',
    schema: { name: 'V2 Juice Matrix', dimensions: [{ dimensionKey: 'yield', displayName: 'Yield', columnGroup: 'calculated', unitCode: '%' }] },
    viewport: { totalGroups: 1, totalRows: 1 },
    groups: [{ id: 'group-1', label: 'Apple group', rows: [{
      id: 'row-1', subject: { label: 'Sample A' }, metrics: { yield: { value: 0 } },
      slots: { result: { summary: 'Stable' }, process: { note: 'No shake' }, issues: { count: 2, severitySummary: ['II'] } },
      evidence: { media: [{ id: 'v2-image', name: 'v2.jpg', type: 'image', url: pixel }] },
    }] }],
  },
});

const v3 = frozenModel({
  kind: 'data_v3',
  projection: {
    matrixProjectionVersion: 'v3', matrixId: 'v3', matrixName: 'V3 Juice Matrix',
    columns: [
      { id: 'temperature', zone: 'detail_dimension', label: 'Temperature', unitText: 'C', displayOrder: 1 },
      { id: 'evaluation', zone: 'evaluation', label: 'Evaluation', displayOrder: 2 },
    ],
    rows: [{ id: 'row-v3', level1Label: 'Use effect', level2Label: 'Juice output', level3Label: 'Apple', cells: { temperature: '0', evaluation: 'Clear' } }],
    cellMedia: { 'row-v3:temperature': [{ id: 'v3-video', name: 'v3.mp4', type: 'video', url: '/api/materials/file/v3-video' }] },
    narratives: [{ blockType: 'summary', content: 'V3 stable', showInReport: true }], issuePoints: [],
    summary: { totalRows: 1, totalColumns: 2 },
  },
});

for (const [model, expected] of [
  [v2, ['V2 Juice Matrix', 'Apple group / Sample A', 'Yield', '0 %', 'v2.jpg']],
  [v3, ['V3 Juice Matrix', 'Use effect / Juice output / Apple', 'Temperature', '0 C', 'Clear', 'v3.mp4']],
] as const) {
  const before = JSON.stringify(model);
  const projected = buildPrintReportViewModel(model);
  assert.equal(JSON.stringify(model), before, 'print projection must not mutate the frozen source');
  assert.equal(projected.sourceReportId, model.header.id);
  assert.equal(projected.matrix?.kind, model.matrix?.kind);
  const html = renderPrintReportHtml(projected, new Date('2026-07-13T00:00:00.000Z'));
  for (const expectedText of expected) assert.equal(html.includes(expectedText), true, `missing ${expectedText}`);
  for (const expectedText of ['Frozen summary', 'Frozen issue', 'Retest passed', 'reeval.jpg', 'Juice effect', 'Foam remains', 'VIDEO', 'effect.mp4']) {
    assert.equal(html.includes(expectedText), true, `missing ${expectedText}`);
  }
  assert.doesNotMatch(html, /role=["']tab/);
  assert.doesNotMatch(html, /overflow-x\s*:\s*auto/i);
  assert.doesNotMatch(html, /<video\b/i);
  assert.doesNotMatch(html, /\bcontrols\b/i);
}

const comparison = frozenModel({
  kind: 'comparison',
  snapshot: {
    matrix_name: 'Comparison Matrix', objects: [{ id: 'a', label: 'Machine A' }, { id: 'b', label: 'Machine B' }],
    item_nodes: [{ id: 'row-c', node_type: 'item', label: 'Juice quality', parent_label: 'Effect' }],
    cells: [
      { item_node_id: 'row-c', object_id: 'a', effect_summary: 'Clear', process_notes: ['Fast cycle'], problem_points: ['Foam'], inline_media: [{ id: 'comparison-video', name: 'comparison.mp4', type: 'video', url: '/api/materials/file/comparison' }] },
      { item_node_id: 'row-c', comparison_object_id: 'b', value: 'Cloudy' },
    ],
  },
});
assert.equal(buildPrintReportViewModel(v2).page.orientation, 'portrait');
assert.equal(buildPrintReportViewModel(v3).page.orientation, 'portrait');
assert.equal(buildPrintReportViewModel(comparison).page.orientation, 'landscape');
const comparisonHtml = renderPrintReportHtml(buildPrintReportViewModel(comparison));
for (const expectedText of ['Comparison Matrix', 'Juice quality', 'Fast cycle', 'Foam', 'comparison.mp4']) {
  assert.equal(comparisonHtml.includes(expectedText), true, `missing comparison ${expectedText}`);
}
const v2Html = renderPrintReportHtml(buildPrintReportViewModel(v2));
assert.equal(v2Html.includes('问题 2 个'), true);
assert.equal(v2Html.includes('II'), true);

console.log('report print renderer tests passed');
