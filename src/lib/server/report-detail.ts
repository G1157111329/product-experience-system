type Row = Record<string, unknown>;

export type ReportViewMode = 'read' | 'data' | 'evidence' | 'review' | 'print';
export type ReportSectionStatus = 'ready' | 'empty' | 'warning' | 'blocked';
export type ReportQualitySeverity = 'info' | 'warning' | 'error';
export type ReportDetailSectionBlockType = 'summary' | 'facts' | 'list' | 'table' | 'media' | 'matrix';
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
  rowConclusion: string;
  cells: Record<string, ReportDetailMatrixCell>;
};

export type ReportDetailMatrix = {
  objects: ReportDetailMatrixObject[];
  rows: ReportDetailMatrixRow[];
  emptyMessage?: string;
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
  matrix?: ReportDetailMatrix;
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

function conclusionLevelFrom(report: Row, issueRows: Row[]) {
  const aiStatus = text(report.ai_confirmation_status);
  const openHighRisk = issueRows.some((issue) => isHighRiskLevel(text(issue.level)) && !isClosedStatus(text(issue.status)));
  if (aiStatus === 'pending' || aiStatus === 'rejected') return 'blocked';
  if (openHighRisk) return 'risk';
  return 'neutral';
}

function conclusionFrom(report: Row, issues: Row[]): ReportDetailConclusion {
  const content = contentOf(report);
  const aiSummary = aiSummaryOf(content);
  const aiStatus = text(report.ai_confirmation_status, 'pending');
  const conclusionLevel = conclusionLevelFrom(report, issues);

  return {
    keyConclusion: firstNonEmpty(aiSummary.summary, content.summary, report.title, 'No report conclusion is available.'),
    conclusionLevel,
    keyRisks: stringArray(aiSummary.risks),
    recommendedNextAction: aiStatus === 'pending' || aiStatus === 'generated'
      ? 'confirm_ai'
      : conclusionLevel === 'blocked'
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
  const sources = sourceIds(report, snapshotJson);
  return {
    reportId: text(report.id),
    title: text(report.title, 'Untitled report'),
    reportType: reportTypeOf(report),
    layoutProfile,
    defaultViewMode: defaultViewMode(layoutProfile),
    productModel: text(report.product_model) || null,
    status: text(report.status, 'draft'),
    snapshotStatus: text(snapshotJson.snapshot_status, text(report.status, 'draft')),
    snapshotVersion: numberOrNull(snapshot?.version),
    aiConfirmationStatus: text(report.ai_confirmation_status, 'pending'),
    sourceTaskIds: sources.sourceTaskIds,
    sourceReportIds: sources.sourceReportIds,
    templateVersion: DEFAULT_TEMPLATE_VERSION,
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
    block('source_trace:facts', 'facts', 'Source and version', {
      items: compact([
        fact('Report ID', report.id),
        fact('Task IDs', sources.sourceTaskIds.join(', ')),
        fact('Report IDs', sources.sourceReportIds.join(', ')),
        fact('Snapshot version', snapshotJson.version),
        fact('Template version', DEFAULT_TEMPLATE_VERSION),
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

function issueEvidenceMedia(issue: Row, recordById: Map<string, Row>, allMaterials: Row[]) {
  const direct = allMaterials.filter((material) => (
    text(material.issue_id) === text(issue.id)
    || text(material.record_id) === text(issue.record_id)
  ));
  const record = recordById.get(text(issue.record_id)) || recordById.get(text(issue.id));
  return [
    ...mediaItems(rows(issue.materials), firstNonEmpty(issue.title, issue.check_item, issue.id)),
    ...mediaItems(rows(record?.materials), firstNonEmpty(issue.title, issue.check_item, record?.check_item, issue.id)),
    ...mediaItems(direct, firstNonEmpty(issue.title, issue.check_item, issue.id)),
  ];
}

function reEvaluationRows(issue: Row) {
  return rows(issue._reEvaluations);
}

function reEvaluationMedia(issue: Row) {
  return reEvaluationRows(issue).flatMap((item, index) =>
    mediaItems(rows(item.materials), `${firstNonEmpty(issue.title, issue.id)} / re-evaluation ${index + 1}`),
  );
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
  return Object.entries(task)
    .filter(([key, value]) => !['id', 'selected_standards', 'created_by'].includes(key) && value !== null && value !== undefined && value !== '')
    .slice(0, 24)
    .map(([key, value]) => ({ Field: key, Value: text(value) }));
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
  const issueMedia = (issue: Row) => [
    ...issueEvidenceMedia(issue, recordById, allMaterials),
    ...reEvaluationMedia(issue),
  ];
  const recipeStepRows = recipes.flatMap((recipe) => rows(recipe.recipe_steps).map((step) => ({
    Recipe: firstNonEmpty(recipe.name, recipe.id),
    Step: firstNonEmpty(step.step_number, '-'),
    Operation: firstNonEmpty(step.operation, '-'),
    Problem: stepProblemText(step),
    Evidence: String(stepProblemMedia(step, `${firstNonEmpty(recipe.name, recipe.id)} / step ${firstNonEmpty(step.step_number, '')}`).length),
  })));
  const recipeEffectRows = recipes.map((recipe) => {
    const effectMedia = mediaItems(rows(recipe.effect_materials), firstNonEmpty(recipe.name, recipe.id));
    const stepMediaCount = rows(recipe.recipe_steps).reduce((sum, step) => sum + rows(step.materials).length, 0);
    const effectProblemText = parseProblemPoints(recipe.effect_problem_point).map((point) => point.text).join('; ');
    return {
      Recipe: firstNonEmpty(recipe.name, recipe.id),
      Effect: firstNonEmpty(recipe.effect_description, isRecord(recipe.effect_ai_result) ? recipe.effect_ai_result.summary : '', '-'),
      Score: firstNonEmpty(recipe.effect_score, isRecord(recipe.effect_ai_result) ? recipe.effect_ai_result.score : '', '-'),
      Risk: firstNonEmpty(effectProblemText, Number(recipe.problem_count || 0) > 0 ? `${recipe.problem_count} problem(s)` : '', '-'),
      Evidence: String(effectMedia.length + stepMediaCount),
    };
  });
  const recipeMedia = recipes.flatMap((recipe) => [
    ...mediaItems(rows(recipe.effect_materials), firstNonEmpty(recipe.name, recipe.id)),
    ...rows(recipe.recipe_steps).flatMap((step) => mediaItems(rows(step.materials), `${firstNonEmpty(recipe.name, recipe.id)} / step ${firstNonEmpty(step.step_number, '')}`)),
  ]);
  const effectProblemItems = recipes.flatMap((recipe) => parseProblemPoints(recipe.effect_problem_point).map((point, index) => ({
    label: `${firstNonEmpty(recipe.name, recipe.id)} effect problem ${index + 1}`,
    value: point.text,
    note: point.materialIds.length ? `materials: ${point.materialIds.join(', ')}` : undefined,
    status: 'warning' as const,
    media: mediaByIds(rows(recipe.effect_materials), point.materialIds, firstNonEmpty(recipe.name, recipe.id)),
  })));
  const reEvaluationItems = issueSource.flatMap((issue) => reEvaluationRows(issue).map((item, index) => ({
    label: `${firstNonEmpty(issue.title, issue.check_item, issue.id)} re-evaluation ${index + 1}`,
    value: firstNonEmpty(item.description, isRecord(item.ai_result) ? item.ai_result.summary : '', 'No re-evaluation detail'),
    note: firstNonEmpty(isRecord(item.ai_result) ? item.ai_result.score : '', item.created_at),
    status: 'positive' as const,
    media: mediaItems(rows(item.materials), `${firstNonEmpty(issue.title, issue.id)} / re-evaluation ${index + 1}`),
  })));

  return [
    section('overview', 'Overview', 'ready', ['task_summary', 'conclusion'], {
      blocks: [
        block('overview:summary', 'summary', 'Report summary', {
          description: firstNonEmpty(aiSummary.summary, content.summary, report.title),
        }),
        block('overview:facts', 'facts', 'Task facts', {
          items: compact([
            fact('Product', firstNonEmpty(task.product, report.product_model)),
            fact('Model', firstNonEmpty(task.product_model, report.product_model)),
            fact('Project type', firstNonEmpty(task.project_type, report.project_type)),
            fact('Project phase', firstNonEmpty(task.project_phase, report.project_phase)),
            fact('Organizer', firstNonEmpty(task.organizer, report.organizer)),
            fact('Test date', task.test_date),
          ]),
        }),
        block('overview:task-details', 'table', 'Task detail fields', {
          columns: ['Field', 'Value'],
          rows: taskDetailRows(task),
          emptyMessage: 'No task detail fields are available.',
        }),
      ],
    }),
    section('issue_closure', 'Issue closure', hasAny(issues, content.issues, records) ? 'ready' : 'empty', ['issue_table', 'issue_evidence'], {
      count: issues.length || rows(content.issues).length,
      blocks: [
        block('issue_closure:table', 'table', 'Issue closure table', {
          columns: ['Title', 'Level', 'Status', 'Source', 'Responsible', 'Plan', 'Validation', 'Evidence'],
          rows: issueSource.slice(0, 8).map((issue) => ({
            Title: firstNonEmpty(issue.title, issue.check_item, issue.problem_description, issue.id),
            Level: firstNonEmpty(issue.level, issue.problem_level, '-'),
            Status: firstNonEmpty(issue.status, issue.evaluation_result, '-'),
            Source: firstNonEmpty(issue.source_type, issue.standard_category, 'record'),
            Responsible: firstNonEmpty(issue.responsible_person, issue.responsible_dept, '-'),
            Plan: firstNonEmpty(issue.improve_plan, issue.no_improve_reason, '-'),
            Validation: firstNonEmpty(issue.verification_note, reEvaluationRows(issue).length ? `${reEvaluationRows(issue).length} re-evaluation(s)` : '', '-'),
            Evidence: String(issueMedia(issue).length),
          })),
          emptyMessage: 'No issue or failed record is attached to this report.',
        }),
        block('issue_closure:details', 'list', 'Issue details', {
          items: issueSource.slice(0, 12).map((issue) => ({
            label: firstNonEmpty(issue.title, issue.check_item, issue.id),
            value: firstNonEmpty(issue.description, issue.problem_description, issue.improve_plan, 'No detail description'),
            note: firstNonEmpty(issue.responsible_person, issue.category, issue.source_type),
            status: isHighRiskLevel(firstNonEmpty(issue.level, issue.problem_level)) ? 'risk' : 'default',
            media: issueMedia(issue).slice(0, 6),
          })),
          emptyMessage: 'No issue detail is available.',
        }),
        block('issue_closure:re-evaluations', 'list', 'Re-evaluation evidence', {
          items: reEvaluationItems,
          emptyMessage: 'No re-evaluation evidence is attached to these issues.',
        }),
      ],
    }),
    section('function_effect', 'Function effect', recipes.length > 0 ? 'ready' : 'empty', ['recipe_effects', 'effect_evidence'], {
      count: recipes.length,
      blocks: [
        block('function_effect:aggregation', 'table', 'Function effect aggregation', {
          columns: ['Recipe', 'Effect', 'Score', 'Risk', 'Evidence'],
          rows: recipeEffectRows,
          emptyMessage: 'No function or recipe effect has been captured.',
        }),
        block('function_effect:list', 'list', 'Function effects', {
          items: recipes.slice(0, 8).map((recipe) => ({
            label: firstNonEmpty(recipe.name, recipe.id),
            value: firstNonEmpty(recipe.effect_description, isRecord(recipe.effect_ai_result) ? recipe.effect_ai_result.summary : '', 'No effect description'),
            note: firstNonEmpty(recipe.effect_score, recipe.problem_count ? `${recipe.problem_count} problem(s)` : ''),
            status: recipeProblems.some((item) => text(item.id) === text(recipe.id)) ? 'warning' : 'default',
          })),
          emptyMessage: 'No function or recipe effect has been captured.',
        }),
        block('function_effect:steps', 'table', 'Recipe steps and problems', {
          columns: ['Recipe', 'Step', 'Operation', 'Problem', 'Evidence'],
          rows: recipeStepRows.slice(0, 20),
          defaultCollapsed: true,
          collapsedLabel: '展开功能效果评估模板',
          emptyMessage: 'No recipe step detail has been captured.',
        }),
        block('function_effect:step-evidence', 'list', 'Step problem evidence', {
          items: recipes.flatMap((recipe) => rows(recipe.recipe_steps).map((step) => ({
            label: `${firstNonEmpty(recipe.name, recipe.id)} / step ${firstNonEmpty(step.step_number, '')}`,
            value: stepProblemText(step),
            note: firstNonEmpty(step.operation, recipe.recipe_type),
            status: stepProblemText(step) !== '-' ? 'warning' as const : 'default' as const,
            media: stepProblemMedia(step, `${firstNonEmpty(recipe.name, recipe.id)} / step ${firstNonEmpty(step.step_number, '')}`).slice(0, 6),
          }))),
          emptyMessage: 'No step evidence is attached.',
        }),
        block('function_effect:effect-problems', 'list', 'Effect problem points', {
          items: effectProblemItems,
          emptyMessage: 'No effect problem point has been captured.',
        }),
        block('function_effect:media', 'media', 'Function effect media', {
          media: recipeMedia.slice(0, 24),
          emptyMessage: 'No function effect media is attached.',
        }),
      ],
    }),
    section('ai_conclusion', 'AI conclusion', isRecord(content.ai_summary) || isRecord(content.review_overrides) ? 'ready' : 'warning', ['ai_summary'], {
      blocks: [
        block('ai_conclusion:summary', 'summary', 'AI summary', {
          description: firstNonEmpty(aiSummary.summary, 'AI summary is not available.'),
        }),
        block('ai_conclusion:list', 'list', 'AI strengths, risks, and suggestions', {
          items: [
            ...stringArray(aiSummary.strengths).map((strength) => ({ label: 'Strength', value: strength, status: 'positive' as const })),
            ...stringArray(aiSummary.risks).map((risk) => ({ label: 'Risk', value: risk, status: 'risk' as const })),
            ...stringArray(aiSummary.suggestions).map((suggestion) => ({ label: 'Suggestion', value: suggestion })),
            ...(text(aiSummary.historical_position) ? [{ label: 'Historical position', value: text(aiSummary.historical_position) }] : []),
            ...(reviewNote ? [{ label: 'Review note', value: reviewNote, status: 'warning' as const }] : []),
          ],
          emptyMessage: 'No AI finding has been captured.',
        }),
      ],
    }),
    section('source_trace', 'Source trace', 'ready', ['source_tasks', 'source_reports'], {
      blocks: sourceTraceBlocks(report, {}),
    }),
    section('evidence_archive', 'Evidence archive', contentMaterials.length + materials.length > 0 ? 'ready' : 'empty', ['material_archive'], {
      count: contentMaterials.length + materials.length,
      blocks: [
        block('evidence_archive:list', 'list', 'Material archive', {
          items: [...contentMaterials, ...materials].slice(0, 12).map((material) => ({
            label: firstNonEmpty(material.file_name, material.id, material.file_path),
            value: firstNonEmpty(material.media_role, material.material_type, 'material'),
            note: firstNonEmpty(material.record_id, material.recipe_step_id, material.recipe_id, material.task_id),
          })),
          emptyMessage: 'No material is attached to this report.',
        }),
        block('evidence_archive:media', 'media', 'Evidence media', {
          media: mediaItems([...contentMaterials, ...materials]).slice(0, 30),
          emptyMessage: 'No media item is available.',
        }),
      ],
    }),
  ];
}

function comparisonTableRows(snapshotJson: Row) {
  const objects = rows(snapshotJson.objects);
  const itemNodes = rows(snapshotJson.item_nodes);
  const objectName = new Map(objects.map((object) => [text(object.id), firstNonEmpty(object.object_name, object.model, object.id)]));
  const itemName = new Map(itemNodes.map((item) => [text(item.id), firstNonEmpty(item.node_label, item.id)]));
  return rows(snapshotJson.cells).slice(0, 12).map((cell) => ({
    Item: firstNonEmpty(itemName.get(text(cell.item_node_id)), cell.item_node_id),
    Object: firstNonEmpty(objectName.get(text(cell.object_id)), cell.object_id),
    Value: firstNonEmpty(cell.metric_value, cell.manual_score, '-'),
    Score: firstNonEmpty(cell.manual_score, cell.ai_score, '-'),
    Conclusion: firstNonEmpty(cell.effect_summary, cell.conclusion_tag, '-'),
    Problems: stringArray(cell.problem_points).join('; ') || '-',
    Evidence: String([...rows(cell.inline_media), ...rows(cell.appendix_media)].length),
    AI: firstNonEmpty(cell.ai_status, '-'),
    Anomaly: firstNonEmpty(cell.anomaly_reason, cell.metric_anomaly_reason, '-'),
  }));
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

function comparisonMatrix(snapshotJson: Row): ReportDetailMatrix {
  const objects = sortedByOrder(rows(snapshotJson.objects)).map((object): ReportDetailMatrixObject => ({
    id: text(object.id),
    label: firstNonEmpty(object.object_name, object.model, object.id),
    subtitle: firstNonEmpty(object.model, object.project_stage, object.task_id),
    objectType: firstNonEmpty(object.object_type, object.brand),
    isCompetitor: Boolean(object.is_competitor),
  })).filter((object) => Boolean(object.id));
  const objectsById = new Map(objects.map((object) => [object.id, object]));

  const cellByKey = new Map(rows(snapshotJson.cells).map((cell) => [
    `${text(cell.item_node_id)}::${text(cell.object_id)}`,
    cell,
  ]));

  const matrixRows = sortedByOrder(rows(snapshotJson.item_nodes)).map((item): ReportDetailMatrixRow => {
    const cells = Object.fromEntries(objects.map((object) => {
      const cell = cellByKey.get(`${text(item.id)}::${object.id}`) || {};
      const matrixCell: ReportDetailMatrixCell = {
        id: firstNonEmpty(cell.id, `${text(item.id)}:${object.id}`),
        value: firstNonEmpty(cell.metric_value, cell.measurement_value, cell.effect_summary, cell.manual_score, '-'),
        score: firstNonEmpty(cell.manual_score, cell.ai_score),
        conclusion: firstNonEmpty(cell.effect_summary, cell.conclusion, cell.conclusion_tag, '-'),
        conclusionTag: firstNonEmpty(cell.conclusion_tag, cell.status),
        problems: stringArray(cell.problem_points),
        aiStatus: firstNonEmpty(cell.ai_status, cell.ai_confirmation_status),
        anomaly: firstNonEmpty(cell.anomaly_reason, cell.metric_anomaly_reason),
        media: comparisonCellMedia(cell, `${firstNonEmpty(item.node_label, item.id)} / ${object.label}`).slice(0, 6),
      };
      return [object.id, matrixCell];
    }));
    const rowCells = Object.values(cells);
    return {
      id: text(item.id),
      label: firstNonEmpty(item.node_label, item.metric_name, item.id),
      group: firstNonEmpty(item.parent_label, item.node_type, item.depth !== undefined ? `depth ${text(item.depth)}` : ''),
      rowConclusion: comparisonMatrixRowConclusion(rowCells, objectsById),
      cells,
    };
  }).filter((row) => Boolean(row.id));

  return {
    objects,
    rows: matrixRows,
    emptyMessage: 'No comparison matrix data has been captured.',
  };
}

function comparisonDifferenceItems(snapshotJson: Row) {
  const objects = rows(snapshotJson.objects);
  const itemNodes = rows(snapshotJson.item_nodes);
  const objectName = new Map(objects.map((object) => [text(object.id), firstNonEmpty(object.object_name, object.model, object.id)]));
  const itemName = new Map(itemNodes.map((item) => [text(item.id), firstNonEmpty(item.node_label, item.id)]));
  return rows(snapshotJson.cells)
    .filter((cell) => text(cell.conclusion_tag) === 'risk' || stringArray(cell.problem_points).length > 0 || text(cell.anomaly_reason) || text(cell.metric_anomaly_reason))
    .slice(0, 12)
    .map((cell) => ({
      label: `${firstNonEmpty(itemName.get(text(cell.item_node_id)), cell.item_node_id)} / ${firstNonEmpty(objectName.get(text(cell.object_id)), cell.object_id)}`,
      value: firstNonEmpty(cell.effect_summary, stringArray(cell.problem_points).join('; '), cell.anomaly_reason, cell.metric_anomaly_reason, 'Risk cell needs review'),
      note: firstNonEmpty(cell.conclusion_tag, cell.metric_value, cell.manual_score),
      status: 'risk' as const,
      media: comparisonCellMedia(cell, firstNonEmpty(cell.id, cell.object_id)).slice(0, 6),
    }));
}

function comparisonCellEvidenceItems(snapshotJson: Row) {
  const objects = rows(snapshotJson.objects);
  const itemNodes = rows(snapshotJson.item_nodes);
  const objectName = new Map(objects.map((object) => [text(object.id), firstNonEmpty(object.object_name, object.model, object.id)]));
  const itemName = new Map(itemNodes.map((item) => [text(item.id), firstNonEmpty(item.node_label, item.id)]));
  return rows(snapshotJson.cells)
    .filter((cell) => comparisonCellMedia(cell).length > 0)
    .slice(0, 12)
    .map((cell) => ({
      label: `${firstNonEmpty(itemName.get(text(cell.item_node_id)), cell.item_node_id)} / ${firstNonEmpty(objectName.get(text(cell.object_id)), cell.object_id)}`,
      value: firstNonEmpty(cell.effect_summary, cell.metric_value, cell.manual_score, 'Cell evidence'),
      note: firstNonEmpty(cell.conclusion_tag, cell.ai_status),
      status: text(cell.conclusion_tag) === 'risk' ? 'risk' as const : 'default' as const,
      media: comparisonCellMedia(cell, firstNonEmpty(cell.id, cell.object_id)).slice(0, 6),
    }));
}

function comparisonAiItems(report: Row, snapshotJson: Row) {
  const snapshotAi = rows(snapshotJson.confirmed_ai_results).map((result) => ({
    label: firstNonEmpty(result.scope, result.id, 'AI result'),
    value: firstNonEmpty(result.summary, result.conclusion, result.status),
    note: firstNonEmpty(result.status, result.updated_at),
    status: text(result.status) === 'rejected' ? 'risk' as const : 'default' as const,
  }));
  const cellAi = rows(snapshotJson.cells)
    .filter((cell) => text(cell.ai_status) || text(cell.ai_summary) || text(cell.ai_score))
    .slice(0, 12)
    .map((cell) => ({
      label: firstNonEmpty(cell.id, 'Cell AI'),
      value: firstNonEmpty(cell.ai_summary, cell.effect_summary, cell.ai_score, cell.ai_status),
      note: firstNonEmpty(cell.ai_status, cell.conclusion_tag),
      status: text(cell.ai_status) === 'rejected' ? 'risk' as const : 'default' as const,
    }));
  if (snapshotAi.length || cellAi.length) return [...snapshotAi, ...cellAi];
  return [{
    label: 'Report AI status',
    value: `Report AI is ${firstNonEmpty(report.ai_confirmation_status, 'pending')}. Formal publish and PDF require confirmed AI.`,
    status: text(report.ai_confirmation_status) === 'confirmed' ? 'positive' as const : 'warning' as const,
  }];
}

function sourceReportIds(report: Row, snapshotJson: Row) {
  return sourceIds(report, snapshotJson).sourceReportIds;
}

function modelStageRows(report: Row, content: Row, snapshotJson: Row) {
  const explicitStages = rows(snapshotJson.stages);
  if (explicitStages.length > 0) {
    return explicitStages.map((stage, index) => ({
      Stage: firstNonEmpty(stage.stage, stage.project_phase, `Stage ${index + 1}`),
      Report: firstNonEmpty(stage.report_title, stage.report_id, '-'),
      Task: firstNonEmpty(stage.task_name, stage.task_id, '-'),
      Date: firstNonEmpty(stage.test_date, stage.created_at, '-'),
      Status: firstNonEmpty(stage.status, '-'),
      Source: firstNonEmpty(stage.source_report_id, stage.report_id, '-'),
    }));
  }

  const task = isRecord(content.task) ? content.task : {};
  const reports = sourceReportIds(report, snapshotJson);
  return (reports.length > 0 ? reports : [text(report.id)]).map((sourceReportId, index) => ({
    Stage: firstNonEmpty(index === reports.length - 1 ? report.project_phase : '', task.project_phase, report.project_phase, `Stage ${index + 1}`),
    Report: firstNonEmpty(index === reports.length - 1 ? report.title : '', sourceReportId),
    Task: firstNonEmpty(task.task_name, task.id, report.task_id, '-'),
    Date: firstNonEmpty(task.test_date, report.created_at, '-'),
    Status: firstNonEmpty(report.status, '-'),
    Source: sourceReportId,
  }));
}

function modelIssueEvolutionRows(content: Row, snapshotJson: Row) {
  const explicitRows = rows(snapshotJson.issue_evolution);
  if (explicitRows.length > 0) {
    return explicitRows.map((item) => ({
      Stage: firstNonEmpty(item.stage, item.project_phase, '-'),
      Issue: firstNonEmpty(item.issue, item.title, item.check_item, '-'),
      Level: firstNonEmpty(item.level, item.problem_level, '-'),
      Status: firstNonEmpty(item.status, item.evaluation_result, '-'),
      Action: firstNonEmpty(item.action, item.improve_plan, '-'),
      Evidence: firstNonEmpty(item.evidence, item.source_report_id, '-'),
    }));
  }

  return rows(content.records).map((record) => ({
    Stage: firstNonEmpty(record.project_phase, record.test_phase, '-'),
    Issue: firstNonEmpty(record.check_item, record.id, '-'),
    Level: firstNonEmpty(record.problem_level, record.level, '-'),
    Status: firstNonEmpty(record.evaluation_result, '-'),
    Action: firstNonEmpty(record.improve_plan, record.problem_description, '-'),
    Evidence: String(rows(record.materials).length),
  }));
}

function modelEffectEvolutionItems(content: Row, snapshotJson: Row) {
  const explicitItems = rows(snapshotJson.function_effect_evolution);
  if (explicitItems.length > 0) {
    return explicitItems.map((item) => ({
      label: firstNonEmpty(item.name, item.function_name, item.stage, 'Function effect'),
      value: firstNonEmpty(item.effect_description, item.summary, item.effect_score, 'No effect summary'),
      note: firstNonEmpty(item.stage, item.effect_score, item.source_report_id),
      status: text(item.status) === 'risk' ? 'risk' as const : 'default' as const,
    }));
  }

  return rows(content.recipes).map((recipe) => ({
    label: firstNonEmpty(recipe.name, recipe.id),
    value: firstNonEmpty(recipe.effect_description, 'No effect description'),
    note: firstNonEmpty(recipe.effect_score, recipe.recipe_type, ''),
    status: text(recipe.effect_problem_point) ? 'warning' as const : 'default' as const,
  }));
}

function riskItems(content: Row, snapshotJson: Row) {
  const explicitRisks = stringArray(snapshotJson.current_risks);
  const summaryRisks = stringArray(aiSummaryOf(content).risks);
  return [...explicitRisks, ...summaryRisks].map((risk) => ({ label: 'Risk', value: risk, status: 'risk' as const }));
}

function validationItems(content: Row, snapshotJson: Row) {
  const explicitItems = stringArray(snapshotJson.next_validation_items);
  const suggestions = stringArray(aiSummaryOf(content).suggestions);
  return [...explicitItems, ...suggestions].map((suggestion) => ({ label: 'Validation', value: suggestion }));
}

function customSourceAlignmentRows(report: Row, content: Row, snapshotJson: Row) {
  const explicitRows = rows(snapshotJson.source_alignment);
  if (explicitRows.length > 0) {
    return explicitRows.map((item) => ({
      Source: firstNonEmpty(item.source_report_id, item.report_id, '-'),
      Report: firstNonEmpty(item.report_title, item.title, '-'),
      Task: firstNonEmpty(item.task_name, item.task_id, '-'),
      Scope: firstNonEmpty(item.scope, item.project_type, '-'),
      Coverage: firstNonEmpty(item.coverage, item.status, '-'),
    }));
  }

  const task = isRecord(content.task) ? content.task : {};
  const reports = sourceReportIds(report, snapshotJson);
  return reports.map((sourceReportId, index) => ({
    Source: sourceReportId,
    Report: firstNonEmpty(index === reports.length - 1 ? report.title : '', sourceReportId),
    Task: firstNonEmpty(task.task_name, task.id, report.task_id, '-'),
    Scope: firstNonEmpty(task.project_type, report.project_type, '-'),
    Coverage: index === reports.length - 1 ? 'current content attached' : 'source reference only',
  }));
}

function customFieldAlignmentRows(report: Row, content: Row, snapshotJson: Row) {
  const explicitRows = rows(snapshotJson.field_alignment);
  if (explicitRows.length > 0) {
    return explicitRows.map((item) => ({
      Field: firstNonEmpty(item.field, item.label, '-'),
      Status: firstNonEmpty(item.status, '-'),
      Source: firstNonEmpty(item.source, item.source_report_id, '-'),
      Gap: firstNonEmpty(item.gap, item.note, '-'),
    }));
  }

  const fields = [
    { field: 'task', present: isRecord(content.task), source: 'content.task' },
    { field: 'records', present: rows(content.records).length > 0, source: 'content.records' },
    { field: 'recipes', present: rows(content.recipes).length > 0, source: 'content.recipes' },
    { field: 'issues', present: rows(content.issues).length > 0, source: 'content.issues' },
    { field: 'source reports', present: sourceReportIds(report, snapshotJson).length > 0, source: 'reports.source_report_ids' },
  ];
  return fields.map((item) => ({
    Field: item.field,
    Status: item.present ? 'covered' : 'missing',
    Source: item.source,
    Gap: item.present ? '-' : 'needs structured source mapping or manual validation',
  }));
}

function comparisonSections(report: Row, snapshotJson: Row, layoutProfile: string): ReportDetailSection[] {
  const objects = rows(snapshotJson.objects);
  const cells = rows(snapshotJson.cells);
  const itemNodes = rows(snapshotJson.item_nodes);
  const metricDefinitions = rows(snapshotJson.metric_definitions);
  const metric = layoutProfile.includes('metric');
  const mixed = layoutProfile.includes('mixed');
  const differenceItems = comparisonDifferenceItems(snapshotJson);
  const cellEvidenceItems = comparisonCellEvidenceItems(snapshotJson);
  const aiItems = comparisonAiItems(report, snapshotJson);
  const horizontalMatrix = comparisonMatrix(snapshotJson);

  return [
    section('overview', 'Overview', 'ready', ['object_strip', 'test_conditions', 'comparability'], {
      blocks: [
        block('overview:summary', 'summary', 'Comparison intent', {
          description: firstNonEmpty(
            isRecord(snapshotJson.assembly) ? snapshotJson.assembly.comparison_intent : '',
            isRecord(snapshotJson.assembly) ? snapshotJson.assembly.name : '',
            report.title,
          ),
        }),
        block('overview:facts', 'facts', 'Comparison facts', {
          items: compact([
            fact('Objects', objects.length),
            fact('Items', itemNodes.length),
            fact('Cells', cells.length),
            fact('Layout profile', layoutProfile),
            fact('Primary task', snapshotJson.primary_task_id),
          ]),
        }),
        block('overview:objects', 'facts', 'Object strip', {
          items: objects.map((object) => ({
            label: firstNonEmpty(object.object_name, object.model, object.id),
            value: firstNonEmpty(object.object_type, object.brand, 'object'),
            note: firstNonEmpty(object.model, object.project_stage, object.task_id),
            status: object.is_competitor ? 'warning' : 'default',
          })),
          emptyMessage: 'No comparison object is attached.',
        }),
        block('overview:comparability', 'summary', 'Comparability boundary', {
          description: firstNonEmpty(
            snapshotJson.comparability_statement,
            isRecord(snapshotJson.assembly) ? snapshotJson.assembly.comparability_statement : '',
            'Objects are compared within the captured task/snapshot context. Treat conclusions as evidence-backed comparison, not uncontrolled absolute ranking.',
          ),
        }),
      ],
    }),
    section(metric ? 'metric_table' : mixed ? 'mixed_matrix' : 'image_matrix', metric ? 'Metric comparison' : mixed ? 'Mixed comparison' : 'Image matrix', cells.length > 0 ? 'ready' : 'empty', [
      metric ? 'comparison_metric_table' : mixed ? 'comparison_mixed_matrix' : 'comparison_image_matrix',
      'cell_evidence',
    ], {
      count: cells.length,
      blocks: compact([
        block(metric ? 'metric_table:matrix' : 'comparison_matrix:horizontal', 'matrix', metric ? 'Metric comparison matrix' : 'Multi-model comparison matrix', {
          description: 'Rows are dimensions or metrics; columns are product/model/material/config objects. Cell media can be reviewed inline and is reused by A3 PDF output.',
          matrix: horizontalMatrix,
          emptyMessage: horizontalMatrix.emptyMessage,
        }),
        block(metric ? 'metric_table:table' : 'comparison_matrix:table', 'table', metric ? 'Metric comparison table' : 'Comparison matrix', {
          columns: metric
            ? ['Item', 'Object', 'Value', 'Score', 'Conclusion', 'Problems', 'Evidence', 'AI', 'Anomaly']
            : ['Item', 'Object', 'Value', 'Score', 'Conclusion', 'Problems', 'Evidence', 'AI'],
          rows: comparisonTableRows(snapshotJson),
          emptyMessage: 'No comparison cells have been captured.',
        }),
        metricDefinitions.length > 0 && block('metric_table:definitions', 'table', 'Metric definitions', {
          columns: ['Metric', 'Formula', 'Threshold'],
          rows: metricDefinitions.map((definition) => ({
            Metric: firstNonEmpty(definition.label, definition.key),
            Formula: firstNonEmpty(definition.formula, '-'),
            Threshold: firstNonEmpty(definition.threshold, '-'),
          })),
        }),
        block(metric ? 'metric_table:differences' : 'comparison_matrix:differences', 'list', 'Key differences and risks', {
          items: differenceItems,
          emptyMessage: 'No risk or difference cell has been captured.',
        }),
        block(metric ? 'metric_table:cell-evidence' : 'comparison_matrix:cell-evidence', 'list', 'Cell evidence', {
          items: cellEvidenceItems,
          emptyMessage: 'No inline cell evidence has been captured.',
        }),
      ]),
    }),
    section('row_conclusions', 'Row conclusions', itemNodes.length > 0 ? 'ready' : 'empty', ['row_conclusion_list'], {
      count: itemNodes.length,
      blocks: [
        block('row_conclusions:list', 'list', 'Rows and dimensions', {
          items: itemNodes.map((item) => ({
            label: firstNonEmpty(item.node_label, item.id),
            value: firstNonEmpty(item.node_type, 'item'),
            note: item.depth !== undefined ? `depth ${text(item.depth)}` : undefined,
          })),
          emptyMessage: 'No row-level comparison dimension has been captured.',
        }),
      ],
    }),
    section('ai_conclusion', 'AI conclusion', text(report.ai_confirmation_status) === 'confirmed' ? 'ready' : 'blocked', ['cell_ai', 'row_ai', 'report_ai'], {
      blocks: [
        block('ai_conclusion:list', 'list', 'AI confirmation boundary', {
          items: aiItems,
          emptyMessage: 'No AI result is attached to this comparison snapshot.',
        }),
      ],
    }),
    section('source_trace', 'Source trace', 'ready', ['source_tasks', 'source_reports'], {
      blocks: sourceTraceBlocks(report, snapshotJson),
    }),
    section('evidence_archive', 'Evidence archive', objects.length > 0 ? 'ready' : 'empty', ['comparison_archive'], {
      count: objects.length,
      blocks: [
        block('evidence_archive:list', 'list', 'Comparison objects', {
          items: objects.map((object) => ({
            label: firstNonEmpty(object.object_name, object.model, object.id),
            value: firstNonEmpty(object.object_type, 'object'),
            note: firstNonEmpty(object.model, object.task_id),
          })),
          emptyMessage: 'No comparison object is attached to this snapshot.',
        }),
      ],
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
    section('model_dossier', 'Model dossier', 'ready', ['model_header', 'current_conclusion'], {
      blocks: [
        block('model_dossier:facts', 'facts', 'Model dossier', {
          items: compact([
            fact('Model', report.product_model),
            fact('Project type', report.project_type),
            fact('Project phase', report.project_phase),
            fact('Current report', report.title),
            fact('Source reports', sources.sourceReportIds.join(', ')),
            fact('Source tasks', sources.sourceTaskIds.join(', ')),
          ]),
        }),
        block('model_dossier:comparability', 'summary', 'Comparability boundary', {
          description: firstNonEmpty(
            snapshotJson.comparability_statement,
            'Stages are chained by model and source report references. Use this as an evolution dossier; do not treat weakly aligned stages as direct ranking evidence.',
          ),
        }),
      ],
    }),
    section('stage_timeline', 'Stage timeline', stageRows.length > 0 ? 'ready' : 'warning', ['stage_cards', 'source_trace'], {
      count: stageRows.length,
      blocks: [
        block('stage_timeline:table', 'table', 'Stage timeline', {
          columns: ['Stage', 'Report', 'Task', 'Date', 'Status', 'Source'],
          rows: stageRows,
          emptyMessage: 'No source report stage has been attached.',
        }),
      ],
    }),
    section('issue_evolution', 'Issue evolution', issueRows.length > 0 ? 'ready' : 'empty', ['issue_evolution_table'], {
      count: issueRows.length,
      blocks: [
        block('issue_evolution:table', 'table', 'Issue evolution', {
          columns: ['Stage', 'Issue', 'Level', 'Status', 'Action', 'Evidence'],
          rows: issueRows,
          emptyMessage: 'No issue evolution record has been captured.',
        }),
      ],
    }),
    section('function_effect_evolution', 'Function effect evolution', effectItems.length > 0 ? 'ready' : 'empty', ['function_effect_timeline'], {
      count: effectItems.length,
      blocks: [
        block('function_effect_evolution:list', 'list', 'Function effect evolution', {
          items: effectItems,
          emptyMessage: 'No function effect evolution has been captured.',
        }),
      ],
    }),
    section('current_risks', 'Current risks', risks.length > 0 ? 'ready' : 'empty', ['risk_summary'], {
      blocks: [
        block('current_risks:list', 'list', 'Current risks', {
          items: risks,
          emptyMessage: 'No current risk has been captured.',
        }),
      ],
    }),
    section('next_validation', 'Next-stage validation', validations.length > 0 ? 'ready' : 'warning', ['validation_next_steps'], {
      blocks: [
        block('next_validation:list', 'list', 'Next-stage validation', {
          items: validations,
          emptyMessage: 'No next-stage validation item has been captured.',
        }),
      ],
    }),
    section('source_trace', 'Source reports', 'ready', ['source_reports'], {
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
    section('merge_purpose', 'Merge purpose', 'ready', ['merge_goal'], {
      blocks: [
        block('merge_purpose:summary', 'summary', 'Merge purpose', {
          description: firstNonEmpty(content.summary, aiSummaryOf(content).summary, report.title),
        }),
      ],
    }),
    section('source_alignment', 'Source alignment', sourceAlignmentRows.length > 0 ? 'ready' : 'warning', ['source_report_list', 'source_alignment_table'], {
      count: sourceAlignmentRows.length,
      blocks: [
        block('source_alignment:table', 'table', 'Source alignment', {
          columns: ['Source', 'Report', 'Task', 'Scope', 'Coverage'],
          rows: sourceAlignmentRows,
          emptyMessage: 'No source report has been attached.',
        }),
        block('source_alignment:list', 'list', 'Source reports', {
          items: sourceReports.map((sourceReportId) => ({ label: sourceReportId, value: 'source report' })),
          emptyMessage: 'No source report has been attached.',
        }),
      ],
    }),
    section('field_alignment', 'Field alignment', fieldAlignmentRows.some((row) => row.Status === 'missing') ? 'warning' : 'ready', ['field_alignment_table'], {
      summary: 'Field-level coverage is shown before synthesis so reviewers can see what is comparable and what still needs validation.',
      blocks: [
        block('field_alignment:table', 'table', 'Field alignment', {
          columns: ['Field', 'Status', 'Source', 'Gap'],
          rows: fieldAlignmentRows,
        }),
      ],
    }),
    section('comparability_boundary', 'Comparability boundary', 'warning', ['comparability_statement'], {
      blocks: [
        block('comparability_boundary:summary', 'summary', 'Comparability boundary', {
          description: 'Source reports may differ by phase, owner, field completeness, and evidence quality. Treat cross-source conclusions as synthesis, not raw one-to-one comparison.',
        }),
      ],
    }),
    section('synthesis', 'Synthesis', hasAny(content.ai_summary, content.summary) ? 'ready' : 'empty', ['synthesis_summary'], {
      blocks: [
        block('synthesis:summary', 'summary', 'Synthesis', {
          description: firstNonEmpty(aiSummaryOf(content).summary, content.summary),
        }),
      ],
    }),
    section('gaps', 'Gaps', 'warning', ['missing_fields'], {
      blocks: [
        block('gaps:list', 'list', 'Known gaps', {
          items: fieldAlignmentRows
            .filter((row) => row.Status === 'missing')
            .map((row) => ({ label: row.Field, value: row.Gap, note: row.Source, status: 'warning' as const })),
          emptyMessage: 'No missing merge field has been detected.',
        }),
      ],
    }),
    section('validation_suggestions', 'Validation suggestions', validations.length > 0 ? 'ready' : 'warning', ['validation_next_steps'], {
      blocks: [
        block('validation_suggestions:list', 'list', 'Validation next steps', {
          items: validations,
          emptyMessage: 'No validation suggestion has been captured.',
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
  if (reportType === 'comparison_report') return comparisonSections(report, snapshotJson, layoutProfile);
  if (reportType === 'model_merged_report') return modelSections(report, content, snapshotJson);
  if (reportType === 'custom_merged_report') return customSections(report, content, snapshotJson);
  return contentSections(report, content, issues, materials);
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
    slots.push(evidenceSlot(
      `comparison_cell:${text(cell.id)}`,
      'comparison_cell',
      text(cell.id),
      'cell_evidence',
      [...inline, ...appendix].map(materialId).filter(Boolean),
      Boolean(cell.problem_points) || text(cell.conclusion_tag) === 'risk',
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
  ]));
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
    errors.push(preflightIssue('missing_required_evidence', 'error', `${missingRequired.length} required evidence slot(s) are missing.`, 'Add or reconnect the required evidence before exporting PDF.'));
  }
  if (aiStatus === 'pending' || aiStatus === 'generated') {
    errors.push(preflightIssue('ai_unconfirmed', 'error', 'AI conclusion is not manually confirmed.', 'Confirm or replace AI conclusions before formal PDF delivery.'));
  }
  if (videoWithoutCover.length > 0) {
    errors.push(preflightIssue('video_cover_missing', 'error', `${videoWithoutCover.length} inline video evidence item(s) may not have a printable cover.`, 'Attach a cover image or move the video to appendix-only evidence.'));
  }
  if ((profile.paper === 'A3' && maxColumns > 9) || (profile.paper === 'A4' && maxColumns > 6)) {
    warnings.push(preflightIssue('matrix_over_wide', 'warning', `The widest print table has ${maxColumns} columns.`, 'Split wide matrices or verify the A3 landscape profile before delivery.'));
  }
  if (input.snapshot && text(snapshotStatus).toLowerCase() !== 'published') {
    warnings.push(preflightIssue('snapshot_unpublished', 'warning', 'The latest snapshot is not marked as published.', 'Publish or confirm the snapshot before treating the PDF as a formal deliverable.'));
  }
  if (!input.snapshot && reportType === 'comparison_report') {
    errors.push(preflightIssue('snapshot_missing', 'error', 'Comparison report is missing a snapshot.', 'Generate a report snapshot before PDF export.'));
  } else if (!input.snapshot) {
    warnings.push(preflightIssue('content_json_fallback', 'warning', 'No snapshot is attached; print preview uses current report content.', 'Publish a snapshot to freeze the formal delivery version.'));
  }
  for (const check of input.qualityChecks.filter((check) => check.severity === 'error')) {
    if (errors.some((item) => item.code === check.code)) continue;
    errors.push(preflightIssue(check.code, 'error', check.message, 'Resolve the blocking quality check before export.'));
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
      label: 'Confirm AI',
      priority: 'primary',
      enabled: aiStatus === 'pending' || aiStatus === 'generated',
      reason: aiStatus === 'confirmed' ? 'AI is already confirmed.' : undefined,
    },
    {
      type: 'publish',
      label: 'Publish snapshot',
      priority: 'primary',
      enabled: !hasErrors && aiStatus === 'confirmed',
      reason: hasErrors ? 'Blocking quality checks exist.' : aiStatus !== 'confirmed' ? 'AI is not confirmed.' : undefined,
    },
    {
      type: latestPdfFailed ? 'retry_pdf' : 'export_pdf',
      label: latestPdfFailed ? 'Retry PDF' : 'Export PDF',
      priority: 'secondary',
      enabled: !hasErrors && aiStatus === 'confirmed',
      reason: aiStatus !== 'confirmed' ? 'AI is not confirmed.' : undefined,
    },
    {
      type: 'share',
      label: 'Share',
      priority: 'secondary',
      enabled: !hasErrors,
    },
    {
      type: 'view_source',
      label: 'View source',
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
    checks.push({ code: 'missing_comparison_snapshot', severity: 'error', message: 'Comparison report is missing a renderable snapshot.' });
  }
  if (reportType !== 'comparison_report' && !isRecord(report.content)) {
    checks.push({ code: 'missing_report_content', severity: 'error', message: 'Report is missing content JSON.' });
  }
  if (sources.sourceTaskIds.length === 0 && sources.sourceReportIds.length === 0) {
    checks.push({ code: 'missing_sources', severity: 'warning', message: 'Report has no source task or source report.' });
  }
  if (aiStatus === 'pending' || aiStatus === 'generated') {
    checks.push({ code: 'ai_unconfirmed', severity: 'error', message: 'AI conclusion is not manually confirmed; formal publish and PDF delivery are blocked.' });
  }
  if (aiStatus === 'rejected') {
    checks.push({ code: 'ai_rejected', severity: 'warning', message: 'AI conclusion was rejected and needs a manual conclusion.' });
  }
  const missingRequiredEvidence = evidenceSlots.filter((slot) => slot.required && slot.status === 'missing');
  if (missingRequiredEvidence.length > 0) {
    checks.push({ code: 'missing_required_evidence', severity: 'error', message: `${missingRequiredEvidence.length} required evidence slot(s) are missing.` });
  }
  const openHighRiskIssues = issues.filter((issue) => isHighRiskLevel(text(issue.level)) && !isClosedStatus(text(issue.status)));
  if (openHighRiskIssues.length > 0) {
    checks.push({ code: 'open_high_risk_issues', severity: 'warning', message: `${openHighRiskIssues.length} high-risk issue(s) are still open.` });
  }
  const failedPdf = pdfJobs.find((job) => text(job.report_id) === text(report.id) && text(job.status) === 'failed');
  if (failedPdf) {
    checks.push({ code: 'pdf_failed', severity: 'warning', message: text(failedPdf.error_message, 'PDF generation failed and needs a retry.') });
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
  return {
    header: buildHeader(report, snapshot),
    conclusion: conclusionFrom(report, issues),
    sections,
    evidenceSlots,
    actions: buildActions(report, qualityChecks, pdfJobs),
    qualityChecks,
    printDelivery: buildPrintDelivery({ report, snapshot, sections, evidenceSlots, qualityChecks, pdfJobs }),
  };
}
