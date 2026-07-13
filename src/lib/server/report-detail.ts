import { comparisonCellFields } from '@/lib/report-comparison-fields';
import { selectEffectEvaluationText } from '@/lib/report-content-rules';
import { issueMaterialRows, recipeIssueMaterialRows } from '@/lib/report-issue-media';
import { hasMeaningfulV2Projection, hasMeaningfulV3Projection } from '@/lib/matrix/meaningful-content';

type Row = Record<string, unknown>;

export type ReportViewMode = 'read' | 'data' | 'evidence' | 'review' | 'print';
export type ReportSectionStatus = 'ready' | 'empty' | 'warning' | 'blocked';
export type ReportQualitySeverity = 'info' | 'warning' | 'error';
export type ReportDetailSectionBlockType = 'summary' | 'facts' | 'list' | 'table' | 'media' | 'matrix' | 'data_matrix' | 'data_matrix_v3';
export type ReportDetailTemplateKey =
  | 'single_report_narrative'
  | 'comparison_image_matrix'
  | 'comparison_metric_table'
  | 'comparison_mixed_matrix'
  | 'model_dossier_timeline'
  | 'custom_merge_synthesis';
export type ReportActionType =
  | 'confirm_ai'
  | 'publish'
  | 'fill_missing'
  | 'retry_pdf'
  | 'share'
  | 'export_pdf'
  | 'view_source';

export type ReportDetailHeader = {
  reportId: string;
  title: string;
  reportType: string;
  layoutProfile: string;
  defaultViewMode: ReportViewMode;
  productModel: string | null;
  status: string;
  snapshotStatus: string;
  snapshotVersion: number | null;
  aiConfirmationStatus: string;
  sourceTaskIds: string[];
  sourceReportIds: string[];
  templateVersion: string;
  templateKey: ReportDetailTemplateKey;
  templateName: string;
};

export type ReportDetailTemplateSelection = {
  key: ReportDetailTemplateKey;
  name: string;
  reportType: string;
  layoutProfile: string;
  defaultViewMode: ReportViewMode;
  sectionOrder: string[];
  hideEmptyInReadMode: boolean;
};

export type ReportDetailConclusion = {
  keyConclusion: string;
  conclusionLevel: 'positive' | 'neutral' | 'risk' | 'blocked';
  keyRisks: string[];
  recommendedNextAction: ReportActionType | 'no_action';
  conclusionSource: 'manual' | 'ai_confirmed' | 'ai_generated' | 'imported' | 'derived';
};

export type ReportDetailSectionBlockItem = {
  label: string;
  value: string;
  note?: string;
  status?: 'default' | 'positive' | 'warning' | 'risk';
  media?: ReportDetailMediaItem[];
  mediaRole?: 'primary' | 'evidence' | 'appendix' | 'compact';
};

export type ReportDetailMediaItem = {
  id: string;
  name: string;
  type: string;
  url: string;
  role?: string;
  owner?: string;
};

export type ReportDetailMatrixObject = {
  id: string;
  label: string;
  subtitle?: string;
  objectType?: string;
  isCompetitor?: boolean;
};

export type ReportDetailMatrixCell = {
  id: string;
  value: string;
  processNotes?: string[];
  score?: string;
  conclusion: string;
  conclusionTag?: string;
  problems: string[];
  aiStatus?: string;
  anomaly?: string;
  media: ReportDetailMediaItem[];
};

export type ReportDetailMatrixRow = {
  id: string;
  label: string;
  group?: string;
  rowKind?: 'item' | 'summary';
  summaryText?: string;
  rowConclusion: string;
  cells: Record<string, ReportDetailMatrixCell>;
};

export type ReportDetailMatrix = {
  objects: ReportDetailMatrixObject[];
  rows: ReportDetailMatrixRow[];
  emptyMessage?: string;
};

/**
 * Frozen data-matrix projection (Task 12). This mirrors the shape produced by
 * `buildMatrixReadProjection` and is stored verbatim under
 * `content.data_matrix_projection` (generation) and
 * `snapshot_json.matrix_projection` (publish freeze, §11.3 no-drift). Kept as a
 * loose record so report-detail does not import the projection module.
 */
export type ReportDetailDataMatrixProjection = {
  matrixId: string;
  taskId?: string;
  schema: {
    key: string;
    version: number;
    name: string;
    dimensions: Array<Record<string, unknown>>;
    formulas: Array<Record<string, unknown>>;
  };
  permissions?: Record<string, unknown>;
  viewport?: { totalGroups: number; totalRows: number };
  groups: Array<{
    id: string;
    label: string;
    conditionSummary?: string;
    rows: Array<{
      id: string;
      version: number;
      subject: { key: string; label: string };
      metrics: Record<string, Record<string, unknown>>;
      slots?: {
        result?: { status?: string; summary?: string };
        process?: { note?: string };
        issues?: { count: number; severitySummary: string[] };
      };
      evidence?: { primaryCount: number; previewIds: string[]; media?: ReportDetailMediaItem[] };
    }>;
  }>;
  calculation?: { status: string; lastRunId?: string };
  version?: number;
};

/**
 * Frozen V3 excel-like matrix projection (Wave 6). Mirrors
 * ReportV3MatrixProjection without importing the adapter module.
 */
export type ReportDetailDataMatrixV3Projection = {
  projectionVersion?: 'v3';
  matrixProjectionVersion?: 'v3';
  matrixId: string;
  matrixName: string;
  frozenAt?: string;
  hierarchy?: Array<Record<string, unknown>>;
  columns: Array<{
    id: string;
    zone?: string;
    label: string;
    dataType?: string;
    unitText?: string | null;
    displayOrder?: number;
  }>;
  rows: Array<{
    id: string;
    level1Label?: string;
    level2Label?: string | null;
    level3Label?: string | null;
    visibleRowIndex?: number;
    cells: Record<string, string>;
  }>;
  cellMedia?: Record<string, Array<{
    materialId: string;
    materialType: string;
    fileName?: string | null;
    fileUrl?: string | null;
  }>>;
  narratives?: Array<{ blockType: string; content: string; showInReport?: boolean }>;
  issuePoints?: Array<{ leafRowIndex: number; issueText: string; status: string }>;
  summary?: { totalRows: number; totalColumns: number; filledCells: number };
};

type ReadableComparisonMatrix = ReportDetailMatrix & {
  summaryText?: string;
};

export type ReportDetailSectionBlock = {
  id: string;
  type: ReportDetailSectionBlockType;
  title: string;
  description?: string;
  columns?: string[];
  rows?: Array<Record<string, string>>;
  items?: ReportDetailSectionBlockItem[];
  media?: ReportDetailMediaItem[];
  mediaRole?: 'primary' | 'evidence' | 'appendix' | 'compact';
  matrix?: ReportDetailMatrix;
  dataMatrix?: ReportDetailDataMatrixProjection;
  dataMatrixV3?: ReportDetailDataMatrixV3Projection;
  defaultCollapsed?: boolean;
  collapsedLabel?: string;
  emptyMessage?: string;
};

export type ReportDetailSection = {
  key: string;
  title: string;
  status: ReportSectionStatus;
  blockKeys: string[];
  blocks: ReportDetailSectionBlock[];
  summary?: string;
  count?: number;
};

export type ReportEvidenceSlot = {
  id: string;
  ownerType: string;
  ownerId: string;
  role: string;
  materialIds: string[];
  required: boolean;
  status: 'ready' | 'missing';
};

export type ReportDetailAction = {
  type: ReportActionType;
  label: string;
  priority: 'primary' | 'secondary' | 'governance';
  enabled: boolean;
  reason?: string;
};

export type ReportQualityCheck = {
  code: string;
  severity: ReportQualitySeverity;
  message: string;
};

export type ReportPrintProfile = {
  id: string;
  paper: 'A4' | 'A3';
  orientation: 'portrait' | 'landscape';
  description: string;
};

export type ReportPrintBlock = {
  id: string;
  sectionKey: string;
  title: string;
  printBlockType: 'cover' | 'summary' | 'table' | 'matrix' | 'image_grid' | 'timeline' | 'appendix' | 'footer';
  printBehavior: 'inline' | 'summary_only' | 'appendix_only' | 'exclude';
  status: ReportSectionStatus;
  sourceBlockIds: string[];
  evidenceSlotIds: string[];
};

export type ReportPrintPreflightIssue = {
  code: string;
  severity: 'error' | 'warning';
  message: string;
  action: string;
};

export type ReportPrintDelivery = {
  profile: ReportPrintProfile;
  printBlocks: ReportPrintBlock[];
  preflight: {
    ok: boolean;
    errors: ReportPrintPreflightIssue[];
    warnings: ReportPrintPreflightIssue[];
    counts: {
      printBlocks: number;
      requiredEvidenceMissing: number;
      inlineEvidence: number;
      videoWithoutCover: number;
      matrixColumns: number;
    };
  };
  latestPdfJob?: {
    id: string;
    status: string;
    errorMessage?: string;
    createdAt?: string;
    finishedAt?: string;
  };
};

export type ReportDetailModel = {
  header: ReportDetailHeader;
  template: ReportDetailTemplateSelection;
  conclusion: ReportDetailConclusion;
  sections: ReportDetailSection[];
  evidenceSlots: ReportEvidenceSlot[];
  actions: ReportDetailAction[];
  qualityChecks: ReportQualityCheck[];
  printDelivery: ReportPrintDelivery;
};

export type BuildReportDetailModelInput = {
  report: Row;
  snapshot?: Row | null;
  issues?: Row[];
  materials?: Row[];
  pdfJobs?: Row[];
};

const DEFAULT_TEMPLATE_VERSION = 'v2.6-system';

function isRecord(value: unknown): value is Row {
  return typeof value === 'object' && value !== null;
}

function text(value: unknown, fallback = '') {
  if (value === null || value === undefined || value === '') return fallback;
  return String(value);
}

function rows(value: unknown): Row[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => text(item)).filter(Boolean);
}

function compact<T>(values: Array<T | null | undefined | false | ''>): T[] {
  return values.filter(Boolean) as T[];
}

function numberOrNull(value: unknown) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function contentOf(report: Row) {
  return isRecord(report.content) ? report.content : {};
}

function snapshotJsonOf(snapshot: Row | null | undefined) {
  return isRecord(snapshot?.snapshot_json) ? snapshot.snapshot_json : {};
}

function firstNonEmpty(...values: unknown[]) {
  for (const value of values) {
    const stringValue = text(value);
    if (stringValue) return stringValue;
  }
  return '';
}

function reportTypeOf(report: Row) {
  return text(report.report_type, 'single_report');
}

function layoutProfileOf(report: Row, snapshotJson: Row) {
  const explicit = firstNonEmpty(report.layout_profile, snapshotJson.layout_profile);
  if (explicit) return explicit;
  const reportType = reportTypeOf(report);
  if (reportType === 'comparison_report') return 'comparison_image_matrix_a3_landscape';
  if (reportType === 'model_merged_report') return 'model_merged_a4_portrait';
  if (reportType === 'custom_merged_report') return 'custom_merged_a4_portrait';
  return 'single_a4_portrait';
}

function defaultViewMode(layoutProfile: string): ReportViewMode {
  return layoutProfile.includes('metric') ? 'data' : 'read';
}

