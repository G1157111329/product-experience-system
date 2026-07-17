import assert from 'node:assert/strict';
import test from 'node:test';

// Node 24 executes this focused test with native TypeScript stripping.
// @ts-expect-error -- TypeScript's project resolver intentionally omits .ts extensions.
import { buildFrozenReportViewModel } from './report-frozen-view.ts';
// @ts-expect-error -- focused native TypeScript test.
import { buildPrintReportViewModel, renderPrintReportHtml } from './server/report-print-renderer.ts';

const media = (id: string) => ({ id, file_url: `/uploads/${id}.jpg`, file_name: `${id}.jpg` });

test('projects the four frozen issue kinds with their report-only context', () => {
const model = buildFrozenReportViewModel({
  report: { id: 'report-four-kinds', title: 'Frozen issue projection', report_type: 'comparison_report', content: {} },
  snapshot: {
    snapshot_json: {
      report_content: {
        records: [{
          id: 'record-sensory',
          // A sensory record can retain an old or misleading category label. It must never turn into a recipe issue.
          standard_category: 'recipe/function effect evaluation',
          standard_type: 'general standard',
          touch_point: 'control panel',
          experience_standard: 'button response within one second',
          check_result: 'button response is delayed',
          check_item: 'start button',
          evaluation_result: 'fail',
          materials: [media('sensory-proof')],
        }, {
          id: 'record-non-standard',
          standard_category: '\u975e\u6807\u51c6',
          check_item: 'custom noise check',
          problem_description: 'motor noise is intrusive',
          evaluation_result: 'fail',
          materials: [media('non-standard-proof')],
        }],
        recipes: [{
          id: 'recipe-frozen',
          name: 'Fresh noodle',
          recipe_type: 'recipe',
          effect_status: 'unqualified',
          effect_description: 'texture is too soft',
          effect_materials: [media('recipe-proof')],
        }],
      },
      matrix_projection: {
        matrixProjectionVersion: 'v3',
        rows: [{
          id: 'row-data',
          level1Label: 'performance',
          level2Label: 'mixing',
          level3Label: 'uniformity',
        }],
        columns: [{ id: 'column-data', label: 'standard deviation' }],
        cellMedia: {
          'row-data:column-data': [media('matrix-proof')],
        },
        issuePoints: [{
          id: 'matrix-issue',
          leafRowId: 'row-data',
          columnId: 'column-data',
          issueText: 'comparison value is out of tolerance',
          materialIds: ['matrix-proof'],
        }],
      },
      objects: [{ id: 'object-a', object_name: 'competitor A' }],
      item_nodes: [{ id: 'comparison-project', node_label: 'heating' }, {
        id: 'comparison-item', parent_id: 'comparison-project', node_label: 'noodle texture',
      }],
      cells: [{
        id: 'comparison-cell',
        object_id: 'object-a',
        item_node_id: 'comparison-item',
        effect_summary: 'texture is not stable',
        problem_points: [{ text: 'texture is inconsistent' }],
        inline_media: [media('comparison-proof')],
      }],
    },
  },
  snapshotResolution: 'anchored',
  issues: [{
    id: 'live-recipe',
    recipe_id: 'recipe-frozen',
    source_type: 'recipe_problem',
    status: 'verified_closed',
    _reEvaluations: [
      { id: 'retest-old', result: 'pending', created_at: '2026-07-10T00:00:00.000Z', materials: [media('old-retest')] },
      { id: 'retest-latest', result: 'qualified', created_at: '2026-07-12T00:00:00.000Z', materials: [media('latest-retest')] },
    ],
  }, {
    id: 'live-matrix',
    source_cell_id: 'matrix-issue',
    source_type: 'matrix_issue',
    status: 'verified_closed',
    _reEvaluations: [
      { id: 'matrix-retest', result: 'qualified', created_at: '2026-07-13T00:00:00.000Z', materials: [media('matrix-retest-proof')] },
    ],
  }],
}, { audience: 'internal' });

const sensory = model.issues.find((issue) => issue.id === 'record-sensory')!;
assert.equal(sensory.sourceKind, 'sensory', 'a frozen record is always a five-sense issue, regardless of its category text');
assert.equal(sensory.title, 'start button', 'the five-sense list title is the frozen inspection item');
assert.equal(sensory.details, 'button response is delayed', 'the observed description remains the expanded detail');
assert.equal(sensory.recipe, undefined);
assert.deepEqual(sensory.context, {
  object: '',
  project: '',
  item: 'start button',
  standardType: 'general standard',
  inspectionRange: 'control panel',
  inspectionStandard: 'button response within one second',
  nonStandardContent: '',
  descriptionResult: 'button response is delayed',
  checkResult: 'fail',
  primaryCategory: '',
  secondaryDetail: '',
  comparisonDimension: '',
  isNonStandard: false,
});

test('projects string comparison points and report-content matrix points into the printable issue list', () => {
  const model = buildFrozenReportViewModel({
    report: { id: 'report-print-all-sources', title: 'All sources', report_type: 'comparison_report', content: {} },
    snapshot: {
      snapshot_json: {
        report_content: {
          records: [{ id: 'record-print', check_item: '触点安全性', evaluation_result: 'fail', check_requirement: '：边缘不应割手，操作反馈清晰' }],
          recipes: [{ id: 'recipe-print', name: '面条模式', effect_status: 'pending', effect_description: '面条成型待确认' }],
          data_matrix_projection: {
            matrixProjectionVersion: 'v3',
            rows: [{ id: 'row-print', level1Label: '制面效果', level2Label: '面团', level3Label: '成型' }],
            columns: [{ id: 'column-print', label: '成型均匀度' }],
            issuePoints: [{ id: 'matrix-print', leafRowId: 'row-print', columnId: 'column-print', issueText: '成型不均匀' }],
          },
        },
        objects: [{ id: 'object-print', object_name: '竞品 A' }],
        item_nodes: [{ id: 'comparison-print', node_label: '揉面效果' }],
        cells: [{ id: 'comparison-cell-print', object_id: 'object-print', item_node_id: 'comparison-print', problem_points: ['边缘粘附明显'] }],
      },
    },
    snapshotResolution: 'anchored',
  }, { audience: 'internal' });

  assert.deepEqual(
    model.issues.map((issue) => issue.sourceKind).sort(),
    ['comparison', 'function', 'matrix', 'sensory'],
  );
  assert.equal(model.issues.find((issue) => issue.sourceKind === 'sensory')?.context.inspectionRange, '边缘不应割手，操作反馈清晰');
  const html = renderPrintReportHtml(buildPrintReportViewModel(model));
  for (const text of ['触点安全性', '面条模式', '成型不均匀', '边缘粘附明显']) {
    assert.equal(html.includes(text), true, `printable issue list is missing ${text}`);
  }
});
assert.deepEqual(sensory.evidence.map((item) => item.id), ['sensory-proof']);

const nonStandard = model.issues.find((issue) => issue.id === 'record-non-standard')!;
assert.equal(nonStandard.sourceKind, 'sensory');
assert.equal(nonStandard.context.standardType, '', 'non-standard records must not render a standard type row');
assert.equal(nonStandard.context.inspectionRange, '', 'non-standard records must not render a standard scope row');
assert.equal(nonStandard.context.inspectionStandard, '', 'non-standard records must not render a standard requirement row');
assert.equal(nonStandard.context.nonStandardContent, 'custom noise check');
assert.equal(nonStandard.context.descriptionResult, 'motor noise is intrusive');
assert.equal(nonStandard.context.checkResult, 'fail');
assert.equal(nonStandard.context.isNonStandard, true);

const recipe = model.issues.find((issue) => issue.id === 'live-recipe')!;
assert.equal(recipe.sourceKind, 'function');
assert.equal(recipe.title, 'Fresh noodle\u98df\u8c31\u6548\u679c\u4e0d\u5408\u683c');
assert.equal(recipe.recipe?.evaluationStatus, 'unqualified', 'recipe/function issue is the frozen tri-state judgment, never an AI score');
assert.equal(recipe.liveOverlay.retest.count, 2);
assert.equal(recipe.liveOverlay.retest.latest?.id, 'retest-latest', 'only the most recent retest is projected');
assert.deepEqual(recipe.liveOverlay.retest.latest?.evidence.map((item) => item.id), ['latest-retest']);

const comparison = model.issues.find((issue) => issue.id === 'comparison-cell:comparison-cell:problem:0')!;
assert.equal(comparison.sourceKind, 'comparison');
assert.deepEqual(comparison.context, {
  object: 'competitor A',
  project: 'heating',
  item: 'noodle texture',
  standardType: '',
  inspectionRange: '',
  inspectionStandard: '',
  nonStandardContent: '',
  descriptionResult: '',
  checkResult: '',
  primaryCategory: '',
  secondaryDetail: '',
  comparisonDimension: '',
  problemPoints: ['texture is inconsistent'],
  isNonStandard: false,
});
assert.deepEqual(comparison.evidence.map((item) => item.id), ['comparison-proof']);

const dataMatrix = model.issues.find((issue) => issue.id === 'live-matrix')!;
assert.equal(dataMatrix.sourceKind, 'matrix');
assert.equal(dataMatrix.sourceCellId, 'matrix-issue', 'the frozen matrix point must retain a stable source identity');
assert.equal(dataMatrix.liveIssueId, 'live-matrix', 'the frozen matrix point must retain its linked mutable issue');
assert.equal(dataMatrix.liveOverlay.retest.latest?.id, 'matrix-retest', 'matrix rectification must follow the linked issue rather than title matching');
assert.equal(dataMatrix.details, 'comparison value is out of tolerance');
assert.deepEqual(dataMatrix.context, {
  object: '',
  project: '',
  item: '',
  standardType: '',
  inspectionRange: '',
  inspectionStandard: '',
  nonStandardContent: '',
  descriptionResult: '',
  checkResult: '',
  primaryCategory: 'performance',
  secondaryDetail: 'mixing / uniformity',
  comparisonDimension: 'standard deviation',
  isNonStandard: false,
});
assert.deepEqual(dataMatrix.evidence.map((item) => item.id), ['matrix-proof']);
});

