import assert from 'node:assert/strict';
import type { FrozenReportViewModel } from './report-frozen-view';
import { buildPrintReportViewModel, pdfProfileForPrintModel, renderPrintReportHtml } from './server/report-print-renderer';

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
        retest: {
          count: 1,
          latest: { id: 'reeval-1', result: 'qualified', description: 'Retest passed', createdAt: null, createdBy: null, evidence: [{ id: 'reeval-image', name: 'reeval.jpg', type: 'image', url: pixel }] },
        },
      },
    }],
    matrix,
    functionEffects: [{
      recipeId: 'effect-1', subjectName: 'Juice effect食谱', name: 'Juice effect', formula: '', parameters: null, evaluationStatus: 'qualified', evaluation: 'Clear and stable',
      evidence: [{ id: 'effect-video', name: 'effect.mp4', type: 'video', url: '/api/materials/file/videos/effect.mp4' }],
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
  for (const expectedText of ['Frozen summary', 'Frozen issue', 'Retest passed', 'reeval.jpg', 'Juice effect', '合格', 'VIDEO', 'effect.mp4']) {
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
    matrix_name: 'Comparison Matrix', objects: [{ id: 'a', label: 'Machine A' }],
    item_nodes: [
      { id: 'parent-c', node_type: 'section', node_label: 'Effect' },
      { id: 'row-c', node_type: 'metric', node_label: 'Juice quality', parent_id: 'parent-c' },
    ],
    cells: [
      {
        item_node_id: 'row-c', object_id: 'a', metric_value: '72.1%', measurement_value: '71%', manual_score: 8,
        process_notes: ['Fast cycle'], problem_points: ['Foam'],
        inline_media: [{ id: 'comparison-video', name: 'comparison.mp4', material_type: 'video', file_path: 'videos/comparison.mp4' }],
        appendix_media: [{ id: 'comparison-video', name: 'duplicate-by-id.mp4', material_type: 'video', file_path: 'videos/comparison-copy.mp4' }],
        media: [
          { id: 'legacy-by-url', name: 'duplicate-by-url.mp4', material_type: 'video', file_path: 'videos/comparison-copy.mp4' },
          { id: 'legacy-by-name', name: 'comparison.mp4', material_type: 'video', file_path: 'videos/other.mp4' },
        ],
      },
    ],
  },
});
assert.equal(buildPrintReportViewModel(v2).page.orientation, 'portrait');
assert.equal(buildPrintReportViewModel(v3).page.orientation, 'portrait');
assert.deepEqual(buildPrintReportViewModel(comparison).page, { paper: 'A4', orientation: 'portrait' });
const comparisonPrint = buildPrintReportViewModel(comparison);
assert.equal(comparisonPrint.matrix?.kind === 'comparison' ? comparisonPrint.matrix.rows[0]?.cells.a.media.length : 0, 2, 'same id or URL deduplicates while different id/URL with the same name remains');
assert.equal(comparisonPrint.matrix?.kind === 'comparison' ? comparisonPrint.matrix.rows[0]?.cells.a.value : '', '72.1%');
assert.equal(comparisonPrint.matrix?.kind === 'comparison' ? (comparisonPrint.matrix.rows[0]?.cells.a as { score?: string }).score : '', '8');
const comparisonHtml = renderPrintReportHtml(comparisonPrint);
for (const expectedText of ['Comparison Matrix', 'Effect / Juice quality', '72.1%', '评分：</b>8', 'Fast cycle', 'Foam', 'comparison.mp4', '/api/materials/poster/videos/comparison.mp4']) {
  assert.equal(comparisonHtml.includes(expectedText), true, `missing comparison ${expectedText}`);
}
assert.match(comparisonHtml, /<img[^>]+data-video-poster/);
assert.equal((comparisonHtml.match(/data-media-id="comparison-video"/g) || []).length, 1);
assert.equal((comparisonHtml.match(/data-media-id="legacy-by-name"/g) || []).length, 1);

const tallNarrowComparison = frozenModel({
  kind: 'comparison',
  snapshot: {
    matrix_name: 'Tall narrow comparison',
    objects: [{ id: 'only-object', object_name: 'Only object' }],
    item_nodes: Array.from({ length: 8 }, (_, index) => ({ id: `short-row-${index}`, node_type: 'metric', node_label: `M${index}` })),
    cells: [],
  },
});
const tallNarrowPrint = buildPrintReportViewModel(tallNarrowComparison);
assert.deepEqual(tallNarrowPrint.page, { paper: 'A4', orientation: 'portrait' });
assert.equal(pdfProfileForPrintModel(tallNarrowPrint).id, 'comparison_a4_portrait');

const threeShortObjects = frozenModel({
  kind: 'comparison',
  snapshot: {
    matrix_name: 'Three short objects',
    objects: Array.from({ length: 3 }, (_, index) => ({ id: `short-object-${index}`, object_name: `${index}` })),
    item_nodes: [{ id: 'short-metric', node_type: 'metric', node_label: 'M' }],
    cells: [],
  },
});
assert.deepEqual(buildPrintReportViewModel(threeShortObjects).page, { paper: 'A4', orientation: 'portrait' });

const wideComparison = frozenModel({
  kind: 'comparison',
  snapshot: {
    matrix_name: 'Wide comparison',
    objects: Array.from({ length: 4 }, (_, index) => ({ id: `object-${index}`, object_name: `Object ${index}` })),
    item_nodes: [{ id: 'wide-row', node_type: 'metric', node_label: 'Wide metric' }],
    cells: [],
  },
});
const widePrint = buildPrintReportViewModel(wideComparison);
assert.deepEqual(widePrint.page, { paper: 'A3', orientation: 'landscape' });
assert.equal(pdfProfileForPrintModel(widePrint).id, 'comparison_a3_landscape');
const anchoredComparison = frozenModel({
  kind: 'comparison',
  snapshot: {
    layout_profile: 'comparison_image_matrix_a3_landscape',
    matrix_name: 'Anchored comparison',
    objects: [{ id: 'only-object', object_name: 'Only object' }],
    item_nodes: [{ id: 'anchored-metric', node_type: 'metric', node_label: 'M' }],
    cells: [],
  },
});
assert.deepEqual(
  buildPrintReportViewModel(anchoredComparison).page,
  { paper: 'A3', orientation: 'landscape' },
  'an explicit frozen comparison layout remains authoritative for browser and server PDF output',
);
const v2Html = renderPrintReportHtml(buildPrintReportViewModel(v2));
assert.equal(v2Html.includes('问题 2 个'), true);
assert.equal(v2Html.includes('II'), true);

console.log('report print renderer tests passed');
