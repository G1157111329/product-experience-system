import {
  evaluationIssueTitle,
  evaluationRecipeSubjectName,
  normalizeEvaluationStatus,
  type EvaluationStatus,
} from './evaluation-status';
import { buildReportFrozenTabs, type ReportFrozenTabKey } from './report-frozen-tabs';

type Row = Record<string, unknown>;

export type FrozenMedia = { id: string; name: string; type: string; url: string };

export type FrozenRecipeStep = {
  id: string;
  stepNumber: number | null;
  operation: string;
  problemPoints: string[];
  evidence: FrozenMedia[];
};

export type FrozenRecipeContext = {
  recipeId: string;
  name: string;
  subjectName: string;
  formula: string;
  parameters: Row | string | null;
  evaluationStatus: EvaluationStatus;
  effectScore: string;
  evaluation: string;
  evidence: FrozenMedia[];
  steps: FrozenRecipeStep[];
};

export type FrozenRetest = {
  id: string;
  result: EvaluationStatus;
  description: string;
  createdAt: string | null;
  createdBy: string | null;
  evidence: FrozenMedia[];
};

export type FrozenRetestSummary = { count: number; latest: FrozenRetest | null };

export type FrozenMatrixView =
  | { kind: 'comparison'; snapshot: Row }
  | { kind: 'data_v2'; projection: Row }
  | { kind: 'data_v3'; projection: Row }
  | null;

export type FrozenIssueLiveOverlay = {
  status: string;
  rectification: string;
  retest: FrozenRetestSummary;
  /** Mutable rectification/retest media; frozen evidence remains on FrozenIssue.evidence. */
  evidence: FrozenMedia[];
};

export type FrozenIssue = {
  id: string;
  title: string;
  details: string;
  level: string;
  sourceType: string;
  sourceKind: 'sensory' | 'function' | 'comparison' | 'matrix';
  context: { object: string; project: string; item: string };
  evidence: FrozenMedia[];
  /** Present only for recipe/function whole-judgment issues. */
  recipe?: FrozenRecipeContext;
  /** Mutable workflow fields only. */
  liveOverlay: FrozenIssueLiveOverlay;
};

export type FrozenFunctionEffect = FrozenRecipeContext;

export type FrozenReportViewModel = {
  snapshotResolution: 'anchored' | 'legacy_latest' | 'none';
  header: { id: string; title: string; reportType: string; status: string; productModel: string | null };
  tabs: ReportFrozenTabKey[];
  summary: {
    text: string;
    aiSummary: Row | null;
    taskInfo: Row | null;
    stats: {
      issueCount: number;
      sensoryIssueCount: number;
      functionIssueCount: number;
      comparisonIssueCount: number;
      rectificationRate: number;
    };
  };
  issues: FrozenIssue[];
  matrix: FrozenMatrixView;
  dataMatrix?: FrozenMatrixView;
  functionEffects: FrozenFunctionEffect[];
  capabilities: { canManageIssues: boolean; canShare: boolean; canExport: boolean };
};

export type BuildFrozenReportViewInput = {
  report: Row;
  taskInfo?: Row | null;
  snapshot?: Row | null;
  issues?: Row[];
  issueEvidence?: Record<string, FrozenMedia[]>;
  snapshotResolution: 'anchored' | 'legacy_latest' | 'none';
};

