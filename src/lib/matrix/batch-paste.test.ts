import assert from 'node:assert/strict';
import {
  validateBatchLevel,
  validateCommandGeometry,
  type BatchCommand,
  type BatchPasteRequest,
  BATCH_LIMIT,
} from './batch-paste';

const observedOrder = ['duration', 'ingredient_weight', 'juice_weight', 'pulp_weight'];
// All schema dimension keys (observed + calculated). juice_yield is a calculated
// column here so we can prove validateCommandGeometry distinguishes calculated
// (→ MATRIX_CALCULATED_VALUE_READONLY) from unknown (→ OUT_OF_RANGE).
const allDims = [...observedOrder, 'juice_yield'];

// ===========================================================================
// validateBatchLevel — anchor / shape / limit. These are BATCH-LEVEL failures
// that reject the WHOLE batch (not per-command partial success).
// ===========================================================================

// Batch-level happy path: valid anchor + non-empty commands under the limit.
{
  const req: BatchPasteRequest = {
    clientOperationId: 'op1',
    baseVersion: 1,
    anchor: { rowId: 'r1', dimensionKey: 'ingredient_weight' },
    commands: [
      { type: 'setMetric', rowId: 'r1', dimensionKey: 'ingredient_weight', value: 100 },
      { type: 'setMetric', rowId: 'r2', dimensionKey: 'ingredient_weight', value: 200 },
    ],
  };
  const result = validateBatchLevel(req, { observedSortOrder: observedOrder, groupRows: ['r1', 'r2', 'r3'], allDimensionKeys: allDims });
  assert.equal(result.valid, true);
}

// Anchor invalid: dimensionKey is not observed (it's a calculated column).
{
  const req: BatchPasteRequest = {
    clientOperationId: 'op1', baseVersion: 1,
    anchor: { rowId: 'r1', dimensionKey: 'juice_yield' },  // calculated, not in observedOrder
    commands: [],
  };
  const result = validateBatchLevel(req, { observedSortOrder: observedOrder, groupRows: ['r1'], allDimensionKeys: allDims });
  assert.equal(result.valid, false);
  if (!result.valid) assert.equal(result.code, 'MATRIX_BATCH_ANCHOR_INVALID');
}

// Limit exceeded → whole batch rejected at batch level.
{
  const commands: BatchCommand[] = Array.from({ length: BATCH_LIMIT + 1 }, (_, i) => ({
    type: 'setMetric' as const, rowId: 'r1', dimensionKey: 'ingredient_weight', value: i,
  }));
  const req: BatchPasteRequest = {
    clientOperationId: 'op1', baseVersion: 1,
    anchor: { rowId: 'r1', dimensionKey: 'ingredient_weight' },
    commands,
  };
  const result = validateBatchLevel(req, { observedSortOrder: observedOrder, groupRows: ['r1'], allDimensionKeys: allDims });
  assert.equal(result.valid, false);
  if (!result.valid) assert.equal(result.code, 'MATRIX_BATCH_LIMIT_EXCEEDED');
}

// Empty commands → whole batch rejected at batch level (INVALID_SHAPE).
{
  const req: BatchPasteRequest = {
    clientOperationId: 'op1', baseVersion: 1,
    anchor: { rowId: 'r1', dimensionKey: 'ingredient_weight' },
    commands: [],
  };
  const result = validateBatchLevel(req, { observedSortOrder: observedOrder, groupRows: ['r1'], allDimensionKeys: allDims });
  assert.equal(result.valid, false);
  if (!result.valid) assert.equal(result.code, 'MATRIX_BATCH_INVALID_SHAPE');
}

// ===========================================================================
// validateCommandGeometry — per-command, PARTIAL SUCCESS. Failing commands are
// returned individually; absent commands are geometry-valid. These do NOT
// reject the whole batch.
// ===========================================================================

// Geometry happy path: all commands inside the anchor rectangle → no errors.
{
  const req: BatchPasteRequest = {
    clientOperationId: 'op1',
    baseVersion: 1,
    anchor: { rowId: 'r1', dimensionKey: 'ingredient_weight' },
    commands: [
      { type: 'setMetric', rowId: 'r1', dimensionKey: 'ingredient_weight', value: 100 },
      { type: 'setMetric', rowId: 'r1', dimensionKey: 'juice_weight', value: 50 },
      { type: 'setMetric', rowId: 'r2', dimensionKey: 'ingredient_weight', value: 200 },
    ],
  };
  const errors = validateCommandGeometry(req, { observedSortOrder: observedOrder, groupRows: ['r1', 'r2', 'r3'], allDimensionKeys: allDims });
  assert.equal(errors.length, 0, `expected no geometry errors, got ${JSON.stringify(errors)}`);
}

