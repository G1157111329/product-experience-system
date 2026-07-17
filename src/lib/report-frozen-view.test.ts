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
        recipes: [frozenRecipe, {
          id: 'recipe-qualified-extra', name: '合格功能', effect_status: 'qualified',
          effect_materials: [{ id: 'qualified-extra-media', file_url: '/uploads/qualified-extra.jpg' }],
        }],
        issues: [{
          id: 'issue-frozen-recipe', recipe_id: 'recipe-frozen', source_type: 'recipe_problem',
          materials: [
            { id: 'original-effect', file_url: '/uploads/original-effect.jpg' },
            { id: 'explicit-issue-proof', file_url: '/uploads/explicit-issue.jpg' },
          ],
        }],
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
}, { audience: 'internal', manageableIssueIds: new Set(['issue-frozen-recipe']) });

assert.equal(model.summary.text, '冻结总结');
assert.equal(model.functionEffects[0]?.name, '冷萃咖啡');
assert.equal(model.functionEffects[0]?.evaluation, '口感偏酸，萃取不稳定。');
assert.equal(model.functionEffects[0]?.evaluationStatus, 'unqualified');
assert.deepEqual(model.functionEffects[0]?.evidence.map((item) => item.id), ['original-effect'], 'function effects retain their frozen evidence even when the recipe also has an issue');
assert.deepEqual(model.functionEffects[0]?.steps[0]?.evidence.map((item) => item.id), ['step-proof'], 'function steps retain their frozen evidence even when the recipe also has an issue');
assert.deepEqual(model.functionEffects[1]?.evidence.map((item) => item.id), ['qualified-extra-media'], 'a non-issue recipe keeps its function evidence');
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
assert.deepEqual(issue.recipe?.steps[0]?.evidence.map((item) => item.id), ['step-proof'], 'issue recipe context retains claimed step evidence');
assert.deepEqual(issue.recipe?.evidence.map((item) => item.id), ['original-effect'], 'recipe context evidence remains on the recipe');
assert.deepEqual(issue.evidence.map((item) => item.id), ['explicit-issue-proof'], 'explicit issue evidence excludes recipe context evidence without losing issue-only media');
assert.equal(issue.canManage, true, 'an explicitly authorized canonical issue is manageable');
assert.equal(model.capabilities.canManageIssues, true);
assert.equal(issue.liveOverlay.status, 'verified_closed');
assert.equal(issue.liveOverlay.rectification, '已调整冷萃时间');
assert.equal(issue.liveOverlay.retest.count, 2);
assert.equal(issue.liveOverlay.retest.latest?.id, 'retest-latest');
assert.deepEqual(issue.liveOverlay.retest.history.map((item) => item.id), ['retest-latest', 'retest-old']);
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
assert.deepEqual(coalescedSources.issues[1]?.recipe?.evidence.map((item) => item.id), ['recipe-evidence']);
assert.deepEqual(coalescedSources.issues[1]?.evidence.map((item) => item.id), ['recipe-issue-evidence']);
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

const titleOnlyMustNotLink = buildFrozenReportViewModel({
  report: { id: 'title-only-must-not-link', report_type: 'single_report', content: {} },
  snapshot: {
    snapshot_json: {
      report_content: {
        records: [{ id: 'frozen-record-without-link', evaluation_result: 'fail', check_item: '同名但无稳定关联' }],
      },
    },
  },
  snapshotResolution: 'anchored',
  issues: [{ id: 'unrelated-live-issue', source_type: 'record_fail', title: '同名但无稳定关联', status: 'verified_closed' }],
}, { audience: 'internal' });
assert.equal(titleOnlyMustNotLink.issues[0]?.liveIssueId, undefined, 'title-only similarity must never attach a mutable issue');
assert.equal(titleOnlyMustNotLink.issues[0]?.liveOverlay.status, '', 'title-only similarity must not leak another issue workflow status');
assert.equal(titleOnlyMustNotLink.capabilities.canManageIssues, false, 'internal audience alone never grants issue management');
assert.equal(titleOnlyMustNotLink.issues[0]?.canManage, false, 'an internal read-only actor receives a non-manageable issue');

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