function templateSelectionFor(reportType: string, layoutProfile: string, sectionOrder: string[] = []): ReportDetailTemplateSelection {
  const defaultMode = defaultViewMode(layoutProfile);
  if (reportType === 'comparison_report') {
    if (layoutProfile.includes('metric')) {
      return {
        key: 'comparison_metric_table',
        name: '指标表对比模板',
        reportType,
        layoutProfile,
        defaultViewMode: defaultMode,
        sectionOrder,
        hideEmptyInReadMode: true,
      };
    }
    if (layoutProfile.includes('mixed')) {
      return {
        key: 'comparison_mixed_matrix',
        name: '图文混合对比模板',
        reportType,
        layoutProfile,
        defaultViewMode: defaultMode,
        sectionOrder,
        hideEmptyInReadMode: true,
      };
    }
    return {
      key: 'comparison_image_matrix',
      name: '图片矩阵对比模板',
      reportType,
      layoutProfile,
      defaultViewMode: defaultMode,
      sectionOrder,
      hideEmptyInReadMode: true,
    };
  }
  if (reportType === 'model_merged_report') {
    return {
      key: 'model_dossier_timeline',
      name: '型号阶段档案模板',
      reportType,
      layoutProfile,
      defaultViewMode: defaultMode,
      sectionOrder,
      hideEmptyInReadMode: true,
    };
  }
  if (reportType === 'custom_merged_report') {
    return {
      key: 'custom_merge_synthesis',
      name: '自定义合并专题模板',
      reportType,
      layoutProfile,
      defaultViewMode: defaultMode,
      sectionOrder,
      hideEmptyInReadMode: true,
    };
  }
  return {
    key: 'single_report_narrative',
    name: '普通报告叙事模板',
    reportType,
    layoutProfile,
    defaultViewMode: defaultMode,
    sectionOrder,
    hideEmptyInReadMode: true,
  };
}

function aiSummaryOf(content: Row) {
  const generated = isRecord(content.ai_summary) ? content.ai_summary : {};
  const overrides = isRecord(content.review_overrides) && isRecord(content.review_overrides.ai_summary)
    ? content.review_overrides.ai_summary
    : {};
  return { ...generated, ...overrides };
}

function reviewNoteOf(content: Row) {
  return isRecord(content.review_overrides) ? text(content.review_overrides.review_note) : '';
}

function isFailResult(value: unknown) {
  const result = text(value).toLowerCase();
  return result.includes('fail')
    || result.includes('unqualified')
    || result.includes('not_pass')
    || result.includes('\u4e0d\u5408');
}

function isClosedStatus(status: string) {
  const value = status.toLowerCase();
  return ['closed', 'verified', 'published', 'no_action', 'accepted'].includes(value)
    || status.includes('\u5df2\u9a8c\u8bc1')
    || status.includes('\u4e0d\u6574\u6539')
    || status.includes('\u5df2\u5173\u95ed');
}

function isHighRiskLevel(level: string) {
  const value = level.toLowerCase();
  return ['a', 'b', 'high', 'critical'].includes(value)
    || level.includes('\u4e00\u7c7b')
    || level.includes('\u4e8c\u7c7b');
}

function sourceIds(report: Row, snapshotJson: Row) {
  const sourceTaskIds = stringArray(report.source_task_ids);
  const snapshotTaskIds = stringArray(snapshotJson.source_task_ids);
  const sourceReportIds = stringArray(report.source_report_ids);
  const snapshotReportIds = stringArray(snapshotJson.source_report_ids);
  const taskId = text(report.task_id);
  return {
    sourceTaskIds: Array.from(new Set([...sourceTaskIds, ...snapshotTaskIds, taskId].filter(Boolean))),
    sourceReportIds: Array.from(new Set([...sourceReportIds, ...snapshotReportIds].filter(Boolean))),
  };
}

function conclusionLevelFrom(report: Row, issueRows: Row[]): ReportDetailConclusion['conclusionLevel'] {
  const openHighRisk = issueRows.some((issue) => isHighRiskLevel(text(issue.level)) && !isClosedStatus(text(issue.status)));
  if (openHighRisk) return 'risk';
  return 'neutral';
}

function conclusionFrom(report: Row, issues: Row[]): ReportDetailConclusion {
  const content = contentOf(report);
  const aiSummary = aiSummaryOf(content);
  const aiStatus = text(report.ai_confirmation_status, 'pending');
  const conclusionLevel = conclusionLevelFrom(report, issues);

  return {
    keyConclusion: firstNonEmpty(aiSummary.summary, content.summary, report.title, '暂无报告结论。'),
    conclusionLevel,
    keyRisks: stringArray(aiSummary.risks),
    recommendedNextAction: conclusionLevel === 'blocked'
        ? 'fill_missing'
        : text(report.status).toLowerCase() === 'published' || text(report.status).includes('\u5df2\u53d1\u5e03')
          ? 'share'
          : 'publish',
    conclusionSource: aiStatus === 'confirmed'
      ? 'ai_confirmed'
      : aiStatus === 'generated' || aiStatus === 'pending'
        ? 'ai_generated'
        : 'derived',
  };
}

function buildHeader(report: Row, snapshot: Row | null | undefined): ReportDetailHeader {
  const snapshotJson = snapshotJsonOf(snapshot);
  const layoutProfile = layoutProfileOf(report, snapshotJson);
  const reportType = reportTypeOf(report);
  const template = templateSelectionFor(reportType, layoutProfile);
  const sources = sourceIds(report, snapshotJson);
  return {
    reportId: text(report.id),
    title: text(report.title, '未命名报告'),
    reportType,
    layoutProfile,
    defaultViewMode: template.defaultViewMode,
    productModel: text(report.product_model) || null,
    status: text(report.status, 'draft'),
    snapshotStatus: text(snapshotJson.snapshot_status, text(report.status, 'draft')),
    snapshotVersion: numberOrNull(snapshot?.version),
    aiConfirmationStatus: text(report.ai_confirmation_status, 'pending'),
    sourceTaskIds: sources.sourceTaskIds,
    sourceReportIds: sources.sourceReportIds,
    templateVersion: DEFAULT_TEMPLATE_VERSION,
    templateKey: template.key,
    templateName: template.name,
  };
}

function block(id: string, type: ReportDetailSectionBlockType, title: string, extras: Omit<ReportDetailSectionBlock, 'id' | 'type' | 'title'> = {}): ReportDetailSectionBlock {
  return { id, type, title, ...extras };
}

function fact(label: string, value: unknown, note?: string): ReportDetailSectionBlockItem | null {
  const displayValue = text(value);
  if (!displayValue) return null;
  return { label, value: displayValue, note };
}

function section(key: string, title: string, status: ReportSectionStatus, blockKeys: string[], extras: Partial<ReportDetailSection> = {}): ReportDetailSection {
  return { key, title, status, blockKeys, blocks: [], ...extras };
}

function hasAny(...values: unknown[]) {
  return values.some((value) => {
    if (Array.isArray(value)) return value.length > 0;
    if (isRecord(value)) return Object.keys(value).length > 0;
    return Boolean(value);
  });
}

function sourceTraceBlocks(report: Row, snapshotJson: Row): ReportDetailSectionBlock[] {
  const sources = sourceIds(report, snapshotJson);
  return [
    block('source_trace:facts', 'facts', '来源与版本', {
      items: compact([
        fact('当前报告', firstNonEmpty(report.title, report.id)),
        fact('来源任务数', sources.sourceTaskIds.length),
        fact('来源报告数', sources.sourceReportIds.length),
        fact('快照版本', snapshotJson.version),
        fact('模板版本', DEFAULT_TEMPLATE_VERSION),
      ]),
    }),
  ];
}

function materialId(material: Row) {
  return text(material.id) || text(material.file_path) || text(material.file_url);
}

function materialUrl(material: Row) {
  return firstNonEmpty(material.file_url, material.file_path, material.url, material.src);
}

function mediaItem(material: Row, owner?: string): ReportDetailMediaItem | null {
  const url = materialUrl(material);
  if (!url) return null;
  return {
    id: materialId(material),
    name: firstNonEmpty(material.file_name, material.name, material.id, material.file_path, 'material'),
    type: firstNonEmpty(material.material_type, material.media_type, 'material'),
    url,
    role: firstNonEmpty(material.media_role, material.role),
    owner,
  };
}

function mediaItems(materials: Row[], owner?: string) {
  return materials.map((material) => mediaItem(material, owner)).filter((item): item is ReportDetailMediaItem => Boolean(item));
}

function mediaItemDedupKey(item: ReportDetailMediaItem) {
  return firstNonEmpty(item.id, item.url, item.name);
}

function uniqueMediaItems(items: ReportDetailMediaItem[]) {
  const seen = new Set<string>();
  const result: ReportDetailMediaItem[] = [];
  for (const item of items) {
    const key = mediaItemDedupKey(item);
    if (key && seen.has(key)) continue;
    if (key) seen.add(key);
    result.push(item);
  }
  return result;
}

function materialDedupKey(material: Row) {
  return firstNonEmpty(material.id, material.file_path, material.file_url, material.url, material.src);
}

function uniqueMaterials(materials: Row[]) {
  const seen = new Set<string>();
  const result: Row[] = [];
  for (const material of materials) {
    const key = materialDedupKey(material);
    if (key && seen.has(key)) continue;
    if (key) seen.add(key);
    result.push(material);
  }
  return result;
}

function mediaByIds(materials: Row[], ids: string[], owner?: string) {
  if (ids.length === 0) return [];
  const wanted = new Set(ids.filter(Boolean));
  return mediaItems(materials.filter((material) => wanted.has(materialId(material))), owner);
}

function parseProblemPoints(value: unknown): Array<{ text: string; materialIds: string[] }> {
  const raw = text(value);
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.map((item) => {
        if (typeof item === 'string') return { text: item, materialIds: [] };
        if (!isRecord(item)) return null;
        const pointText = text(item.text).trim();
        if (!pointText) return null;
        return { text: pointText, materialIds: stringArray(item.material_ids) };
      }).filter((item): item is { text: string; materialIds: string[] } => Boolean(item));
    }
    if (typeof parsed === 'string' && parsed.trim()) return [{ text: parsed.trim(), materialIds: [] }];
  } catch {
    // Legacy reports stored a plain text problem point.
  }
  return raw.trim() ? [{ text: raw.trim(), materialIds: [] }] : [];
}

function issueEvidenceMedia(issue: Row, recordById: Map<string, Row>, allMaterials: Row[], recipes: Row[]) {
  const direct = issueMaterialRows(issue, allMaterials);
  const recipeMaterials = recipeIssueMaterialRows(issue, recipes, allMaterials);
  const record = recordById.get(text(issue.record_id)) || recordById.get(text(issue.id));
  return uniqueMediaItems([
    ...mediaItems(rows(issue.materials), firstNonEmpty(issue.title, issue.check_item, issue.id)),
    ...mediaItems(rows(record?.materials), firstNonEmpty(issue.title, issue.check_item, record?.check_item, issue.id)),
    ...mediaItems(direct, firstNonEmpty(issue.title, issue.check_item, issue.id)),
    ...mediaItems(recipeMaterials, firstNonEmpty(issue.title, issue.id)),
  ]);
}

function reEvaluationRows(issue: Row) {
  return rows(issue._reEvaluations);
}

function stepProblemText(step: Row) {
  const points = rows(step.problem_points)
    .map((point) => isRecord(point) ? text(point.text) : text(point))
    .filter(Boolean);
  return firstNonEmpty(points.join('; '), step.problem_point, '-');
}

function stepProblemMedia(step: Row, owner: string) {
  const materials = rows(step.materials);
  const pointIds = rows(step.problem_points).flatMap((point) => (
    isRecord(point) && Array.isArray(point.material_ids)
      ? point.material_ids.map((id) => text(id)).filter(Boolean)
      : []
  ));
  return pointIds.length > 0 ? mediaByIds(materials, pointIds, owner) : mediaItems(materials, owner);
}

function taskDetailRows(task: Row) {
  const fieldLabels: Record<string, string> = {
    title: '任务名称',
    product: '产品名称',
    product_model: '产品型号',
    project_type: '项目类型',
    project_phase: '项目阶段',
    product_category: '产品品类',
    organizer: '任务负责人',
    test_date: '测试日期',
    status: '任务状态',
    description: '任务说明',
    created_at: '创建时间',
    updated_at: '更新时间',
  };
  return Object.entries(task)
    .filter(([key, value]) => !['id', 'selected_standards', 'created_by'].includes(key) && value !== null && value !== undefined && value !== '')
    .slice(0, 24)
    .map(([key, value]) => ({ '字段': fieldLabels[key] || key, '内容': text(value) }));
}