// Command out of range: row in a different group (only THAT command fails).
{
  const req: BatchPasteRequest = {
    clientOperationId: 'op1', baseVersion: 1,
    anchor: { rowId: 'r1', dimensionKey: 'ingredient_weight' },
    commands: [
      { type: 'setMetric', rowId: 'r1', dimensionKey: 'ingredient_weight', value: 100 },  // valid
      { type: 'setMetric', rowId: 'rX', dimensionKey: 'ingredient_weight', value: 100 },  // not in groupRows
    ],
  };
  const errors = validateCommandGeometry(req, { observedSortOrder: observedOrder, groupRows: ['r1', 'r2'], allDimensionKeys: allDims });
  assert.equal(errors.length, 1, `expected 1 error, got ${errors.length}`);
  assert.equal(errors[0]!.index, 1, 'the cross-group command (index 1) should fail');
  assert.equal(errors[0]!.code, 'MATRIX_BATCH_COMMAND_OUT_OF_RANGE');
}

// Command out of range: column before anchor (跳列) — only that command fails.
{
  const req: BatchPasteRequest = {
    clientOperationId: 'op1', baseVersion: 1,
    anchor: { rowId: 'r1', dimensionKey: 'juice_weight' },  // index 2
    commands: [
      { type: 'setMetric', rowId: 'r1', dimensionKey: 'juice_weight', value: 100 },      // index 2 == anchor, valid
      { type: 'setMetric', rowId: 'r1', dimensionKey: 'ingredient_weight', value: 100 },  // index 1 < 2, before anchor
    ],
  };
  const errors = validateCommandGeometry(req, { observedSortOrder: observedOrder, groupRows: ['r1'], allDimensionKeys: allDims });
  assert.equal(errors.length, 1, `expected 1 error, got ${errors.length}`);
  assert.equal(errors[0]!.index, 1, 'the before-anchor command (index 1) should fail');
  assert.equal(errors[0]!.code, 'MATRIX_BATCH_COMMAND_OUT_OF_RANGE');
}

// Calculated column → MATRIX_CALCULATED_VALUE_READONLY for THAT command only;
// the observed command in the same request has NO error (partial success).
{
  const req: BatchPasteRequest = {
    clientOperationId: 'op1', baseVersion: 1,
    anchor: { rowId: 'r1', dimensionKey: 'ingredient_weight' },
    commands: [
      { type: 'setMetric', rowId: 'r1', dimensionKey: 'ingredient_weight', value: 100 },  // observed, valid
      { type: 'setMetric', rowId: 'r1', dimensionKey: 'juice_yield', value: 0.5 },        // calculated → readonly
    ],
  };
  const errors = validateCommandGeometry(req, { observedSortOrder: observedOrder, groupRows: ['r1'], allDimensionKeys: allDims });
  assert.equal(errors.length, 1, `expected exactly 1 geometry error, got ${errors.length}`);
  assert.equal(errors[0]!.index, 1, 'the calculated-column command (index 1) should be the only error');
  assert.equal(errors[0]!.code, 'MATRIX_CALCULATED_VALUE_READONLY');
}

// Truly unknown column (not in allDimensionKeys) → MATRIX_BATCH_COMMAND_OUT_OF_RANGE,
// NOT CALCULATED_VALUE_READONLY. Proves the calculated-vs-unknown distinction.
{
  const req: BatchPasteRequest = {
    clientOperationId: 'op1', baseVersion: 1,
    anchor: { rowId: 'r1', dimensionKey: 'ingredient_weight' },
    commands: [
      { type: 'setMetric', rowId: 'r1', dimensionKey: 'totally_unknown_key', value: 1 },
    ],
  };
  const errors = validateCommandGeometry(req, { observedSortOrder: observedOrder, groupRows: ['r1'], allDimensionKeys: allDims });
  assert.equal(errors.length, 1);
  assert.equal(errors[0]!.code, 'MATRIX_BATCH_COMMAND_OUT_OF_RANGE', 'unknown key must be OUT_OF_RANGE, not readonly');
}

