import { buildReportFrozenTabs, type ReportFrozenTabKey } from './report-frozen-tabs';

type Row = Record<string, unknown>;

export type FrozenMedia = {
  id: string;
  name: string;
  type: string;
  url: string;
};

export type FrozenMatrixView =
  | { kind: 'comparison'; snapshot: Row }
  | { kind: 'data_v2'; projection: Row }
  | { kind: 'data_v3'; projection: Row }
  | null;

export type FrozenIssueLiveOverlay = {
  status: string;
  rectification: string;
  reEvaluations: unknown[];
  /** Mutable rectification/re-evaluation media, separate from original frozen evidence. */
  evidence: FrozenMedia[];
};

export type FrozenIssue = {
  id: string;
  title: string;
  details: string;
  level: string;
  sourceType: string;
  evidence: FrozenMedia[];
  /** Mutable workflow fields only. Frozen title, details and evidence never come from this overlay. */
  liveOverlay: FrozenIssueLiveOverlay;
};

export type FrozenFunctionEffect = {
  id: string;
  name: string;
  evaluation: string;
  score: string;
  problemPoints: unknown;
  evidence: FrozenMedia[];
  steps: Row[];
};

export type FrozenReportViewModel = {
  snapshotResolution: 'anchored' | 'legacy_latest' | 'none';
  header: {
    id: string;
    title: string;
    reportType: string;
    status: string;
    productModel: string | null;
  };
  tabs: ReportFrozenTabKey[];
  summary: { text: string; aiSummary: Row | null };
  issues: FrozenIssue[];
  matrix: FrozenMatrixView;
  functionEffects: FrozenFunctionEffect[];
  capabilities: { canManageIssues: boolean; canShare: boolean; canExport: boolean };
};

export type BuildFrozenReportViewInput = {
  report: Row;
  snapshot?: Row | null;
  issues?: Row[];
  issueEvidence?: Record<string, FrozenMedia[]>;
  snapshotResolution: 'anchored' | 'legacy_latest' | 'none';
};

