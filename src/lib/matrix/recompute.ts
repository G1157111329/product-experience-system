/**
 * Server-side recompute of calculated metrics when a raw metric changes.
 *
 * This is the authoritative half of the optimistic + authoritative strategy:
 * the frontend computes the same formulas optimistically (via {@link
 * "./formula-engine"}), and this function recomputes them on the backend with
 * the same DSL engine so the two results agree. It writes both the inputs and
 * the recalculated outputs, records a {@link matrix_calculation_runs} audit row,
 * and is idempotent on `(assemblyId, input_version_hash, formula_version_hash)`.
 *
 * DB access uses ONLY the Supabase chainable builder API, matching projection.ts.
 */
import { createHash } from 'node:crypto';
import { compileFormula, evaluate, type CompiledFormula, type EvalContext, type MetricValue } from './formula-engine';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RecomputeInput {
  client: any;
  assemblyId: string;
  schemaVersionId: string;
  /** Row whose metric just changed. */
  triggeredRowId: string;
  /** Dimension key that just changed (for logging/hash). */
  triggeredDimensionKey: string;
  traceId: string;
  triggerType?: 'api_save' | 'api_recalculate' | 'snapshot_build' | 'batch_paste';
}

export interface RecomputeUpdate {
  rowId: string;
  metricKey: string;
  value?: number;
  durationMs?: number;
  text?: string;
  errorCode?: string;
  formulaVersion?: string;
  formulaDefinitionId?: string;
  status: 'valid' | 'calculation_failed';
}

