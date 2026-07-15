import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildFrozenReportViewModel } from './report-frozen-view';

const frozenRecipe = {
  id: 'recipe-frozen',
  name: '冷萃咖啡',
  recipe_type: '食谱',
  ingredients: '咖啡粉 20g；水 300ml',
  parameters: { 水温: '5℃', 时间: '12小时' },
  effect_status: 'unqualified',
  effect_description: '口感偏酸，萃取不稳定。',
  effect_materials: [{ id: 'original-effect', file_url: '/uploads/original-effect.jpg' }],
  recipe_steps: [{
    id: 'step-1',
    step_number: 1,
    operation: '冷藏萃取 12 小时',
    problem_point: '旧步骤问题点不得显示',
    materials: [{ id: 'step-proof', file_url: '/uploads/step-proof.jpg' }],
  }],
};

const model = buildFrozenReportViewModel({
  report: {
    id: 'report-frozen-recipe',
    title: '实时标题不得覆盖冻结内容',
    report_type: 'single_report',
    content: {
      recipes: [{ ...frozenRecipe, name: '实时改名', effect_description: '实时描述不得覆盖' }],
    },
  },
  snapshot: {
    snapshot_json: {
      report_content: {
        ai_summary: { summary: '冻结总结' },
        recipes: [frozenRecipe],
      },
    },
  },
  snapshotResolution: 'anchored',
  issues: [{
    id: 'issue-frozen-recipe',
    recipe_id: 'recipe-frozen',
    title: '实时问题标题不得覆盖',
    status: 'verified_closed',
    improve_plan: '已调整冷萃时间',
    _reEvaluations: [
      {
        id: 'retest-old', result: 'pending', description: '旧复测',
        created_at: '2026-07-10T00:00:00.000Z', created_by: 'u-old',
        materials: [{ id: 'old-proof', file_url: '/uploads/old-proof.jpg' }],
      },
      {
        id: 'retest-latest', result: 'qualified', description: '最新复测合格',
        created_at: '2026-07-11T00:00:00.000Z', created_by: 'u-new',
        materials: [{ id: 'latest-proof', file_url: '/uploads/latest-proof.jpg' }],
      },
    ],
  }],
  issueEvidence: {
    'issue-frozen-recipe': [{ id: 'rectification-proof', name: '整改素材', type: 'image', url: '/uploads/rectification.jpg' }],
  },
}, { audience: 'internal' });

assert.equal(model.summary.text, '冻结总结');
assert.equal(model.functionEffects[0]?.name, '冷萃咖啡');
assert.equal(model.functionEffects[0]?.evaluation, '口感偏酸，萃取不稳定。');
assert.equal(model.functionEffects[0]?.evaluationStatus, 'unqualified');
const effectShape = model.functionEffects[0] as unknown as Record<string, unknown>;
assert.equal(effectShape.score, undefined);
assert.equal(effectShape.problemPoints, undefined);
assert.deepEqual(model.functionEffects[0]?.steps.map((step) => ({
  number: step.stepNumber,
  operation: step.operation,
  evidence: step.evidence.map((item) => item.id),
})), [{ number: 1, operation: '冷藏萃取 12 小时', evidence: ['step-proof'] }]);

assert.deepEqual(model.issues.map((issue) => issue.id), ['issue-frozen-recipe']);
const issue = model.issues[0]!;
assert.equal(issue.title, '冷萃咖啡食谱效果不合格');
assert.equal(issue.recipe?.name, '冷萃咖啡');
assert.equal(issue.recipe?.formula, '咖啡粉 20g；水 300ml');
assert.deepEqual(issue.recipe?.parameters, { 水温: '5℃', 时间: '12小时' });
assert.equal(issue.recipe?.evaluationStatus, 'unqualified');
assert.deepEqual(issue.recipe?.steps.map((step) => step.stepNumber), [1]);
assert.deepEqual(issue.evidence.map((item) => item.id), ['original-effect']);
assert.equal(issue.liveOverlay.status, 'verified_closed');
assert.equal(issue.liveOverlay.rectification, '已调整冷萃时间');
assert.equal(issue.liveOverlay.retest.count, 2);
assert.equal(issue.liveOverlay.retest.latest?.id, 'retest-latest');
assert.equal(issue.liveOverlay.retest.latest?.result, 'qualified');
assert.equal(issue.liveOverlay.retest.latest?.description, '最新复测合格');
assert.deepEqual(issue.liveOverlay.retest.latest?.evidence.map((item) => item.id), ['latest-proof']);
assert.equal('reEvaluations' in issue.liveOverlay, false);