// ── 数据矩阵投影渲染（Task 12, Sub-task B）─────────────────────────────────
// 当 content.data_matrix_projection 或 snapshot_json.matrix_projection 存在时，
// 渲染一个只读的数据矩阵区块。读取顺序：snapshot 冻结值优先（历史不漂移），
// 回退到 content 中的投影。所有矩阵新增都受「投影存在」守卫，不影响既有报告类型。

function pickMatrixProjectionSource(content: Row, snapshotJson: Row): Row | null {
  const snapshotProjection = isRecord(snapshotJson.matrix_projection) ? snapshotJson.matrix_projection : null;
  const contentProjection = isRecord(content.data_matrix_projection) ? content.data_matrix_projection : null;
  return snapshotProjection || contentProjection;
}

function dataMatrixProjectionOf(content: Row, snapshotJson: Row): ReportDetailDataMatrixProjection | null {
  const source = pickMatrixProjectionSource(content, snapshotJson);
  if (!source || !Array.isArray(source.groups) || !hasMeaningfulV2Projection(source)) return null;
  // Defensive: ensure schema block exists so the section is renderable.
  if (!isRecord(source.schema)) return null;
  return source as ReportDetailDataMatrixProjection;
}

function dataMatrixV3ProjectionOf(content: Row, snapshotJson: Row): ReportDetailDataMatrixV3Projection | null {
  const source = pickMatrixProjectionSource(content, snapshotJson);
  if (!source) return null;
  if (source.projectionVersion === 'v3' || source.matrixProjectionVersion === 'v3') {
    return hasMeaningfulV3Projection(source) ? source as ReportDetailDataMatrixV3Projection : null;
  }
  // Shape heuristic: excel-like columns+rows without V2 groups.
  if (
    typeof source.matrixId === 'string' &&
    Array.isArray(source.columns) &&
    Array.isArray(source.rows) &&
    !Array.isArray(source.groups)
  ) {
    return hasMeaningfulV3Projection(source) ? source as ReportDetailDataMatrixV3Projection : null;
  }
  return null;
}

function dataMatrixDimensionColumns(projection: ReportDetailDataMatrixProjection): Array<{ key: string; label: string }> {
  const dimensions = Array.isArray(projection.schema.dimensions) ? projection.schema.dimensions : [];
  return dimensions.map((dim) => ({
    key: firstNonEmpty(dim.dimensionKey, dim.key),
    label: firstNonEmpty(dim.displayName, dim.dimensionKey, dim.key),
  })).filter((col) => Boolean(col.key));
}

function dataMatrixMetricDisplay(metric: Record<string, unknown>): string {
  if (metric.display) return text(metric.display);
  if (metric.value !== undefined && metric.value !== null && metric.value !== '') return text(metric.value);
  if (metric.text) return text(metric.text);
  const state = text(metric.state);
  if (state === 'missing') return '（缺失）';
  if (state === 'not_applicable') return '（不适用）';
  if (state === 'calculation_failed') return '（计算失败）';
  if (state === 'pending') return '（待计算）';
  return '-';
}

function dataMatrixRowTableRows(projection: ReportDetailDataMatrixProjection): Array<Record<string, string>> {
  const columns = dataMatrixDimensionColumns(projection);
  const tableRows: Array<Record<string, string>> = [];
  for (const group of projection.groups) {
    for (const row of group.rows) {
      const base: Record<string, string> = {
        '分组': group.label,
        '行项目': firstNonEmpty(row.subject?.label, row.id),
        '结果': firstNonEmpty(row.slots?.result?.status, row.slots?.result?.summary, '-'),
        '问题数': String(row.slots?.issues?.count ?? 0),
        '证据': `${row.evidence?.primaryCount ?? 0} 条`,
      };
      for (const col of columns) {
        const metric = row.metrics?.[col.key] || {};
        base[col.label] = dataMatrixMetricDisplay(metric);
      }
      tableRows.push(base);
    }
  }
  return tableRows;
}

function dataMatrixSchemaFacts(projection: ReportDetailDataMatrixProjection): ReportDetailSectionBlockItem[] {
  return compact([
    fact('矩阵模式 Key', projection.schema.key),
    fact('模式版本', projection.schema.version),
    fact('模式名称', projection.schema.name),
    fact('维度数', Array.isArray(projection.schema.dimensions) ? projection.schema.dimensions.length : 0),
    fact('公式数', Array.isArray(projection.schema.formulas) ? projection.schema.formulas.length : 0),
    fact('分组数', projection.viewport?.totalGroups ?? projection.groups.length),
    fact('数据行数', projection.viewport?.totalRows ?? projection.groups.reduce((sum, g) => sum + (g.rows?.length ?? 0), 0)),
    fact('计算状态', projection.calculation?.status),
    fact('可比性', (projection as Row).comparabilityStatus),
  ]);
}

function dataMatrixSection(projection: ReportDetailDataMatrixProjection): ReportDetailSection {
  const tableRows = dataMatrixRowTableRows(projection);
  const columns = ['分组', '行项目', ...dataMatrixDimensionColumns(projection).map((col) => col.label), '结果', '问题数', '证据'];
  const totalRows = projection.viewport?.totalRows ?? projection.groups.reduce((sum, g) => sum + (g.rows?.length ?? 0), 0);
  return section('data_matrix', '数据矩阵', totalRows > 0 ? 'ready' : 'empty', ['矩阵概览', '矩阵明细'], {
    count: totalRows,
    blocks: compact([
      block('data_matrix:facts', 'facts', '矩阵概览', {
        items: dataMatrixSchemaFacts(projection),
      }),
      block('data_matrix:matrix', 'data_matrix', '矩阵投影', {
        description: '只读数据矩阵投影：分组 → 行 → 指标值（含结果、问题数与证据引用）。历史报告读取冻结快照，不会随源数据漂移。',
        dataMatrix: projection,
        emptyMessage: '暂无数据矩阵行。',
      }),
      tableRows.length > 0 && block('data_matrix:table', 'table', '矩阵明细', {
        columns,
        rows: tableRows,
        emptyMessage: '暂无数据矩阵明细。',
      }),
    ]),
  });
}

function dataMatrixV3Section(projection: ReportDetailDataMatrixV3Projection): ReportDetailSection {
  const totalRows = projection.summary?.totalRows ?? projection.rows?.length ?? 0;
  const totalColumns = projection.summary?.totalColumns ?? projection.columns?.length ?? 0;
  const filledCells = projection.summary?.filledCells ?? 0;
  return section('data_matrix', '数据矩阵', totalRows > 0 ? 'ready' : 'empty', ['矩阵概览', '矩阵投影'], {
    count: totalRows,
    blocks: compact([
      block('data_matrix_v3:facts', 'facts', '矩阵概览', {
        items: compact([
          fact('矩阵名称', projection.matrixName),
          fact('矩阵 ID', projection.matrixId),
          fact('行数', totalRows),
          fact('列数', totalColumns),
          fact('已填单元格', filledCells),
          fact('冻结时间', projection.frozenAt),
        ]),
      }),
      block('data_matrix_v3:matrix', 'data_matrix_v3', '矩阵投影', {
        description: '只读 V3 数据矩阵投影（Excel 风格行列）。历史报告读取冻结快照，不会随源数据漂移。',
        dataMatrixV3: projection,
        emptyMessage: '暂无数据矩阵行。',
      }),
    ]),
  });
}

