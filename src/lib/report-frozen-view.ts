import {
  evaluationIssueTitle,
  evaluationRecipeSubjectName,
  normalizeEvaluationStatus,
  type EvaluationStatus,
} from './evaluation-status';
import { buildReportFrozenTabs, type ReportFrozenTabKey } from './report-frozen-tabs';
import { sortFrozenIssues } from './stable-display-order';
import { orderMaterialsByIds } from './material-selection-order';

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

export type FrozenRetestSummary = { count: number; latest: FrozenRetest | null; history: FrozenRetest[] };

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
  /** Frozen source/problem creation time used for stable oldest-first display. */
  createdAt?: string | null;
  /** Canonical mutable issue id. Absent for a frozen fact without an issue record. */
  liveIssueId?: string;
  /** Request-scoped canonical authorization; frozen content never grants this by audience alone. */
  canManage: boolean;
  /** Stable frozen source identity for a matrix/comparison issue; never derived from its title. */
  sourceCellId?: string;
  title: string;
  details: string;
  level: string;
  sourceType: string;
  sourceKind: 'sensory' | 'function' | 'comparison' | 'matrix';
  context: {
    object: string;
    project: string;
    item: string;
    standardType?: string;
    inspectionRange?: string;
    inspectionStandard?: string;
    nonStandardContent?: string;
    descriptionResult?: string;
    checkResult?: string;
    primaryCategory?: string;
    secondaryDetail?: string;
    comparisonDimension?: string;
    problemPoints?: string[];
    isNonStandard?: boolean;
  };
  evidence: FrozenMedia[];
  /** Present only for recipe/function whole-judgment issues. */
  recipe?: FrozenRecipeContext;
  /** Mutable workflow fields only. */
  liveOverlay: FrozenIssueLiveOverlay;
};

export type FrozenFunctionEffect = FrozenRecipeContext;

export function excludeClaimedRecipeMediaFromEffects(
  effects: FrozenFunctionEffect[],
  issues: FrozenIssue[],
): FrozenFunctionEffect[] {
  const claimedByRecipe = new Map<string, Set<string>>();
  for (const issue of issues) {
    if (!issue.recipe) continue;
    const claimed = claimedByRecipe.get(issue.recipe.recipeId) ?? new Set<string>();
    [...issue.recipe.evidence, ...issue.recipe.steps.flatMap((step) => step.evidence), ...issue.evidence]
      .forEach((item) => claimed.add(frozenMediaDedupeKey(item)));
    claimedByRecipe.set(issue.recipe.recipeId, claimed);
  }
  return effects.map((effect) => {
    const claimed = claimedByRecipe.get(effect.recipeId);
    if (!claimed) return effect;
    return {
      ...effect,
      evidence: effect.evidence.filter((item) => !claimed.has(frozenMediaDedupeKey(item))),
      steps: effect.steps.map((step) => ({
        ...step,
        evidence: step.evidence.filter((item) => !claimed.has(frozenMediaDedupeKey(item))),
      })),
    };
  });
}

