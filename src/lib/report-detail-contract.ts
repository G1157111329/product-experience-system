import type { GoldenTestData } from './golden-test-data';

export type ContractDisposition = 'required_now' | 'content_json_fallback' | 'later_structural_migration';

export type DetailContractInventoryItem = {
  area: string;
  field: string;
  disposition: ContractDisposition;
  currentCarrier: string;
  note: string;
};

export type GoldenContractEvaluation = {
  gaps: string[];
  inventory: DetailContractInventoryItem[];
};

const REQUIRED_REPORT_TYPES = [
  'single_report',
  'comparison_report',
  'model_merged_report',
  'custom_merged_report',
] as const;

const REQUIRED_LAYOUT_PROFILES = [
  'single_a4_portrait',
  'comparison_image_matrix_a3_landscape',
  'comparison_metric_table_a3_landscape',
  'model_merged_a4_portrait',
  'custom_merged_a4_portrait',
] as const;

const REQUIRED_AI_STATUSES = ['pending', 'generated', 'confirmed', 'rejected', 'not_applicable'] as const;

export const V26_DETAIL_CONTRACT_INVENTORY: DetailContractInventoryItem[] = [
  {
    area: 'Header',
    field: 'report_type',
    disposition: 'required_now',
    currentCarrier: 'reports.report_type / report_snapshots.report_type',
    note: 'Determines the top-level report asset family.',
  },
  {
    area: 'Header',
    field: 'layout_profile',
    disposition: 'required_now',
    currentCarrier: 'reports.layout_profile / report_snapshots.layout_profile',
    note: 'Selects the detail template and PDF profile.',
  },
  {
    area: 'Header',
    field: 'source_task_ids/source_report_ids',
    disposition: 'required_now',
    currentCarrier: 'reports JSONB columns and comparison_assemblies JSONB columns',
    note: 'Supports source tracing and merge boundaries.',
  },
  {
    area: 'Conclusion',
    field: 'key_conclusion/recommended_next_action',
    disposition: 'content_json_fallback',
    currentCarrier: 'reports.content.ai_summary plus dashboard derivation',
    note: 'Can be normalized later after detail shell is stable.',
  },
  {
    area: 'Sections',
    field: 'section_key/block_key',
    disposition: 'content_json_fallback',
    currentCarrier: 'Derived from report_type, layout_profile, content, issues, recipes, and comparison assembly',
    note: 'System templates should derive sections before adding configurable tables.',
  },
  {
    area: 'Evidence',
    field: 'evidence_slot.role',
    disposition: 'required_now',
    currentCarrier: 'materials.media_role plus record/recipe/issue/re_evaluation/comparison_cell foreign keys',
    note: 'Prevents appendix-only evidence for key business objects.',
  },
  {
    area: 'AI',
    field: 'ai_confirmation_status',
    disposition: 'required_now',
    currentCarrier: 'reports.ai_confirmation_status and comparison_ai_results.status',
    note: 'Blocks formal publish/PDF when AI is unconfirmed.',
  },
  {
    area: 'PDF',
    field: 'pdf_profile/preflight_result',
    disposition: 'required_now',
    currentCarrier: 'pdf_generation_jobs.layout_profile and preflight_result',
    note: 'Separates web reading from PDF delivery.',
  },
  {
    area: 'Metrics',
    field: 'formula_version/threshold/anomaly_reason',
    disposition: 'later_structural_migration',
    currentCarrier: 'comparison_matrix_cells and snapshot_json until metric definitions are normalized',
    note: 'V2.6 Golden Test must still include a metric-table report shape.',
  },
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringValue(value: unknown) {
  return typeof value === 'string' ? value : '';
}

function reportLabel(report: Record<string, unknown>) {
  return stringValue(report.id) || stringValue(report.title) || 'unknown-report';
}

function hasLayout(data: GoldenTestData, layoutProfile: string) {
  return data.reports.some((report) => report.layout_profile === layoutProfile);
}

function hasReportType(data: GoldenTestData, reportType: string) {
  return data.reports.some((report) => report.report_type === reportType);
}

function hasSnapshotForReport(data: GoldenTestData, reportId: string) {
  return data.snapshots.some((snapshot) => snapshot.report_id === reportId);
}

function pushMissingReportField(gaps: string[], report: Record<string, unknown>, field: string) {
  if (report[field] === undefined || report[field] === null || report[field] === '') {
    gaps.push(`${reportLabel(report)} is missing ${field}`);
  }
}

export function evaluateGoldenDetailContract(data: GoldenTestData): GoldenContractEvaluation {
  const gaps: string[] = [];

  for (const reportType of REQUIRED_REPORT_TYPES) {
    if (!hasReportType(data, reportType)) gaps.push(`Golden data is missing report_type=${reportType}`);
  }

  for (const layoutProfile of REQUIRED_LAYOUT_PROFILES) {
    if (!hasLayout(data, layoutProfile)) gaps.push(`Golden data is missing layout_profile=${layoutProfile}`);
  }

  for (const report of data.reports as Array<Record<string, unknown>>) {
    pushMissingReportField(gaps, report, 'id');
    pushMissingReportField(gaps, report, 'title');
    pushMissingReportField(gaps, report, 'task_id');
    pushMissingReportField(gaps, report, 'report_type');
    pushMissingReportField(gaps, report, 'layout_profile');
    pushMissingReportField(gaps, report, 'ai_confirmation_status');

    const sourceTaskIds = arrayValue(report.source_task_ids);
    const sourceReportIds = arrayValue(report.source_report_ids);
    if (sourceTaskIds.length === 0 && sourceReportIds.length === 0) {
      gaps.push(`${reportLabel(report)} must include source_task_ids or source_report_ids`);
    }

    const reportType = stringValue(report.report_type);
    const snapshotId = stringValue(report.snapshot_id);
    if (snapshotId && !hasSnapshotForReport(data, stringValue(report.id))) {
      gaps.push(`${reportLabel(report)} references snapshot_id=${snapshotId} but no matching snapshot exists`);
    }
    if (reportType !== 'comparison_report' && report.content === null) {
      gaps.push(`${reportLabel(report)} must have content or a derived non-comparison detail source`);
    }
  }

  const reportsWithPendingAi = data.reports.filter((report) => report.ai_confirmation_status === 'pending');
  if (reportsWithPendingAi.length === 0) gaps.push('Golden data should include at least one pending AI report');

  const reportsWithConfirmedAi = data.reports.filter((report) => report.ai_confirmation_status === 'confirmed');
  if (reportsWithConfirmedAi.length === 0) gaps.push('Golden data should include at least one confirmed AI report');

  const mediaRoles = new Set(data.materials.map((material) => material.media_role).filter(Boolean));
  if (!mediaRoles.has('inline_evidence')) gaps.push('Golden materials should include media_role=inline_evidence');

  const comparisonAssemblies = [data.comparison, data.metricComparison]
    .map((comparison) => comparison?.assembly)
    .filter(isRecord);
  if (comparisonAssemblies.length < 2) gaps.push('Golden data should include image-matrix and metric-table comparison assemblies');

  const comparisonCells = [...data.comparison.cells, ...data.metricComparison.cells];
  if (comparisonCells.length < 6) gaps.push('Golden comparison data should include at least six cells across image and metric samples');

  const metricCells = data.metricComparison.cells.filter((cell) => {
    return Boolean(cell.metric_value || cell.manual_score || cell.effect_summary);
  });
  if (metricCells.length < 2) gaps.push('Golden metric comparison should include metric cell values');

  for (const snapshot of data.snapshots as Array<Record<string, unknown>>) {
    pushMissingReportField(gaps, snapshot, 'report_id');
    pushMissingReportField(gaps, snapshot, 'report_type');
    pushMissingReportField(gaps, snapshot, 'layout_profile');
    if (!isRecord(snapshot.snapshot_json)) gaps.push(`${reportLabel(snapshot)} snapshot_json must be an object`);
  }

  for (const job of data.pdfJobs as Array<Record<string, unknown>>) {
    pushMissingReportField(gaps, job, 'report_id');
    pushMissingReportField(gaps, job, 'snapshot_id');
    pushMissingReportField(gaps, job, 'layout_profile');
    pushMissingReportField(gaps, job, 'status');
  }

  const supportedStatuses = new Set<string>(REQUIRED_AI_STATUSES);
  for (const report of data.reports) {
    const status = stringValue(report.ai_confirmation_status);
    if (status && !supportedStatuses.has(status)) {
      gaps.push(`${report.id} has unsupported ai_confirmation_status=${status}`);
    }
  }

  return { gaps, inventory: V26_DETAIL_CONTRACT_INVENTORY };
}

export function assertGoldenDetailContract(data: GoldenTestData) {
  const result = evaluateGoldenDetailContract(data);
  if (result.gaps.length > 0) {
    throw new Error(`Golden detail contract gaps:\n- ${result.gaps.join('\n- ')}`);
  }
  return result;
}

export function requiredReportTypes() {
  return [...REQUIRED_REPORT_TYPES];
}

export function requiredLayoutProfiles() {
  return [...REQUIRED_LAYOUT_PROFILES];
}
