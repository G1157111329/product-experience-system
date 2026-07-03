/**
 * Server-side read projection for a data-matrix assembly.
 *
 * {@link buildMatrixReadProjection} assembles a structured {@link MatrixReadProjection}
 * DTO from rows spread across `comparison_assemblies`, `matrix_schema_versions`,
 * `matrix_dimension_bindings`, `matrix_formula_definitions`,
 * `comparison_item_nodes`, `metric_evaluations`, `issues`, `materials`, and
 * `matrix_calculation_runs`. It is consumed by the GET task-matrix endpoint
 * (Task 7) and the report Aggregator (Task 12).
 *
 * DB access uses ONLY the Supabase chainable builder API
 * (`client.from(table).select().eq().order().limit().maybeSingle()`), never raw
 * SQL or Drizzle — `getSupabaseClient()` returns that shape in both cloud and
 * self-hosted modes.
 */
import type { DimensionBinding, FormulaDefinition, MatrixSchemaJson } from './types';

// ---------------------------------------------------------------------------
// Read DTO types
// ---------------------------------------------------------------------------

export interface MatrixMetricReadValue {
  state: 'valid' | 'missing' | 'not_applicable' | 'calculation_failed' | 'pending';
  value?: number;
  durationMs?: number;
  text?: string;
  unit?: string;
  display?: string;
  formulaVersion?: string;
  errorCode?: string;
}

export interface MatrixRowSlotResult { status?: string; summary?: string; }
export interface MatrixRowSlotProcess { note?: string; }
export interface MatrixRowSlotIssues { count: number; severitySummary: string[]; }

export interface MatrixReadRow {
  id: string;
  recordItemId?: string;
  version: number;
  subject: { key: string; label: string };
  slots: {
    result: MatrixRowSlotResult;
    process: MatrixRowSlotProcess;
    issues: MatrixRowSlotIssues;
  };
  metrics: Record<string, MatrixMetricReadValue>;
  evidence: { primaryCount: number; previewIds: string[] };
}

export interface MatrixReadGroup {
  id: string;
  label: string;
  conditionSummary?: string;
  rows: MatrixReadRow[];
}