const pending = buildFrozenReportViewModel({
  report: {
    id: 'report-pending', report_type: 'single_report', content: {},
  },
  snapshot: {
    snapshot_json: {
      report_content: {
        recipes: [{ id: 'recipe-pending', name: '待定功能', recipe_type: '功能', effect_status: 'pending', effect_description: '等待结论' }],
      },
    },
  },
  snapshotResolution: 'anchored',
}, { audience: 'share' });
assert.equal(pending.issues.length, 1, '待定整体判断必须进入冻结问题 Tab');
assert.equal(pending.issues[0]?.title, '待定功能效果待定');
assert.equal(pending.issues[0]?.recipe?.steps.length, 0);

const legacyOnly = buildFrozenReportViewModel({
  report: { id: 'legacy-points', report_type: 'single_report', content: {} },
  snapshot: {
    snapshot_json: {
      report_content: {
        recipes: [{
          id: 'legacy-recipe', name: '旧食谱', effect_status: 'qualified',
          effect_problem_point: '[{"text":"不得生成"}]',
          recipe_steps: [{ id: 'legacy-step', problem_point: '不得生成步骤问题' }],
        }],
      },
    },
  },
  snapshotResolution: 'anchored',
}, { audience: 'internal' });
assert.equal(legacyOnly.issues.length, 0, '旧效果/步骤问题点不得再生成冻结问题');

const anchoredWithoutContent = buildFrozenReportViewModel({
  report: {
    id: 'anchored-without-content', report_type: 'single_report',
    content: { recipes: [{ id: 'live-only', name: '实时食谱', effect_status: 'unqualified' }] },
  },
  snapshot: { snapshot_json: { matrix_projection: {} } },
  snapshotResolution: 'anchored',
}, { audience: 'internal' });
assert.equal(anchoredWithoutContent.functionEffects.length, 0, '带 snapshot_id 的旧快照不得静默读取实时食谱');
assert.equal(anchoredWithoutContent.issues.length, 0, '带 snapshot_id 的旧快照不得由实时食谱生成问题');

const anchoredLegacyIssue = buildFrozenReportViewModel({
  report: { id: 'anchored-legacy-issue', report_type: 'comparison_report', content: {} },
  snapshot: { snapshot_json: { objects: [{ id: 'object-1' }], item_nodes: [{ id: 'item-1' }], cells: [] } },
  snapshotResolution: 'anchored',
  issues: [{
    id: 'legacy-sensory-issue', source_report_id: 'anchored-legacy-issue', source_type: 'record_fail',
    title: '历史五感问题', description: '历史快照未写入记录时仍应保留同报告问题', status: 'open',
  }],
}, { audience: 'internal' });
assert.equal(anchoredLegacyIssue.issues.length, 1, '旧冻结快照仍需保留明确归属当前报告的问题');
assert.equal(anchoredLegacyIssue.issues[0]?.sourceKind, 'sensory');

const qualifiedAtFreeze = buildFrozenReportViewModel({
  report: { id: 'qualified-at-freeze', report_type: 'single_report', content: {} },
  snapshot: { snapshot_json: { report_content: { recipes: [{ id: 'recipe-qualified', name: '冻结时合格', effect_status: 'qualified' }] } } },
  snapshotResolution: 'anchored',
  issues: [{ id: 'live-old-issue', recipe_id: 'recipe-qualified', source_type: 'recipe_problem', status: 'rectifying' }],
}, { audience: 'internal' });
assert.equal(qualifiedAtFreeze.issues.length, 0, '冻结时合格的食谱不得因之后同 recipe 的旧 issue 回流到报告');