function isRecord(value: unknown): value is Row {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function rows(value: unknown): Row[] { return Array.isArray(value) ? value.filter(isRecord) : []; }
function text(value: unknown): string { return value === null || value === undefined ? '' : String(value).trim(); }
function first(...values: unknown[]): string {
  for (const value of values) { const result = text(value); if (result) return result; }
  return '';
}

function media(items: unknown): FrozenMedia[] {
  const seen = new Set<string>();
  return rows(items).flatMap((item) => {
    const id = first(item.id, item.materialId, item.file_path, item.file_url, item.fileUrl);
    const url = first(item.file_url, item.fileUrl, item.file_path, item.url);
    const key = id || url;
    if (!key || !url || seen.has(key)) return [];
    seen.add(key);
    return [{
      id: key,
      name: first(item.file_name, item.fileName, item.name, item.id, item.materialId, 'material'),
      type: first(item.material_type, item.materialType, item.media_type, 'material'),
      url,
    }];
  });
}

function problemTexts(value: unknown): string[] {
  if (typeof value === 'string') return value.trim() ? [value.trim()] : [];
  return Array.isArray(value)
    ? value.map((item) => typeof item === 'string' ? item : first(isRecord(item) ? item.text : '')).filter(Boolean)
    : [];
}

function failedRecord(record: Row): boolean {
  const result = text(record.evaluation_result).toLowerCase();
  return result.includes('fail') || result.includes('unqualified') || result.includes('not_pass') || result.includes('不合')
    || result.includes('pending') || result.includes('待定');
}

function materialsByIds(materials: Row[], ids: string[]) {
  if (ids.length === 0) return [];
  const wanted = new Set(ids);
  return materials.filter((item) => wanted.has(first(item.id, item.materialId)));
}

function recipeContext(recipe: Row): FrozenRecipeContext {
  const rawParameters = recipe.parameters ?? recipe.recipe_parameters ?? recipe.function_parameters;
  return {
    recipeId: first(recipe.id),
    name: first(recipe.name, recipe.recipe_name, recipe.id, '未命名食谱/功能'),
    subjectName: evaluationRecipeSubjectName(first(recipe.name, recipe.recipe_name, recipe.id), recipe.recipe_type ?? recipe.type),
    formula: first(recipe.ingredients, recipe.formula, recipe.recipe_formula),
    parameters: isRecord(rawParameters) ? rawParameters : text(rawParameters) || null,
    evaluationStatus: normalizeEvaluationStatus(recipe.effect_status ?? recipe.evaluation_status ?? recipe.evaluation_result),
    effectScore: first(recipe.effect_score, recipe.effectScore, recipe.ai_score),
    evaluation: first(recipe.effect_description, recipe.effect_evaluation),
    evidence: media(recipe.effect_materials),
    steps: rows(recipe.recipe_steps).map((step, index) => ({
      id: first(step.id, `${first(recipe.id, 'recipe')}:step:${index}`),
      stepNumber: Number.isFinite(Number(step.step_number)) ? Number(step.step_number) : null,
      operation: first(step.operation, step.description, step.name),
      problemPoints: problemTexts(step.problem_points ?? step.problem_point ?? step.problemPoints),
      evidence: media(step.materials),
    })),
  };
}

function frozenReportContent(input: BuildFrozenReportViewInput, snapshotJson: Row): Row {
  const reportContent = isRecord(input.report.content) ? input.report.content : {};
  const frozenContent = isRecord(snapshotJson.report_content)
    ? snapshotJson.report_content
    : isRecord(snapshotJson.frozen_report_content)
      ? snapshotJson.frozen_report_content
      : isRecord(snapshotJson.content)
        ? snapshotJson.content
        : null;
  if (frozenContent) return frozenContent;
  // A report that has an anchor must never silently substitute live report content for frozen facts.
  // Only genuinely legacy reports (without an anchor) may use the historical report.content shape.
  if (input.snapshotResolution === 'anchored') return {};
  return reportContent;
}

type FrozenFact = Row & { _recipe?: FrozenRecipeContext; _reportable?: boolean };

function frozenIssueFacts(content: Row, snapshotJson: Row): FrozenFact[] {
  const facts: FrozenFact[] = [
    ...rows(content.issues).map((issue, index) => ({ ...issue, _frozenKey: `issue:${first(issue.id, index)}`, _sourceKind: 'explicit_issue' })),
    ...rows(content.records).filter(failedRecord).map((record, index) => ({
      ...record, _frozenKey: `record:${first(record.id, index)}`, _sourceKind: 'record',
    })),
    ...rows(content.recipes).map((recipe, index) => {
      const context = recipeContext(recipe);
      return {
        id: `recipe:${context.recipeId || index}`,
        _frozenKey: `recipe:${context.recipeId || index}`,
        _sourceKind: 'recipe',
        _recipeId: context.recipeId,
        _recipe: context,
        _reportable: context.evaluationStatus !== 'qualified',
        title: evaluationIssueTitle(context.subjectName, 'recipe', context.evaluationStatus),
        description: context.evaluation,
        source_type: 'recipe_problem',
        materials: context.evidence,
      };
    }),
  ];

  const projection = isRecord(snapshotJson.matrix_projection) ? snapshotJson.matrix_projection : {};
  const cellMedia = isRecord(projection.cellMedia) ? projection.cellMedia : {};
  for (const point of rows(projection.issuePoints)) {
    const pointId = text(point.id);
    const leafRowId = text(point.leafRowId);
    const columnId = text(point.columnId);
    const pointMaterials = Object.entries(cellMedia).flatMap(([key, items]) => (
      key === `${leafRowId}:${columnId}` || key.startsWith(`${leafRowId}:`) ? rows(items) : []
    ));
    const materialIds = Array.isArray(point.materialIds) ? point.materialIds.map(text).filter(Boolean) : [];
    facts.push({
      id: pointId || `matrix-issue:${leafRowId}:${columnId}`,
      _frozenKey: `v3-issue:${pointId || `${leafRowId}:${columnId}`}`,
      _sourceKind: 'v3_issue_point', title: point.issueText, description: point.issueText,
      source_type: 'matrix_problem', source_issue_point_id: pointId,
      materials: materialsByIds(pointMaterials, materialIds),
    });
  }
  for (const cell of rows(snapshotJson.cells ?? snapshotJson.matrix_cells)) {
    const cellId = text(cell.id);
    const points = Array.isArray(cell.problem_points) ? cell.problem_points : [];
    rows(points).forEach((point, index) => facts.push({
      id: `comparison-cell:${cellId}:problem:${index}`,
      _frozenKey: `comparison-cell:${cellId}:problem:${index}`,
      _sourceKind: 'comparison_cell', _comparisonCellId: cellId,
      title: first(point.text, point.issueText), description: first(cell.effect_summary, point.text, point.issueText),
      source_type: 'recipe_problem', materials: [...rows(cell.inline_media), ...rows(cell.appendix_media), ...rows(cell.media)],
    }));
  }
  return facts;
}

function findFrozenFactForLive(facts: FrozenFact[], live: Row) {
  const recipeId = text(live.recipe_id);
  if (recipeId) return facts.find((item) => text(item._recipeId) === recipeId);
  const recordId = text(live.record_id);
  if (recordId) return facts.find((item) => text(item._sourceKind) === 'record' && text(item.id) === recordId);
  const sourceCellId = text(live.source_cell_id);
  if (sourceCellId) return facts.find((item) => (
    text(item.id) === sourceCellId || text(item.source_issue_point_id) === sourceCellId || text(item._comparisonCellId) === sourceCellId
  ));
  const sourceType = text(live.source_type);
  const matching = facts.filter((item) => text(item.source_type) === sourceType && first(item.title) === first(live.title));
  return matching.length === 1 ? matching[0] : undefined;
}

export function overlayEvidenceWithoutReEvaluations(
  evidence: FrozenMedia[], evaluations: unknown[], baseEvidence: FrozenMedia[] = [],
): FrozenMedia[] {
  const retestMedia = rows(evaluations).flatMap((evaluation) => media(evaluation.materials));
  const excluded = [...retestMedia, ...baseEvidence];
  const ids = new Set(excluded.map((item) => text(item.id)).filter(Boolean));
  const urls = new Set(excluded.map((item) => text(item.url)).filter(Boolean));
  return evidence.filter((item) => !ids.has(text(item.id)) && !urls.has(text(item.url)));
}

function retestSummary(issue: Row | undefined): FrozenRetestSummary {
  const retests = rows(issue?._reEvaluations)
    .map((item, index): FrozenRetest => ({
      id: first(item.id, `retest:${index}`),
      result: normalizeEvaluationStatus(item.result ?? item.evaluation_result ?? item.conclusion),
      description: first(item.description, item.evaluation_description, item.conclusion),
      createdAt: text(item.created_at) || null,
      createdBy: first(item.created_by_name, item.created_by, item.creator_name) || null,
      evidence: media(item.materials),
    }))
    .sort((left, right) => ((right.createdAt ?? '').localeCompare(left.createdAt ?? '') || right.id.localeCompare(left.id)));
  return { count: retests.length, latest: retests[0] ?? null };
}

function liveOverlay(issue: Row | undefined, evidence: FrozenMedia[] = [], baseEvidence: FrozenMedia[] = []): FrozenIssueLiveOverlay {
  const rawRetests = rows(issue?._reEvaluations);
  return {
    status: first(issue?.status, issue?.evaluation_result),
    rectification: first(issue?.improve_plan, issue?.rectification, issue?.no_improve_reason),
    retest: retestSummary(issue),
    evidence: overlayEvidenceWithoutReEvaluations(evidence, rawRetests, baseEvidence),
  };
}

function frozenIssue(base: FrozenFact, live: Row | undefined, evidence: FrozenMedia[], overlayEvidence: FrozenMedia[] = [], overlayBaseEvidence: FrozenMedia[] = []): FrozenIssue {
  const sourceType = first(base.source_type, base.standard_category, live?.source_type);
  const sourceKind: FrozenIssue['sourceKind'] = sourceType === 'matrix_problem'
    ? 'matrix'
    : Boolean(live?.source_assembly_id) || Boolean(base._comparisonCellId)
      ? 'comparison'
      : sourceType === 'record_fail' || sourceType === 'sensory_problem'
        ? 'sensory'
        : 'function';
  return {
    id: first(live?.id, base.id),
    title: first(base.title, base.check_item, base.problem_description, base.effect_summary, base.id),
    details: first(base.description, base.problem_description, base.check_requirement, base.check_standard),
    level: first(base.level, base.problem_level, live?.level, live?.problem_level),
    sourceType,
    sourceKind,
    context: {
      object: first(base.object_name, base.object_label, live?.object_name, live?.object_label),
      project: first(base.project_name, base.task_name, base.project, live?.project_name),
      item: first(base.check_item, base.item_name, base.node_label, base.sub_check_dimension, live?.check_item),
    },
    evidence,
    ...(base._recipe ? { recipe: base._recipe } : {}),
    liveOverlay: liveOverlay(live, overlayEvidence, overlayBaseEvidence),
  };
}

function buildIssues(
  content: Row,
  snapshotJson: Row,
  liveIssues: Row[],
  issueEvidence: Record<string, FrozenMedia[]>,
  resolution: BuildFrozenReportViewInput['snapshotResolution'],
  reportId: string,
): FrozenIssue[] {
  const facts = frozenIssueFacts(content, snapshotJson);
  const consumed = new Set<FrozenFact>();
  const result: FrozenIssue[] = [];
  for (const live of liveIssues) {
    const base = findFrozenFactForLive(facts, live);
    if (base?._sourceKind === 'recipe' && !base._reportable) continue;
    const isCurrentReportLegacyIssue = text(live.source_report_id) === reportId;
    if (!base && resolution !== 'legacy_latest' && !isCurrentReportLegacyIssue) continue;
    const frozenBase = base ?? live as FrozenFact;
    consumed.add(frozenBase);
    const evidence = media(rows(frozenBase.materials));
    result.push(frozenIssue(frozenBase, live, evidence, issueEvidence[text(live.id)] ?? [], evidence));
  }
  for (const fact of facts) {
    if (consumed.has(fact)) continue;
    if (fact._sourceKind === 'recipe' && !fact._reportable) continue;
    result.push(frozenIssue(fact, undefined, media(rows(fact.materials))));
  }
  return result;
}

function comparisonMatrixView(reportType: string, snapshotJson: Row, tabs: ReportFrozenTabKey[]): FrozenMatrixView {
  if (reportType === 'comparison_report' && tabs.includes('comparison_matrix')) return { kind: 'comparison', snapshot: snapshotJson };
  return null;
}

function dataMatrixView(projection: unknown, tabs: ReportFrozenTabKey[]): FrozenMatrixView {
  if (!isRecord(projection) || !tabs.includes('data_matrix')) return null;
  const isV3 = projection.projectionVersion === 'v3' || projection.matrixProjectionVersion === 'v3';
  return { kind: isV3 ? 'data_v3' : 'data_v2', projection };
}

export function buildFrozenReportViewModel(input: BuildFrozenReportViewInput, options: { audience: 'internal' | 'share' }): FrozenReportViewModel {
  const snapshotJson = isRecord(input.snapshot?.snapshot_json) ? input.snapshot.snapshot_json : {};
  const content = frozenReportContent(input, snapshotJson);
  const projection = isRecord(snapshotJson.matrix_projection)
    ? snapshotJson.matrix_projection
    : content.data_matrix_projection;
  const recipes = rows(content.recipes);
  const reportType = first(input.report.report_type, snapshotJson.report_type, 'single_report');
  const tabs = buildReportFrozenTabs({ reportType, dataMatrixProjection: projection, comparisonSnapshot: snapshotJson, recipes });
  const aiSummary = isRecord(content.ai_summary) ? content.ai_summary : null;
  const frozenIssues = buildIssues(
    content, snapshotJson, input.issues ?? [], input.issueEvidence ?? {}, input.snapshotResolution, text(input.report.id),
  );
  const issueCount = frozenIssues.length;
  const countByKind = (kind: FrozenIssue['sourceKind']) => frozenIssues.filter((issue) => issue.sourceKind === kind).length;
  const rectifiedCount = frozenIssues.filter((issue) => issue.liveOverlay.status === 'verified_closed').length;
  const frozenTaskInfo = isRecord(content.task)
    ? content.task
    : isRecord(snapshotJson.task)
      ? snapshotJson.task
      : input.taskInfo ?? null;
  const internal = options.audience === 'internal';
  return {
    snapshotResolution: input.snapshotResolution,
    header: {
      id: text(input.report.id), title: first(input.report.title, input.report.id), reportType,
      status: text(input.report.status), productModel: text(input.report.product_model) || null,
    },
    tabs,
    summary: {
      text: first(aiSummary?.summary, content.summary, input.report.title),
      aiSummary,
      taskInfo: frozenTaskInfo,
      stats: {
        issueCount,
        sensoryIssueCount: countByKind('sensory'),
        functionIssueCount: countByKind('function'),
        comparisonIssueCount: countByKind('comparison'),
        rectificationRate: issueCount > 0 ? Math.round((rectifiedCount / issueCount) * 100) : 0,
      },
    },
    issues: frozenIssues,
    matrix: comparisonMatrixView(reportType, snapshotJson, tabs),
    dataMatrix: dataMatrixView(projection, tabs),
    functionEffects: recipes.map(recipeContext),
    capabilities: { canManageIssues: internal, canShare: internal, canExport: true },
  };
}