test('counts one comparison issue per object and item while retaining every problem line and material', () => {
  const model = buildFrozenReportViewModel({
    report: { id: 'comparison-cell-summary', report_type: 'comparison_report', content: {} },
    snapshot: {
      snapshot_json: {
        report_content: {
          issues: [
            { id: 'legacy-line-1', source_type: 'recipe_problem', source_cell_id: 'cell-1', title: '粘连严重' },
            { id: 'legacy-line-2', source_type: 'recipe_problem', source_cell_id: 'cell-1', title: '拔出困难' },
          ],
        },
        objects: [{ id: 'object-1', object_name: '竞品 A' }],
        item_nodes: [
          { id: 'project-1', node_label: '出面状态' },
          { id: 'item-1', parent_id: 'project-1', node_label: '刀头模具的龙须面' },
        ],
        cells: [{
          id: 'cell-1', object_id: 'object-1', item_node_id: 'item-1',
          problem_points: ['粘连严重', '拔出困难', '粘连严重'],
          inline_media: [media('comparison-cell-proof')],
        }],
      },
    },
    snapshotResolution: 'anchored',
    issues: [{
      id: 'live-comparison', source_report_id: 'comparison-cell-summary', source_type: 'recipe_problem',
      source_cell_id: 'cell-1', title: '粘连严重', status: 'verified_closed', improve_plan: '整改后顺畅',
      _reEvaluations: [
        { id: 'old', result: 'pending', created_at: '2026-07-01T00:00:00.000Z' },
        { id: 'latest', result: 'qualified', created_at: '2026-07-02T00:00:00.000Z' },
      ],
    }],
    issueEvidence: { 'live-comparison': [{ id: 'rectified-proof', name: '整改图', type: 'image', url: '/uploads/rectified.jpg' }] },
  }, { audience: 'internal', manageableIssueIds: new Set(['live-comparison']) });

  assert.equal(model.issues.length, 1, 'problem-point lines inside one object/item cell do not inflate the issue count');
  const issue = model.issues[0]!;
  assert.equal(issue.sourceKind, 'comparison');
  assert.equal(issue.title, '竞品 A（对象）：出面状态（大类）的刀头模具的龙须面（细项）效果不合格');
  assert.deepEqual(issue.context.problemPoints, ['粘连严重', '拔出困难']);
  assert.deepEqual(issue.evidence.map((item) => item.id), ['comparison-cell-proof']);
  assert.equal(issue.liveOverlay.status, 'verified_closed');
  assert.equal(issue.liveOverlay.rectification, '整改后顺畅');
  assert.deepEqual(issue.liveOverlay.evidence.map((item) => item.id), ['rectified-proof']);
  assert.equal(issue.liveOverlay.retest.count, 2);
  assert.equal(issue.liveOverlay.retest.latest?.id, 'latest');
  assert.equal(issue.canManage, true);
  assert.deepEqual(model.summary.stats, {
    issueCount: 1,
    sensoryIssueCount: 0,
    functionIssueCount: 0,
    comparisonIssueCount: 1,
    rectificationRate: 100,
  });
});