// Backward-compat: when allDimensionKeys is OMITTED, a calculated column falls
// back to OUT_OF_RANGE (the historical behavior before this distinction existed).
{
  const req: BatchPasteRequest = {
    clientOperationId: 'op1', baseVersion: 1,
    anchor: { rowId: 'r1', dimensionKey: 'ingredient_weight' },
    commands: [
      { type: 'setMetric', rowId: 'r1', dimensionKey: 'juice_yield', value: 0.5 },
    ],
  };
  const errors = validateCommandGeometry(req, { observedSortOrder: observedOrder, groupRows: ['r1'] });
  assert.equal(errors.length, 1);
  assert.equal(errors[0]!.code, 'MATRIX_BATCH_COMMAND_OUT_OF_RANGE', 'without allDimensionKeys, calculated falls back to OUT_OF_RANGE');
}

console.log('batch-paste validation tests passed');

// ===========================================================================
// Execution tests for executeBatchPaste — the DB-touching orchestrator.
//
// We reuse the same chainable-stub-client pattern from recompute.test.ts so the
// exact queries executeBatchPaste issues are exercised against in-memory
// tables. The client supports reads (.from().select().eq()… .order().limit()
// / .maybeSingle()), inserts, and version-guarded updates (.update().eq().eq()
// .select().maybeSingle()). Writes mutate the in-memory fixture so subsequent
// reads reflect them.
// ===========================================================================
import { executeBatchPaste } from './batch-paste';

interface StubState {
  _table: string | null;
  _filters: Array<{ col: string; val: any }>;
  _orders: Array<{ col: string; ascending: boolean }>;
  _limit: number | null;
  _single: boolean;
}

/**
 * Build a chainable stub client. Adapted from recompute.test.ts.
 *
 * Fix I1: the stub's `update()` path now honors a `version` filter when present
 * on `metric_evaluations`, mirroring the real `upsertMetricEvaluation` guard
 * `.eq('id', …).eq('version', prevVersion)`. Combined with the `bumpOnUpdateIds`
 * knob, this lets a conflict be produced through the REAL failure signal (the
 * version guard matching 0 rows because a concurrent write bumped the version),
 * rather than a synthetic shortcut that ignores the version dimension.
 */