const mixedMatrices = buildFrozenReportViewModel({
  report: { id: 'mixed-matrices', report_type: 'comparison_report', content: {} },
  snapshot: {
    snapshot_json: {
      report_type: 'comparison_report',
      report_content: {
        data_matrix_projection: {
          projectionVersion: 'v3',
          rows: [{ id: 'row-1', cells: { 'column-1': '85' } }],
        },
      },
      objects: [{ id: 'object-1' }],
      item_nodes: [{ id: 'item-1' }],
      cells: [{ id: 'cell-1', effect_summary: '结果稳定' }],
    },
  },
  snapshotResolution: 'anchored',
}, { audience: 'internal' });
assert.equal(mixedMatrices.matrix?.kind, 'comparison');
assert.equal(mixedMatrices.dataMatrix?.kind, 'data_v3');

const coalescedSources = buildFrozenReportViewModel({
  report: { id: 'coalesced-sources', report_type: 'single_report', content: {} },
  snapshot: {
    snapshot_json: {
      report_content: {
        records: [{ id: 'record-source', evaluation_result: 'fail', check_item: 'Record evidence', materials: [{ id: 'record-evidence', file_url: '/uploads/record.jpg' }] }],
        recipes: [{ id: 'recipe-source', name: 'Juice', effect_status: 'unqualified', effect_description: 'Texture failed', effect_materials: [{ id: 'recipe-evidence', file_url: '/uploads/recipe.jpg' }] }],
        issues: [
          {
            id: 'issue-record', record_id: 'record-source', source_type: 'record_fail', title: 'Record evidence',
            materials: [{ id: 'record-issue-evidence', file_url: '/uploads/record-issue.jpg' }],
            _reEvaluations: [{ id: 'record-retest', result: 'qualified', description: 'Retest passed', created_at: '2026-07-15T00:00:00.000Z', materials: [{ id: 'record-retest-evidence', file_url: '/uploads/record-retest.jpg' }] }],
          },
          { id: 'issue-recipe', recipe_id: 'recipe-source', source_type: 'recipe_problem', title: 'Juice failed', materials: [{ id: 'recipe-issue-evidence', file_url: '/uploads/recipe-issue.jpg' }] },
        ],
      },
    },
  },
  snapshotResolution: 'anchored',
  issues: [
    { id: 'issue-record', record_id: 'record-source', source_type: 'record_fail', title: 'Record evidence' },
    { id: 'issue-recipe', recipe_id: 'recipe-source', source_type: 'recipe_problem', title: 'Juice failed' },
  ],
}, { audience: 'internal' });
assert.deepEqual(coalescedSources.issues.map((issue) => issue.id), ['issue-record', 'issue-recipe'], 'one live issue must coalesce with its frozen source fact');
assert.deepEqual(coalescedSources.issues[0]?.evidence.map((item) => item.id), ['record-evidence', 'record-issue-evidence']);
assert.deepEqual(coalescedSources.issues[1]?.evidence.map((item) => item.id), ['recipe-evidence', 'recipe-issue-evidence']);
assert.equal(coalescedSources.issues[0]?.liveOverlay.retest.count, 1, 'frozen re-evaluation history stays attached to the canonical issue');
assert.deepEqual(coalescedSources.issues[0]?.liveOverlay.retest.latest?.evidence.map((item) => item.id), ['record-retest-evidence']);