function contentSections(report: Row, content: Row, issues: Row[], materials: Row[]): ReportDetailSection[] {
  const records = rows(content.records);
  const recipes = rows(content.recipes);
  const contentMaterials = rows(content.materials);
  const task = isRecord(content.task) ? content.task : {};
  const aiSummary = aiSummaryOf(content);
  const reviewNote = reviewNoteOf(content);
  const failRecords = records.filter((record) => isFailResult(record.evaluation_result));
  const recipeProblems = recipes.filter((recipe) => text(recipe.effect_problem_point) || Number(recipe.problem_count || 0) > 0);
  const issueSource = issues.length ? issues : failRecords;
  const allMaterials = [...contentMaterials, ...materials];
  const recordById = new Map(records.map((record) => [text(record.id), record]));
  const issueMedia = (issue: Row) => issueEvidenceMedia(issue, recordById, allMaterials, recipes);
  const recipeStepRows = recipes.flatMap((recipe) => rows(recipe.recipe_steps).map((step) => ({
    '功能/食谱': firstNonEmpty(recipe.name, recipe.id),
    '步骤': firstNonEmpty(step.step_number, '-'),
    '具体操作': firstNonEmpty(step.operation, '-'),
    '问题点': stepProblemText(step),
    '素材数': String(stepProblemMedia(step, `${firstNonEmpty(recipe.name, recipe.id)} / 步骤 ${firstNonEmpty(step.step_number, '')}`).length),
  })));
  const recipeEffectRows = recipes.map((recipe) => {
    const effectMedia = mediaItems(rows(recipe.effect_materials), firstNonEmpty(recipe.name, recipe.id));
    const stepMediaCount = rows(recipe.recipe_steps).reduce((sum, step) => sum + rows(step.materials).length, 0);
    const effectProblemText = parseProblemPoints(recipe.effect_problem_point).map((point) => point.text).join('; ');
    return {
      '功能/食谱': firstNonEmpty(recipe.name, recipe.id),
      '效果评价': firstNonEmpty(selectEffectEvaluationText(recipe), '-'),
      '评分': firstNonEmpty(recipe.effect_score, '-'),
      '问题点': firstNonEmpty(effectProblemText, Number(recipe.problem_count || 0) > 0 ? `${recipe.problem_count} 个问题` : '', '-'),
      '素材数': String(effectMedia.length + stepMediaCount),
    };
  });
  const effectProblemItems = recipes.flatMap((recipe) => parseProblemPoints(recipe.effect_problem_point).map((point, index) => ({
    label: `${firstNonEmpty(recipe.name, recipe.id)} 效果问题 ${index + 1}`,
    value: point.text,
    note: point.materialIds.length ? `素材：${point.materialIds.join('，')}` : undefined,
    status: 'warning' as const,
    media: mediaByIds(rows(recipe.effect_materials), point.materialIds, firstNonEmpty(recipe.name, recipe.id)),
    mediaRole: 'primary' as const,
  })));
  const reEvaluationItems = issueSource.flatMap((issue) => reEvaluationRows(issue).map((item, index) => ({
    label: `${firstNonEmpty(issue.title, issue.check_item, issue.id)} 复评估 ${index + 1}`,
    value: firstNonEmpty(item.description, isRecord(item.ai_result) ? item.ai_result.summary : '', '暂无复评估详情'),
    note: firstNonEmpty(isRecord(item.ai_result) ? item.ai_result.score : '', item.created_at),
    status: 'positive' as const,
    media: mediaItems(rows(item.materials), `${firstNonEmpty(issue.title, issue.id)} / 复评估 ${index + 1}`),
    mediaRole: 'appendix' as const,
  })));

  return [
    section('overview', '报告概览', 'ready', ['任务摘要', '结论'], {
      blocks: [
        block('overview:summary', 'summary', '报告摘要', {
          description: firstNonEmpty(aiSummary.summary, content.summary, report.title),
        }),
        block('overview:facts', 'facts', '任务信息', {
          items: compact([
            fact('产品名称', firstNonEmpty(task.product, report.product_model)),
            fact('产品型号', firstNonEmpty(task.product_model, report.product_model)),
            fact('项目类型', firstNonEmpty(task.project_type, report.project_type)),
            fact('项目阶段', firstNonEmpty(task.project_phase, report.project_phase)),
            fact('任务负责人', firstNonEmpty(task.organizer, report.organizer)),
            fact('测试日期', task.test_date),
          ]),
        }),
        block('overview:task-details', 'table', '任务字段明细', {
          columns: ['字段', '内容'],
          rows: taskDetailRows(task),
          emptyMessage: '暂无任务字段明细。',
        }),
      ],
    }),
    section('issue_closure', '问题闭环', hasAny(issues, content.issues, records) ? 'ready' : 'empty', ['问题表', '问题素材'], {
      count: issues.length || rows(content.issues).length,
      blocks: [
        block('issue_closure:table', 'table', '问题闭环表', {
          columns: ['问题标题', '等级', '状态', '来源', '责任人', '整改方案', '验证情况', '素材数'],
          rows: issueSource.slice(0, 8).map((issue) => ({
            '问题标题': firstNonEmpty(issue.title, issue.check_item, issue.problem_description, issue.id),
            '等级': firstNonEmpty(issue.level, issue.problem_level, '-'),
            '状态': firstNonEmpty(issue.status, issue.evaluation_result, '-'),
            '来源': firstNonEmpty(issue.source_type, issue.standard_category, '检查记录'),
            '责任人': firstNonEmpty(issue.responsible_person, issue.responsible_dept, '-'),
            '整改方案': firstNonEmpty(issue.improve_plan, issue.no_improve_reason, '-'),
            '验证情况': firstNonEmpty(issue.verification_note, reEvaluationRows(issue).length ? `${reEvaluationRows(issue).length} 次复评估` : '', '-'),
            '素材数': String(issueMedia(issue).length),
          })),
          emptyMessage: '暂无问题或不合格记录。',
        }),
        block('issue_closure:details', 'list', '问题详情', {
          items: issueSource.slice(0, 12).map((issue) => ({
            label: firstNonEmpty(issue.title, issue.check_item, issue.id),
            value: firstNonEmpty(issue.description, issue.problem_description, issue.improve_plan, '暂无详情说明'),
            note: firstNonEmpty(issue.responsible_person, issue.category, issue.source_type),
            status: isHighRiskLevel(firstNonEmpty(issue.level, issue.problem_level)) ? 'risk' : 'default',
            media: issueMedia(issue),
            mediaRole: 'appendix' as const,
          })),
          emptyMessage: '暂无问题详情。',
        }),
        block('issue_closure:re-evaluations', 'list', '复评估证据', {
          items: reEvaluationItems,
          emptyMessage: '暂无复评估证据。',
        }),
      ],
    }),
    section('function_effect', '功能效果', recipes.length > 0 ? 'ready' : 'empty', ['功能效果', '效果素材'], {
      count: recipes.length,
      blocks: [
        block('function_effect:aggregation', 'table', '功能效果汇总', {
          columns: ['功能/食谱', '效果评价', '评分', '问题点', '素材数'],
          rows: recipeEffectRows,
          emptyMessage: '暂无功能或食谱效果数据。',
        }),
        block('function_effect:list', 'list', '功能效果', {
          items: recipes.slice(0, 8).map((recipe) => ({
            label: firstNonEmpty(recipe.name, recipe.id),
            value: firstNonEmpty(selectEffectEvaluationText(recipe), '暂无效果描述'),
            note: firstNonEmpty(recipe.effect_score, recipe.problem_count ? `${recipe.problem_count} 个问题` : ''),
            status: recipeProblems.some((item) => text(item.id) === text(recipe.id)) ? 'warning' : 'default',
          })),
          emptyMessage: '暂无功能或食谱效果数据。',
        }),
        block('function_effect:steps', 'table', '食谱步骤与问题点', {
          columns: ['功能/食谱', '步骤', '具体操作', '问题点', '素材数'],
          rows: recipeStepRows.slice(0, 20),
          defaultCollapsed: true,
          collapsedLabel: '展开功能效果评估模板',
          emptyMessage: '暂无食谱步骤详情。',
        }),
        block('function_effect:step-evidence', 'list', '步骤问题证据', {
          items: recipes.flatMap((recipe) => rows(recipe.recipe_steps).map((step) => ({
            label: `${firstNonEmpty(recipe.name, recipe.id)} / 步骤 ${firstNonEmpty(step.step_number, '')}`,
            value: stepProblemText(step),
            note: firstNonEmpty(step.operation, recipe.recipe_type),
            status: stepProblemText(step) !== '-' ? 'warning' as const : 'default' as const,
            media: stepProblemMedia(step, `${firstNonEmpty(recipe.name, recipe.id)} / 步骤 ${firstNonEmpty(step.step_number, '')}`),
            mediaRole: 'evidence' as const,
          }))),
          emptyMessage: '暂无步骤问题证据。',
        }),
        block('function_effect:effect-problems', 'list', '效果问题点', {
          items: effectProblemItems,
          emptyMessage: '暂无效果问题点。',
        }),
        block('function_effect:media', 'media', '功能效果素材', {
          media: recipes.flatMap((recipe) => mediaItems(rows(recipe.effect_materials), firstNonEmpty(recipe.name, recipe.id))),
          mediaRole: 'primary',
          emptyMessage: '暂无功能效果素材。',
        }),
      ],
    }),
    section('ai_conclusion', '结论', isRecord(content.ai_summary) || isRecord(content.review_overrides) ? 'ready' : 'warning', ['摘要'], {
      blocks: [
        block('ai_conclusion:summary', 'summary', '摘要', {
          description: firstNonEmpty(aiSummary.summary, '暂无摘要。'),
        }),
        block('ai_conclusion:list', 'list', '亮点、风险与建议', {
          items: [
            ...stringArray(aiSummary.strengths).map((strength) => ({ label: '亮点', value: strength, status: 'positive' as const })),
            ...stringArray(aiSummary.risks).map((risk) => ({ label: '风险', value: risk, status: 'risk' as const })),
            ...stringArray(aiSummary.suggestions).map((suggestion) => ({ label: '建议', value: suggestion })),
            ...(text(aiSummary.historical_position) ? [{ label: '历史定位', value: text(aiSummary.historical_position) }] : []),
            ...(reviewNote ? [{ label: '审核备注', value: reviewNote, status: 'warning' as const }] : []),
          ],
          emptyMessage: '暂无关键发现。',
        }),
      ],
    }),
    section('source_trace', '来源追溯', 'ready', ['来源任务', '来源报告'], {
      blocks: sourceTraceBlocks(report, {}),
    }),
    section('evidence_archive', '素材归档', uniqueMaterials([...materials, ...contentMaterials]).length > 0 ? 'ready' : 'empty', ['素材归档'], {
      count: uniqueMaterials([...materials, ...contentMaterials]).length,
      blocks: [
        block('evidence_archive:list', 'list', '素材归档', {
          items: uniqueMaterials([...materials, ...contentMaterials]).slice(0, 12).map((material) => ({
            label: firstNonEmpty(material.file_name, material.id, material.file_path),
            value: firstNonEmpty(material.media_role, material.material_type, '素材'),
            note: firstNonEmpty(material.record_id, material.recipe_step_id, material.recipe_id, material.task_id),
          })),
          emptyMessage: '暂无报告素材。',
        }),
        block('evidence_archive:media', 'media', '证据素材', {
          media: mediaItems(uniqueMaterials([...materials, ...contentMaterials])).slice(0, 30),
          emptyMessage: '暂无可展示素材。',
        }),
      ],
    }),
  ];
}

function comparisonCellMedia(cell: Row, owner?: string) {
  return mediaItems([...rows(cell.inline_media), ...rows(cell.appendix_media)], owner);
}

function sortedByOrder(items: Row[]) {
  return [...items].sort((a, b) => {
    const left = Number(a.sort_order ?? a.display_order ?? 0);
    const right = Number(b.sort_order ?? b.display_order ?? 0);
    if (left !== right) return left - right;
    return text(a.id).localeCompare(text(b.id));
  });
}

function comparisonMatrixRowConclusion(rowCells: ReportDetailMatrixCell[], objectsById: Map<string, ReportDetailMatrixObject>) {
  const riskCells = rowCells.filter((cell) => cell.conclusionTag === 'risk' || cell.problems.length > 0 || Boolean(cell.anomaly));
  if (riskCells.length > 0) {
    return `风险项：${riskCells.map((cell) => firstNonEmpty(objectsById.get(text(cell.id.split(':')[1]))?.label, cell.conclusion, cell.value)).join('；')}`;
  }
  const bestCell = rowCells.find((cell) => cell.conclusionTag === 'best');
  if (bestCell) {
    return `优势项：${firstNonEmpty(objectsById.get(text(bestCell.id.split(':')[1]))?.label, bestCell.conclusion, bestCell.value)}`;
  }
  const filled = rowCells.filter((cell) => cell.value || cell.conclusion || cell.score);
  return filled.length > 0 ? '本项已完成横向对比，未标记突出风险。' : '本项暂无有效对比数据。';
}

function isMetaComparisonObject(object: ReportDetailMatrixObject) {
  const label = object.label.trim();
  return ['整体小结', '报告信息', '报告小结', '体验总结', '总结', '小结'].some((keyword) => label.includes(keyword));
}

function isServerMatrixCellEmpty(cell: ReportDetailMatrixCell | undefined) {
  if (!cell) return true;
  const blank = (value: string | undefined) => {
    const normalized = (value || '').trim();
    return normalized === '' || normalized === '-' || normalized === '—' || normalized === '暂无' || normalized === '无';
  };
  return blank(cell.value)
    && blank(cell.conclusion)
    && blank(cell.score)
    && blank(cell.anomaly)
    && blank(cell.conclusionTag)
    && cell.problems.length === 0
    && cell.media.length === 0;
}

function isReportInfoMatrixRow(row: ReportDetailMatrixRow) {
  return row.label.startsWith('报告信息');
}

function isSummaryMatrixRow(row: ReportDetailMatrixRow) {
  const group = row.group || '';
  return row.label.includes('总结') || row.label.includes('小结') || group.includes('总结') || group.includes('小结');
}

const MATRIX_CELL_NODE_TYPES = new Set(['item', 'condition', 'process_node', 'metric', 'issue_group']);

function isMatrixItemNode(item: Row) {
  return MATRIX_CELL_NODE_TYPES.has(text(item.node_type, 'item'));
}

function nodeConfig(item: Row) {
  return isRecord(item.config) ? item.config : {};
}

function comparisonParentLabel(item: Row, itemsById: Map<string, Row>) {
  const parentId = text(item.parent_id);
  if (!parentId) return '';
  const parent = itemsById.get(parentId);
  return parent ? firstNonEmpty(parent.node_label, parent.metric_name, parent.id) : '';
}

function comparisonRowGroup(item: Row) {
  const explicit = firstNonEmpty(item.parent_label, item.group_label, item.section_label, item.source_sheet_name);
  if (explicit) return explicit;
  const labelParts = text(item.node_label).split('/').map((part) => part.trim()).filter(Boolean);
  if (labelParts.length >= 2) return labelParts[0];
  if (item.depth !== undefined && Number(item.depth) > 0) return `层级 ${text(item.depth)}`;
  return '';
}

function comparisonRowLabel(item: Row) {
  const label = firstNonEmpty(item.node_label, item.metric_name, item.id);
  if (firstNonEmpty(item.parent_label, item.group_label, item.section_label, item.source_sheet_name)) return label;
  const labelParts = text(item.node_label).split('/').map((part) => part.trim()).filter(Boolean);
  if (labelParts.length >= 2) return labelParts.slice(1).join(' / ');
  return label;
}

function comparisonCellOwnerLabel(item: Row) {
  const labelParts = text(item.node_label).split('/').map((part) => part.trim()).filter(Boolean);
  if (labelParts.length >= 2) return labelParts.slice(1).join(' / ');
  return firstNonEmpty(item.node_label, item.metric_name, item.id);
}

function filledMatrixCells(row: ReportDetailMatrixRow, objects: ReportDetailMatrixObject[]) {
  return objects
    .map((object) => row.cells[object.id])
    .filter((cell): cell is ReportDetailMatrixCell => !isServerMatrixCellEmpty(cell));
}