export interface RecomputeResult {
  runId: string;
  status: 'succeeded' | 'failed' | 'partial';
  updated: RecomputeUpdate[];
  inputVersionHash: string;
  formulaVersionHash: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type Row = Record<string, any>;

/**
 * Error code thrown by {@link upsertMetricEvaluation} when a version-guarded
 * update affects 0 rows (a concurrent recompute bumped the row's version
 * between our read and write). The API route maps this to a 409. (Fix I1.)
 */
export const MATRIX_METRIC_VERSION_CONFLICT = 'MATRIX_METRIC_VERSION_CONFLICT';

/**
 * Typed error carrying the conflict code + the version we read (which the API
 * can return as `latestVersion` so the client can refresh and retry).
 */
export class MatrixMetricConflictError extends Error {
  readonly code = MATRIX_METRIC_VERSION_CONFLICT;
  readonly cellId: string;
  readonly metricKey: string;
  readonly staleVersion: number;
  constructor(cellId: string, metricKey: string, staleVersion: number) {
    super(`${MATRIX_METRIC_VERSION_CONFLICT}: ${cellId}/${metricKey} version ${staleVersion} stale`);
    this.name = 'MatrixMetricConflictError';
    this.cellId = cellId;
    this.metricKey = metricKey;
    this.staleVersion = staleVersion;
  }
}

function asRows(value: unknown): Row[] {
  return Array.isArray(value) ? (value as Row[]) : [];
}

/**
 * Coerce a DB value to a number. Real Supabase serializes `numeric(18,6)`
 * columns as STRINGS (e.g. `"558.7"`); a bare `typeof === 'number'` check
 * silently drops the value in production. Mirrors projection.ts's coercion.
 */
function coerceNumber(v: unknown): number | undefined {
  if (typeof v === 'number') return v;
  if (typeof v === 'string' && v !== '') {
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

/**
 * Convert a `metric_evaluations` row into the {@link MetricValue} shape the
 * formula engine consumes:
 *   duration → { durationMs }
 *   numeric  → { value, unit }
 *   text     → { text }
 *   otherwise → null (missing/blank)
 */
function evalRowToMetricValue(m: Row): MetricValue {
  if (String(m.value_kind ?? '') === 'duration') {
    const ms = coerceNumber(m.duration_ms);
    if (ms !== undefined) return { durationMs: ms };
    return null;
  }
  const num = coerceNumber(m.numeric_value);
  if (num !== undefined) {
    return { value: num, unit: String(m.unit_code ?? '') };
  }
  if (m.text_value !== null && m.text_value !== undefined) {
    return { text: String(m.text_value) };
  }
  return null;
}

/**
 * 16-char sha256 digest, matching the digest convention in ai-runs.ts. Short
 * enough for the 80-char hash columns, long enough to make collisions a
 * non-concern at the assembly scale.
 */
function digest(parts: string[]): string {
  return createHash('sha256').update(parts.join('|')).digest('hex').slice(0, 16);
}

function nowIso(): string {
  return new Date().toISOString();
}

function genId(): string {
  // Prefer the global crypto.randomUUID when present (Node 19+/browsers);
  // fall back to a sha256-derived id for older runtimes / test stubs.
  const g = globalThis as { crypto?: { randomUUID?: () => string } };
  if (g.crypto?.randomUUID) return g.crypto.randomUUID();
  return createHash('sha256').update(`${Date.now()}-${Math.random()}`).digest('hex').slice(0, 36);
}

/** A formula that compiled successfully, plus its source row id. */
interface CompiledFormulaRow {
  id: string;
  outputDimensionKey: string;
  formulaVersion: string;
  compiled: CompiledFormula;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export async function recomputeAffected(input: RecomputeInput): Promise<RecomputeResult> {
  const { client, assemblyId, schemaVersionId, triggeredRowId } = input;

  // 1. Load + recompile published formulas. Recompile from formula_dsl (not the
  //    stored AST) so the runtime and the optimistic frontend share the exact
  //    parse path; serialization edge cases can't drift between them.
  const { data: formulaRowsRaw, error: formulaErr } = await client
    .from('matrix_formula_definitions')
    .select('*')
    .eq('schema_version_id', schemaVersionId)
    .eq('status', 'published');
  if (formulaErr) throw new Error(formulaErr.message || '加载公式定义失败');
  const formulaRows = asRows(formulaRowsRaw);

  const compiledFormulas: CompiledFormulaRow[] = [];
  // Formulas that failed to compile are skipped (they can't produce a value),
  // but the failure is logged and surfaced in the run's error_detail_sanitized
  // so there's an auditable trace instead of a silent swallow. (Fix M2.)
  const formulaCompileFailures: string[] = [];
  for (const f of formulaRows) {
    try {
      compiledFormulas.push({
        id: String(f.id),
        outputDimensionKey: String(f.output_dimension_key),
        formulaVersion: String(f.formula_version ?? ''),
        compiled: compileFormula(String(f.formula_dsl ?? '')),
      });
    } catch (err) {
      const code = err instanceof Error ? err.message : 'unknown compile error';
      const note = `formula ${String(f.id)} (${String(f.output_dimension_key)}) failed to compile: ${code}`;
      formulaCompileFailures.push(note);
      console.error(`[recompute] ${note}`);
    }
  }

  // 2. Load dimension bindings once → Map<dimensionKey, binding> (for the
  //    output metric's unit / value_kind when writing results).
  const { data: dimRowsRaw, error: dimErr } = await client
    .from('matrix_dimension_bindings')
    .select('*')
    .eq('schema_version_id', schemaVersionId);
  if (dimErr) throw new Error(dimErr.message || '加载维度绑定失败');
  const bindingByMetric = new Map<string, Row>();
  for (const b of asRows(dimRowsRaw)) {
    bindingByMetric.set(String(b.dimension_key), b);
  }

  // 3. Load all row nodes for the assembly (used to build the ref/group context).
  const { data: nodeRowsRaw, error: nodesErr } = await client
    .from('comparison_item_nodes')
    .select('*')
    .eq('assembly_id', assemblyId);
  if (nodesErr) throw new Error(nodesErr.message || '加载项目节点失败');
  const nodeRows = asRows(nodeRowsRaw);
  const rowNodes = nodeRows.filter(
    (n) => n.node_type === 'item' || n.node_type === 'condition',
  );
  const rowById = new Map<string, Row>(rowNodes.map((n) => [String(n.id), n]));

  // 4. Load the triggered row's metrics into a Map<metricKey, MetricValue>.
  //    Also track which keys are inputs (not calculated) — this drives the
  //    inputVersionHash so it stays stable across recomputes.
  const triggeredRow = rowById.get(triggeredRowId);
  const triggeredMetrics = await loadRowMetrics(client, triggeredRowId);
  const triggeredMap = new Map<string, MetricValue>();
  const inputMetricKeys = new Set<string>();
  for (const m of triggeredMetrics) {
    triggeredMap.set(String(m.metric_key), evalRowToMetricValue(m));
    if (String(m.calculation_mode ?? '') !== 'calculated') {
      inputMetricKeys.add(String(m.metric_key));
    }
  }

  // 5. Load sibling rows (same parent_id) for the REF context, each with its own
  //    metrics map. Siblings are keyed by their config.subject_key.
  const siblingMaps = new Map<string, Map<string, MetricValue>>(); // subjectKey → metrics
  if (triggeredRow) {
    const parentId = triggeredRow.parent_id ? String(triggeredRow.parent_id) : null;
    const siblings = parentId
      ? rowNodes.filter((n) => String(n.parent_id) === parentId && String(n.id) !== triggeredRowId)
      : [];
    for (const sib of siblings) {
      const sibId = String(sib.id);
      const sibConfig = (sib.config ?? {}) as Record<string, unknown>;
      const subjectKey = typeof sibConfig.subject_key === 'string' ? sibConfig.subject_key : null;
      if (!subjectKey) continue;
      const sibMetricRows = await loadRowMetrics(client, sibId);
      const sibMap = new Map<string, MetricValue>();
      for (const m of sibMetricRows) {
        sibMap.set(String(m.metric_key), evalRowToMetricValue(m));
      }
      siblingMaps.set(subjectKey, sibMap);
    }
  }

  // 6. Build the EvalContext for the triggered row.
  const ctx: EvalContext = {
    self: (key) => triggeredMap.get(key) ?? null,
    refSameGroup: (subjectKey, key) => {
      const sib = siblingMaps.get(subjectKey);
      return sib ? (sib.get(key) ?? null) : null;
    },
    // TODO: group aggregates are not used in the juicer schema; wire when a
    // GROUP-scoped formula is introduced. Returning null yields INPUT_MISSING
    // for any formula that references one, which is correct for now.
    groupAggregate: () => null,
  };

  // 7. Compute version hashes BEFORE doing any writes (so idempotency uses the
  //    *input* state, not post-write state).
  //    inputVersionHash: digest of the triggered row's *input* metrics (sorted,
  //      stable). IMPORTANT: only observed/manual metrics count as inputs —
  //      excluding formula outputs is what makes this hash stable across
  //      recomputes (the run writes the outputs, so including them would change
  //      the hash on every re-run and defeat idempotency).
  //    formulaVersionHash: digest of formula output keys + versions (sorted).
  const formulaOutputKeys = new Set(compiledFormulas.map((f) => f.outputDimensionKey));
  const inputVersionParts: string[] = [];
  for (const [k, v] of triggeredMap) {
    // Skip calculated outputs two ways: keys that are current formula outputs,
    // and any row the DB already marks as calculated. This keeps the input hash
    // stable across recomputes (the run writes outputs → excluding them is what
    // makes idempotency work).
    if (formulaOutputKeys.has(k)) continue;
    if (!inputMetricKeys.has(k)) continue;
    if (v === null) {
      inputVersionParts.push(`${triggeredRowId}:${k}:null`);
    } else if ('value' in v) {
      inputVersionParts.push(`${triggeredRowId}:${k}:${v.value}`);
    } else if ('durationMs' in v) {
      inputVersionParts.push(`${triggeredRowId}:${k}:${v.durationMs}`);
    } else {
      inputVersionParts.push(`${triggeredRowId}:${k}:${v.text}`);
    }
  }
  inputVersionParts.sort();
  const inputVersionHash = digest(inputVersionParts);

  const formulaVersionParts = compiledFormulas
    .map((f) => `${f.outputDimensionKey}@${f.formulaVersion}`)
    .sort();
  const formulaVersionHash = digest(formulaVersionParts);

  // 8. Idempotency: if a run already exists for this (instance, input, formula)
  //    triple, return its prior results instead of recomputing. Makes retries cheap.
  const { data: existingRunRaw, error: runLookupErr } = await client
    .from('matrix_calculation_runs')
    .select('id')
    .eq('matrix_instance_id', assemblyId)
    .eq('input_version_hash', inputVersionHash)
    .eq('formula_version_hash', formulaVersionHash)
    .limit(1);
  if (runLookupErr) throw new Error(runLookupErr.message || '查找计算运行失败');
  const existingRun = asRows(existingRunRaw)[0];
  if (existingRun) {
    const existingRunId = String(existingRun.id);
    // Re-fetch the metric_evaluations the prior run produced so callers get the
    // authoritative values back, not an empty list.
    const { data: priorMetricsRaw, error: priorErr } = await client
      .from('metric_evaluations')
      .select('*')
      .eq('cell_id', triggeredRowId)
      .eq('source_run_id', existingRunId);
    if (priorErr) throw new Error(priorErr.message || '加载历史计算结果失败');
    const updated: RecomputeUpdate[] = [];
    for (const m of asRows(priorMetricsRaw)) {
      const metricKey = String(m.metric_key);
      const formulaVersionByMetric = compiledFormulas.find(
        (f) => f.outputDimensionKey === metricKey,
      )?.formulaVersion;
      const errorCode = m.error_code ? String(m.error_code) : undefined;
      updated.push({
        rowId: triggeredRowId,
        metricKey,
        value: coerceNumber(m.numeric_value),
        durationMs: coerceNumber(m.duration_ms),
        text: m.text_value ?? undefined,
        errorCode,
        formulaVersion: formulaVersionByMetric,
        formulaDefinitionId: m.formula_definition_id ? String(m.formula_definition_id) : undefined,
        status: errorCode ? 'calculation_failed' : 'valid',
      });
    }
    return {
      runId: existingRunId,
      status: 'succeeded',
      updated,
      inputVersionHash,
      formulaVersionHash,
    };
  }

  // 9. Insert the run row (status placeholder 'succeeded'; corrected at the end
  //    of the loop, or to 'failed' if the loop throws — see try/catch below).
  const runId = genId();
  const triggerType = input.triggerType ?? 'api_save';
  const { error: runInsertErr } = await client.from('matrix_calculation_runs').insert({
    id: runId,
    matrix_instance_id: assemblyId,
    trigger_type: triggerType,
    input_version_hash: inputVersionHash,
    formula_version_hash: formulaVersionHash,
    status: 'succeeded',
    computed_at: nowIso(),
    trace_id: input.traceId,
  });
  if (runInsertErr) throw new Error(runInsertErr.message || '写入计算运行失败');

  // 10. Evaluate each formula on the triggered row and write its result.
  //     NOTE (TODO): for the first version only the triggered row is recomputed.
  //     That covers all row-scoped SELF(...) juicer formulas. A GROUP-scoped or
  //     REF-across-rows formula that aggregates *other* rows would need broader
  //     recomputation — extend the row loop here when such a formula is added.
  let successCount = 0;
  let failureCount = 0;
  const updated: RecomputeUpdate[] = [];

  // Fix C1: wrap the evaluate+upsert loop in try/catch so that if a write
  // throws mid-loop, the run row is ALWAYS corrected to 'failed' before the
  // error propagates. Without this the row would stay at the placeholder
  // 'succeeded' even though writes failed → an orphaned, misleading run.
  try {
    for (const formula of compiledFormulas) {
      const result = evaluate(formula.compiled, ctx);
      const outputMetricKey = formula.outputDimensionKey;
      const binding = bindingByMetric.get(outputMetricKey);
      const unitCode = binding?.unit_code ?? null;
      // value_kind from the dimension binding (default 'number' for calculated).
      const valueKind = String(binding?.value_kind ?? 'number');

      const update: RecomputeUpdate = {
        rowId: triggeredRowId,
        metricKey: outputMetricKey,
        formulaVersion: formula.formulaVersion,
        formulaDefinitionId: formula.id,
        status: result.ok ? 'valid' : 'calculation_failed',
      };

      if (result.ok) {
        successCount++;
        update.value = result.value;
        await upsertMetricEvaluation(client, {
          cellId: triggeredRowId,
          metricKey: outputMetricKey,
          valueKind,
          numericValue: result.value,
          durationMs: null,
          textValue: null,
          unitCode,
          inputState: 'valid',
          calculationMode: 'calculated',
          formulaDefinitionId: formula.id,
          sourceRunId: runId,
          errorCode: null,
        });
      } else {
        failureCount++;
        update.errorCode = result.code;
        await upsertMetricEvaluation(client, {
          cellId: triggeredRowId,
          metricKey: outputMetricKey,
          valueKind,
          numericValue: null,
          durationMs: null,
          textValue: null,
          unitCode,
          // input_state stays 'valid' — the *input* is fine; the *calculation*
          // failed. The projection maps calculation_mode+error_code →
          // 'calculation_failed' regardless of input_state.
          inputState: 'valid',
          calculationMode: 'calculated',
          formulaDefinitionId: formula.id,
          sourceRunId: runId,
          errorCode: result.code,
        });
      }
      updated.push(update);
    }
  } catch (err) {
    // A write threw mid-loop. Mark the run failed (with the error message — no
    // stack, so no sensitive internal detail leaks) and rethrow so the caller
    // sees the failure. The metrics written before the throw remain; they're
    // marked with their own per-formula status.
    const errMessage = err instanceof Error ? err.message : 'unknown error';
    await updateRunStatus(client, runId, 'failed', errMessage, formulaCompileFailures);
    throw err;
  }

  // 11. Finalize run status (normal completion path).
  let runStatus: 'succeeded' | 'failed' | 'partial';
  if (compiledFormulas.length === 0 || (successCount > 0 && failureCount === 0)) {
    runStatus = 'succeeded';
  } else if (failureCount > 0 && successCount > 0) {
    runStatus = 'partial';
  } else {
    runStatus = 'failed';
  }
  await updateRunStatus(client, runId, runStatus, null, formulaCompileFailures);

  return {
    runId,
    status: runStatus,
    updated,
    inputVersionHash,
    formulaVersionHash,
  };
}

/**
 * Update a calculation run's status (and optional error info). The error
 * message goes into error_detail_sanitized verbatim (no stack / no internal
 * paths) so audit/debugging surfaces a useful trace without leaking sensitive
 * detail. Best-effort: errors updating the run are logged but not thrown, so a
 * status-update failure never masks the original error. (Fix C1.)
 */
async function updateRunStatus(
  client: any,
  runId: string,
  status: 'succeeded' | 'failed' | 'partial',
  errorCode: string | null,
  formulaCompileFailures: string[] = [],
): Promise<void> {
  // On 'failed', fold any compile failures into error_detail_sanitized so the
  // trace is durable. error_code stays the surfaced error; detail is the prose.
  const detailParts = [...formulaCompileFailures];
  if (errorCode) detailParts.unshift(`error: ${errorCode}`);
  const errorDetailSanitized = detailParts.length > 0 ? detailParts.join('; ') : null;
  const { error } = await client
    .from('matrix_calculation_runs')
    .update({
      status,
      ...(errorCode !== null ? { error_code: errorCode } : {}),
      ...(errorDetailSanitized !== null ? { error_detail_sanitized: errorDetailSanitized } : {}),
    })
    .eq('id', runId);
  if (error) {
    console.error(`[recompute] failed to update run ${runId} status to ${status}: ${error.message ?? error}`);
  }
}

/**
 * Load the metric_evaluations rows for a single row (cell_id === rowId).
 * Always returns an array (empty on null/error-free empty).
 */
async function loadRowMetrics(client: any, rowId: string): Promise<Row[]> {
  const { data, error } = await client
    .from('metric_evaluations')
    .select('*')
    .eq('cell_id', rowId);
  if (error) throw new Error(error.message || '加载指标失败');
  return asRows(data);
}

/**
 * Upsert a single metric_evaluations row keyed on (cell_id, metric_key).
 *
 * Why not client.upsert(): the repo's Supabase-like builder (pg-query.ts) only
 * resolves an upsert conflict target against `schema.key || schema.id`.
 * metric_evaluations has a *composite* unique constraint
 * `metric_evaluations_cell_metric_key` on (cell_id, metric_key) and a UUID PK —
 * there is no single `.key` column. Passing the row to `.upsert()` would always
 * conflict on PK `id`, and since we don't supply an id it would always INSERT,
 * producing duplicate rows that violate the unique constraint. So we do a
 * read-then-update-or-insert: read the existing row by (cell_id, metric_key),
 * then UPDATE (bumping version) or INSERT (version 1) as appropriate.
 */
export interface UpsertMetricInput {
  cellId: string;
  metricKey: string;
  valueKind: string;
  numericValue: number | null;
  durationMs: number | null;
  textValue: string | null;
  unitCode: string | null;
  inputState: 'valid' | 'missing' | 'not_applicable';
  calculationMode: 'manual' | 'calculated';
  formulaDefinitionId: string | null;
  sourceRunId: string | null;
  errorCode: string | null;
}

export async function upsertMetricEvaluation(client: any, input: UpsertMetricInput): Promise<void> {
  const { data: existingRaw, error: readErr } = await client
    .from('metric_evaluations')
    .select('id, version')
    .eq('cell_id', input.cellId)
    .eq('metric_key', input.metricKey)
    .maybeSingle();
  if (readErr) throw new Error(readErr.message || '读取指标失败');
  const existing = existingRaw as { id?: string; version?: number } | null;
  const prevVersion = typeof existing?.version === 'number' ? existing.version : 0;
  const newVersion = prevVersion + 1;

  const payload: Record<string, unknown> = {
    cell_id: input.cellId,
    metric_key: input.metricKey,
    value_kind: input.valueKind,
    numeric_value: input.numericValue,
    duration_ms: input.durationMs,
    text_value: input.textValue,
    unit_code: input.unitCode,
    input_state: input.inputState,
    calculation_mode: input.calculationMode,
    formula_definition_id: input.formulaDefinitionId,
    source_run_id: input.sourceRunId,
    error_code: input.errorCode,
    version: newVersion,
    updated_at: nowIso(),
  };

  if (existing?.id) {
    // Fix I1: version-guarded update. Two concurrent recomputes targeting the
    // same calculated (cell_id, metric_key) can both read version=N and both
    // write version=N+1, silently clobbering each other (lost update). The
    // second `.eq('version', prevVersion)` guard makes the UPDATE affect 0 rows
    // if someone bumped the version between our read and write; we then throw a
    // typed conflict so the API maps it to a 409.
    //
    // RESIDUAL RACE WINDOW: the read→guard-update is still not atomic without
    // SELECT ... FOR UPDATE. Two writers can both read N, one wins the guarded
    // update (0 rows lost), the other gets the conflict. The window is the
    // small gap between the SELECT and UPDATE here — much smaller than the old
    // unguarded read-then-write, but not serializable. Acceptable for v1; a
    // transaction + row lock would close it entirely.
    const { data: updatedRow, error: updErr } = await client
      .from('metric_evaluations')
      .update(payload)
      .eq('id', existing.id)
      .eq('version', prevVersion) // guard: only update if version hasn't changed
      .select('id')
      .maybeSingle();
    if (updErr) throw new Error(updErr.message || '更新指标失败');
    if (!updatedRow) {
      // 0 rows affected → someone else updated between our read and write.
      // Surface a typed conflict (no retry here) so the API maps it to 409.
      throw new MatrixMetricConflictError(
        input.cellId,
        input.metricKey,
        prevVersion,
      );
    }
  } else {
    // INSERT path: no version guard. The unique constraint
    // (cell_id, metric_key) protects against duplicate inserts; if two
    // concurrent inserts race, the second gets a unique-violation from Postgres
    // which the Supabase client surfaces as `error` → we throw. Rare race.
    payload.created_at = nowIso();
    const { error: insErr } = await client
      .from('metric_evaluations')
      .insert(payload);
    if (insErr) throw new Error(insErr.message || '写入指标失败');
  }
}
