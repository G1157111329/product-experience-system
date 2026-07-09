import { recomputeAffected, upsertMetricEvaluation, MatrixMetricConflictError } from './recompute';
import type { UpsertMetricInput } from './recompute';

export const BATCH_LIMIT = 500;

export interface BatchSetMetricCommand {
  type: 'setMetric';
  rowId: string;
  dimensionKey: string;
  value: number | string;
  unitCode?: string;
}
export type BatchCommand = BatchSetMetricCommand;

export interface BatchAnchor {
  rowId: string;
  dimensionKey: string;
}

export interface BatchPasteRequest {
  clientOperationId: string;
  baseVersion: number;
  anchor: BatchAnchor;
  commands: BatchCommand[];
}

export interface BatchCommandResult {
  index: number;
  status: 'succeeded' | 'conflict' | 'validation_failed' | 'row_not_found';
  rowId: string;
  dimensionKey: string;
  newVersion?: number;
  error?: { code: string; message?: string; latestVersion?: number; latestValue?: unknown };
}

export interface AuthoritativeCalc {
  rowId: string;
  metricKey: string;
  value?: number;
  unit?: string;
  formulaVersion?: string;
  status: string;
  errorCode?: string;
}

export interface BatchPasteResult {
  operationId: string;
  status: 'succeeded' | 'partially_succeeded' | 'failed';
  results: BatchCommandResult[];
  authoritativeCalculations: AuthoritativeCalc[];
  calculationRunIds: string[];
  warnings: string[];
}

export type BatchLevelValidationError =
  | { valid: true }
  | { valid: false; code: 'MATRIX_BATCH_INVALID_SHAPE' | 'MATRIX_BATCH_ANCHOR_INVALID' | 'MATRIX_BATCH_LIMIT_EXCEEDED'; message?: string };

export interface PerCommandValidationError {
  index: number;
  code: 'MATRIX_BATCH_COMMAND_OUT_OF_RANGE' | 'MATRIX_CALCULATED_VALUE_READONLY';
  message: string;
}

export interface ValidationContext {
  observedSortOrder: string[];   // dimension_keys of observed+editable columns in sort_order
  groupRows: string[];            // row ids of the anchor's group in sort_order ascending
  /**
   * All dimension keys in the schema (observed + calculated), in any order.
   * Used by {@link validateCommandGeometry} to distinguish a *calculated*
   * column (→ MATRIX_CALCULATED_VALUE_READONLY) from a truly *unknown* key
   * (→ MATRIX_BATCH_COMMAND_OUT_OF_RANGE). Optional: when omitted, every
   * non-observed key is reported as OUT_OF_RANGE (the historical behavior).
   */
  allDimensionKeys?: string[];
}

/**
 * Batch-level validation: anchor existence/observability, command shape, and
 * the cell-count limit. If this fails, the WHOLE batch is rejected (no
 * commands run) — these are not per-command partial-success failures. Pure,
 * does NOT touch the DB.
 */
export function validateBatchLevel(req: BatchPasteRequest, ctx: ValidationContext): BatchLevelValidationError {
  if (!req.anchor || !req.anchor.rowId || !req.anchor.dimensionKey) {
    return { valid: false, code: 'MATRIX_BATCH_INVALID_SHAPE', message: 'anchor 缺失' };
  }

  const anchorColIdx = ctx.observedSortOrder.indexOf(req.anchor.dimensionKey);
  if (anchorColIdx < 0) {
    return { valid: false, code: 'MATRIX_BATCH_ANCHOR_INVALID', message: 'anchor 列不是原始指标' };
  }
  const anchorRowIdx = ctx.groupRows.indexOf(req.anchor.rowId);
  if (anchorRowIdx < 0) {
    return { valid: false, code: 'MATRIX_BATCH_ANCHOR_INVALID', message: 'anchor 行不在当前组内' };
  }

  if (!Array.isArray(req.commands) || req.commands.length === 0) {
    return { valid: false, code: 'MATRIX_BATCH_INVALID_SHAPE', message: 'commands 为空' };
  }
  if (req.commands.length > BATCH_LIMIT) {
    return { valid: false, code: 'MATRIX_BATCH_LIMIT_EXCEEDED', message: `粘贴超出 ${BATCH_LIMIT} 单元格上限` };
  }
  return { valid: true };
}