function makeStubClient(
  tables: Record<string, any[]>,
  opts: {
    /**
     * metric_evaluations row `id`s whose version should be bumped the FIRST time
     * a guarded update targets them. This models a concurrent write that lands
     * AFTER the orchestrator's upsert read version N but BEFORE its
     * `.eq('version', N)` guarded update runs — so the guard matches 0 rows and
     * upsertMetricEvaluation throws MatrixMetricConflictError. (Fix I1.)
     */
    bumpOnUpdateIds?: Set<string>;
  } = {},
) {
  const records: Record<string, Array<Record<string, unknown>>> = {};
  for (const [k, v] of Object.entries(tables)) {
    records[k] = v.map((row) => ({ ...row }));
  }
  // Track which rows we've already bumped so the bump happens once (a real
  // concurrent write bumps once; subsequent retries would see the new version).
  const bumpedIds = new Set<string>();

  const resolveSelect = (state: StubState): Promise<{ data: any; error: any }> => {
    let rows = (records[state._table!] || []).filter((r) =>
      state._filters.every((f) => r[f.col] === f.val),
    );
    if (state._orders.length > 0) {
      rows = [...rows].sort((a, b) => {
        for (const { col, ascending } of state._orders) {
          const av = a[col] as unknown;
          const bv = b[col] as unknown;
          if (av === bv) continue;
          const cmp = String(av) < String(bv) ? -1 : 1;
          return ascending ? cmp : -cmp;
        }
        return 0;
      });
    }
    if (state._limit != null) rows = rows.slice(0, state._limit);
    const data = state._single ? (rows[0] || null) : rows;
    return Promise.resolve({ data, error: null });
  };

  const api = {
    select() { return this; },
    eq(this: StubState, col: string, val: any) { this._filters.push({ col, val }); return this; },
    order(this: StubState, col: string, opts: any) {
      this._orders.push({ col, ascending: opts.ascending });
      return this;
    },
    limit(this: StubState, n: number) { this._limit = n; return this; },
    maybeSingle(this: StubState) { this._single = true; return resolveSelect(this); },
    then(this: StubState, onFulfilled: any, onRejected?: any) {
      return resolveSelect(this).then(onFulfilled, onRejected);
    },
  };

  const newState = (): StubState => ({
    _table: null,
    _filters: [],
    _orders: [],
    _limit: null,
    _single: false,
  });

  const build = (table: string) => {
    const state: StubState & Record<string, any> = { ...newState(), ...api, _table: table };
    const insertApi = {
      insert(row: Record<string, unknown>) {
        const rec = { ...row };
        records[table] = records[table] || [];
        records[table].push(rec);
        return Promise.resolve({ data: [rec], error: null });
      },
      update(row: Record<string, unknown>) {
        const filters: Array<{ col: string; val: any }> = [];
        let matched: Record<string, unknown>[] = [];
        const apply = () => {
          const arr = records[table] || [];
          matched = arr.filter((r) => filters.every((f) => r[f.col] === f.val));
          // Fix I1: honor a `version` filter on metric_evaluations exactly like
          // the real upsertMetricEvaluation guard `.eq('version', prevVersion)`.
          // This is what makes the guarded update match 0 rows when a concurrent
          // write has bumped the row's version — the real conflict signal.
          const versionFilter = filters.find((f: any) => f.col === 'version');
          if (table === 'metric_evaluations' && versionFilter !== undefined) {
            matched = matched.filter((r: any) => Number(r.version) === Number(versionFilter.val));
          }
          // Model a concurrent write: if this row's id is configured to be
          // bumped AND the orchestrator is making its first guarded-update
          // attempt on it, bump the version now (before Object.assign applies
          // the new payload). The version filter above then excludes the row,
          // so matched becomes [] and upsertMetricEvaluation throws the conflict.
          if (opts.bumpOnUpdateIds && table === 'metric_evaluations' && matched.length > 0) {
            const idFilter = filters.find((f) => f.col === 'id');
            const vFilter = filters.find((f: any) => f.col === 'version');
            if (
              idFilter && vFilter &&
              opts.bumpOnUpdateIds.has(String(idFilter.val)) &&
              !bumpedIds.has(String(idFilter.val))
            ) {
              bumpedIds.add(String(idFilter.val));
              for (const r of records[table]) {
                if (String(r.id) === String(idFilter.val)) {
                  r.version = Number(r.version) + 1;
                }
              }
              // Re-apply the version filter after the bump → the bumped row no
              // longer matches the guard → matched = [] → conflict.
              matched = matched.filter((r: any) => Number(r.version) === Number(vFilter.val));
            }
          }
          for (const r of matched) Object.assign(r, row);
        };
        const updateChain = {
          eq(col: string, val: unknown) { filters.push({ col, val }); return this; },
          select() {
            return {
              maybeSingle() {
                apply();
                return Promise.resolve({ data: matched[0] ?? null, error: null });
              },
            };
          },
          then(onFulfilled: any, onRejected?: any) {
            apply();
            return Promise.resolve({ data: null, error: null }).then(onFulfilled, onRejected);
          },
        };
        return updateChain;
      },
      ...api,
    };
    return Object.assign(state, insertApi);
  };

  const root = { from(t: string) { return build(t); } };
  return { root, records };
}

/** Batch-paste fixture: one assembly + section g1 with two items (r1, r2). */
function batchPasteFixtures(): Record<string, any[]> {
  return {
    comparison_assemblies: [
      { id: 'a1', matrix_role: 'data_matrix', matrix_schema_version_id: 'sv1' },
    ],
    comparison_item_nodes: [
      { id: 'g1', assembly_id: 'a1', parent_id: null, node_type: 'section', sort_order: 0, config: {} },
      { id: 'r1', assembly_id: 'a1', parent_id: 'g1', node_type: 'item', sort_order: 0, config: { subject_key: 'aperture_160' } },
      { id: 'r2', assembly_id: 'a1', parent_id: 'g1', node_type: 'item', sort_order: 1, config: { subject_key: 'aperture_120' } },
    ],
    matrix_dimension_bindings: [
      { schema_version_id: 'sv1', dimension_key: 'ingredient_weight', column_group: 'observed', editable: true, sort_order: 0, value_kind: 'number', unit_code: 'g' },
      { schema_version_id: 'sv1', dimension_key: 'juice_weight', column_group: 'observed', editable: true, sort_order: 1, value_kind: 'number', unit_code: 'g' },
      { schema_version_id: 'sv1', dimension_key: 'juice_yield', column_group: 'calculated', editable: false, sort_order: 2, value_kind: 'number', unit_code: '%' },
    ],
    matrix_formula_definitions: [
      {
        id: 'fd_yield',
        schema_version_id: 'sv1',
        output_dimension_key: 'juice_yield',
        formula_dsl: 'ROUND(SELF("juice_weight") / SELF("ingredient_weight"), 4)',
        dependency_json: ['juice_weight', 'ingredient_weight'],
        scope: 'row',
        formula_version: 'v1',
        status: 'published',
      },
    ],
    metric_evaluations: [],
    matrix_calculation_runs: [],
  };
}

