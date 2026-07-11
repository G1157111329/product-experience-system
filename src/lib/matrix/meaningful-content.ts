type UnknownRecord = Record<string, unknown>;

/** A trimmed string, or a scalar explicitly supplied by the user. */
export function nonBlank(value: unknown): boolean {
  if (typeof value === 'string') return value.trim().length > 0;
  return typeof value === 'number' && Number.isFinite(value) || typeof value === 'boolean';
}

/** True when a list contains at least one non-blank item or item text. */
export function nonBlankList(value: unknown): boolean {
  if (!Array.isArray(value)) return false;
  return value.some((item) => {
    if (nonBlank(item)) return true;
    if (!item || typeof item !== 'object') return false;
    const record = item as UnknownRecord;
    return nonBlank(record.text) || nonBlank(record.content) || nonBlank(record.value);
  });
}

function meaningfulParam(value: unknown): boolean {
  if (nonBlank(value)) return true;
  if (Array.isArray(value)) return nonBlankList(value);
  if (!value || typeof value !== 'object') return false;
  return Object.values(value as UnknownRecord).some(meaningfulParam);
}

/** Detects actual comparison-cell content without counting empty containers. */
export function hasMeaningfulComparisonCell(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const cell = value as UnknownRecord;
  return (
    nonBlank(cell.effect_summary) ||
    nonBlank(cell.conclusion) ||
    nonBlank(cell.manual_score) ||
    nonBlank(cell.ai_score) ||
    nonBlank(cell.conclusion_tag) ||
    nonBlank(cell.process_notes) ||
    nonBlankList(cell.problem_points) ||
    meaningfulParam(cell.params)
  );
}

function meaningfulV2Metric(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const metric = value as UnknownRecord;
  const state = metric.state ?? metric.valueState;
  const resultStatus = metric.resultStatus ?? metric.result_status;
  if (resultStatus === 'pending') return false;
  if (state !== 'valid' && state !== 'filled') return false;
  return (
    nonBlank(metric.value) ||
    nonBlank(metric.durationMs) ||
    nonBlank(metric.text) ||
    nonBlank(metric.display) ||
    nonBlank(metric.valueText) ||
    nonBlank(metric.valueNumber) ||
    nonBlank(metric.numericValue) ||
    nonBlank(metric.textValue) ||
    nonBlank(metric.booleanValue) ||
    nonBlank(metric.enumValue) ||
    nonBlank(metric.dateTimeValue)
  );
}

function meaningfulV2Row(row: unknown): boolean {
  if (!row || typeof row !== 'object') return false;
  const record = row as UnknownRecord;
  const slots = record.slots as UnknownRecord | undefined;
  const result = slots?.result as UnknownRecord | undefined;
  const process = slots?.process as UnknownRecord | undefined;
  const issues = slots?.issues as UnknownRecord | undefined;

  if (
    nonBlank(result?.summary) ||
    (nonBlank(result?.status) && result?.status !== 'pending') ||
    nonBlank(process?.note) ||
    (typeof issues?.count === 'number' && issues.count > 0)
  ) return true;

  const metrics = record.metrics;
  if (metrics && typeof metrics === 'object' && !Array.isArray(metrics)) {
    if (Object.values(metrics as UnknownRecord).some(meaningfulV2Metric)) return true;
  }

  const evidence = record.evidence;
  if (evidence && typeof evidence === 'object' && !Array.isArray(evidence)) {
    const evidenceRecord = evidence as UnknownRecord;
    if (
      (typeof evidenceRecord.primaryCount === 'number' && evidenceRecord.primaryCount > 0) ||
      nonBlankList(evidenceRecord.previewIds) ||
      (Array.isArray(evidenceRecord.media) && evidenceRecord.media.length > 0)
    ) return true;
  }

  const values = record.values;
  if (values && typeof values === 'object' && !Array.isArray(values)) {
    if (Object.values(values as UnknownRecord).some(meaningfulV2Metric)) return true;
  }
  const evidenceCounts = record.evidenceCounts;
  if (evidenceCounts && typeof evidenceCounts === 'object' && !Array.isArray(evidenceCounts)) {
    if (Object.values(evidenceCounts as UnknownRecord).some((count) => typeof count === 'number' && count > 0)) return true;
  }
  return Array.isArray(record.evidenceMaterials) && record.evidenceMaterials.length > 0;
}

/** Detects substantive result/process/issue/evidence/metric data in V2. */
export function hasMeaningfulV2Projection(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const projection = value as UnknownRecord;
  const summary = projection.summary as UnknownRecord | undefined;
  if (
    (typeof summary?.totalIssues === 'number' && summary.totalIssues > 0) ||
    (typeof summary?.totalEvidence === 'number' && summary.totalEvidence > 0)
  ) return true;

  if (Array.isArray(projection.narratives) && projection.narratives.some((item) => {
    return !!item && typeof item === 'object' && nonBlank((item as UnknownRecord).content);
  })) return true;

  const groups = projection.groups;
  if (!Array.isArray(groups)) return false;
  return groups.some((group) => {
    if (!group || typeof group !== 'object') return false;
    const rows = (group as UnknownRecord).rows;
    return Array.isArray(rows) && rows.some(meaningfulV2Row);
  });
}

function meaningfulV3Cell(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const cell = value as UnknownRecord;
  if (cell.valueState !== 'filled') return false;
  return (
    nonBlank(cell.valueText) ||
    nonBlank(cell.valueNumber) ||
    nonBlank(cell.valueDurationSeconds) ||
    nonBlank(cell.valuePercentage) ||
    nonBlank(cell.displayText)
  );
}

function meaningfulV3ReportRow(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const cells = (value as UnknownRecord).cells;
  return !!cells && typeof cells === 'object' && !Array.isArray(cells)
    && Object.values(cells as UnknownRecord).some((cell) => nonBlank(cell) || meaningfulV3Cell(cell));
}

/** Detects substantive values, media, narratives, or issue points in V3. */
export function hasMeaningfulV3Projection(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const projection = value as UnknownRecord;
  const cells = projection.cells;
  if (cells && typeof cells === 'object' && !Array.isArray(cells)) {
    if (Object.values(cells as UnknownRecord).some(meaningfulV3Cell)) return true;
  }

  if (Array.isArray(projection.rows) && projection.rows.some(meaningfulV3ReportRow)) return true;

  const cellMedia = projection.cellMedia;
  if (cellMedia && typeof cellMedia === 'object' && !Array.isArray(cellMedia)) {
    if (Object.values(cellMedia as UnknownRecord).some((items) => Array.isArray(items) && items.some((item) => {
      return !!item && typeof item === 'object' && nonBlank((item as UnknownRecord).materialId);
    }))) return true;
  }

  if (Array.isArray(projection.narratives) && projection.narratives.some((item) => {
    return !!item && typeof item === 'object' && nonBlank((item as UnknownRecord).content);
  })) return true;
  return Array.isArray(projection.issuePoints) && projection.issuePoints.some((item) => {
    return !!item && typeof item === 'object' && nonBlank((item as UnknownRecord).issueText);
  });
}