const comparisonLiveOverlayDedup = buildFrozenReportViewModel({
  report: { id: 'comparison-live-overlay-dedup', report_type: 'comparison_report', content: {} },
  snapshot: {
    snapshot_json: {
      report_content: {
        issues: [
          { id: 'live-a', source_type: 'recipe_problem', source_assembly_id: 'asm-1', source_cell_id: 'cell-a', title: '问题甲' },
          { id: 'live-b', source_type: 'recipe_problem', source_assembly_id: 'asm-1', source_cell_id: 'cell-a', title: '问题乙' },
          { id: 'live-a-dup', source_type: 'recipe_problem', source_assembly_id: 'asm-1', source_cell_id: 'cell-a', title: '问题甲' },
        ],
      },
      objects: [{ id: 'object-a', object_name: '对象 A' }],
      item_nodes: [{ id: 'item-a', node_label: '细项 A' }],
      cells: [{
        id: 'cell-a', object_id: 'object-a', item_node_id: 'item-a',
        problem_points: ['问题甲', '问题乙'],
      }],
    },
  },
  snapshotResolution: 'anchored',
  issues: [
    { id: 'live-a', source_type: 'recipe_problem', source_assembly_id: 'asm-1', source_cell_id: 'cell-a', title: '问题甲', source_report_id: 'comparison-live-overlay-dedup', status: 'open' },
    { id: 'live-a-dup', source_type: 'recipe_problem', source_assembly_id: 'asm-1', source_cell_id: 'cell-a', title: '问题甲', source_report_id: 'comparison-live-overlay-dedup', status: 'rectifying' },
    { id: 'live-b', source_type: 'recipe_problem', source_assembly_id: 'asm-1', source_cell_id: 'cell-a', title: '问题乙', source_report_id: 'comparison-live-overlay-dedup', status: 'open' },
  ],
}, { audience: 'internal' });
assert.equal(comparisonLiveOverlayDedup.issues.length, 1, 'one comparison object/item cell is one issue regardless of problem-line count');
assert.deepEqual(comparisonLiveOverlayDedup.issues[0]?.context.problemPoints, ['问题甲', '问题乙']);
assert.equal(comparisonLiveOverlayDedup.issues[0]?.liveIssueId, 'live-a');
assert.deepEqual(comparisonLiveOverlayDedup.issues.map((issue) => issue.sourceKind), ['comparison']);
assert.equal(
  comparisonLiveOverlayDedup.issues.every((issue) => issue.sourceCellId === 'cell-a'),
  true,
  'the aggregated comparison fact stays bound to its source cell',
);

const legacyFunctionStatusMerge = buildFrozenReportViewModel({
  report: { id: 'legacy-function-status', report_type: 'single_report', content: {} },
  snapshot: { snapshot_json: { report_content: {
    issues: [{ id: 'old-fact', source_type: 'recipe_problem', title: '薯条食谱效果不合格' }],
  } } },
  snapshotResolution: 'anchored',
  issues: [{
    id: 'live-function', source_report_id: 'legacy-function-status', source_type: 'recipe_problem',
    title: '薯条食谱效果不合格', status: 'open',
  }],
}, { audience: 'internal', manageableIssueIds: new Set(['live-function']) });
assert.equal(legacyFunctionStatusMerge.issues.length, 1, 'a unique legacy function fact and its current-report live issue merge instead of duplicating');
assert.equal(legacyFunctionStatusMerge.issues[0]?.liveIssueId, 'live-function');
assert.equal(legacyFunctionStatusMerge.issues[0]?.liveOverlay.status, 'open');
assert.equal(legacyFunctionStatusMerge.issues[0]?.canManage, true);

const staleLegacyFunctionFacts = buildFrozenReportViewModel({
  report: { id: 'stale-legacy-function', report_type: 'single_report', content: {} },
  snapshot: { snapshot_json: { report_content: {
    issues: [
      { id: 'stale-fact', source_type: 'recipe_problem', title: '旧食谱问题' },
      { id: 'current-fact', source_type: 'recipe_problem', title: '当前食谱问题' },
    ],
  } } },
  snapshotResolution: 'anchored',
  issues: [{
    id: 'current-live', source_report_id: 'stale-legacy-function', source_type: 'recipe_problem',
    recipe_id: 'current-recipe', title: '当前食谱问题', status: 'open',
  }],
}, { audience: 'internal', manageableIssueIds: new Set(['current-live']) });
assert.deepEqual(
  staleLegacyFunctionFacts.issues.map((issue) => issue.title),
  ['当前食谱问题'],
  'current-report live function issues replace unmatched stale frozen function facts',
);
assert.equal(staleLegacyFunctionFacts.issues[0]?.canManage, true);

