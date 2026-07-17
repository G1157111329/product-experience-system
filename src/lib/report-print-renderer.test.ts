import assert from 'node:assert/strict';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ReportPrintDocument } from '@/components/reports/report-section-block-renderer';
import type { FrozenReportViewModel } from './report-frozen-view';
import { buildPrintReportViewModel, pdfProfileForPrintModel, printReportMedia, printReportMediaOccurrences, renderPrintReportHtml } from './server/report-print-renderer';

const pixel = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';

globalThis.React = React;

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
    summary: {
      text: 'Frozen summary', aiSummary: null, taskInfo: null,
      stats: { issueCount: 1, sensoryIssueCount: 1, functionIssueCount: 0, comparisonIssueCount: 0, rectificationRate: 0 },
    },
    issues: [{
      id: 'issue-1', canManage: false, title: 'Frozen issue', details: 'Frozen issue details', level: 'II', sourceType: 'record_fail', sourceKind: 'sensory',
      context: { object: '', project: '', item: '' },
      evidence: [{ id: 'issue-image', name: 'issue.jpg', type: 'image', url: pixel }],
      liveOverlay: {
        status: 'rectifying', rectification: 'Replace seal', evidence: [],
        retest: {
          count: 3,
          latest: { id: 'reeval-1', result: 'qualified', description: 'Retest passed', createdAt: '2026-07-15T00:00:00.000Z', createdBy: null, evidence: [{ id: 'reeval-image', name: 'reeval.jpg', type: 'image', url: pixel }] },
          history: [
            { id: 'reeval-1', result: 'qualified', description: 'Retest passed', createdAt: '2026-07-15T00:00:00.000Z', createdBy: null, evidence: [{ id: 'reeval-image', name: 'reeval.jpg', type: 'image', url: pixel }] },
            { id: 'reeval-middle', result: 'unqualified', description: 'Middle retest failed', createdAt: '2026-07-14T00:00:00.000Z', createdBy: 'Tester', evidence: [{ id: 'reeval-middle-image', name: 'reeval-middle.jpg', type: 'image', url: pixel }] },
            { id: 'reeval-oldest', result: 'unqualified', description: 'Oldest retest failed', createdAt: '2026-07-13T00:00:00.000Z', createdBy: 'Tester', evidence: [{ id: 'reeval-oldest-image', name: 'reeval-oldest.jpg', type: 'image', url: pixel }] },
          ],
        },
      },
    }, {
      id: 'recipe-issue-1', canManage: false, title: 'Juice effect recipe/function effect failed', details: 'Frozen recipe issue details', level: 'I', sourceType: 'recipe_problem', sourceKind: 'function',
      context: { object: '', project: '', item: '' },
      recipe: {
        recipeId: 'effect-1', subjectName: 'Juice effect recipe/function', name: 'Juice effect', formula: 'Apple + water', parameters: null,
        evaluationStatus: 'qualified', effectScore: '', evaluation: 'Clear and stable', evidence: [{ id: 'recipe-context-media', name: 'recipe-context.jpg', type: 'image', url: pixel }],
        steps: [{ id: 'historic-step-1', stepNumber: 1, operation: 'Blend', problemPoints: ['Historic frozen step issue'], evidence: [{ id: 'step-image', name: 'step.jpg', type: 'image', url: pixel }] }],
      },
      evidence: [{ id: 'recipe-issue-media', name: 'recipe-issue.jpg', type: 'image', url: pixel }],
      liveOverlay: { status: 'open', rectification: '', evidence: [], retest: { count: 0, latest: null, history: [] } },
    }],
    matrix,
    functionEffects: [{
      recipeId: 'effect-1', subjectName: 'Juice effect食谱', name: 'Juice effect', formula: '', parameters: null, evaluationStatus: 'qualified', effectScore: '', evaluation: 'Clear and stable',
      evidence: [
        { id: 'recipe-context-media', name: 'recipe-context.jpg', type: 'image', url: pixel },
        { id: 'recipe-issue-media', name: 'recipe-issue.jpg', type: 'image', url: pixel },
        { id: 'effect-video', name: 'effect.mp4', type: 'video', url: '/api/materials/file/videos/effect.mp4' },
      ],
      steps: [{ id: 'historic-step-1', stepNumber: 1, operation: 'Blend', problemPoints: ['Historic frozen step issue'], evidence: [{ id: 'step-image', name: 'step.jpg', type: 'image', url: pixel }] }],
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

const dataMatrixOnly = frozenModel(null);
dataMatrixOnly.dataMatrix = v3.matrix;
const dataMatrixOnlyPrint = buildPrintReportViewModel(dataMatrixOnly);
assert.equal(dataMatrixOnlyPrint.matrix?.kind, 'data_v3', 'a frozen data matrix stored on dataMatrix must be printed');
assert.equal(dataMatrixOnlyPrint.matrix?.kind === 'data_v3' ? dataMatrixOnlyPrint.matrix.rows.length : 0, 1);
assert.equal(
  dataMatrixOnlyPrint.matrix?.kind === 'data_v3' ? dataMatrixOnlyPrint.matrix.rows[0]?.media[0]?.posterUrl : undefined,
  '/api/materials/poster/v3-video',
  'data matrix videos must derive a printable poster before browser/PDF asset preparation',
);

for (const [model, expected] of [
  [v2, ['V2 Juice Matrix', 'Apple group', 'Sample A', 'Yield', '0 %', 'v2.jpg']],
  [v3, ['V3 Juice Matrix', 'Use effect', 'Juice output', 'Apple', 'Temperature', '0 C', 'Clear', 'v3.mp4']],
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

const singleRecipeHtml = renderPrintReportHtml(buildPrintReportViewModel(v2));
const rectificationProjectionHtml = renderPrintReportHtml(buildPrintReportViewModel(v2, [{
  id: 'issue-1',
  improve_plan: 'Replace the seal assembly',
  responsible_person: 'Li Wei',
  responsible_dept: 'Quality',
  plan_complete_date: '2026-07-20',
  rectificationHistory: [
    { action_plan: 'Old rectification plan', responsible_person: 'Old owner', plan_complete_date: '2026-07-01', created_at: '2026-07-01T00:00:00.000Z' },
    { action_plan: 'Latest rectification plan', responsible_person: 'Latest owner', plan_complete_date: '2026-07-21', created_at: '2026-07-02T00:00:00.000Z' },
  ],
  latestReEvaluation: { result: 'qualified', description: 'Latest retest passed' },
}]));
for (const expectedText of ['Latest rectification plan', 'Latest owner', '2026-07-21', 'Latest retest passed']) {
  assert.equal(rectificationProjectionHtml.includes(expectedText), true, `print/PDF must render the latest rectification projection: missing ${expectedText}`);
}
for (const omittedText of ['Old rectification plan', 'Old owner', '2026-07-01', 'Middle retest failed', 'Oldest retest failed']) {
  assert.equal(rectificationProjectionHtml.includes(omittedText), false, `print/PDF must not render historical rectification or retest entries: found ${omittedText}`);
}
const deletedRetestHtml = renderPrintReportHtml(buildPrintReportViewModel(v2, [{
  id: 'issue-1',
  reEvaluationCount: 0,
  latestReEvaluation: null,
  verification_note: 'This historical note is not a current retest',
}]));
for (const omittedText of ['Retest passed', 'Middle retest failed', 'Oldest retest failed', 'This historical note is not a current retest', '最新整改复测：']) {
  assert.equal(deletedRetestHtml.includes(omittedText), false, `deleted retests must not fall back to frozen or issue-note content: found ${omittedText}`);
}
const rectificationProjectionDocumentHtml = renderToStaticMarkup(React.createElement(ReportPrintDocument, {
  model: buildPrintReportViewModel(v2, [{
    id: 'issue-1',
    improve_plan: 'Production rectification plan',
    responsible_person: 'Production owner',
    responsible_dept: 'Production quality',
    plan_complete_date: '2026-07-22',
    rectificationHistory: [
      { action_plan: 'Old document rectification plan', responsible_person: 'Old document owner', plan_complete_date: '2026-07-01', created_at: '2026-07-01T00:00:00.000Z' },
      { action_plan: 'Latest document rectification plan', responsible_person: 'Latest document owner', responsible_dept: 'Latest document quality', plan_complete_date: '2026-07-23', created_at: '2026-07-02T00:00:00.000Z' },
    ],
    latestReEvaluation: { result: 'qualified', description: 'Latest projected retest passed' },
  }]),
}));
for (const expectedText of ['Latest document rectification plan', 'Latest document owner / Latest document quality', '2026-07-23', 'Latest projected retest passed']) {
  assert.equal(rectificationProjectionDocumentHtml.includes(expectedText), true, `print document must render the latest rectification projection while rectifying: missing ${expectedText}`);
}
assert.equal(rectificationProjectionDocumentHtml.includes('复测结果：'), true, 'browser print must label the latest retest as a result');
for (const omittedText of ['Old document rectification plan', 'Old document owner', 'Middle retest failed', 'Oldest retest failed', 'Retest passed']) {
  assert.equal(rectificationProjectionDocumentHtml.includes(omittedText), false, `print document must omit historical or superseded retests: found ${omittedText}`);
}
const metadataOnlyRectificationModel = buildPrintReportViewModel(v2, [{
  id: 'issue-1',
  responsible_person: 'Metadata-only owner',
  plan_complete_date: '2026-07-24',
}]);
metadataOnlyRectificationModel.issues[0].liveOverlay.rectification = '';
const metadataOnlyRectificationHtml = renderToStaticMarkup(React.createElement(ReportPrintDocument, { model: metadataOnlyRectificationModel }));
for (const expectedText of ['Metadata-only owner', '2026-07-24']) {
  assert.equal(metadataOnlyRectificationHtml.includes(expectedText), true, `print document must render rectification metadata without a plan: missing ${expectedText}`);
}
assert.equal(metadataOnlyRectificationHtml.includes('整改方案：'), false, 'print document must not render an empty rectification plan row');
const canonicalSummaryModel = frozenModel(null);
canonicalSummaryModel.summary.text = 'Legacy summary text that must not override the frozen structured summary';
canonicalSummaryModel.summary.aiSummary = {
  tag: '建议整改',
  summary: 'Canonical frozen summary',
  strengths: ['Stable output'],
  risks: ['Difficult cleaning'],
  suggestions: ['Improve detachable structure'],
};
const canonicalSummaryHtml = renderPrintReportHtml(buildPrintReportViewModel(canonicalSummaryModel));
for (const expectedText of ['建议整改', 'Canonical frozen summary', '主要优势', 'Stable output', '主要风险', 'Difficult cleaning', '后续建议', 'Improve detachable structure']) {
  assert.equal(canonicalSummaryHtml.includes(expectedText), true, `print summary must match the frozen/share summary: missing ${expectedText}`);
}
assert.equal(
  canonicalSummaryHtml.includes('Legacy summary text that must not override the frozen structured summary'),
  false,
  'structured frozen summary must be authoritative when it exists',
);
assert.doesNotMatch(canonicalSummaryHtml, /<figcaption\b/i, 'print/PDF media must not display material names');
assert.equal(singleRecipeHtml.includes('Retest passed'), true, 'print/PDF keeps the latest retest');
assert.equal(singleRecipeHtml.includes('Oldest retest failed'), false, 'print/PDF omits historical retests');
assert.equal(singleRecipeHtml.includes('Middle retest failed'), false, 'print/PDF omits intermediate retests');
const printMediaIds = printReportMedia(buildPrintReportViewModel(v2)).map((item) => item.id);
assert.equal(printMediaIds.includes('reeval-image'), true, 'print asset preparation includes the latest retest evidence');
assert.equal(printMediaIds.includes('reeval-oldest-image'), false, 'print asset preparation omits historical retest evidence');
assert.equal(printMediaIds.includes('reeval-middle-image'), false, 'print asset preparation omits intermediate retest evidence');
for (const expectedText of ['（合格）', '食谱效果评价', 'Historic frozen step issue', '问题点', 'recipe-issue.jpg']) {
  assert.equal(singleRecipeHtml.includes(expectedText), true, `single recipe print list is missing ${expectedText}`);
}
assert.equal(singleRecipeHtml.includes('判断：合格'), false, 'print/PDF must use the current status label instead of the retired judgment prefix');
assert.equal(printReportMedia(buildPrintReportViewModel(v2)).some((item) => item.id === 'recipe-context-media'), true, 'recipe issue context media must be included in print media preparation');
assert.equal(printReportMedia(buildPrintReportViewModel(v2)).filter((item) => item.id === 'recipe-context-media').length, 1, 'recipe context media enters print preparation exactly once');
assert.equal(printReportMedia(buildPrintReportViewModel(v2)).filter((item) => item.id === 'recipe-issue-media').length, 1, 'explicit issue media enters print preparation exactly once');
assert.equal((singleRecipeHtml.match(/data-media-id="recipe-context-media"/g) ?? []).length, 1, 'recipe context media is rendered once across issue and function sections');

const duplicateMediaReferences = buildPrintReportViewModel(v2);
const sharedMedia = duplicateMediaReferences.issues[0].evidence[0];
duplicateMediaReferences.functionEffects[0].evidence.push({ ...sharedMedia });
assert.equal(printReportMediaOccurrences(duplicateMediaReferences).filter((item) => item.id === sharedMedia.id).length, 2, 'print preparation visits every cloned media reference');
assert.equal(printReportMedia(duplicateMediaReferences).filter((item) => item.id === sharedMedia.id).length, 1, 'public print media inventory remains deduplicated');

const legacyMissingStepArrays = JSON.parse(JSON.stringify(v2));
delete legacyMissingStepArrays.functionEffects[0].steps[0].problemPoints;
delete legacyMissingStepArrays.functionEffects[0].steps[0].evidence;
const legacyRecipeIssue = legacyMissingStepArrays.issues.find((issue: { recipe?: unknown }) => issue.recipe);
assert.ok(legacyRecipeIssue?.recipe, 'fixture must include a recipe issue');
delete legacyRecipeIssue.recipe.steps[0].problemPoints;
delete legacyRecipeIssue.recipe.steps[0].evidence;
assert.doesNotThrow(
  () => renderPrintReportHtml(buildPrintReportViewModel(legacyMissingStepArrays)),
  'legacy frozen recipe steps without array fields must remain printable',
);
assert.equal(singleRecipeHtml.includes('recipe-issue.jpg'), true, 'explicit issue evidence remains visible in print HTML');
assert.match(singleRecipeHtml, /data-print-issue-meta/, 'print issue rows must keep level, source, description, and status as separate metadata units');
assert.match(singleRecipeHtml, /data-print-issue-status/, 'print issue rows must expose a dedicated rectification-status unit');
assert.doesNotMatch(singleRecipeHtml, /class="function-issues"/, 'function effect print must not repeat the issue list after the single recipe entry');

const comparison = frozenModel({
  kind: 'comparison',
  snapshot: {
    matrix_name: 'Comparison Matrix', objects: [{ id: 'a', label: 'Machine A' }],
    item_nodes: [
      { id: 'parent-c', node_type: 'section', node_label: 'Effect' },
      { id: 'row-c', node_type: 'metric', node_label: 'Juice quality', parent_id: 'parent-c' },
      { id: 'summary-c', node_type: 'summary', node_label: '本大类小结', parent_id: 'parent-c', config: { summary_text: '稳定性小结' } },
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
comparison.issues.push({
  ...comparison.issues[0]!,
  id: 'comparison-source-issue',
  title: 'Comparison matrix issue',
  details: 'Foam comparison issue',
  sourceType: 'recipe_problem',
  sourceKind: 'comparison',
});
const comparisonWithDataMatrix = frozenModel(comparison.matrix);
comparisonWithDataMatrix.dataMatrix = v3.matrix;
assert.equal(
  renderPrintReportHtml(buildPrintReportViewModel(comparisonWithDataMatrix)).includes('V3 Juice Matrix'),
  true,
  'a report with both frozen matrices must print the data matrix after its comparison matrix',
);
assert.deepEqual(buildPrintReportViewModel(v2).page, { paper: 'A4', orientation: 'landscape' });
assert.deepEqual(buildPrintReportViewModel(v3).page, { paper: 'A4', orientation: 'landscape' });
assert.deepEqual(buildPrintReportViewModel(comparison).page, { paper: 'A4', orientation: 'landscape' });
const comparisonPrint = buildPrintReportViewModel(comparison);
const comparisonItem = comparisonPrint.matrix?.kind === 'comparison' ? comparisonPrint.matrix.rows.find((row) => row.rowKind === 'item') : undefined;
assert.equal(comparisonItem?.cells.a.media.length, 3, 'stable media identity uses id first; URL is the fallback only when id is absent');
assert.equal(comparisonItem?.cells.a.value, '72.1%');
assert.equal(comparisonItem?.cells.a.score, '8');
assert.equal(comparisonPrint.matrix?.kind === 'comparison' ? comparisonPrint.matrix.rows.find((row) => row.rowKind === 'summary')?.summaryText : '', '稳定性小结');
const comparisonHtml = renderPrintReportHtml(comparisonPrint);
assert.match(comparisonHtml, /食谱\/功能-对比矩阵/);
for (const expectedText of ['Comparison Matrix', 'Effect', 'Juice quality', '本大类小结', '稳定性小结', '72.1%', '评分：</b>8', 'Fast cycle', 'Foam', 'comparison.mp4', '/api/materials/poster/videos/comparison.mp4']) {
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
assert.deepEqual(tallNarrowPrint.page, { paper: 'A4', orientation: 'landscape' });
assert.equal(pdfProfileForPrintModel(tallNarrowPrint).id, 'comparison_a4_landscape');

const threeShortObjects = frozenModel({
  kind: 'comparison',
  snapshot: {
    matrix_name: 'Three short objects',
    objects: Array.from({ length: 3 }, (_, index) => ({ id: `short-object-${index}`, object_name: `${index}` })),
    item_nodes: [{ id: 'short-metric', node_type: 'metric', node_label: 'M' }],
    cells: [],
  },
});
assert.deepEqual(buildPrintReportViewModel(threeShortObjects).page, { paper: 'A4', orientation: 'landscape' });

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
assert.deepEqual(widePrint.page, { paper: 'A4', orientation: 'landscape' });
assert.equal(pdfProfileForPrintModel(widePrint).id, 'comparison_a4_landscape');
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
  { paper: 'A4', orientation: 'landscape' },
  'an explicit frozen comparison layout remains authoritative for browser and server PDF output',
);
const v2Html = renderPrintReportHtml(buildPrintReportViewModel(v2));
assert.equal(v2Html.includes('问题 2 个'), true);
assert.equal(v2Html.includes('II'), true);
assert.match(v2Html, /class="data-matrix-table"/, 'data matrix prints as one complete table rather than row cards');
assert.doesNotMatch(v2Html, /class="paper-fields"/, 'data matrix print should not split fields into card grids');

const mislabeledVideo = frozenModel(null);
mislabeledVideo.functionEffects[0]!.evidence = [{
  id: 'historical-mislabeled-video',
  name: '2026071509465601.mp4',
  type: 'image',
  url: '/api/materials/file/materials/task-1/2026071509465601.mp4',
}];
const mislabeledVideoPrint = buildPrintReportViewModel(mislabeledVideo);
const normalizedHistoricalVideo = printReportMedia(mislabeledVideoPrint).find((item) => item.id === 'historical-mislabeled-video')!;
assert.equal(normalizedHistoricalVideo.type, 'video', 'a historical MP4 must be normalized as video even when its stored material_type says image');
assert.equal(
  normalizedHistoricalVideo.posterUrl,
  '/api/materials/poster/materials/task-1/2026071509465601.mp4',
  'a historical MP4 must use the poster derivative in print/PDF output',
);
assert.doesNotMatch(
  renderPrintReportHtml(mislabeledVideoPrint),
  /<img(?![^>]*data-video-poster)[^>]+src="[^"]*\.mp4/i,
  'print/PDF must never render a video file URL as a regular image',
);

const absoluteVideo = frozenModel(null);
absoluteVideo.functionEffects[0]!.evidence = [{
  id: 'absolute-video',
  name: 'absolute.mp4',
  type: 'image',
  url: 'http://localhost:5000/api/materials/file/materials/task-1/absolute.mp4?token=signed',
}];
assert.equal(
  printReportMedia(buildPrintReportViewModel(absoluteVideo)).find((item) => item.id === 'absolute-video')!.posterUrl,
  '/api/materials/poster/materials/task-1/absolute.mp4',
  'an absolute application media URL must still resolve to the local poster derivative',
);

console.log('report print renderer tests passed');