function firstCellText(cell: ReportDetailMatrixCell) {
  return firstNonEmpty(cell.conclusion, cell.value);
}

function normalizeReadableComparisonMatrix(matrix: ReportDetailMatrix): ReadableComparisonMatrix {
  const realObjects = matrix.objects.filter((object) => !isMetaComparisonObject(object));
  if (realObjects.length === matrix.objects.length) {
    const summaryText = matrix.rows
      .filter((row) => row.rowKind === 'summary')
      .map((row) => row.summaryText || row.rowConclusion)
      .filter(Boolean)
      .join('\n\n');
    return { ...matrix, summaryText };
  }

  const summaryParts: string[] = [];
  const rowsForMatrix: ReportDetailMatrixRow[] = [];
  const pivotRows = new Map<string, ReportDetailMatrixRow>();

  for (const row of matrix.rows) {
    if (row.rowKind === 'summary') {
      rowsForMatrix.push({
        ...row,
        cells: {},
      });
      if (row.summaryText) summaryParts.push(row.summaryText);
      continue;
    }
    const realFilled = filledMatrixCells(row, realObjects);
    const allFilled = Object.values(row.cells).filter((cell) => !isServerMatrixCellEmpty(cell));
    if (isSummaryMatrixRow(row) && allFilled.length > 0 && realFilled.length < 2) {
      const summary = allFilled.map(firstCellText).filter(Boolean).join('\n');
      if (summary) summaryParts.push(summary);
      continue;
    }
    if (isReportInfoMatrixRow(row)) continue;
    if (realFilled.length >= 2) {
      rowsForMatrix.push({
        ...row,
        group: (row.group || '').includes('对比') ? '' : row.group,
        cells: Object.fromEntries(realObjects.map((object) => [object.id, row.cells[object.id]])),
      });
      continue;
    }

    const group = row.group || '';
    const sourceObject = realObjects.find((object) => group.includes(object.label) || (group && object.label.includes(group)));
    if (!sourceObject || realFilled.length === 0) continue;
    const existing = pivotRows.get(row.label) || {
      id: `pivot:${row.label}`,
      label: row.label,
      group: '',
      rowConclusion: '',
      cells: Object.fromEntries(realObjects.map((object) => [object.id, {
        id: `empty:${row.label}:${object.id}`,
        value: '-',
        conclusion: '-',
        problems: [],
        media: [],
      } satisfies ReportDetailMatrixCell])),
    };
    existing.cells[sourceObject.id] = realFilled[0];
    pivotRows.set(row.label, existing);
  }

  const fallbackRows = Array.from(pivotRows.values()).filter((row) => filledMatrixCells(row, realObjects).length >= 2);
  const normalizedRows = rowsForMatrix.length > 0 ? rowsForMatrix : fallbackRows;
  return {
    objects: realObjects,
    rows: normalizedRows,
    emptyMessage: matrix.emptyMessage,
    summaryText: Array.from(new Set(summaryParts)).join('\n\n'),
  };
}

function comparisonMatrix(snapshotJson: Row): ReadableComparisonMatrix {
  const objects = sortedByOrder(rows(snapshotJson.objects)).map((object): ReportDetailMatrixObject => ({
    id: text(object.id),
    label: firstNonEmpty(object.object_name, object.model, object.id),
    subtitle: firstNonEmpty(object.model, object.project_stage, object.brand),
    objectType: firstNonEmpty(object.brand, text(object.is_competitor) === 'true' ? '竞品对象' : '对比对象'),
    isCompetitor: Boolean(object.is_competitor),
  })).filter((object) => Boolean(object.id));
  const objectsById = new Map(objects.map((object) => [object.id, object]));

  const cellByKey = new Map(rows(snapshotJson.cells).map((cell) => [
    `${text(cell.item_node_id)}::${text(cell.object_id)}`,
    cell,
  ]));
  const orderedItems = sortedByOrder(rows(snapshotJson.item_nodes));
  const itemsById = new Map(orderedItems.map((item) => [text(item.id), item]));

  const matrixRows = orderedItems.flatMap((item): ReportDetailMatrixRow[] => {
    const nodeType = text(item.node_type, 'item');
    if (nodeType === 'section') return [];
    if (nodeType === 'summary') {
      const config = nodeConfig(item);
      const group = firstNonEmpty(comparisonParentLabel(item, itemsById), comparisonRowGroup(item));
      const summaryText = firstNonEmpty(
        config.summary_text,
        config.summary,
        item.summary_text,
        item.summary,
        item.description,
        text(item.node_label).includes('总结') || text(item.node_label).includes('小结') ? '' : item.node_label,
      );
      return [{
        id: text(item.id),
        label: firstNonEmpty(item.node_label, '本大类小结'),
        group,
        rowKind: 'summary',
        summaryText,
        rowConclusion: summaryText || '本大类暂无小结。',
        cells: {},
      }];
    }
    if (!isMatrixItemNode(item)) return [];
    const cells = Object.fromEntries(objects.map((object) => {
      const cell = cellByKey.get(`${text(item.id)}::${object.id}`) || {};
      const fields = comparisonCellFields(cell);
      const matrixCell: ReportDetailMatrixCell = {
        id: firstNonEmpty(cell.id, `${text(item.id)}:${object.id}`),
        value: firstNonEmpty(cell.metric_value, cell.measurement_value, cell.manual_score, '-'),
        processNotes: fields.processNotes,
        score: firstNonEmpty(cell.manual_score, cell.ai_score),
        conclusion: fields.conclusion,
        conclusionTag: firstNonEmpty(cell.conclusion_tag, cell.status),
        problems: stringArray(cell.problem_points),
        aiStatus: firstNonEmpty(cell.ai_status, cell.ai_confirmation_status),
        anomaly: firstNonEmpty(cell.anomaly_reason, cell.metric_anomaly_reason),
        media: comparisonCellMedia(cell, `${comparisonCellOwnerLabel(item)} / ${object.label}`),
      };
      return [object.id, matrixCell];
    }));
    const rowCells = Object.values(cells);
    return [{
      id: text(item.id),
      label: comparisonRowLabel(item),
      group: firstNonEmpty(comparisonParentLabel(item, itemsById), comparisonRowGroup(item)),
      rowConclusion: comparisonMatrixRowConclusion(rowCells, objectsById),
      cells,
    }];
  }).filter((row) => Boolean(row.id));

  return normalizeReadableComparisonMatrix({
    objects,
    rows: matrixRows,
    emptyMessage: '暂无对比矩阵数据。',
  });
}

function sourceReportIds(report: Row, snapshotJson: Row) {
  return sourceIds(report, snapshotJson).sourceReportIds;
}

function comparisonObjectLabelById(snapshotJson: Row) {
  return new Map(rows(snapshotJson.objects).map((object) => [
    text(object.id),
    firstNonEmpty(object.object_name, object.model, object.id),
  ]));
}

function comparisonItemById(snapshotJson: Row) {
  return new Map(rows(snapshotJson.item_nodes).map((item) => [text(item.id), item]));
}

function extractExcelField(summary: string, column: string) {
  const match = summary.match(new RegExp(`(?:^|\\n)${column}\\d+:\\s*([\\s\\S]*?)(?=\\n[A-Z]{1,2}\\d+:|$)`));
  return match?.[1]?.trim() || '';
}

function comparisonIssueItems(snapshotJson: Row): ReportDetailSectionBlockItem[] {
  const objectsById = comparisonObjectLabelById(snapshotJson);
  const itemsById = comparisonItemById(snapshotJson);
  const seen = new Set<string>();
  const issueItems: ReportDetailSectionBlockItem[] = [];

  for (const cell of rows(snapshotJson.cells)) {
    const item = itemsById.get(text(cell.item_node_id)) || {};
    const rawItemLabel = firstNonEmpty(item.node_label, item.metric_name, cell.item_node_id);
    const rowLabel = comparisonRowLabel(item);
    const group = comparisonRowGroup(item);
    const objectLabel = firstNonEmpty(objectsById.get(text(cell.object_id)), cell.object_id);
    const summary = firstNonEmpty(cell.effect_summary, cell.conclusion, cell.metric_value, cell.measurement_value);
    const problems = stringArray(cell.problem_points);
    const isIssueRow = rawItemLabel.includes('体验问题') || group.includes('体验问题') || rowLabel.includes('体验问题');
    const problemText = firstNonEmpty(
      problems.join('；'),
      text(cell.conclusion_tag) === 'risk' ? summary : '',
      firstNonEmpty(cell.anomaly_reason, cell.metric_anomaly_reason),
      isIssueRow ? firstNonEmpty(extractExcelField(summary, 'E'), extractExcelField(summary, 'R')) : '',
    );
    if (!problemText) continue;

    const dimension = firstNonEmpty(extractExcelField(summary, 'B'), extractExcelField(summary, 'C'));
    const action = firstNonEmpty(extractExcelField(summary, 'G'), extractExcelField(summary, 'J'));
    const note = compact([group && !group.includes(objectLabel) ? group : '', dimension, action]).join(' / ');
    const key = `${objectLabel}::${rowLabel}::${problemText}`;
    if (seen.has(key)) continue;
    seen.add(key);

    issueItems.push({
      label: `${objectLabel} / ${rowLabel}`,
      value: problemText,
      note: note || undefined,
      status: text(cell.conclusion_tag) === 'risk' ? 'risk' : 'warning',
      media: comparisonCellMedia(cell, `${rowLabel} / ${objectLabel}`),
    });
  }

  return issueItems;
}

function aiSummaryItems(aiSummary: Row, sourceLabel: string): ReportDetailSectionBlockItem[] {
  const items: ReportDetailSectionBlockItem[] = [];
  const summary = firstNonEmpty(aiSummary.summary, aiSummary.conclusion, aiSummary.keyConclusion, aiSummary.recommendation);
  if (summary) items.push({ label: `${sourceLabel}总结`, value: summary, status: 'default' });
  for (const risk of stringArray(aiSummary.risks)) {
    items.push({ label: `${sourceLabel}风险`, value: risk, status: 'warning' });
  }
  for (const suggestion of stringArray(aiSummary.suggestions)) {
    items.push({ label: `${sourceLabel}建议`, value: suggestion, status: 'positive' });
  }
  for (const nextStep of stringArray(aiSummary.next_steps)) {
    items.push({ label: `${sourceLabel}下一步`, value: nextStep, status: 'positive' });
  }
  return items;
}

function comparisonAiSuggestionItems(report: Row, content: Row, snapshotJson: Row): ReportDetailSectionBlockItem[] {
  const items: ReportDetailSectionBlockItem[] = [];
  const contentAi = aiSummaryOf(content);
  items.push(...aiSummaryItems(contentAi, ''));

  if (isRecord(snapshotJson.ai_summary)) items.push(...aiSummaryItems(snapshotJson.ai_summary, ''));
  if (isRecord(snapshotJson.report_ai_summary)) items.push(...aiSummaryItems(snapshotJson.report_ai_summary, ''));

  for (const result of rows(snapshotJson.confirmed_ai_results)) {
    const value = firstNonEmpty(result.summary, result.conclusion, result.suggestion, result.value);
    if (!value) continue;
    items.push({
      label: firstNonEmpty(result.scope, result.label, '建议'),
      value,
      note: firstNonEmpty(result.status, result.updated_at),
      status: text(result.status) === 'rejected' ? 'risk' : 'default',
    });
  }

  for (const risk of stringArray(snapshotJson.current_risks)) {
    items.push({ label: '风险提示', value: risk, status: 'warning' });
  }
  for (const suggestion of stringArray(snapshotJson.next_validation_items)) {
    items.push({ label: '验证建议', value: suggestion, status: 'positive' });
  }

  if (items.length === 0 && text(report.ai_confirmation_status) === 'confirmed') {
    const summary = firstNonEmpty(snapshotJson.ai_summary_text, snapshotJson.ai_conclusion, snapshotJson.ai_suggestion);
    if (summary) items.push({ label: '建议', value: summary, status: 'default' });
  }

  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.label}::${item.value}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function comparisonGeneratedSuggestionFallback(summaryText: string, issueItems: ReportDetailSectionBlockItem[]): ReportDetailSectionBlockItem[] {
  if (!summaryText && issueItems.length === 0) return [];
  const items: ReportDetailSectionBlockItem[] = [];
  if (summaryText) {
    items.push({
      label: '报告生成总结',
      value: summaryText,
      note: '来自报告生成摘要',
      status: 'default',
    });
  }
  const issueLabels = Array.from(new Set(issueItems.map((item) => item.label.split(' / ').slice(0, 2).join(' / ')))).slice(0, 4);
  if (issueLabels.length > 0) {
    items.push({
      label: '后续验证建议',
      value: `建议优先围绕问题汇总中的 ${issueLabels.join('、')} 做整改验证，并在下一阶段复测中保留同工况图片/视频证据。`,
      status: 'positive',
    });
  }
  return items;
}