const coalescedMatrixSources = buildFrozenReportViewModel({
  report: { id: 'coalesced-matrix-sources', report_type: 'single_report', content: {} },
  snapshot: {
    snapshot_json: {
      report_content: {
        issues: [
          { id: 'live-matrix-a', source_type: 'matrix_issue', source_report_id: 'point-a', title: '同名问题' },
          { id: 'live-matrix-b', source_type: 'matrix_issue', source_report_id: 'point-b', title: '同名问题' },
        ],
        data_matrix_projection: {
          matrixProjectionVersion: 'v3',
          rows: [
            { id: 'row-a', level1Label: '大类 A', level2Label: '细项 A' },
            { id: 'row-b', level1Label: '大类 B', level2Label: '细项 B' },
          ],
          columns: [{ id: 'issue-column', label: '问题点' }],
          issuePoints: [
            { id: 'point-a', leafRowId: 'row-a', columnId: 'issue-column', issueText: '同名问题', linkedIssueId: 'live-matrix-a' },
            { id: 'point-b', leafRowId: 'row-b', columnId: 'issue-column', issueText: '同名问题', linkedIssueId: 'live-matrix-b' },
          ],
        },
      },
    },
  },
  snapshotResolution: 'anchored',
  issues: [
    { id: 'live-matrix-a', source_type: 'matrix_issue', source_report_id: 'point-a', title: '同名问题', status: 'open' },
    { id: 'live-matrix-b', source_type: 'matrix_issue', source_report_id: 'point-b', title: '同名问题', status: 'rectifying' },
  ],
}, { audience: 'internal' });
assert.equal(coalescedMatrixSources.issues.length, 2, 'two same-title matrix points remain two source occurrences, not four duplicated projections');
assert.deepEqual(coalescedMatrixSources.issues.map((issue) => issue.id), ['live-matrix-a', 'live-matrix-b']);
assert.deepEqual(coalescedMatrixSources.issues.map((issue) => issue.sourceCellId), ['point-a', 'point-b']);
assert.deepEqual(coalescedMatrixSources.issues.map((issue) => issue.context.primaryCategory), ['大类 A', '大类 B']);
assert.deepEqual(coalescedMatrixSources.issues.map((issue) => issue.sourceKind), ['matrix', 'matrix']);

const comparisonProblemDedup = buildFrozenReportViewModel({
  report: { id: 'comparison-problem-dedup', report_type: 'comparison_report', content: {} },
  snapshot: {
    snapshot_json: {
      objects: [{ id: 'object-a', object_name: '对象 A' }, { id: 'object-b', object_name: '对象 B' }],
      item_nodes: [{ id: 'item-a', node_label: '项目 A' }],
      cells: [
        {
          id: 'cell-a', object_id: 'object-a', item_node_id: 'item-a',
          problem_points: ['同一问题', '  同一问题  ', { text: '同一问题' }],
        },
        {
          id: 'cell-b', object_id: 'object-b', item_node_id: 'item-a',
          problem_points: ['同一问题'],
        },
      ],
    },
  },
  snapshotResolution: 'anchored',
}, { audience: 'internal' });
assert.equal(comparisonProblemDedup.issues.length, 2, 'identical normalized points collapse only within one comparison cell');
assert.deepEqual(comparisonProblemDedup.issues.map((issue) => issue.context.object), ['对象 A', '对象 B']);
assert.notEqual(comparisonProblemDedup.issues[0]?.sourceCellId, comparisonProblemDedup.issues[1]?.sourceCellId, 'different comparison cells retain independent issue identities');

const readerSource = readFileSync(resolve(process.cwd(), 'src/components/reports/frozen-report-reader.tsx'), 'utf8');
const printSource = readFileSync(resolve(process.cwd(), 'src/lib/server/report-print-renderer.ts'), 'utf8');
const reportRouteSource = readFileSync(resolve(process.cwd(), 'src/app/api/reports/route.ts'), 'utf8');
assert.match(readerSource, /issue\.recipe/);
assert.match(readerSource, /liveOverlay\.retest/);
assert.match(readerSource, /data-issue-field="status"/, 'each issue row must expose one dedicated status field');
assert.match(readerSource, /issueStatusLabel\(issue\.liveOverlay\.status \|\| 'open'\)/, 'the status field uses the four-state label with an open fallback');
assert.doesNotMatch(readerSource, />\s*查看整改\s*</, 'the superseded management action must not be rendered');
assert.doesNotMatch(readerSource, /problemPoints\(/);
assert.doesNotMatch(readerSource, /AI评分/);
assert.doesNotMatch(printSource, /problemTexts\(effect\.problemPoints\)/);
assert.doesNotMatch(printSource, /effect\.score/);
assert.match(reportRouteSource, /report_content:\s*finalReportContent/);

console.log('frozen recipe issue projection contract tests passed');
