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
    const id = first(item.id, item.file_path, item.file_url);
    const url = first(item.file_url, item.file_path, item.url);
    const key = id || url;
    if (!key || !url || seen.has(key)) return [];
    seen.add(key);
    return [{
      id: key,
      name: first(item.file_name, item.name, item.id, 'material'),
      type: first(item.material_type, item.media_type, 'material'),
      url,
    }];
  });
}

function failedRecord(record: Row): boolean {
  const result = text(record.evaluation_result).toLowerCase();
  return result.includes('fail') || result.includes('unqualified') || result.includes('not_pass') || result.includes('不合');
}

function liveOverlay(issue: Row | undefined, evidence: FrozenMedia[] = []): FrozenIssueLiveOverlay {
  return {
    status: first(issue?.status, issue?.evaluation_result),
    rectification: first(issue?.improve_plan, issue?.rectification, issue?.no_improve_reason),
    reEvaluations: rows(issue?._reEvaluations),
    evidence,
  };
}

function frozenIssue(
  base: Row,
  live: Row | undefined,
  evidence: FrozenMedia[],
  overlayEvidence: FrozenMedia[] = [],
): FrozenIssue {
  return {
    id: first(live?.id, base.id),
    title: first(base.title, base.check_item, base.problem_description, base.effect_summary, base.id),
    details: first(base.description, base.problem_description, base.check_requirement, base.check_standard),
    level: first(base.level, base.problem_level, live?.level, live?.problem_level),
    sourceType: first(base.source_type, base.standard_category, live?.source_type),
    evidence,
    liveOverlay: liveOverlay(live, overlayEvidence),
  };
}

function buildIssues(
  content: Row,
  snapshotJson: Row,
  liveIssues: Row[],
  issueEvidence: Record<string, FrozenMedia[]>,
  snapshotResolution: BuildFrozenReportViewInput['snapshotResolution'],
): FrozenIssue[] {
  const records = rows(content.records);
  const frozenIssues = rows(content.issues);
  const cells = rows(snapshotJson.cells ?? snapshotJson.matrix_cells);
  const consumed = new Set<Row>();
  const result: FrozenIssue[] = [];

  for (const live of liveIssues) {
    const record = records.find((item) => text(item.id) === text(live.record_id));
    const explicit = frozenIssues.find((item) => text(item.id) === text(live.id));
    const cell = cells.find((item) => text(item.id) === text(live.source_cell_id));
    const base = explicit ?? record ?? cell;
    if (!base && snapshotResolution !== 'legacy_latest') continue;
    const frozenBase = base ?? live;
    consumed.add(frozenBase);
    const baseMedia = cell
      ? [...rows(cell.inline_media), ...rows(cell.appendix_media), ...rows(cell.media)]
      : rows(frozenBase.materials);
    result.push(frozenIssue(
      frozenBase,
      live,
      media(baseMedia),
      issueEvidence[text(live.id)] ?? [],
    ));
  }

  const orphanFrozen = [
    ...frozenIssues,
    ...records.filter(failedRecord),
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