function isRecord(value: unknown): value is Row {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function rows(value: unknown): Row[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function text(value: unknown): string {
  return value === null || value === undefined ? '' : String(value).trim();
}

function first(...values: unknown[]): string {
  for (const value of values) {
    const result = text(value);
    if (result) return result;
  }
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

function failedRecord(record: Row): boolean {
  const result = text(record.evaluation_result).toLowerCase();
  return result.includes('fail') || result.includes('unqualified') || result.includes('not_pass') || result.includes('不合');
}

function problemPoints(value: unknown): Array<{ text: string; materialIds: string[] }> {
  let source = value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return [];
    try {
      source = JSON.parse(trimmed);
    } catch {
      return [{ text: trimmed, materialIds: [] }];
    }
  }
  if (!Array.isArray(source)) return [];
  return source.flatMap((item) => {
    if (typeof item === 'string') return item.trim() ? [{ text: item.trim(), materialIds: [] }] : [];
    if (!isRecord(item)) return [];
    const pointText = text(item.text ?? item.issueText);
    if (!pointText) return [];
    const rawMaterialIds = item.material_ids ?? item.materialIds;
    const materialIds = Array.isArray(rawMaterialIds)
      ? rawMaterialIds.map(text).filter(Boolean)
      : [];
    return [{ text: pointText, materialIds }];
  });
}

function materialsByIds(materials: Row[], ids: string[]) {
  if (ids.length === 0) return [];
  const wanted = new Set(ids);
  return materials.filter((item) => wanted.has(first(item.id, item.materialId)));
}

function generatedIssueTitle(value: unknown) {
  return text(value).substring(0, 200);
}

function frozenIssueFacts(content: Row, snapshotJson: Row): Row[] {
  const facts: Row[] = [
    ...rows(content.issues).map((issue, index) => ({
      ...issue,
      _frozenKey: `issue:${first(issue.id, index)}`,
      _sourceKind: 'explicit_issue',
    })),
    ...rows(content.records).filter(failedRecord).map((record, index) => ({
      ...record,
      _frozenKey: `record:${first(record.id, index)}`,
      _sourceKind: 'record',
    })),
  ];
  for (const recipe of rows(content.recipes)) {
    const effectMaterials = rows(recipe.effect_materials);
    problemPoints(recipe.effect_problem_point).forEach((point, index) => facts.push({
      id: `recipe-effect:${first(recipe.id, recipe.name)}:${index}`,
      _frozenKey: `recipe:${first(recipe.id, recipe.name)}:effect:${index}`,
      _sourceKind: 'recipe_effect',
      _recipeId: text(recipe.id),
      _recipeName: text(recipe.name),
      title: point.text,
      description: first(recipe.effect_description, '效果/出品效果评价问题'),
      source_type: 'recipe_problem',
      materials: materialsByIds(effectMaterials, point.materialIds),
    }));
    for (const step of rows(recipe.recipe_steps)) {
      const stepPoints = problemPoints(step.problem_points).length > 0
        ? problemPoints(step.problem_points)
        : problemPoints(step.problem_point);
      stepPoints.forEach((point, index) => facts.push({
        id: `recipe-step:${first(step.id, recipe.id)}:${index}`,
        _frozenKey: `recipe:${first(recipe.id, recipe.name)}:step:${first(step.id, index)}:problem:${index}`,
        _sourceKind: 'recipe_step',
        _recipeId: text(recipe.id),
        _recipeName: text(recipe.name),
        _recipeStepId: text(step.id),
        title: point.text,
        description: [first(step.step_number), first(step.operation)].filter(Boolean).join(': '),
        source_type: 'recipe_problem',
        materials: materialsByIds(rows(step.materials), point.materialIds),
      }));
    }
  }

  const projection = isRecord(snapshotJson.matrix_projection) ? snapshotJson.matrix_projection : {};
  const cellMedia = isRecord(projection.cellMedia) ? projection.cellMedia : {};
  for (const point of rows(projection.issuePoints)) {
    const pointId = text(point.id);
    const leafRowId = text(point.leafRowId);
    const columnId = text(point.columnId);
    const pointMaterials = Object.entries(cellMedia).flatMap(([key, items]) => (
      key === `${leafRowId}:${columnId}` || key.startsWith(`${leafRowId}:`)
        ? rows(items)
        : []
    ));
    const materialIds = Array.isArray(point.materialIds) ? point.materialIds.map(text).filter(Boolean) : [];
    facts.push({
      id: pointId || `matrix-issue:${leafRowId}:${columnId}`,
      _frozenKey: `v3-issue:${pointId || `${leafRowId}:${columnId}`}`,
      _sourceKind: 'v3_issue_point',
      title: point.issueText,
      description: point.issueText,
      source_type: 'matrix_problem',
      source_issue_point_id: pointId,
      materials: materialsByIds(pointMaterials, materialIds),
    });
  }

  for (const cell of rows(snapshotJson.cells ?? snapshotJson.matrix_cells)) {
    const cellId = text(cell.id);
    const points = problemPoints(cell.problem_points);
    points.forEach((point, index) => facts.push({
      id: `comparison-cell:${cellId}:problem:${index}`,
      _frozenKey: `comparison-cell:${cellId}:problem:${index}`,
      _sourceKind: 'comparison_cell',
      _comparisonCellId: cellId,
      title: point.text,
      description: first(cell.effect_summary, point.text),
      source_type: 'recipe_problem',
      materials: [
        ...rows(cell.inline_media),
        ...rows(cell.appendix_media),
        ...rows(cell.media),
      ],
    }));
  }

  const seen = new Set<string>();
  return facts.filter((fact) => {
    const key = first(fact._frozenKey, fact.id);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function recipeSourceKind(live: Row): 'recipe_effect' | 'recipe_step' | null {
  const source = text(live.source);
  if (source.includes('食谱效果问题') || source.includes('效果问题')) return 'recipe_effect';
  if (source.includes('食谱功能问题') || source.includes('功能问题')) return 'recipe_step';
  return null;
}

function findFrozenFactForLive(facts: Row[], live: Row) {
  const stable = facts.find((item) => (
    text(item.id) === text(live.id)
    || (text(item.id) && text(item.id) === text(live.source_cell_id))
    || (
      text(item._comparisonCellId)
      && text(item._comparisonCellId) === text(live.source_cell_id)
      && generatedIssueTitle(item.title) === generatedIssueTitle(live.title)
    )
    || (text(item.source_issue_point_id) && text(item.source_issue_point_id) === text(live.source_issue_point_id))
    || (text(item._recipeStepId) && text(item._recipeStepId) === text(live.recipe_step_id))
  ));
  if (stable) return stable;

  const title = generatedIssueTitle(live.title);
  const sourceType = text(live.source_type);
  const discriminator = recipeSourceKind(live);
  const candidates = facts.filter((item) => {
    if (generatedIssueTitle(first(item.title, item.check_item)) !== title) return false;
    if (first(item.source_type, item.standard_category) !== sourceType) return false;
    if (discriminator && text(item._sourceKind) !== discriminator) return false;
    if (text(live.recipe_step_id) && text(item._recipeStepId) !== text(live.recipe_step_id)) return false;
    if (text(live.recipe_id) && text(item._recipeId) !== text(live.recipe_id)) return false;
    const recipeName = text(item._recipeName);
    return !recipeName || !text(live.source) || text(live.source).includes(recipeName);
  });
  return candidates.length === 1 ? candidates[0] : undefined;
}

export function overlayEvidenceWithoutReEvaluations(
  evidence: FrozenMedia[],
  evaluations: unknown[],
  baseEvidence: FrozenMedia[] = [],
): FrozenMedia[] {
  const reevaluationMedia = rows(evaluations).flatMap((evaluation) => media(evaluation.materials));
  const excluded = [...reevaluationMedia, ...baseEvidence];
  const excludedIds = new Set(excluded.map((item) => text(item.id)).filter(Boolean));
  const excludedUrls = new Set(excluded.map((item) => text(item.url)).filter(Boolean));
  const excludedNames = new Set(excluded.map((item) => text(item.name)).filter(Boolean));
  return evidence.filter((item) => {
    const id = text(item.id);
    const url = text(item.url);
    const name = text(item.name);
    if (id && excludedIds.has(id)) return false;
    if (url && excludedUrls.has(url)) return false;
    return Boolean(id || url) || !name || !excludedNames.has(name);
  });
}

function liveOverlay(
  issue: Row | undefined,
  evidence: FrozenMedia[] = [],
  baseEvidence: FrozenMedia[] = [],
): FrozenIssueLiveOverlay {
  const reEvaluations = rows(issue?._reEvaluations);
  return {
    status: first(issue?.status, issue?.evaluation_result),
    rectification: first(issue?.improve_plan, issue?.rectification, issue?.no_improve_reason),
    reEvaluations,
    evidence: overlayEvidenceWithoutReEvaluations(evidence, reEvaluations, baseEvidence),
  };
}

function frozenIssue(
  base: Row,
  live: Row | undefined,
  evidence: FrozenMedia[],
  overlayEvidence: FrozenMedia[] = [],
  overlayBaseEvidence: FrozenMedia[] = [],
): FrozenIssue {
  return {
    id: first(live?.id, base.id),
    title: first(base.title, base.check_item, base.problem_description, base.effect_summary, base.id),
    details: first(base.description, base.problem_description, base.check_requirement, base.check_standard),
    level: first(base.level, base.problem_level, live?.level, live?.problem_level),
    sourceType: first(base.source_type, base.standard_category, live?.source_type),
    evidence,
    liveOverlay: liveOverlay(live, overlayEvidence, overlayBaseEvidence),
  };
}

function buildIssues(
  content: Row,
  snapshotJson: Row,
  liveIssues: Row[],
  issueEvidence: Record<string, FrozenMedia[]>,
  snapshotResolution: BuildFrozenReportViewInput['snapshotResolution'],
): FrozenIssue[] {
  const frozenFacts = frozenIssueFacts(content, snapshotJson);
  const cells = rows(snapshotJson.cells ?? snapshotJson.matrix_cells);
  const consumed = new Set<Row>();
  const result: FrozenIssue[] = [];

  for (const live of liveIssues) {
    const record = frozenFacts.find((item) => (
      text(item._sourceKind) === 'record' && text(item.id) === text(live.record_id)
    ));
    const explicit = findFrozenFactForLive(frozenFacts, live);
    const cell = cells.find((item) => text(item.id) === text(live.source_cell_id));
    const base = explicit ?? record ?? cell;
    if (!base && snapshotResolution !== 'legacy_latest') continue;
    const frozenBase = base ?? live;
    consumed.add(frozenBase);
    const baseMedia = cell
      ? [...rows(cell.inline_media), ...rows(cell.appendix_media), ...rows(cell.media)]
      : rows(frozenBase.materials);
    const frozenEvidence = media(baseMedia);
    result.push(frozenIssue(
      frozenBase,
      live,
      frozenEvidence,
      issueEvidence[text(live.id)] ?? [],
      snapshotResolution === 'legacy_latest' ? frozenEvidence : [],
    ));
  }

  const orphanFrozen = [
    ...frozenFacts,
  ].filter((item) => !consumed.has(item));
  for (const item of orphanFrozen) result.push(frozenIssue(item, undefined, media(item.materials)));
  return result;
}

function matrixView(reportType: string, projection: unknown, snapshotJson: Row, tabs: ReportFrozenTabKey[]): FrozenMatrixView {
  if (reportType === 'comparison_report' && tabs.includes('comparison_matrix')) {
    return { kind: 'comparison', snapshot: snapshotJson };
  }
  if (!isRecord(projection) || !tabs.includes('data_matrix')) return null;
  const isV3 = projection.projectionVersion === 'v3' || projection.matrixProjectionVersion === 'v3';
  return { kind: isV3 ? 'data_v3' : 'data_v2', projection };
}

function functionEffects(content: Row): FrozenFunctionEffect[] {
  return rows(content.recipes).map((recipe) => ({
    id: text(recipe.id),
    name: first(recipe.name, recipe.id),
    evaluation: first(recipe.effect_description, recipe.effect_evaluation, recipe.effect_ai_result),
    score: text(recipe.effect_score),
    problemPoints: recipe.effect_problem_point ?? null,
    evidence: media(recipe.effect_materials),
    steps: rows(recipe.recipe_steps),
  }));
}

export function buildFrozenReportViewModel(
  input: BuildFrozenReportViewInput,
  options: { audience: 'internal' | 'share' },
): FrozenReportViewModel {
  const content = isRecord(input.report.content) ? input.report.content : {};
  const snapshotJson = isRecord(input.snapshot?.snapshot_json) ? input.snapshot.snapshot_json : {};
  const projection = input.snapshot
    ? snapshotJson.matrix_projection
    : content.data_matrix_projection;
  const recipes = rows(content.recipes);
  const reportType = first(input.report.report_type, 'single_report');
  const tabs = buildReportFrozenTabs({
    reportType,
    dataMatrixProjection: projection,
    comparisonSnapshot: snapshotJson,
    recipes,
  });
  const aiSummary = isRecord(content.ai_summary) ? content.ai_summary : null;
  const internal = options.audience === 'internal';
  return {
    snapshotResolution: input.snapshotResolution,
    header: {
      id: text(input.report.id),
      title: first(input.report.title, input.report.id),
      reportType,
      status: text(input.report.status),
      productModel: text(input.report.product_model) || null,
    },
    tabs,
    summary: { text: first(aiSummary?.summary, content.summary, input.report.title), aiSummary },
    issues: buildIssues(
      content,
      snapshotJson,
      input.issues ?? [],
      input.issueEvidence ?? {},
      input.snapshotResolution,
    ),
    matrix: matrixView(reportType, projection, snapshotJson, tabs),
    functionEffects: functionEffects(content),
    capabilities: {
      canManageIssues: internal,
      canShare: internal,
      canExport: true,
    },
  };
}