export type FrozenReportViewModel = {
  snapshotResolution: 'anchored' | 'legacy_latest' | 'none';
  header: { id: string; taskId?: string; title: string; reportType: string; status: string; productModel: string | null };
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

function normalizedFrozenMediaUrl(value: string) {
  return value.trim().normalize('NFKC').replace(/\\/g, '/').replace(/^\/+/, '');
}

export function frozenMediaDedupeKey(item: Pick<FrozenMedia, 'id' | 'url'>) {
  const id = text(item.id);
  return id ? `id:${id}` : `url:${normalizedFrozenMediaUrl(text(item.url))}`;
}

export function dedupeFrozenMedia(items: FrozenMedia[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = frozenMediaDedupeKey(item);
    if (key === 'url:' || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function subtractFrozenMedia(items: FrozenMedia[], excluded: FrozenMedia[]) {
  const excludedKeys = new Set(excluded.map(frozenMediaDedupeKey));
  return dedupeFrozenMedia(items).filter((item) => !excludedKeys.has(frozenMediaDedupeKey(item)));
}

export function normalizeFrozenIssueLevel(...values: unknown[]): string {
  const level = first(...values);
  const unknown = level.toLowerCase().replace(/\s+/g, '');
  return !unknown || ['?', '??', '未知', 'unknown', 'n/a', 'na', '-', '—', 'null'].includes(unknown)
    ? '二类'
    : level;
}

function media(items: unknown): FrozenMedia[] {
  const seen = new Set<string>();
  return rows(items).flatMap((item) => {
    const id = first(item.id, item.materialId, item.file_path, item.filePath, item.file_url, item.fileUrl);
    const url = first(item.file_path, item.filePath, item.file_url, item.fileUrl, item.url);
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

function normalizedProblemText(value: unknown): string {
  return text(value).normalize('NFKC').replace(/\s+/g, ' ').toLocaleLowerCase();
}

function isComparisonOriginIssue(issue: Row) {
  return Boolean(first(issue.source_assembly_id, issue.sourceAssemblyId, issue.source_cell_id, issue.sourceCellId));
}

function issueProblemText(issue: Row) {
  return normalizedProblemText(first(issue.title, issue.description, issue.problem_description));
}

function failedRecord(record: Row): boolean {
  const result = text(record.evaluation_result).toLowerCase();
  return result.includes('fail') || result.includes('unqualified') || result.includes('not_pass') || result.includes('不合')
    || result.includes('pending') || result.includes('待定');
}

function materialsByIds(materials: Row[], ids: string[]) {
  return orderMaterialsByIds(ids, materials.map((item) => ({ ...item, id: first(item.id, item.materialId) })));
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

function frozenMatrixProjection(content: Row, snapshotJson: Row): Row {
  if (isRecord(snapshotJson.matrix_projection)) return snapshotJson.matrix_projection;
  if (isRecord(content.data_matrix_projection)) return content.data_matrix_projection;
  if (isRecord(content.matrix_projection)) return content.matrix_projection;
  return {};
}

function cleanFrozenFieldValue(value: unknown): string {
  return text(value).replace(/^(?:[:：]\s*)+/, '');
}

type FrozenFact = Row & {
  _recipe?: FrozenRecipeContext;
  _reportable?: boolean;
  _comparisonCellIds?: string[];
  _comparisonProblemPoints?: string[];
};

function comparisonCellIds(fact: FrozenFact): string[] {
  return fact._comparisonCellIds?.length
    ? fact._comparisonCellIds
    : [first(fact._comparisonCellId, fact.source_cell_id, fact.sourceCellId)].filter(Boolean);
}

function comparisonIssueTitle(objectName: string, projectName: string, itemName: string): string {
  if (!objectName && !projectName && !itemName) return '';
  return `${objectName || '未命名对象'}（对象）：${projectName || '未命名大类'}（大类）的${itemName || '未命名细项'}（细项）效果不合格`;
}

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

  const projection = frozenMatrixProjection(content, snapshotJson);
  const cellMedia = isRecord(projection.cellMedia) ? projection.cellMedia : {};
  const matrixRows = rows(projection.rows ?? projection.matrix_rows);
  const matrixColumns = rows(projection.columns ?? projection.matrix_columns);
  for (const point of rows(projection.issuePoints ?? projection.issue_points)) {
    const pointId = text(point.id);
    const sourceCellId = first(point.sourceCellId, point.source_cell_id, pointId, `${text(point.leafRowId)}:${text(point.columnId)}`);
    const leafRowId = text(point.leafRowId);
    const columnId = text(point.columnId);
    const pointMaterials = Object.entries(cellMedia).flatMap(([key, items]) => (
      key === `${leafRowId}:${columnId}` || key.startsWith(`${leafRowId}:`) ? rows(items) : []
    ));
    const materialIds = Array.isArray(point.materialIds) ? point.materialIds.map(text).filter(Boolean) : [];
    const matrixRow = matrixRows.find((row) => text(row.id) === leafRowId);
    const matrixColumn = matrixColumns.find((column) => text(column.id) === columnId);
    facts.push({
      id: pointId || `matrix-issue:${leafRowId}:${columnId}`,
      _frozenKey: `v3-issue:${pointId || `${leafRowId}:${columnId}`}`,
      _sourceKind: 'v3_issue_point', title: point.issueText, description: point.issueText,
      source_type: 'matrix_problem',
      source_cell_id: sourceCellId,
      source_issue_point_id: pointId,
      linked_issue_id: text(point.linkedIssueId),
      primary_category: first(matrixRow?.level1Label, matrixRow?.level_1),
      secondary_detail: [first(matrixRow?.level2Label, matrixRow?.level_2), first(matrixRow?.level3Label, matrixRow?.level_3)].filter(Boolean).join(' / '),
      comparison_dimension: first(matrixColumn?.label, matrixColumn?.columnLabel),
      created_at: first(point.created_at, point.createdAt),
      materials: materialsByIds(pointMaterials, materialIds),
    });
  }
const comparisonObjectsById = new Map(rows(snapshotJson.objects ?? snapshotJson.comparison_objects)
    .map((item) => [text(item.id), item] as const)
    .filter(([id]) => Boolean(id)));
  const comparisonItemsById = new Map(rows(snapshotJson.item_nodes ?? snapshotJson.comparison_item_nodes)
    .map((item) => [text(item.id), item] as const)
    .filter(([id]) => Boolean(id)));
  const comparisonGroups = new Map<string, {
    cellIds: string[];
    objectName: string;
    projectName: string;
    itemName: string;
    effectSummary: string;
    createdAt: string;
    problemPoints: string[];
    materials: Row[];
  }>();
  for (const cell of rows(snapshotJson.cells ?? snapshotJson.matrix_cells)) {
    const cellId = text(cell.id);
    const objectId = first(cell.object_id, cell.objectId);
    const itemId = first(cell.item_node_id, cell.itemNodeId);
    const object = comparisonObjectsById.get(objectId);
    const item = comparisonItemsById.get(itemId);
    const parent = item ? comparisonItemsById.get(first(item.parent_id, item.parentId)) : undefined;
    const points = Array.isArray(cell.problem_points) ? cell.problem_points : [];
    const objectName = first(object?.object_name, object?.name, cell.object_name);
    const projectName = first(parent?.node_label, parent?.label, item?.project_name, cell.project_name);
    const itemName = first(item?.node_label, item?.label, cell.item_name);
    const groupKey = objectId && itemId ? `${objectId}:${itemId}` : cellId;
    const group = comparisonGroups.get(groupKey) ?? {
      cellIds: [], objectName, projectName, itemName,
      effectSummary: first(cell.effect_summary),
      createdAt: first(cell.created_at, cell.createdAt),
      problemPoints: [], materials: [],
    };
    if (cellId && !group.cellIds.includes(cellId)) group.cellIds.push(cellId);
    const seenProblemTexts = new Set(group.problemPoints.map(normalizedProblemText));
    points.forEach((rawPoint) => {
      const point = typeof rawPoint === 'string' ? { text: rawPoint } : isRecord(rawPoint) ? rawPoint : {};
      const pointText = first(point.text, point.issueText);
      const normalizedText = normalizedProblemText(pointText);
      if (!normalizedText || seenProblemTexts.has(normalizedText)) return;
      seenProblemTexts.add(normalizedText);
      group.problemPoints.push(pointText);
      group.createdAt = first(group.createdAt, point.created_at, point.createdAt);
    });
    group.materials.push(...rows(cell.inline_media), ...rows(cell.appendix_media), ...rows(cell.media));
    comparisonGroups.set(groupKey, group);
  }
  for (const group of comparisonGroups.values()) {
    if (group.problemPoints.length === 0) continue;
    const firstCellId = group.cellIds[0] ?? '';
    facts.push({
      id: `comparison-cell:${firstCellId}:problem:0`,
      _frozenKey: `comparison-cell:${firstCellId}:problem:0`,
      _sourceKind: 'comparison_cell',
      _comparisonCellId: firstCellId,
      _comparisonCellIds: group.cellIds,
      _comparisonProblemPoints: group.problemPoints,
      title: comparisonIssueTitle(group.objectName, group.projectName, group.itemName),
      description: first(group.effectSummary, group.problemPoints[0]),
      source_type: 'comparison_problem',
      created_at: group.createdAt,
      object_name: group.objectName,
      project_name: group.projectName,
      item_name: group.itemName,
      problem_points: group.problemPoints,
      materials: group.materials,
    });
  }
  return facts;
}

function explicitIssueMatchesSource(explicit: FrozenFact, source: FrozenFact) {
  const sourceKind = text(source._sourceKind);
  if (sourceKind === 'record' && text(explicit.record_id) === text(source.id)) return true;
  if (sourceKind === 'recipe' && text(explicit.recipe_id) === text(source._recipeId)) return true;
  if (sourceKind === 'v3_issue_point') {
    if (text(source.linked_issue_id) && text(source.linked_issue_id) === text(explicit.id)) return true;
    const explicitPointId = first(
      explicit.source_cell_id,
      explicit.sourceCellId,
      explicit.source_issue_point_id,
      text(explicit.source_type) === 'matrix_issue' ? explicit.source_report_id : '',
    );
    return Boolean(explicitPointId) && explicitPointId === first(source.source_issue_point_id, source.source_cell_id, source.id);
  }
  if (sourceKind !== 'comparison_cell') return false;
  const explicitCellId = first(explicit.source_cell_id, explicit.sourceCellId);
  return Boolean(explicitCellId) && comparisonCellIds(source).includes(explicitCellId);
}

function mergeFrozenSourceWithExplicitIssue(source: FrozenFact, explicit: FrozenFact): FrozenFact {
  return {
    ...explicit,
    ...source,
    _issueCreatedAt: first(explicit._issueCreatedAt, explicit.created_at, explicit.createdAt),
    linked_issue_id: first(source.linked_issue_id, explicit.linked_issue_id, explicit.id),
    materials: [...rows(source.materials), ...rows(explicit.materials)],
    _reEvaluations: [...rows(source._reEvaluations), ...rows(explicit._reEvaluations)],
  };
}

/**
 * Generated report content includes canonical issue facts so issue/retest media
 * can be frozen.  Record, recipe, and matrix facts already describe the same
 * source, so collapse them before projection instead of rendering two rows.
 */
function coalesceExplicitIssueFacts(facts: FrozenFact[]): FrozenFact[] {
  const explicit = facts.filter((fact) => text(fact._sourceKind) === 'explicit_issue');
  const sourceFacts = facts.filter((fact) => text(fact._sourceKind) !== 'explicit_issue');
  const matched = new Set<FrozenFact>();
  const coalesced = sourceFacts.map((source) => {
    const matches = explicit.filter((issue) => !matched.has(issue) && explicitIssueMatchesSource(issue, source));
    if (matches.length === 0) return source;
    matches.forEach((issue) => matched.add(issue));
    return matches.reduce(mergeFrozenSourceWithExplicitIssue, source);
  });

  // Secondary dedup: comparison-origin issues without a cell-id match may still
  // duplicate a frozen cell problem by sourceCellId + normalized title.
  for (const issue of explicit) {
    if (matched.has(issue)) continue;
    if (!isComparisonOriginIssue(issue)) continue;
    const cellId = text(issue.source_cell_id || issue.sourceCellId);
    if (cellId && coalesced.some((fact) => text(fact._sourceKind) === 'comparison_cell' && comparisonCellIds(fact).includes(cellId))) {
      matched.add(issue);
    }
  }

  return [...coalesced, ...explicit.filter((issue) => !matched.has(issue))];
}

function findFrozenFactForLive(facts: FrozenFact[], live: Row, consumed: Set<FrozenFact>) {
  const liveIssueId = text(live.id);
  if (liveIssueId) {
    const linked = facts.find((item) => !consumed.has(item) && text(item.linked_issue_id) === liveIssueId);
    if (linked) return linked;
  }
  const recipeId = text(live.recipe_id);
  if (recipeId) return facts.find((item) => !consumed.has(item) && text(item._recipeId) === recipeId);
  const recordId = text(live.record_id);
  if (recordId) return facts.find((item) => !consumed.has(item) && text(item._sourceKind) === 'record' && text(item.id) === recordId);
  const sourceCellId = text(live.source_cell_id);
  const liveTitle = issueProblemText(live);
  if (sourceCellId) return facts.find((item) => !consumed.has(item) && (
    text(item.id) === sourceCellId
    || text(item.source_issue_point_id) === sourceCellId
    || (comparisonCellIds(item).includes(sourceCellId) && (!liveTitle || text(item._sourceKind) === 'comparison_cell'))
  ));
  return undefined;
}

function comparisonLiveCoveredByFrozenFacts(facts: FrozenFact[], live: Row) {
  if (!isComparisonOriginIssue(live)) return false;
  const cellId = first(live.source_cell_id, live.sourceCellId);
  if (!cellId) return false;
  return facts.some((fact) => (
    text(fact._sourceKind) === 'comparison_cell'
    && comparisonCellIds(fact).includes(cellId)
  ));
}

function findUniqueLegacyFunctionFactForLive(
  facts: FrozenFact[], live: Row, consumed: Set<FrozenFact>, reportId: string,
): FrozenFact | undefined {
  if (text(live.source_report_id) !== reportId
    || text(live.source_type) !== 'recipe_problem'
    || isComparisonOriginIssue(live)
    || text(live.recipe_id)) return undefined;
  const title = issueProblemText(live);
  if (!title) return undefined;
  const candidates = facts.filter((fact) => (
    !consumed.has(fact)
    && text(fact._sourceKind) === 'explicit_issue'
    && text(fact.source_type) === 'recipe_problem'
    && !isComparisonOriginIssue(fact)
    && issueProblemText(fact) === title
  ));
  return candidates.length === 1 ? candidates[0] : undefined;
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

export function authoritativeRetestRows(frozenReEvaluations: Row[] = [], liveReEvaluations?: unknown): Row[] {
  return Array.isArray(liveReEvaluations) ? liveReEvaluations as Row[] : frozenReEvaluations;
}

function retestSummary(issue: Row | undefined, frozenReEvaluations: Row[] = []): FrozenRetestSummary {
  const byId = new Map<string, Row>();
  for (const item of authoritativeRetestRows(frozenReEvaluations, issue?._reEvaluations)) {
    const id = first(item.id);
    if (id) byId.set(id, item);
    else byId.set(`anonymous:${byId.size}`, item);
  }
  const retests = Array.from(byId.values())
    .map((item, index): FrozenRetest => ({
      id: first(item.id, `retest:${index}`),
      result: normalizeEvaluationStatus(item.result ?? item.evaluation_result ?? item.conclusion),
      description: first(item.description, item.evaluation_description, item.conclusion),
      createdAt: text(item.created_at) || null,
      createdBy: first(item.created_by_name, item.created_by, item.creator_name) || null,
      evidence: media(item.materials),
    }))
    .sort((left, right) => ((right.createdAt ?? '').localeCompare(left.createdAt ?? '') || right.id.localeCompare(left.id)));
  return { count: retests.length, latest: retests[0] ?? null, history: retests };
}

function liveOverlay(issue: Row | undefined, evidence: FrozenMedia[] = [], baseEvidence: FrozenMedia[] = [], frozenReEvaluations: Row[] = []): FrozenIssueLiveOverlay {
  const rawRetests = authoritativeRetestRows(frozenReEvaluations, issue?._reEvaluations);
  return {
    status: first(issue?.status, issue?.evaluation_result),
    rectification: first(issue?.improve_plan, issue?.rectification, issue?.no_improve_reason),
    retest: retestSummary(issue, frozenReEvaluations),
    evidence: overlayEvidenceWithoutReEvaluations(evidence, rawRetests, baseEvidence),
  };
}

function frozenIssue(base: FrozenFact, live: Row | undefined, evidence: FrozenMedia[], overlayEvidence: FrozenMedia[] = [], overlayBaseEvidence: FrozenMedia[] = []): FrozenIssue {
  const sourceType = first(base.source_type, live?.source_type, base.standard_category);
  const isFrozenRecord = text(base._sourceKind) === 'record';
  const sourceKind: FrozenIssue['sourceKind'] = sourceType === 'matrix_problem' || sourceType === 'matrix_issue'
    ? 'matrix'
    : text(base._sourceKind) === 'comparison_cell' || isComparisonOriginIssue(base) || Boolean(live && isComparisonOriginIssue(live))
      ? 'comparison'
      : isFrozenRecord || sourceType === 'record_fail' || sourceType === 'sensory_problem'
        ? 'sensory'
        : 'function';
  const standardType = first(base.standard_type, base.standardType, base.standard_category);
  const nonStandard = standardType.includes('非标准');
  const recipe = base._recipe;
  const sensoryTitle = first(base.check_item, base.item_name, base.title, base.problem_description, base.id);
  const observedDescription = cleanFrozenFieldValue(first(base.check_result, base.description, base.problem_description));
  return {
    id: first(live?.id, base.id),
    createdAt: first(base._issueCreatedAt, live?.created_at, live?.createdAt, base.created_at, base.createdAt) || null,
    ...(text(live?.id) ? { liveIssueId: text(live?.id) } : {}),
    canManage: false,
    ...(first(base.source_cell_id, base.source_issue_point_id, comparisonCellIds(base)[0]) ? {
      sourceCellId: first(base.source_cell_id, base.source_issue_point_id, comparisonCellIds(base)[0]),
    } : {}),
    title: sourceKind === 'sensory' ? sensoryTitle : first(base.title, base.check_item, base.problem_description, base.effect_summary, base.id),
    details: sourceKind === 'sensory'
      ? observedDescription
      : first(base.description, base.problem_description, base.check_requirement, base.check_standard),
    level: normalizeFrozenIssueLevel(base.level, base.problem_level, live?.level, live?.problem_level),
    sourceType,
    sourceKind,
    context: {
      object: cleanFrozenFieldValue(first(base.object_name, base.object_label, base.object, live?.object_name, live?.object_label)),
      project: cleanFrozenFieldValue(first(base.project_name, base.task_name, base.project, live?.project_name)),
      item: cleanFrozenFieldValue(first(base.check_item, base.item_name, base.node_label, base.sub_check_dimension, live?.check_item)),
      standardType: nonStandard ? '' : cleanFrozenFieldValue(standardType),
      inspectionRange: cleanFrozenFieldValue(first(base.touch_point, base.check_requirement, base.evaluation_prep, base.inspection_range)),
      inspectionStandard: nonStandard ? '' : cleanFrozenFieldValue(first(base.experience_standard, base.check_standard, base.subjective_rating, base.subjective_score)),
      nonStandardContent: nonStandard ? cleanFrozenFieldValue(first(base.check_item, base.problem_description, base.description)) : '',
      descriptionResult: sourceKind === 'sensory' ? observedDescription : '',
      checkResult: cleanFrozenFieldValue(first(base.evaluation_result, base.result, base.inspection_result)),
      primaryCategory: cleanFrozenFieldValue(first(base.primary_category, base.level_1, base.level1, base.first_level_category)),
      secondaryDetail: cleanFrozenFieldValue(first(base.secondary_detail, base.level_2, base.second_level_category, base.level_3, base.third_level_category)),
      comparisonDimension: cleanFrozenFieldValue(first(base.comparison_dimension, base.compare_dimension, base.column_label, base.metric_name)),
      ...(sourceKind === 'comparison' ? {
        problemPoints: problemTexts(base._comparisonProblemPoints ?? base.problem_points),
      } : {}),
      isNonStandard: nonStandard,
    },
    evidence: recipe ? subtractFrozenMedia(evidence, recipe.evidence) : dedupeFrozenMedia(evidence),
    ...(recipe ? { recipe } : {}),
    liveOverlay: liveOverlay(live, overlayEvidence, overlayBaseEvidence, rows(base._reEvaluations)),
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
  const hasCanonicalComparisonCells = rows(snapshotJson.cells ?? snapshotJson.matrix_cells).length > 0;
  const rawFacts = frozenIssueFacts(content, snapshotJson);
  // A comparison snapshot is its own canonical source. Historical explicit
  // issue rows are retained in report_content for audit compatibility, but
  // must never revive removed cells or split one current cell into many rows.
  const facts = coalesceExplicitIssueFacts(hasCanonicalComparisonCells
    ? rawFacts.filter((fact) => !(text(fact._sourceKind) === 'explicit_issue' && isComparisonOriginIssue(fact)))
    : rawFacts);
  const hasCanonicalLiveFunctionIssues = liveIssues.some((issue) => (
    text(issue.source_type) === 'recipe_problem'
    && !isComparisonOriginIssue(issue)
    && (Boolean(text(issue.recipe_id)) || text(issue.source_report_id) === reportId)
  ));
  const consumed = new Set<FrozenFact>();
  const result: FrozenIssue[] = [];
  for (const live of liveIssues) {
    const base = findFrozenFactForLive(facts, live, consumed)
      ?? findUniqueLegacyFunctionFactForLive(facts, live, consumed, reportId);
    if (base?._sourceKind === 'recipe' && !base._reportable) continue;
    const isCurrentReportLegacyIssue = text(live.source_report_id) === reportId;
    if (!base) {
      if (comparisonLiveCoveredByFrozenFacts(facts, live)) continue;
      if (resolution !== 'legacy_latest' && !isCurrentReportLegacyIssue) continue;
    }
    const frozenBase = base ?? live as FrozenFact;
    consumed.add(frozenBase);
    const evidence = media(rows(frozenBase.materials));
    result.push(frozenIssue(frozenBase, live, evidence, issueEvidence[text(live.id)] ?? [], evidence));
  }
  for (const fact of facts) {
    if (consumed.has(fact)) continue;
    if (fact._sourceKind === 'recipe' && !fact._reportable) continue;
    if (hasCanonicalComparisonCells
      && fact._sourceKind === 'explicit_issue'
      && isComparisonOriginIssue(fact)) continue;
    if (hasCanonicalLiveFunctionIssues
      && fact._sourceKind === 'explicit_issue'
      && text(fact.source_type) === 'recipe_problem'
      && !isComparisonOriginIssue(fact)) continue;
    result.push(frozenIssue(fact, undefined, media(rows(fact.materials))));
  }
  return sortFrozenIssues(result);
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

export function buildFrozenReportViewModel(
  input: BuildFrozenReportViewInput,
  options: { audience: 'internal' | 'share'; manageableIssueIds?: ReadonlySet<string> },
): FrozenReportViewModel {
  const snapshotJson = isRecord(input.snapshot?.snapshot_json) ? input.snapshot.snapshot_json : {};
  const content = frozenReportContent(input, snapshotJson);
  const projection = frozenMatrixProjection(content, snapshotJson);
  const recipes = rows(content.recipes);
  const reportType = first(input.report.report_type, snapshotJson.report_type, 'single_report');
  const tabs = buildReportFrozenTabs({ reportType, dataMatrixProjection: projection, comparisonSnapshot: snapshotJson, recipes });
  const aiSummary = isRecord(content.ai_summary) ? content.ai_summary : null;
  const manageableIssueIds = options.manageableIssueIds ?? new Set<string>();
  const frozenIssues = buildIssues(
    content, snapshotJson, input.issues ?? [], input.issueEvidence ?? {}, input.snapshotResolution, text(input.report.id),
  ).map((issue) => ({
    ...issue,
    canManage: Boolean(issue.liveIssueId && manageableIssueIds.has(issue.liveIssueId)),
  }));
  const issueCount = frozenIssues.length;
  const countByKind = (kind: FrozenIssue['sourceKind']) => frozenIssues.filter((issue) => issue.sourceKind === kind).length;
  const rectifiedCount = frozenIssues.filter((issue) => issue.liveOverlay.status === 'verified_closed').length;
  const frozenTaskInfo = isRecord(content.task)
    ? content.task
    : isRecord(snapshotJson.task)
      ? snapshotJson.task
      : input.taskInfo ?? null;
  const internal = options.audience === 'internal';
  const functionEffects = recipes.map(recipeContext);
  return {
    snapshotResolution: input.snapshotResolution,
    header: {
      id: text(input.report.id), title: first(input.report.title, input.report.id), reportType,
      status: text(input.report.status), productModel: text(input.report.product_model) || null,
      taskId: text(input.report.task_id) || undefined,
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
    functionEffects,
    capabilities: { canManageIssues: frozenIssues.some((issue) => issue.canManage), canShare: internal, canExport: true },
  };
}