const staleComparisonFacts = buildFrozenReportViewModel({
  report: { id: 'stale-comparison-facts', report_type: 'comparison_report', content: {} },
  snapshot: { snapshot_json: {
    report_content: { issues: [
      { id: 'stale-comparison', source_type: 'recipe_problem', source_cell_id: 'stale-cell', title: '旧对比问题' },
      { id: 'current-comparison', source_type: 'recipe_problem', source_cell_id: 'current-cell', title: '当前对比问题' },
    ] },
    cells: [
      { id: 'stale-cell', object_name: '旧对象', project_name: '旧项目', item_name: '旧细项', problem_points: [] },
      { id: 'current-cell', object_name: '当前对象', project_name: '当前项目', item_name: '当前细项', problem_points: ['当前问题'] },
    ],
  } },
  snapshotResolution: 'anchored',
  issues: [
    { id: 'stale-comparison', source_report_id: 'older-report', source_type: 'recipe_problem', source_cell_id: 'stale-cell', title: '旧对比问题', status: 'open' },
    { id: 'current-comparison', source_report_id: 'stale-comparison-facts', source_type: 'recipe_problem', source_cell_id: 'current-cell', title: '当前对比问题', status: 'open' },
  ],
}, { audience: 'internal', manageableIssueIds: new Set(['current-comparison']) });
assert.equal(staleComparisonFacts.issues.length, 1, 'comparison cells with cleared problem points must not retain explicit frozen issues');
assert.equal(staleComparisonFacts.issues[0]?.sourceCellId, 'current-cell');
assert.equal(staleComparisonFacts.issues[0]?.canManage, true);

const comparisonCrossObjectKeepsPeers = buildFrozenReportViewModel({
  report: { id: 'comparison-cross-object', report_type: 'comparison_report', content: {} },
  snapshot: {
    snapshot_json: {
      objects: [{ id: 'object-a', object_name: '对象 A' }, { id: 'object-b', object_name: '对象 B' }],
      item_nodes: [{ id: 'item-a', node_label: '细项 A' }],
      cells: [
        { id: 'cell-a', object_id: 'object-a', item_node_id: 'item-a', problem_points: ['同文案'] },
        { id: 'cell-b', object_id: 'object-b', item_node_id: 'item-a', problem_points: ['同文案'] },
      ],
    },
  },
  snapshotResolution: 'anchored',
  issues: [
    { id: 'live-a', source_type: 'recipe_problem', source_assembly_id: 'asm-1', source_cell_id: 'cell-a', title: '同文案', source_report_id: 'comparison-cross-object', status: 'open' },
    { id: 'live-b', source_type: 'recipe_problem', source_assembly_id: 'asm-1', source_cell_id: 'cell-b', title: '同文案', source_report_id: 'comparison-cross-object', status: 'open' },
  ],
}, { audience: 'internal' });
assert.equal(comparisonCrossObjectKeepsPeers.issues.length, 2, 'same normalized text across different comparison objects must remain two rows');
assert.deepEqual(comparisonCrossObjectKeepsPeers.issues.map((issue) => issue.context.object), ['对象 A', '对象 B']);

const readerSource = readFileSync(resolve(process.cwd(), 'src/components/reports/frozen-report-reader.tsx'), 'utf8');
const printSource = readFileSync(resolve(process.cwd(), 'src/lib/server/report-print-renderer.ts'), 'utf8');
const reportRouteSource = readFileSync(resolve(process.cwd(), 'src/app/api/reports/route.ts'), 'utf8');
assert.match(readerSource, /issue\.recipe/);
assert.match(readerSource, /liveOverlay\.retest/);
assert.match(readerSource, /data-issue-field="status"/, 'each issue row must expose one dedicated status field');
assert.match(readerSource, /issueStatusLabel\(issue\.liveOverlay\.status \|\| 'open'\)/, 'the status field uses the four-state label with an open fallback');
assert.doesNotMatch(readerSource, />\s*查看整改\s*</, 'the superseded management action must not be rendered');
assert.match(readerSource, /关联缺失，无法进入整改/, 'unlinked frozen facts explain why management is unavailable');
assert.match(readerSource, /issue\.recipe[\s\S]*items=\{issue\.evidence\}/, 'recipe issue rows render explicit issue evidence in addition to recipe context');
const detailSource = readFileSync(resolve(process.cwd(), 'src/app/(main)/reports/[id]/page.tsx'), 'utf8');
assert.match(detailSource, /正在加载体验报告\.\.\.\.\.\./, 'report loading copy must not expose frozen implementation terminology');
assert.doesNotMatch(detailSource, /fetch\(['"]\/api\/issues['"][\s\S]{0,240}method:\s*['"]POST['"]/, 'opening a frozen report must never create a canonical issue');
assert.match(detailSource, /fetchFrozenReportProjection/, 'dialog saves refresh the authoritative frozen projection');
assert.doesNotMatch(detailSource, /const applyIssueUpdate/, 'dialog saves must not patch only the status field');
assert.doesNotMatch(readerSource, /problemPoints\(/);
assert.doesNotMatch(readerSource, /AI评分/);
assert.doesNotMatch(printSource, /problemTexts\(effect\.problemPoints\)/);
assert.doesNotMatch(printSource, /effect\.score/);
assert.match(reportRouteSource, /report_content:\s*finalReportContent/);

console.log('frozen recipe issue projection contract tests passed');