export interface MatrixReadProjection {
  matrixId: string;
  taskId?: string;
  schema: {
    key: string;
    version: number;
    name: string;
    dimensions: DimensionBinding[];
    formulas: FormulaDefinition[];
  };
  permissions: { canEditRows: boolean; canEditObservedMetrics: boolean; canEditFormula: boolean };
  viewport: { totalGroups: number; totalRows: number };
  groups: MatrixReadGroup[];
  calculation: { status: 'succeeded' | 'failed' | 'partial' | 'unknown'; lastRunId?: string };
  version: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type Row = Record<string, any>;
type QueryResult = { data: Row | Row[] | null; error: { message?: string } | null };

function asRows(value: unknown): Row[] {
  return Array.isArray(value) ? (value as Row[]) : [];
}

/**
 * Issue statuses considered "closed" (no longer an open problem) and therefore
 * excluded from the row severity summary. Mirrors issue-row.tsx rectified logic.
 */
const CLOSED_ISSUE_STATUSES = new Set([
  'verified_closed',
  'waived',
  '已验证',
  '已整改',
  '不整改',
]);

/** Map a raw metric_evaluations row to the read DTO. */
function mapMetric(
  m: Row,
  formulaVersionByMetric: Map<string, string>,
): MatrixMetricReadValue {
  const inputState = String(m.input_state ?? '');
  const calcMode = String(m.calculation_mode ?? '');
  const errorCode = m.error_code ? String(m.error_code) : undefined;

  // Derive state per spec: explicit input_state wins for manual values; for
  // calculated values, error or null-value produce failure / pending.
  let state: MatrixMetricReadValue['state'];
  if (calcMode === 'calculated' && errorCode) {
    state = 'calculation_failed';
  } else if (calcMode === 'calculated' && (m.numeric_value === null || m.numeric_value === undefined) && !errorCode) {
    state = 'pending';
  } else if (inputState === 'valid') {
    state = 'valid';
  } else if (inputState === 'missing') {
    state = 'missing';
  } else if (inputState === 'not_applicable') {
    state = 'not_applicable';
  } else {
    state = 'valid';
  }

  // display: first version just stringifies the underlying value.
  let display: string | undefined;
  const numeric = typeof m.numeric_value === 'number' ? m.numeric_value : undefined;
  if (typeof m.display_value === 'string' && m.display_value) {
    display = m.display_value;
  } else if (numeric !== undefined) {
    display = String(numeric);
  } else if (m.duration_ms !== null && m.duration_ms !== undefined) {
    display = String(m.duration_ms);
  } else if (m.text_value) {
    display = String(m.text_value);
  }

  return {
    state,
    value: numeric,
    durationMs: typeof m.duration_ms === 'number' ? m.duration_ms : undefined,
    text: m.text_value ?? undefined,
    unit: m.unit_code ?? undefined,
    display,
    formulaVersion: formulaVersionByMetric.get(String(m.metric_key)),
    errorCode,
  };
}

/** Map a raw matrix_dimension_bindings row to the DimensionBinding type. */
function mapDimension(b: Row): DimensionBinding {
  return {
    dimensionKey: String(b.dimension_key),
    displayName: String(b.display_name),
    columnGroup: b.column_group === 'calculated' ? 'calculated' : 'observed',
    valueKind: b.value_kind,
    unitCode: b.unit_code ?? undefined,
    required: b.required ?? undefined,
    editable: b.editable ?? undefined,
    sortOrder: typeof b.sort_order === 'number' ? b.sort_order : Number(b.sort_order ?? 0),
    displayFormat: b.display_format_json ?? undefined,
    validation: b.validation_rule_json ?? undefined,
  };
}

/** Map a raw matrix_formula_definitions row to the FormulaDefinition type. */
function mapFormula(f: Row): FormulaDefinition {
  return {
    outputDimensionKey: String(f.output_dimension_key),
    formulaDsl: String(f.formula_dsl ?? ''),
    scope: f.scope === 'group' ? 'group' : 'row',
    formulaVersion: String(f.formula_version ?? ''),
  };
}

// ---------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------

/**
 * Build a {@link MatrixReadProjection} for a data-matrix assembly.
 *
 * Throws if the assembly is not a data matrix (`matrix_role !== 'data_matrix'`).
 *
 * NOTE (TODO performance): For the first version this issues N+1 queries — one
 * per row node for metrics, issues, and evidence (acceptable for ≤50 rows).
 * A future batch-loading pass should collapse the per-row lookups into a few
 * `in('cell_id', rowIds)` / `in('source_item_node_id', rowIds)` queries.
 */
export async function buildMatrixReadProjection(
  client: any,
  assemblyId: string,
  options?: { userId?: string },
): Promise<MatrixReadProjection> {
  // 1. Load assembly + assert data matrix role.
  const { data: assembly, error: assemblyErr } = await client
    .from('comparison_assemblies')
    .select('*')
    .eq('id', assemblyId)
    .maybeSingle();
  if (assemblyErr) throw new Error(assemblyErr.message || '加载组装失败');
  if (!assembly) throw new Error(`未找到组装: ${assemblyId}`);
  if (assembly.matrix_role !== 'data_matrix') {
    throw new Error(`组装 ${assemblyId} 不是数据矩阵 (matrix_role=${assembly.matrix_role})`);
  }

  const schemaVersionId = String(assembly.matrix_schema_version_id);
  const sourceTaskIds: unknown[] = Array.isArray(assembly.source_task_ids) ? assembly.source_task_ids : [];
  const taskId = sourceTaskIds.length > 0 ? String(sourceTaskIds[0]) : undefined;

  // 2. Load schema version blob.
  const { data: schemaVersion, error: svErr } = await client
    .from('matrix_schema_versions')
    .select('*')
    .eq('id', schemaVersionId)
    .maybeSingle();
  if (svErr) throw new Error(svErr.message || '加载矩阵模式版本失败');
  const schemaJson = (schemaVersion?.schema_json ?? {}) as Partial<MatrixSchemaJson>;

  // 3. Load dimension bindings (ordered).
  const { data: dimensionRowsRaw, error: dimErr } = await client
    .from('matrix_dimension_bindings')
    .select('*')
    .eq('schema_version_id', schemaVersionId)
    .order('sort_order', { ascending: true });
  if (dimErr) throw new Error(dimErr.message || '加载维度绑定失败');
  const dimensions = asRows(dimensionRowsRaw).map(mapDimension);

  // 4. Load published formula definitions.
  const { data: formulaRowsRaw, error: formulaErr } = await client
    .from('matrix_formula_definitions')
    .select('*')
    .eq('schema_version_id', schemaVersionId)
    .eq('status', 'published');
  if (formulaErr) throw new Error(formulaErr.message || '加载公式定义失败');
  const formulaRows = asRows(formulaRowsRaw);
  const formulas = formulaRows.map(mapFormula);
  const formulaVersionByMetric = new Map<string, string>(
    formulas.map((f) => [f.outputDimensionKey, f.formulaVersion]),
  );

  // 5. Load item nodes + build section→item tree.
  const { data: nodeRowsRaw, error: nodesErr } = await client
    .from('comparison_item_nodes')
    .select('*')
    .eq('assembly_id', assemblyId)
    .order('sort_order', { ascending: true });
  if (nodesErr) throw new Error(nodesErr.message || '加载项目节点失败');
  const nodeRows = asRows(nodeRowsRaw);

  const sections = nodeRows.filter((n) => n.node_type === 'section' && (n.parent_id === null || n.parent_id === undefined));
  const rowsByParent = new Map<string, Row[]>();
  for (const n of nodeRows) {
    if ((n.node_type === 'item' || n.node_type === 'condition') && n.parent_id) {
      const arr = rowsByParent.get(String(n.parent_id)) ?? [];
      arr.push(n);
      rowsByParent.set(String(n.parent_id), arr);
    }
  }
  const summaryByParent = new Map<string, string>();
  for (const n of nodeRows) {
    if (n.node_type === 'summary' && n.parent_id) {
      const cfg = (n.config ?? {}) as Record<string, unknown>;
      const text = typeof cfg.summary_text === 'string' ? cfg.summary_text : undefined;
      if (text) summaryByParent.set(String(n.parent_id), text);
    }
  }

  const totalRows = nodeRows.filter((n) => n.node_type === 'item' || n.node_type === 'condition').length;

  // 6-9. Build groups + per-row projections.
  const groups: MatrixReadGroup[] = [];
  for (const section of sections) {
    const sectionId = String(section.id);
    const sectionRows = rowsByParent.get(sectionId) ?? [];
    const readRows: MatrixReadRow[] = [];
    for (const r of sectionRows) {
      readRows.push(await buildRowProjection(client, assemblyId, r, formulaVersionByMetric));
    }
    groups.push({
      id: sectionId,
      label: String(section.node_label ?? ''),
      conditionSummary: summaryByParent.get(sectionId),
      rows: readRows,
    });
  }

  // 12. Latest calculation run status.
  const { data: calcRunRaw } = await client
    .from('matrix_calculation_runs')
    .select('id, status')
    .eq('matrix_instance_id', assemblyId)
    .order('computed_at', { ascending: false })
    .limit(1);
  const calcRun = asRows(calcRunRaw)[0];
  const calcStatus = (calcRun?.status as MatrixReadProjection['calculation']['status']) ?? 'unknown';

  // 11. Permissions — first version: row/observed editing allowed if a user is
  // present (real permission wiring arrives in Task 7); formula editing is
  // admin-only and wired in Task 13.
  const userId = options?.userId;
  const permissions = {
    canEditRows: Boolean(userId),
    canEditObservedMetrics: Boolean(userId),
    canEditFormula: false,
  };

  // 13. version — first version uses 1; there is no row-level version
  // aggregation yet (tracked for a future pass).
  const version = 1;

  return {
    matrixId: assemblyId,
    taskId,
    schema: {
      key: String(schemaJson.schemaKey ?? ''),
      version: typeof schemaJson.version === 'number' ? schemaJson.version : Number(schemaVersion?.version_no ?? 0),
      name: String(schemaJson.title ?? assembly.name ?? ''),
      dimensions,
      formulas,
    },
    permissions,
    viewport: { totalGroups: sections.length, totalRows },
    groups,
    calculation: {
      status: calcStatus,
      lastRunId: calcRun?.id ? String(calcRun.id) : undefined,
    },
    version,
  };
}

/**
 * Build a single row's projection: metrics, issues, evidence, three slots.
 *
 * Three-slot derivation (result/process/issues):
 * - The authoritative source is a `check_records` row linked via
 *   `config.record_item_id`. That wiring is performed by Task 7 on row create.
 * - Until that wiring exists, we fall back to fields stored directly on the
 *   row node's `config` blob (`result_status`, `result_summary`,
 *   `process_note`). This fallback is documented so Task 7 can remove it once
 *   `record_item_id` is reliably populated.
 */
async function buildRowProjection(
  client: any,
  assemblyId: string,
  row: Row,
  formulaVersionByMetric: Map<string, string>,
): Promise<MatrixReadRow> {
  const rowId = String(row.id);
  const cfg = (row.config ?? {}) as Record<string, any>;

  // 6. Metrics for this row (cell_id === row node id).
  const { data: metricRowsRaw } = await client
    .from('metric_evaluations')
    .select('*')
    .eq('cell_id', rowId);
  const metrics: Record<string, MatrixMetricReadValue> = {};
  for (const m of asRows(metricRowsRaw)) {
    metrics[String(m.metric_key)] = mapMetric(m, formulaVersionByMetric);
  }

  // 7. Issues for this row — precise filter via source_item_node_id.
  const { data: issueRowsRaw } = await client
    .from('issues')
    .select('id, level, status')
    .eq('source_item_node_id', rowId);
  const issueRows = asRows(issueRowsRaw);
  const openIssues = issueRows.filter((i) => !CLOSED_ISSUE_STATUSES.has(String(i.status ?? '')));
  const severityLevels = Array.from(
    new Set(openIssues.map((i) => String(i.level ?? '')).filter(Boolean)),
  );

  // 8. Evidence previews (cell_primary materials).
  const { data: evidenceRowsRaw } = await client
    .from('materials')
    .select('id')
    .eq('comparison_cell_id', rowId)
    .eq('media_role', 'cell_primary')
    .order('media_display_order', { ascending: true })
    .limit(3);
  const evidenceRows = asRows(evidenceRowsRaw);
  const previewIds = evidenceRows.map((m) => String(m.id));

  // 9. Three-slot fields.
  // record_item_id wiring (Task 7) is the authoritative path; until then read
  // directly from the row node config as a fallback.
  const resultStatus = cfg.result_status as string | undefined;
  const resultSummary = cfg.result_summary as string | undefined;
  const processNote = cfg.process_note as string | undefined;

  return {
    id: rowId,
    recordItemId: cfg.record_item_id ? String(cfg.record_item_id) : undefined,
    version: 1,
    subject: {
      key: String(cfg.subject_key ?? ''),
      label: String(row.node_label ?? ''),
    },
    slots: {
      result: {
        status: resultStatus,
        summary: resultSummary,
      },
      process: { note: processNote },
      issues: { count: openIssues.length, severitySummary: severityLevels },
    },
    metrics,
    evidence: { primaryCount: evidenceRows.length, previewIds },
  };
}