async function executionMain() {
  // --- Happy path: 2 commands on row r1 → both succeed, juice_yield ≈ 0.4683 --
  {
    const { root, records } = makeStubClient(batchPasteFixtures());
    const result = await executeBatchPaste(root, 'a1', {
      clientOperationId: 'op_happy',
      baseVersion: 1,
      anchor: { rowId: 'r1', dimensionKey: 'ingredient_weight' },
      commands: [
        { type: 'setMetric', rowId: 'r1', dimensionKey: 'ingredient_weight', value: 1193.1, unitCode: 'g' },
        { type: 'setMetric', rowId: 'r1', dimensionKey: 'juice_weight', value: 558.7, unitCode: 'g' },
      ],
    }, { actorId: 'u1' });

    assert.equal(result.status, 'succeeded', `expected succeeded, got ${result.status}`);
    assert.equal(result.results.length, 2);
    assert.ok(result.results.every((r: any) => r.status === 'succeeded'));
    const jy = result.authoritativeCalculations.find((c: any) => c.metricKey === 'juice_yield');
    assert.ok(jy, 'juice_yield missing from authoritative calculations');
    assert.ok(
      Math.abs((jy as any).value - 0.4683) < 1e-6,
      `juice_yield expected ≈ 0.4683, got ${(jy as any).value}`,
    );
    // One calculation run was inserted (deduped by row → r1 only).
    assert.equal(records.matrix_calculation_runs.length, 1, 'expected exactly one calculation run');
    assert.equal(records.matrix_calculation_runs[0]!.trace_id, 'op_happy');
  }

  // --- Partial success: second command hits a version conflict ---------------
  // Fix I1: this models the REAL failure mode. upsertMetricEvaluation reads
  // (r1, juice_weight) at version 5; a concurrent write bumps it to 6 before the
  // guarded update runs; the update `.eq('id', me_jw_seed).eq('version', 5)`
  // matches 0 rows → upsertMetricEvaluation throws MatrixMetricConflictError.
  // The stub's `bumpOnUpdateIds` knob simulates the concurrent bump the FIRST
  // time a guarded update targets that id; the version filter (now honored by
  // the stub) is what makes matched=0. This proves the conflict is produced by
  // the version guard, not a synthetic shortcut that ignores version.
  {
    const fixtures = batchPasteFixtures();
    // Pre-seed (r1, juice_weight) at version 5 so the update path is taken
    // (existing.id present → guarded update, not insert).
    fixtures.metric_evaluations = [
      { id: 'me_jw_seed', cell_id: 'r1', metric_key: 'juice_weight', value_kind: 'number', numeric_value: 100, unit_code: 'g', input_state: 'valid', calculation_mode: 'manual', version: 5 },
    ];
    const { root, records } = makeStubClient(fixtures, {
      bumpOnUpdateIds: new Set(['me_jw_seed']),
    });
    const result = await executeBatchPaste(root, 'a1', {
      clientOperationId: 'op_partial',
      baseVersion: 1,
      anchor: { rowId: 'r1', dimensionKey: 'ingredient_weight' },
      commands: [
        { type: 'setMetric', rowId: 'r1', dimensionKey: 'ingredient_weight', value: 1193.1, unitCode: 'g' },
        { type: 'setMetric', rowId: 'r1', dimensionKey: 'juice_weight', value: 558.7, unitCode: 'g' },
      ],
    }, { actorId: 'u1' });

    assert.equal(result.status, 'partially_succeeded', `expected partially_succeeded, got ${result.status}`);
    assert.equal(result.results.length, 2);
    assert.equal(result.results[0]!.status, 'succeeded', 'ingredient_weight should succeed');
    assert.equal(result.results[1]!.status, 'conflict', 'juice_weight should conflict');
    assert.equal(result.results[1]!.error!.code, 'MATRIX_METRIC_VERSION_CONFLICT');
    // After the concurrent bump, the readback sees the bumped version (6).
    assert.equal(result.results[1]!.error!.latestVersion, 6);
    // Only the succeeded row (r1) is recomputed.
    assert.equal(records.matrix_calculation_runs.length, 1, 'expected one run for the succeeded row');
  }

  // --- AT-20 scenario: calculated column among valid observed commands -------
  // This is the regression the split-validation fix targets. Before the fix,
  // `validateBatchRequest` rejected the WHOLE batch at the geometry pre-check
  // (juice_yield absent from observedSortOrder → MATRIX_BATCH_COMMAND_OUT_OF_RANGE
  // for every command via failedResult), so the per-command CALCULATED_VALUE_READONLY
  // branch and the partially_succeeded status were unreachable dead code. After
  // the fix, geometry validation is per-command: the ingredient_weight command
  // succeeds, the juice_yield command fails MATRIX_CALCULATED_VALUE_READONLY,
  // and the batch is partially_succeeded.
  {
    const { root } = makeStubClient(batchPasteFixtures());
    const result = await executeBatchPaste(root, 'a1', {
      clientOperationId: 'op_at20_calc',
      baseVersion: 1,
      anchor: { rowId: 'r1', dimensionKey: 'ingredient_weight' },
      commands: [
        { type: 'setMetric', rowId: 'r1', dimensionKey: 'ingredient_weight', value: 1000, unitCode: 'g' },  // observed, valid
        { type: 'setMetric', rowId: 'r1', dimensionKey: 'juice_yield', value: 0.5 },                       // calculated → readonly
      ],
    }, { actorId: 'u1' });

    assert.equal(result.status, 'partially_succeeded', `expected partially_succeeded, got ${result.status}`);
    assert.equal(result.results.length, 2);
    // The observed command succeeded.
    assert.equal(result.results[0]!.status, 'succeeded', 'ingredient_weight (observed) should succeed');
    assert.equal(result.results[0]!.dimensionKey, 'ingredient_weight');
    // The calculated command failed at geometry validation, NOT written.
    assert.equal(result.results[1]!.status, 'validation_failed', 'juice_yield (calculated) should fail validation');
    assert.equal(result.results[1]!.dimensionKey, 'juice_yield');
    assert.equal(result.results[1]!.error!.code, 'MATRIX_CALCULATED_VALUE_READONLY');
  }

  // --- Idempotency: same clientOperationId twice → no new run on second call -
  {
    const { root, records } = makeStubClient(batchPasteFixtures());

    const first = await executeBatchPaste(root, 'a1', {
      clientOperationId: 'op_idem',
      baseVersion: 1,
      anchor: { rowId: 'r1', dimensionKey: 'ingredient_weight' },
      commands: [
        { type: 'setMetric', rowId: 'r1', dimensionKey: 'ingredient_weight', value: 1193.1, unitCode: 'g' },
        { type: 'setMetric', rowId: 'r1', dimensionKey: 'juice_weight', value: 558.7, unitCode: 'g' },
      ],
    }, { actorId: 'u1' });
    const runsAfterFirst = records.matrix_calculation_runs.length;

    const second = await executeBatchPaste(root, 'a1', {
      clientOperationId: 'op_idem',  // same id
      baseVersion: 1,
      anchor: { rowId: 'r1', dimensionKey: 'ingredient_weight' },
      commands: [
        { type: 'setMetric', rowId: 'r1', dimensionKey: 'ingredient_weight', value: 1193.1, unitCode: 'g' },
      ],
    }, { actorId: 'u1' });

    assert.equal(second.operationId, 'op_idem');
    assert.equal(
      records.matrix_calculation_runs.length,
      runsAfterFirst,
      'idempotent re-call must not insert another run',
    );
    // First call produced a normal result; second is a minimal confirmation.
    assert.ok(first.authoritativeCalculations.length > 0, 'first call should produce calcs');
    assert.ok(second.warnings.length > 0, 'second call should carry an idempotency warning');
  }

  console.log('batch-paste execution tests passed');
}

executionMain().catch((err) => {
  console.error(err);
  process.exit(1);
});