test('classifies production-style source-cell recipe rows as comparison and never as function', () => {
  const records = Array.from({ length: 19 }, (_, index) => ({
    id: `sensory-${index}`, check_item: `五感 ${index}`, evaluation_result: 'fail',
  }));
  const cells = Array.from({ length: 30 }, (_, index) => ({
    id: `cell-${index}`, object_id: `object-${index}`, item_node_id: `item-${index}`,
    problem_points: [`问题 ${index}`],
  }));
  const comparisonIssues = Array.from({ length: 37 }, (_, index) => ({
    id: `comparison-${index}`, source_type: 'recipe_problem', source_cell_id: `cell-${index % 30}`,
    title: `问题 ${index % 30}`,
  }));
  const model = buildFrozenReportViewModel({
    report: { id: 'production-8a421-shape', report_type: 'comparison_report', content: {} },
    snapshot: { snapshot_json: {
      report_content: { records, issues: comparisonIssues },
      objects: Array.from({ length: 30 }, (_, index) => ({ id: `object-${index}`, object_name: `对象 ${index}` })),
      item_nodes: Array.from({ length: 30 }, (_, index) => ({ id: `item-${index}`, node_label: `细项 ${index}` })),
      cells,
    } },
    snapshotResolution: 'anchored',
  }, { audience: 'internal' });

  assert.equal(model.summary.stats.issueCount, 49);
  assert.equal(model.summary.stats.sensoryIssueCount, 19);
  assert.equal(model.summary.stats.functionIssueCount, 0, 'source-cell comparison facts must not inflate function totals');
  assert.equal(model.summary.stats.comparisonIssueCount, 30);
});
test('defaults an unknown frozen issue level to 二类 for every report surface', () => {
  const model = buildFrozenReportViewModel({
    report: { id: 'report-unknown-level', title: 'Unknown level', report_type: 'single_report', content: {} },
    snapshot: {
      snapshot_json: {
        report_content: {
          records: [{ id: 'unknown-level-record', check_item: 'edge safety', evaluation_result: 'fail', problem_level: '??' }],
        },
      },
    },
    snapshotResolution: 'anchored',
  }, { audience: 'internal' });

  assert.equal(model.issues[0]?.level, '二类');
  assert.match(renderPrintReportHtml(buildPrintReportViewModel(model)), /二类/);
});