function modelStageRows(report: Row, content: Row, snapshotJson: Row) {
  const explicitStages = rows(snapshotJson.stages);
  if (explicitStages.length > 0) {
    return explicitStages.map((stage, index) => ({
      '阶段': firstNonEmpty(stage.stage, stage.project_phase, `阶段 ${index + 1}`),
      '报告': firstNonEmpty(stage.report_title, stage.report_id, '-'),
      '任务': firstNonEmpty(stage.task_name, stage.task_id, '-'),
      '日期': firstNonEmpty(stage.test_date, stage.created_at, '-'),
      '状态': firstNonEmpty(stage.status, '-'),
      '来源': firstNonEmpty(stage.source_report_id, stage.report_id, '-'),
    }));
  }

  const task = isRecord(content.task) ? content.task : {};
  const reports = sourceReportIds(report, snapshotJson);
  return (reports.length > 0 ? reports : [text(report.id)]).map((sourceReportId, index) => ({
    '阶段': firstNonEmpty(index === reports.length - 1 ? report.project_phase : '', task.project_phase, report.project_phase, `阶段 ${index + 1}`),
    '报告': firstNonEmpty(index === reports.length - 1 ? report.title : '', sourceReportId),
    '任务': firstNonEmpty(task.task_name, task.id, report.task_id, '-'),
    '日期': firstNonEmpty(task.test_date, report.created_at, '-'),
    '状态': firstNonEmpty(report.status, '-'),
    '来源': sourceReportId,
  }));
}

function modelIssueEvolutionRows(content: Row, snapshotJson: Row) {
  const explicitRows = rows(snapshotJson.issue_evolution);
  if (explicitRows.length > 0) {
    return explicitRows.map((item) => ({
      '阶段': firstNonEmpty(item.stage, item.project_phase, '-'),
      '问题': firstNonEmpty(item.issue, item.title, item.check_item, '-'),
      '等级': firstNonEmpty(item.level, item.problem_level, '-'),
      '状态': firstNonEmpty(item.status, item.evaluation_result, '-'),
      '措施': firstNonEmpty(item.action, item.improve_plan, '-'),
      '证据': firstNonEmpty(item.evidence, item.source_report_id, '-'),
    }));
  }

  return rows(content.records).map((record) => ({
    '阶段': firstNonEmpty(record.project_phase, record.test_phase, '-'),
    '问题': firstNonEmpty(record.check_item, record.id, '-'),
    '等级': firstNonEmpty(record.problem_level, record.level, '-'),
    '状态': firstNonEmpty(record.evaluation_result, '-'),
    '措施': firstNonEmpty(record.improve_plan, record.problem_description, '-'),
    '证据': String(rows(record.materials).length),
  }));
}

function modelEffectEvolutionItems(content: Row, snapshotJson: Row) {
  const explicitItems = rows(snapshotJson.function_effect_evolution);
  if (explicitItems.length > 0) {
    return explicitItems.map((item) => ({
      label: firstNonEmpty(item.name, item.function_name, item.stage, '功能效果'),
      value: firstNonEmpty(selectEffectEvaluationText(item), item.summary, item.effect_score, '暂无效果摘要'),
      note: firstNonEmpty(item.stage, item.effect_score, item.source_report_id),
      status: text(item.status) === 'risk' ? 'risk' as const : 'default' as const,
    }));
  }

  return rows(content.recipes).map((recipe) => ({
    label: firstNonEmpty(recipe.name, recipe.id),
    value: firstNonEmpty(selectEffectEvaluationText(recipe), '暂无效果描述'),
    note: firstNonEmpty(recipe.effect_score, recipe.recipe_type, ''),
    status: text(recipe.effect_problem_point) ? 'warning' as const : 'default' as const,
  }));
}

function riskItems(content: Row, snapshotJson: Row) {
  const explicitRisks = stringArray(snapshotJson.current_risks);
  const summaryRisks = stringArray(aiSummaryOf(content).risks);
  return [...explicitRisks, ...summaryRisks].map((risk) => ({ label: '风险', value: risk, status: 'risk' as const }));
}

function validationItems(content: Row, snapshotJson: Row) {
  const explicitItems = stringArray(snapshotJson.next_validation_items);
  const suggestions = stringArray(aiSummaryOf(content).suggestions);
  return [...explicitItems, ...suggestions].map((suggestion) => ({ label: '验证项', value: suggestion }));
}

function customSourceAlignmentRows(report: Row, content: Row, snapshotJson: Row) {
  const explicitRows = rows(snapshotJson.source_alignment);
  if (explicitRows.length > 0) {
    return explicitRows.map((item) => ({
      '来源': firstNonEmpty(item.source_report_id, item.report_id, '-'),
      '报告': firstNonEmpty(item.report_title, item.title, '-'),
      '任务': firstNonEmpty(item.task_name, item.task_id, '-'),
      '范围': firstNonEmpty(item.scope, item.project_type, '-'),
      '覆盖情况': firstNonEmpty(item.coverage, item.status, '-'),
    }));
  }

  const task = isRecord(content.task) ? content.task : {};
  const reports = sourceReportIds(report, snapshotJson);
  return reports.map((sourceReportId, index) => ({
    '来源': sourceReportId,
    '报告': firstNonEmpty(index === reports.length - 1 ? report.title : '', sourceReportId),
    '任务': firstNonEmpty(task.task_name, task.id, report.task_id, '-'),
    '范围': firstNonEmpty(task.project_type, report.project_type, '-'),
    '覆盖情况': index === reports.length - 1 ? '已附当前内容' : '仅来源引用',
  }));
}

function customFieldAlignmentRows(report: Row, content: Row, snapshotJson: Row) {
  const explicitRows = rows(snapshotJson.field_alignment);
  if (explicitRows.length > 0) {
    return explicitRows.map((item) => ({
      '字段': firstNonEmpty(item.field, item.label, '-'),
      '状态': firstNonEmpty(item.status, '-'),
      '来源': firstNonEmpty(item.source, item.source_report_id, '-'),
      '差异': firstNonEmpty(item.gap, item.note, '-'),
    }));
  }

  const fields = [
    { field: '任务信息', present: isRecord(content.task), source: 'content.task' },
    { field: '检查记录', present: rows(content.records).length > 0, source: 'content.records' },
    { field: '功能/食谱', present: rows(content.recipes).length > 0, source: 'content.recipes' },
    { field: '问题点', present: rows(content.issues).length > 0, source: 'content.issues' },
    { field: '来源报告', present: sourceReportIds(report, snapshotJson).length > 0, source: 'reports.source_report_ids' },
  ];
  return fields.map((item) => ({
    '字段': item.field,
    '状态': item.present ? '已覆盖' : '缺失',
    '来源': item.source,
    '差异': item.present ? '-' : '需要补充结构化来源或人工确认',
  }));
}

function comparisonSections(report: Row, content: Row, snapshotJson: Row, layoutProfile: string): ReportDetailSection[] {
  const metric = layoutProfile.includes('metric');
  const mixed = layoutProfile.includes('mixed');
  const horizontalMatrix = comparisonMatrix(snapshotJson);
  const blockTitle = metric ? '指标横向对比' : mixed ? '图文横向对比' : '横向对比矩阵';
  const summaryText = firstNonEmpty(
    horizontalMatrix.summaryText,
    snapshotJson.comparison_summary,
    isRecord(snapshotJson.assembly) ? snapshotJson.assembly.comparison_intent : '',
    report.summary,
    report.title,
  );
  const issueItems = comparisonIssueItems(snapshotJson);
  const explicitAiItems = comparisonAiSuggestionItems(report, content, snapshotJson);
  const aiItems = explicitAiItems.length > 0 ? explicitAiItems : comparisonGeneratedSuggestionFallback(summaryText, issueItems);

  return [
    section(metric ? 'metric_table' : mixed ? 'mixed_matrix' : 'image_matrix', blockTitle, horizontalMatrix.rows.length > 0 ? 'ready' : 'empty', ['体验结论', blockTitle], {
      blocks: compact([
        summaryText && block('comparison_matrix:summary', 'summary', '体验结论', {
          description: summaryText,
        }),
        issueItems.length > 0 && block('comparison_matrix:issues', 'list', '问题汇总', {
          items: issueItems,
          emptyMessage: '暂无问题点。',
        }),
        aiItems.length > 0 && block('comparison_matrix:ai_suggestions', 'list', 'AI建议', {
          items: aiItems,
          emptyMessage: '暂无AI建议。',
        }),
        block(metric ? 'metric_table:matrix' : 'comparison_matrix:horizontal', 'matrix', blockTitle, {
          description: '横向为真实对比对象，纵向为同一工况或评价项；图片、视频和评价文字保留在对应单元格内。',
          matrix: horizontalMatrix,
          emptyMessage: horizontalMatrix.emptyMessage,
        }),
      ]),
    }),
  ];
}

function modelSections(report: Row, content: Row, snapshotJson: Row): ReportDetailSection[] {
  const sources = sourceIds(report, snapshotJson);
  const stageRows = modelStageRows(report, content, snapshotJson);
  const issueRows = modelIssueEvolutionRows(content, snapshotJson);
  const effectItems = modelEffectEvolutionItems(content, snapshotJson);
  const risks = riskItems(content, snapshotJson);
  const validations = validationItems(content, snapshotJson);
  return [
    section('model_dossier', '型号档案', 'ready', ['型号信息', '当前结论'], {
      blocks: [
        block('model_dossier:facts', 'facts', '型号档案', {
          items: compact([
            fact('产品型号', report.product_model),
            fact('项目类型', report.project_type),
            fact('项目阶段', report.project_phase),
            fact('当前报告', report.title),
            fact('来源报告', sources.sourceReportIds.length),
            fact('来源任务', sources.sourceTaskIds.length),
          ]),
        }),
        block('model_dossier:comparability', 'summary', '可比性边界', {
          description: firstNonEmpty(
            snapshotJson.comparability_statement,
            '本页按型号和来源报告串联不同阶段，用于观察演进关系；阶段条件不完全一致时，不应作为直接排名证据。',
          ),
        }),
      ],
    }),
    section('stage_timeline', '阶段时间线', stageRows.length > 0 ? 'ready' : 'warning', ['阶段卡片', '来源追溯'], {
      count: stageRows.length,
      blocks: [
        block('stage_timeline:table', 'table', '阶段时间线', {
          columns: ['阶段', '报告', '任务', '日期', '状态', '来源'],
          rows: stageRows,
          emptyMessage: '暂无来源报告阶段。',
        }),
      ],
    }),
    section('issue_evolution', '问题演进', issueRows.length > 0 ? 'ready' : 'empty', ['问题演进表'], {
      count: issueRows.length,
      blocks: [
        block('issue_evolution:table', 'table', '问题演进', {
          columns: ['阶段', '问题', '等级', '状态', '措施', '证据'],
          rows: issueRows,
          emptyMessage: '暂无问题演进记录。',
        }),
      ],
    }),
    section('function_effect_evolution', '功能效果演进', effectItems.length > 0 ? 'ready' : 'empty', ['功能效果时间线'], {
      count: effectItems.length,
      blocks: [
        block('function_effect_evolution:list', 'list', '功能效果演进', {
          items: effectItems,
          emptyMessage: '暂无功能效果演进记录。',
        }),
      ],
    }),
    section('current_risks', '当前风险', risks.length > 0 ? 'ready' : 'empty', ['风险摘要'], {
      blocks: [
        block('current_risks:list', 'list', '当前风险', {
          items: risks,
          emptyMessage: '暂无当前风险。',
        }),
      ],
    }),
    section('next_validation', '下一阶段验证', validations.length > 0 ? 'ready' : 'warning', ['验证事项'], {
      blocks: [
        block('next_validation:list', 'list', '下一阶段验证', {
          items: validations,
          emptyMessage: '暂无下一阶段验证项。',
        }),
      ],
    }),
    section('source_trace', '来源报告', 'ready', ['来源报告'], {
      blocks: sourceTraceBlocks(report, snapshotJson),
    }),
  ];
}