/**
 * Per-command geometry validation. Returns an error for EACH command that is
 * out of range (non-observed column, column before anchor, row in a different
 * group, row before anchor) or targets a calculated column. Commands NOT in
 * the returned list are geometry-valid and should proceed to the write layer.
 *
 * Unlike {@link validateBatchLevel}, this is partial-success: failing commands
 * are reported individually and do NOT block the other commands in the same
 * request. Non-observed columns that ARE known schema dimensions (calculated,
 * via `ctx.allDimensionKeys`) get `MATRIX_CALCULATED_VALUE_READONLY`; observed-
 * but-mispositioned columns and truly-unknown keys get
 * `MATRIX_BATCH_COMMAND_OUT_OF_RANGE`.
 *
 * Assumes {@link validateBatchLevel} already passed, so the anchor is valid
 * and `anchorColIdx`/`anchorRowIdx` are >= 0. Pure, does NOT touch the DB.
 */
export function validateCommandGeometry(req: BatchPasteRequest, ctx: ValidationContext): PerCommandValidationError[] {
  const anchorColIdx = ctx.observedSortOrder.indexOf(req.anchor.dimensionKey);
  const anchorRowIdx = ctx.groupRows.indexOf(req.anchor.rowId);
  const errors: PerCommandValidationError[] = [];
  for (let i = 0; i < req.commands.length; i++) {
    const cmd = req.commands[i];
    if (cmd.type !== 'setMetric') {
      errors.push({ index: i, code: 'MATRIX_BATCH_COMMAND_OUT_OF_RANGE', message: `不支持的命令类型 ${cmd.type}` });
      continue;
    }
    const cmdColIdx = ctx.observedSortOrder.indexOf(cmd.dimensionKey);
    if (cmdColIdx < 0) {
      // Not an observed+editable column. Distinguish a *calculated* column
      // (a known schema dimension → read-only) from a truly *unknown* key
      // (→ out of range) using ctx.allDimensionKeys when provided.
      if (ctx.allDimensionKeys?.includes(cmd.dimensionKey)) {
        errors.push({ index: i, code: 'MATRIX_CALCULATED_VALUE_READONLY', message: `命令列 ${cmd.dimensionKey} 是计算指标，不可编辑` });
      } else {
        errors.push({ index: i, code: 'MATRIX_BATCH_COMMAND_OUT_OF_RANGE', message: `命令列 ${cmd.dimensionKey} 不是原始指标` });
      }
      continue;
    }
    if (cmdColIdx < anchorColIdx) {
      errors.push({ index: i, code: 'MATRIX_BATCH_COMMAND_OUT_OF_RANGE', message: `命令列 ${cmd.dimensionKey} 在 anchor 之前` });
      continue;
    }
    const cmdRowIdx = ctx.groupRows.indexOf(cmd.rowId);
    if (cmdRowIdx < 0) {
      errors.push({ index: i, code: 'MATRIX_BATCH_COMMAND_OUT_OF_RANGE', message: `命令行 ${cmd.rowId} 不在当前组内（跨组禁止）` });
      continue;
    }
    if (cmdRowIdx < anchorRowIdx) {
      errors.push({ index: i, code: 'MATRIX_BATCH_COMMAND_OUT_OF_RANGE', message: `命令行 ${cmd.rowId} 在 anchor 之前` });
      continue;
    }
  }
  return errors;
}

// ---------------------------------------------------------------------------
// Execution orchestrator
// ---------------------------------------------------------------------------

export interface ExecuteOptions {
  actorId: string;
}

/**
 * Execute a batch paste: load the assembly, run an idempotency check against
 * prior runs (keyed by `clientOperationId` written as the run's trace_id),
 * validate geometry, write each command via {@link upsertMetricEvaluation}
 * (partial success — one command's failure does NOT block others), then
 * recompute calculated metrics ONCE PER AFFECTED ROW (deduped, not once per
 * command) via {@link recomputeAffected}. Returns a shaped {@link BatchPasteResult}.
 *
 * The orchestrator does NOT write its own top-level matrix_calculation_runs
 * row — recomputeAffected writes per-row runs whose trace_id is the
 * clientOperationId, which doubles as the idempotency record (step 2).
 */