function customSections(report: Row, content: Row, snapshotJson: Row) {
  const sourceReports = sourceReportIds(report, snapshotJson);
  const sourceAlignmentRows = customSourceAlignmentRows(report, content, snapshotJson);
  const fieldAlignmentRows = customFieldAlignmentRows(report, content, snapshotJson);
  const validations = validationItems(content, snapshotJson);
  return [
    section('merge_purpose', '合并目的', 'ready', ['合并目标'], {
      blocks: [
        block('merge_purpose:summary', 'summary', '合并目的', {
          description: firstNonEmpty(content.summary, aiSummaryOf(content).summary, report.title),
        }),
      ],
    }),
    section('source_alignment', '来源对齐', sourceAlignmentRows.length > 0 ? 'ready' : 'warning', ['来源报告列表', '来源对齐表'], {
      count: sourceAlignmentRows.length,
      blocks: [
        block('source_alignment:table', 'table', '来源对齐', {
          columns: ['来源', '报告', '任务', '范围', '覆盖情况'],
          rows: sourceAlignmentRows,
          emptyMessage: '暂无来源报告。',
        }),
        block('source_alignment:list', 'list', '来源报告', {
          items: sourceReports.map((sourceReportId) => ({ label: sourceReportId, value: '来源报告' })),
          emptyMessage: '暂无来源报告。',
        }),
      ],
    }),
    section('field_alignment', '字段对齐', fieldAlignmentRows.some((row) => row['状态'] === '缺失') ? 'warning' : 'ready', ['字段对齐表'], {
      summary: '先呈现字段覆盖情况，便于判断哪些内容可直接对比，哪些内容仍需验证。',
      blocks: [
        block('field_alignment:table', 'table', '字段对齐', {
          columns: ['字段', '状态', '来源', '差异'],
          rows: fieldAlignmentRows,
        }),
      ],
    }),
    section('comparability_boundary', '可比性边界', 'warning', ['可比性说明'], {
      blocks: [
        block('comparability_boundary:summary', 'summary', '可比性边界', {
          description: '不同来源报告可能在阶段、负责人、字段完整度和证据质量上存在差异，跨来源结论应作为综合判断，而不是原始一对一排名。',
        }),
      ],
    }),
    section('synthesis', '综合结论', hasAny(content.ai_summary, content.summary) ? 'ready' : 'empty', ['综合摘要'], {
      blocks: [
        block('synthesis:summary', 'summary', '综合结论', {
          description: firstNonEmpty(aiSummaryOf(content).summary, content.summary),
        }),
      ],
    }),
    section('gaps', '待补信息', 'warning', ['缺失字段'], {
      blocks: [
        block('gaps:list', 'list', '已知待补信息', {
          items: fieldAlignmentRows
            .filter((row) => row['状态'] === '缺失')
            .map((row) => ({ label: row['字段'], value: row['差异'], note: row['来源'], status: 'warning' as const })),
          emptyMessage: '暂无检测到缺失合并字段。',
        }),
      ],
    }),
    section('validation_suggestions', '验证建议', validations.length > 0 ? 'ready' : 'warning', ['验证事项'], {
      blocks: [
        block('validation_suggestions:list', 'list', '后续验证建议', {
          items: validations,
          emptyMessage: '暂无验证建议。',
        }),
      ],
    }),
  ];
}

function buildSections(report: Row, snapshot: Row | null | undefined, issues: Row[], materials: Row[]) {
  const content = contentOf(report);
  const snapshotJson = snapshotJsonOf(snapshot);
  const reportType = reportTypeOf(report);
  const layoutProfile = layoutProfileOf(report, snapshotJson);
  if (reportType === 'comparison_report') return comparisonSections(report, content, snapshotJson, layoutProfile);
  if (reportType === 'model_merged_report') return modelSections(report, content, snapshotJson);
  if (reportType === 'custom_merged_report') return customSections(report, content, snapshotJson);
  const sections = contentSections(report, content, issues, materials);
  // ── 数据矩阵追加（Task 12 / Wave 6）──
  // 仅当存在冻结快照或 content 投影时追加；既有 single_report 类型无投影时不受影响。
  // V3 优先于 V2（同一 payload 不会同时满足 groups 与 columns+rows 无 groups）。
  const dataMatrixV3Projection = dataMatrixV3ProjectionOf(content, snapshotJson);
  if (dataMatrixV3Projection) {
    sections.push(dataMatrixV3Section(dataMatrixV3Projection));
  } else {
    const dataMatrixProjection = dataMatrixProjectionOf(content, snapshotJson);
    if (dataMatrixProjection) sections.push(dataMatrixSection(dataMatrixProjection));
  }
  return sections;
}

function evidenceSlot(id: string, ownerType: string, ownerId: string, role: string, materialIds: string[], required = false): ReportEvidenceSlot {
  return {
    id,
    ownerType,
    ownerId,
    role,
    materialIds,
    required,
    status: materialIds.length > 0 ? 'ready' : 'missing',
  };
}

function evidenceFromContent(content: Row, externalMaterials: Row[]): ReportEvidenceSlot[] {
  const slots: ReportEvidenceSlot[] = [];
  for (const record of rows(content.records)) {
    const materials = rows(record.materials);
    slots.push(evidenceSlot(`record:${text(record.id)}`, 'record', text(record.id), 'issue_evidence', materials.map(materialId).filter(Boolean), isFailResult(record.evaluation_result)));
  }
  for (const recipe of rows(content.recipes)) {
    for (const step of rows(recipe.recipe_steps)) {
      const materials = rows(step.materials);
      slots.push(evidenceSlot(`recipe_step:${text(step.id)}`, 'recipe_step', text(step.id), 'step_evidence', materials.map(materialId).filter(Boolean), false));
    }
    const effectMaterials = rows(recipe.effect_materials);
    slots.push(evidenceSlot(`recipe_effect:${text(recipe.id)}`, 'recipe', text(recipe.id), 'effect_evidence', effectMaterials.map(materialId).filter(Boolean), Boolean(recipe.effect_problem_point)));
  }
  for (const material of externalMaterials) {
    const ownerId = firstNonEmpty(material.record_id, material.recipe_step_id, material.recipe_id, material.issue_id, material.re_evaluation_id, material.comparison_cell_id, material.task_id, material.id);
    slots.push(evidenceSlot(`material:${text(material.id)}`, 'material', ownerId, text(material.media_role, 'archive_evidence'), [materialId(material)].filter(Boolean), false));
  }
  return slots;
}

function evidenceFromSnapshot(snapshotJson: Row): ReportEvidenceSlot[] {
  const slots: ReportEvidenceSlot[] = [];
  for (const cell of rows(snapshotJson.cells)) {
    const inline = rows(cell.inline_media);
    const appendix = rows(cell.appendix_media);
    const hasProblemPoints = stringArray(cell.problem_points).length > 0;
    const hasCellContent = Boolean(
      firstNonEmpty(cell.effect_summary, cell.conclusion, cell.manual_score, cell.ai_score, cell.metric_value, cell.measurement_value)
      || hasProblemPoints
      || text(cell.conclusion_tag),
    );
    slots.push(evidenceSlot(
      `comparison_cell:${text(cell.id)}`,
      'comparison_cell',
      text(cell.id),
      'cell_evidence',
      [...inline, ...appendix].map(materialId).filter(Boolean),
      hasCellContent && (hasProblemPoints || text(cell.conclusion_tag) === 'risk'),
    ));
  }
  return slots;
}

function buildEvidenceSlots(report: Row, snapshot: Row | null | undefined, materials: Row[]) {
  const content = contentOf(report);
  return [
    ...evidenceFromContent(content, materials),
    ...evidenceFromSnapshot(snapshotJsonOf(snapshot)),
  ];
}

function printProfileFor(layoutProfile: string): ReportPrintProfile {
  if (layoutProfile.includes('a3_landscape') || layoutProfile.includes('comparison_')) {
    return {
      id: layoutProfile || 'comparison_image_matrix_a3_landscape',
      paper: 'A3',
      orientation: 'landscape',
      description: 'A3 landscape profile for comparison matrices, metric tables, and wide mixed comparison output.',
    };
  }
  return {
    id: layoutProfile || 'single_a4_portrait',
    paper: 'A4',
    orientation: 'portrait',
    description: layoutProfile.includes('model_merged')
      ? 'A4 portrait profile for model stage timeline and issue evolution.'
      : layoutProfile.includes('custom_merged')
        ? 'A4 portrait profile for source alignment, synthesis, and validation suggestions.'
        : 'A4 portrait profile for single report narrative with inline issue and effect evidence.',
  };
}

function printBlockType(sectionItem: ReportDetailSection, blockItem: ReportDetailSectionBlock): ReportPrintBlock['printBlockType'] {
  if (sectionItem.key === 'overview' || sectionItem.key === 'model_dossier' || sectionItem.key === 'merge_purpose') return 'cover';
  if (sectionItem.key.includes('timeline') || blockItem.id.includes('timeline')) return 'timeline';
  if (blockItem.type === 'media') return 'image_grid';
  if (blockItem.type === 'table') {
    return blockItem.id.includes('matrix') || sectionItem.key.includes('matrix') ? 'matrix' : 'table';
  }
  if (sectionItem.key.includes('archive') || sectionItem.key.includes('source_trace')) return 'appendix';
  return 'summary';
}

function printBehaviorFor(blockItem: ReportDetailSectionBlock): ReportPrintBlock['printBehavior'] {
  if (blockItem.type === 'media' && (blockItem.media?.length || 0) > 12) return 'appendix_only';
  if (blockItem.type === 'summary' && !blockItem.description) return 'summary_only';
  return 'inline';
}

function evidenceIdsForSection(sectionItem: ReportDetailSection, evidenceSlots: ReportEvidenceSlot[]) {
  const key = sectionItem.key.toLowerCase();
  return evidenceSlots
    .filter((slot) => {
      const role = slot.role.toLowerCase();
      const owner = `${slot.ownerType}:${slot.ownerId}`.toLowerCase();
      return role.includes(key)
        || (key.includes('issue') && (role.includes('issue') || role.includes('re_evaluation')))
        || (key.includes('function') && (role.includes('recipe') || owner.includes('recipe')))
        || (key.includes('sensory') && role.includes('issue'))
        || (key.includes('comparison') && slot.ownerType === 'comparison_cell')
        || (key.includes('metric') && slot.ownerType === 'comparison_cell');
    })
    .map((slot) => slot.id);
}

function buildPrintBlocks(sections: ReportDetailSection[], evidenceSlots: ReportEvidenceSlot[]): ReportPrintBlock[] {
  return sections.flatMap((sectionItem) => sectionItem.blocks.map((blockItem) => ({
    id: `print:${blockItem.id}`,
    sectionKey: sectionItem.key,
    title: blockItem.title,
    printBlockType: printBlockType(sectionItem, blockItem),
    printBehavior: printBehaviorFor(blockItem),
    status: sectionItem.status,
    sourceBlockIds: [blockItem.id],
    evidenceSlotIds: evidenceIdsForSection(sectionItem, evidenceSlots),
  })));
}

function allBlockMedia(sections: ReportDetailSection[]): ReportDetailMediaItem[] {
  return sections.flatMap((sectionItem) => sectionItem.blocks.flatMap((blockItem) => [
    ...(blockItem.media || []),
    ...(blockItem.items || []).flatMap((item) => item.media || []),
    ...(blockItem.matrix?.rows || []).flatMap((row) =>
      (blockItem.matrix?.objects || []).flatMap((object) => row.cells[object.id]?.media || []),
    ),
    ...(blockItem.dataMatrix?.groups || []).flatMap((group) =>
      group.rows.flatMap((row) => row.evidence?.media || []),
    ),
  ]));
}

/**
 * In-place presign every media URL in the report model. Required for server-side
 * rendering (PDF export via Playwright) where relative storage keys must be
 * turned into absolute, browser-fetchable URLs. Gray-release aware: tries local
 * first, falls back to S3 (see generatePresignedUrl).
 *
 * Idempotent: skips URLs that are already http(s) or data URIs.
 */
export async function presignReportMediaUrls(
  model: ReportDetailModel,
  options: { absoluteBaseUrl?: string } = {},
): Promise<void> {
  const { generatePresignedUrl } = await import('@/lib/server/storage');
  const media = allBlockMedia(model.sections);
  await Promise.all(media.map(async (item) => {
    if (!item.url || item.url.startsWith('http') || item.url.startsWith('data:')) return;
    try {
      const resolvedUrl = await generatePresignedUrl({ key: item.url, expireTime: 30 * 60, absoluteUrl: true });
      if (options.absoluteBaseUrl && resolvedUrl.startsWith('http')) {
        const parsedUrl = new URL(resolvedUrl);
        item.url = `${options.absoluteBaseUrl.replace(/\/+$/, '')}${parsedUrl.pathname}${parsedUrl.search}`;
      } else {
        item.url = resolvedUrl;
      }
    } catch (error) {
      console.error('[report-detail] presign failed for media url:', item.url, error);
    }
  }));
}

function latestPdfJob(pdfJobs: Row[]): ReportPrintDelivery['latestPdfJob'] {
  const job = pdfJobs[0];
  if (!job) return undefined;
  return {
    id: text(job.id),
    status: text(job.status),
    errorMessage: text(job.error_message) || undefined,
    createdAt: text(job.created_at) || undefined,
    finishedAt: text(job.finished_at) || undefined,
  };
}

function matrixColumnCount(sections: ReportDetailSection[]) {
  return sections.reduce((max, sectionItem) => {
    const sectionMax = sectionItem.blocks.reduce((blockMax, blockItem) => Math.max(blockMax, blockItem.columns?.length || 0), 0);
    return Math.max(max, sectionMax);
  }, 0);
}

function preflightIssue(code: string, severity: 'error' | 'warning', message: string, action: string): ReportPrintPreflightIssue {
  return { code, severity, message, action };
}

function buildPrintDelivery(input: {
  report: Row;
  snapshot?: Row | null;
  sections: ReportDetailSection[];
  evidenceSlots: ReportEvidenceSlot[];
  qualityChecks: ReportQualityCheck[];
  pdfJobs: Row[];
}): ReportPrintDelivery {
  const snapshotJson = snapshotJsonOf(input.snapshot);
  const layoutProfile = layoutProfileOf(input.report, snapshotJson);
  const profile = printProfileFor(layoutProfile);
  const printBlocks = buildPrintBlocks(input.sections, input.evidenceSlots);
  const missingRequired = input.evidenceSlots.filter((slot) => slot.required && slot.status === 'missing');
  const media = allBlockMedia(input.sections);
  const videoWithoutCover = media.filter((item) => item.type === 'video' && !item.url.match(/\.(jpg|jpeg|png|webp)(\?|$)/i));
  const maxColumns = matrixColumnCount(input.sections);
  const errors: ReportPrintPreflightIssue[] = [];
  const warnings: ReportPrintPreflightIssue[] = [];
  const aiStatus = text(input.report.ai_confirmation_status, 'pending');
  const reportType = reportTypeOf(input.report);
  const snapshotStatus = firstNonEmpty(snapshotJson.snapshot_status, input.snapshot?.status, input.report.status);

  if (missingRequired.length > 0) {
    warnings.push(preflightIssue('missing_required_evidence', 'warning', `${missingRequired.length} 个重点证据位尚未关联素材。`, '补充或重新关联素材后，报告证据链会更完整。'));
  }
  if (aiStatus === 'pending' || aiStatus === 'generated') {
    warnings.push(preflightIssue('ai_unconfirmed', 'warning', '结论尚未人工确认。', '如需正式归档，可由管理员确认或替换结论。'));
  }
  if (videoWithoutCover.length > 0) {
    warnings.push(preflightIssue('video_cover_missing', 'warning', `${videoWithoutCover.length} 个视频素材可能缺少打印封面。`, '补充视频封面或将视频移至附录素材。'));
  }
  if ((profile.paper === 'A3' && maxColumns > 9) || (profile.paper === 'A4' && maxColumns > 6)) {
    warnings.push(preflightIssue('matrix_over_wide', 'warning', `最宽表格有 ${maxColumns} 列。`, '建议拆分宽矩阵，或确认使用 A3 横向版式。'));
  }
  if (input.snapshot && text(snapshotStatus).toLowerCase() !== 'published') {
    warnings.push(preflightIssue('snapshot_unpublished', 'warning', '当前快照尚未标记为正式发布。', '正式归档前可由管理员确认快照版本。'));
  }
  if (!input.snapshot && reportType === 'comparison_report') {
    errors.push(preflightIssue('snapshot_missing', 'error', '对比报告缺少可渲染快照。', '请先生成报告快照。'));
  } else if (!input.snapshot) {
    warnings.push(preflightIssue('content_json_fallback', 'warning', '当前报告未绑定快照，打印预览会读取最新内容。', '正式归档前建议生成快照。'));
  }
  for (const check of input.qualityChecks.filter((check) => check.severity === 'error')) {
    if (errors.some((item) => item.code === check.code)) continue;
    errors.push(preflightIssue(check.code, 'error', check.message, '请先处理该诊断项。'));
  }

  return {
    profile,
    printBlocks,
    preflight: {
      ok: errors.length === 0,
      errors,
      warnings,
      counts: {
        printBlocks: printBlocks.length,
        requiredEvidenceMissing: missingRequired.length,
        inlineEvidence: media.length,
        videoWithoutCover: videoWithoutCover.length,
        matrixColumns: maxColumns,
      },
    },
    latestPdfJob: latestPdfJob(input.pdfJobs),
  };
}

function buildActions(report: Row, qualityChecks: ReportQualityCheck[], pdfJobs: Row[]): ReportDetailAction[] {
  const aiStatus = text(report.ai_confirmation_status, 'pending');
  const hasErrors = qualityChecks.some((check) => check.severity === 'error');
  const latestPdfFailed = pdfJobs.some((job) => text(job.report_id) === text(report.id) && text(job.status) === 'failed');
  return [
    {
      type: 'confirm_ai',
      label: '确认结论',
      priority: 'primary',
      enabled: aiStatus === 'pending' || aiStatus === 'generated',
      reason: aiStatus === 'confirmed' ? '结论已确认。' : undefined,
    },
    {
      type: 'publish',
      label: '确认归档版本',
      priority: 'primary',
      enabled: !hasErrors,
      reason: hasErrors ? '存在需要处理的诊断项。' : undefined,
    },
    {
      type: latestPdfFailed ? 'retry_pdf' : 'export_pdf',
      label: latestPdfFailed ? '重新生成PDF' : '导出PDF',
      priority: 'secondary',
      enabled: !hasErrors,
      reason: hasErrors ? '存在需要处理的诊断项。' : undefined,
    },
    {
      type: 'share',
      label: '分享报告',
      priority: 'secondary',
      enabled: !hasErrors,
    },
    {
      type: 'view_source',
      label: '查看来源',
      priority: 'governance',
      enabled: true,
    },
  ];
}

function buildQualityChecks(report: Row, snapshot: Row | null | undefined, issues: Row[], evidenceSlots: ReportEvidenceSlot[], pdfJobs: Row[]) {
  const checks: ReportQualityCheck[] = [];
  const reportType = reportTypeOf(report);
  const aiStatus = text(report.ai_confirmation_status, 'pending');
  const sources = sourceIds(report, snapshotJsonOf(snapshot));

  if (reportType === 'comparison_report' && !snapshot) {
    checks.push({ code: 'missing_comparison_snapshot', severity: 'error', message: '对比报告缺少可渲染快照。' });
  }
  if (reportType !== 'comparison_report' && !isRecord(report.content)) {
    checks.push({ code: 'missing_report_content', severity: 'error', message: '报告缺少结构化内容。' });
  }
  if (sources.sourceTaskIds.length === 0 && sources.sourceReportIds.length === 0) {
    checks.push({ code: 'missing_sources', severity: 'warning', message: '报告缺少来源任务或来源报告。' });
  }
  if (aiStatus === 'pending' || aiStatus === 'generated') {
    checks.push({ code: 'ai_unconfirmed', severity: 'warning', message: '结论尚未人工确认。' });
  }
  if (aiStatus === 'rejected') {
    checks.push({ code: 'ai_rejected', severity: 'warning', message: '结论已被驳回，需要补充人工结论。' });
  }
  const missingRequiredEvidence = evidenceSlots.filter((slot) => slot.required && slot.status === 'missing');
  if (missingRequiredEvidence.length > 0) {
    checks.push({ code: 'missing_required_evidence', severity: 'warning', message: `${missingRequiredEvidence.length} 个重点证据位尚未关联素材。` });
  }
  const openHighRiskIssues = issues.filter((issue) => isHighRiskLevel(text(issue.level)) && !isClosedStatus(text(issue.status)));
  if (openHighRiskIssues.length > 0) {
    checks.push({ code: 'open_high_risk_issues', severity: 'warning', message: `${openHighRiskIssues.length} 个高风险问题仍未关闭。` });
  }
  const failedPdf = pdfJobs.find((job) => text(job.report_id) === text(report.id) && text(job.status) === 'failed');
  if (failedPdf) {
    checks.push({ code: 'pdf_failed', severity: 'warning', message: text(failedPdf.error_message, 'PDF生成失败，需要重试。') });
  }
  return checks;
}

export function buildReportDetailModel({
  report,
  snapshot,
  issues = [],
  materials = [],
  pdfJobs = [],
}: BuildReportDetailModelInput): ReportDetailModel {
  const evidenceSlots = buildEvidenceSlots(report, snapshot, materials);
  const qualityChecks = buildQualityChecks(report, snapshot, issues, evidenceSlots, pdfJobs);
  const sections = buildSections(report, snapshot, issues, materials);
  const snapshotJson = snapshotJsonOf(snapshot);
  const layoutProfile = layoutProfileOf(report, snapshotJson);
  const reportType = reportTypeOf(report);
  const template = templateSelectionFor(reportType, layoutProfile, sections.map((sectionItem) => sectionItem.key));
  return {
    header: buildHeader(report, snapshot),
    template,
    conclusion: conclusionFrom(report, issues),
    sections,
    evidenceSlots,
    actions: buildActions(report, qualityChecks, pdfJobs),
    qualityChecks,
    printDelivery: buildPrintDelivery({ report, snapshot, sections, evidenceSlots, qualityChecks, pdfJobs }),
  };
}