export async function executeBatchPaste(
  client: any,
  assemblyId: string,
  req: BatchPasteRequest,
  _opts: ExecuteOptions,
): Promise<BatchPasteResult> {
  void _opts;
  // 1. Load assembly — must be a data_matrix instance.
  const { data: assembly, error: aErr } = await client.from('comparison_assemblies')
    .select('id,matrix_role,matrix_schema_version_id')
    .eq('id', assemblyId)
    .maybeSingle();
  if (aErr) throw new Error(aErr.message || '加载组装失败');
  if (!assembly || assembly.matrix_role !== 'data_matrix') {
    throw new Error('未找到数据矩阵实例');
  }
  const schemaVersionId = String(assembly.matrix_schema_version_id);

  // Fix I3: baseVersion is accepted for forward-compat. projection.version is
  // hardcoded to 1 in v1 (spec §8.5), so there's no 409 here yet. When Wave 2
  // wires real projection versioning, add the optimistic-concurrency check:
  //   if (req.baseVersion !== <assembly.version>) → 409.

  // 2. Idempotency: a prior run with trace_id === clientOperationId means the
  //    batch was already applied. (recomputeAffected writes runs with
  //    trace_id = clientOperationId.) v1 returns a minimal confirmation rather
  //    than replaying per-command results (that needs a results snapshot,
  //    deferred). Fix M3: scope the check to trigger_type='batch_paste' so it
  //    doesn't false-positive on runs from other operations (api_save,
  //    api_recalculate) that might happen to share a trace_id.
  const { data: existingRun, error: idemErr } = await client.from('matrix_calculation_runs')
    .select('id')
    .eq('matrix_instance_id', assemblyId)
    .eq('trace_id', req.clientOperationId)
    .eq('trigger_type', 'batch_paste')
    .maybeSingle();
  if (idemErr) throw new Error(idemErr.message || '幂等查询失败');
  if (existingRun) {
    return {
      operationId: req.clientOperationId,
      status: 'succeeded',
      results: [],
      authoritativeCalculations: [],
      calculationRunIds: [String(existingRun.id)],
      warnings: ['该操作已执行过，返回幂等确认（v1 不重放逐项结果，请刷新投影）'],
    };
  }

  // 3. Load schema bindings → observed+editable sort order + lookup-by-key map.
  const { data: bindings, error: bErr } = await client.from('matrix_dimension_bindings')
    .select('dimension_key,column_group,editable,sort_order,value_kind,unit_code')
    .eq('schema_version_id', schemaVersionId)
    .order('sort_order', { ascending: true });
  if (bErr) throw new Error(bErr.message || '加载维度绑定失败');
  const bindingRows = (bindings || []) as Array<Record<string, any>>;
  const observedSortOrder = bindingRows
    .filter((b) => b.column_group === 'observed' && b.editable !== false)
    .map((b) => String(b.dimension_key));
  const bindingByKey = new Map(bindingRows.map((b) => [String(b.dimension_key), b]));

  // 4. Load group rows: find the anchor row's parent (the group), then all
  //    item/condition rows under that group in sort_order.
  const { data: allNodes, error: nErr } = await client.from('comparison_item_nodes')
    .select('id,parent_id,node_type,sort_order')
    .eq('assembly_id', assemblyId)
    .order('sort_order', { ascending: true });
  if (nErr) throw new Error(nErr.message || '加载节点失败');
  const nodeRows = (allNodes || []) as Array<Record<string, any>>;
  const anchorNode = nodeRows.find((n) => String(n.id) === req.anchor.rowId);
  if (!anchorNode || !['item', 'condition'].includes(String(anchorNode.node_type))) {
    return failedResult(req, 'MATRIX_BATCH_ANCHOR_INVALID', 'anchor 行不是数据行');
  }
  const groupId = String(anchorNode.parent_id);
  const groupRows = nodeRows
    .filter((n) => String(n.parent_id) === groupId && ['item', 'condition'].includes(String(n.node_type)))
    .map((n) => String(n.id));

  // 5. Batch-level validation (anchor/shape/limit — rejects the WHOLE batch).
  //    These are not per-command partial-success failures: a bad anchor or an
  //    over-limit batch cannot be salvaged command-by-command, so the whole
  //    request is rejected before any write.
  const allDimensionKeys = Array.from(bindingByKey.keys());
  const batchLevel = validateBatchLevel(req, { observedSortOrder, groupRows, allDimensionKeys });
  if (!batchLevel.valid) {
    return failedResult(req, batchLevel.code, batchLevel.message);
  }

  // 6. Per-command geometry validation — partial success. Only the commands
  //    that fail geometry (calculated column, cross-group, before-anchor,
  //    unknown key) are rejected; the rest proceed to the write layer. A
  //    calculated column among valid observed commands no longer fails the
  //    whole batch — it fails just that one command (AT-20).
  const geometryErrors = validateCommandGeometry(req, { observedSortOrder, groupRows, allDimensionKeys });
  const geometryErrorByIndex = new Map(geometryErrors.map((e) => [e.index, e]));

  // 7. Per-command write. Partial success: commands that failed geometry are
  //    marked failed UP FRONT (before any write) and skipped; the rest are
  //    isolated in their own try/catch so a conflict or invalid value on one
  //    cell does NOT block the others. UpsertMetricInput is constructed cleanly
  //    per value_kind (no casts): the input field is set, the other two value
  //    slots are null.
  const results: BatchCommandResult[] = [];
  for (let i = 0; i < req.commands.length; i++) {
    const cmd = req.commands[i];
    const geoErr = geometryErrorByIndex.get(i);
    if (geoErr) {
      results.push({
        index: i, status: 'validation_failed',
        rowId: cmd.rowId, dimensionKey: cmd.dimensionKey,
        error: { code: geoErr.code, message: geoErr.message },
      });
      continue;
    }
    // Defense-in-depth: geometry validation already filtered non-observed /
    // non-editable columns, but keep this belt-and-braces check so a future
    // schema change can't sneak a calculated write past the orchestrator.
    const binding = bindingByKey.get(cmd.dimensionKey);
    if (!binding || binding.column_group !== 'observed' || binding.editable === false) {
      results.push({
        index: i, status: 'validation_failed',
        rowId: cmd.rowId, dimensionKey: cmd.dimensionKey,
        error: { code: 'MATRIX_CALCULATED_VALUE_READONLY', message: '该列为计算指标或不可编辑' },
      });
      continue;
    }
    try {
      const valueKind = String(binding.value_kind || 'number');
      const unitCode = cmd.unitCode || binding.unit_code || null;

      // Build UpsertMetricInput without casts: set the active value slot, null
      // the others. Number coercion rejects non-finite values.
      let numericValue: number | null = null;
      let durationMs: number | null = null;
      let textValue: string | null = null;
      if (valueKind === 'duration') {
        const n = typeof cmd.value === 'number' ? cmd.value : Number(cmd.value);
        if (!Number.isFinite(n)) throw new Error('MATRIX_VALUE_INVALID');
        durationMs = n;
      } else if (valueKind === 'text') {
        textValue = String(cmd.value);
      } else {
        const n = typeof cmd.value === 'number' ? cmd.value : Number(cmd.value);
        if (!Number.isFinite(n)) throw new Error('MATRIX_VALUE_INVALID');
        numericValue = n;
      }

      const upsertInput: UpsertMetricInput = {
        cellId: cmd.rowId,
        metricKey: cmd.dimensionKey,
        valueKind,
        numericValue,
        durationMs,
        textValue,
        unitCode,
        inputState: 'valid',
        calculationMode: 'manual',
        formulaDefinitionId: null,
        sourceRunId: null,
        errorCode: null,
      };
      await upsertMetricEvaluation(client, upsertInput);

      // Read back the new version for the result.
      const { data: row, error: rErr } = await client.from('metric_evaluations')
        .select('version')
        .eq('cell_id', cmd.rowId)
        .eq('metric_key', cmd.dimensionKey)
        .maybeSingle();
      if (rErr) throw new Error(rErr.message);
      results.push({
        index: i, status: 'succeeded',
        rowId: cmd.rowId, dimensionKey: cmd.dimensionKey,
        newVersion: row?.version,
      });
    } catch (err) {
      if (err instanceof MatrixMetricConflictError) {
        // Fix C2: destructure the readback error and handle it. A conflict was
        // detected (the version-guarded update matched 0 rows) but if the
        // subsequent readback of the latest version/value ALSO fails, we still
        // mark conflict — just without latestVersion/latestValue, with a message
        // explaining the readback failed. Previously the readback error was
        // swallowed, silently dropping the failure signal (Wave-1 bug pattern).
        const { data: latest, error: latestErr } = await client.from('metric_evaluations')
          .select('version,numeric_value,duration_ms,text_value')
          .eq('cell_id', cmd.rowId)
          .eq('metric_key', cmd.dimensionKey)
          .maybeSingle();
        if (latestErr) {
          results.push({
            index: i, status: 'conflict',
            rowId: cmd.rowId, dimensionKey: cmd.dimensionKey,
            error: {
              code: 'MATRIX_METRIC_VERSION_CONFLICT',
              message: '冲突后读取最新值失败：' + (latestErr.message || ''),
            },
          });
        } else {
          results.push({
            index: i, status: 'conflict',
            rowId: cmd.rowId, dimensionKey: cmd.dimensionKey,
            error: {
              code: 'MATRIX_METRIC_VERSION_CONFLICT',
              latestVersion: latest?.version,
              latestValue: latest?.numeric_value ?? latest?.duration_ms ?? latest?.text_value,
            },
          });
        }
      } else {
        const code = (err instanceof Error && err.message) || 'MATRIX_VALUE_INVALID';
        results.push({
          index: i, status: 'validation_failed',
          rowId: cmd.rowId, dimensionKey: cmd.dimensionKey,
          error: { code, message: err instanceof Error ? err.message : undefined },
        });
      }
    }
  }

  // 8. 集中重算: dedupe the rows that had at least one succeeded command and
  //    recompute each ONCE (not once per command). recomputeAffected is itself
  //    idempotent on (instance, input_version_hash, formula_version_hash) and
  //    writes the run with trace_id = clientOperationId, which is what step 2's
  //    idempotency check keys on.
  const affectedRowIds = Array.from(new Set(
    results.filter((r) => r.status === 'succeeded').map((r) => r.rowId),
  ));
  const authoritativeCalculations: AuthoritativeCalc[] = [];
  const calculationRunIds: string[] = [];
  // Fix C1: each row's recompute is isolated in its own try/catch so a failure
  // on row N cannot discard per-command results, authoritative values, or run
  // ids collected for earlier rows (the write path is partial-success). Failures
  // are surfaced in `warnings` and force the top-level status to
  // partially_succeeded — authoritative values for the failed row are stale
  // until the next recompute, so the caller must be told.
  const recomputeFailures: string[] = [];
  for (const rowId of affectedRowIds) {
    try {
      const recompute = await recomputeAffected({
        client,
        assemblyId,
        schemaVersionId,
        triggeredRowId: rowId,
        triggeredDimensionKey: '<batch>',
        traceId: req.clientOperationId,
        triggerType: 'batch_paste',
      });
      for (const u of recompute.updated) {
        authoritativeCalculations.push({
          rowId: u.rowId,
          metricKey: u.metricKey,
          value: u.value,
          formulaVersion: u.formulaVersion,
          status: u.status,
          errorCode: u.errorCode,
        });
      }
      calculationRunIds.push(recompute.runId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'unknown recompute error';
      recomputeFailures.push(`行 ${rowId} 重算失败：${msg}`);
      // The per-command writes for this row already committed; authoritative
      // values for this row will be stale until the next recompute. Surfaced in
      // warnings so the caller knows authoritative values are incomplete.
    }
  }

  // 9. Compose the top-level status from per-command outcomes. If any recompute
  //    failed, force partially_succeeded even if all per-command writes
  //    succeeded — the authoritative values are incomplete.
  const succeededCount = results.filter((r) => r.status === 'succeeded').length;
  let status: BatchPasteResult['status'] =
    succeededCount === results.length ? 'succeeded'
    : succeededCount === 0 ? 'failed'
    : 'partially_succeeded';
  if (recomputeFailures.length > 0 && status === 'succeeded') {
    status = 'partially_succeeded';
  }

  return {
    operationId: req.clientOperationId,
    status,
    results,
    authoritativeCalculations,
    calculationRunIds,
    warnings: recomputeFailures,
  };
}

/** Build a uniform failed result (all commands marked validation_failed). */
function failedResult(req: BatchPasteRequest, code: string, message?: string): BatchPasteResult {
  return {
    operationId: req.clientOperationId,
    status: 'failed',
    results: req.commands.map((cmd, i) => ({
      index: i,
      status: 'validation_failed' as const,
      rowId: cmd.rowId,
      dimensionKey: cmd.dimensionKey,
      error: { code, message },
    })),
    authoritativeCalculations: [],
    calculationRunIds: [],
    warnings: [],
  };
}
