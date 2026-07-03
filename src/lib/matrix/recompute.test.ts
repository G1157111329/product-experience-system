import assert from 'node:assert/strict';
import { recomputeAffected } from './recompute';

/**
 * Stub Supabase-like client for the recompute tests.
 *
 * Supports the chainable read API used by recompute.ts
 *   `.from(t).select().eq(col,val)… .order().limit(n)`
 *   `.from(t).select().eq().maybeSingle()`
 * plus the write API:
 *   `.from(t).insert(row)`          (records the insert, mutates the table)
 *   `.from(t).update(row).eq(c,v)`  (records + applies the update)
 * Upsert is intentionally NOT exercised here — recompute uses read-then-
 * update-or-insert for metric_evaluations (see the upsertMetricEvaluation
 * comment in recompute.ts for why).
 *
 * Every read returns a fresh filtered view of the in-memory tables, and every
 * write mutates them, so the same client reflects subsequent reads (e.g. the
 * idempotency re-run sees the inserted run + metrics).
 */

interface StubState {
  _table: string | null;
  _filters: Array<{ col: string; val: any }>;
  _orders: Array<{ col: string; ascending: boolean }>;
  _limit: number | null;
  _single: boolean;
}

function makeStubClient(tables: Record<string, any[]>) {
  const records: Record<string, Array<Record<string, unknown>>> = {};
  for (const [k, v] of Object.entries(tables)) {
    records[k] = v.map((row) => ({ ...row }));
  }

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
    // write builders mutate `state` minimally then resolve on await.
    const insertApi = {
      insert(row: Record<string, unknown>) {
        const rec = { ...row };
        records[table] = records[table] || [];
        records[table].push(rec);
        return Promise.resolve({ data: [rec], error: null });
      },
      update(row: Record<string, unknown>) {
        return {
          eq(col: string, val: unknown) {
            const arr = records[table] || [];
            for (const r of arr) {
              if (r[col] === val) Object.assign(r, row);
            }
            return Promise.resolve({ data: null, error: null });
          },
        };
      },
      // select() chains onto the read API with the same mutable state.
      ...api,
    };
    return Object.assign(state, insertApi);
  };

  const root = { from(t: string) { return build(t); } };
  return { root, records };
}

/** Juicer fixture: 3 row-scoped formulas + an item row under one section. */
function baseFixtures() {
  return {
    matrix_formula_definitions: [
      {
        id: 'fd_yield',
        schema_version_id: 'sv1',
        output_dimension_key: 'juice_yield',
        formula_dsl: 'ROUND(SELF("juice_weight") / SELF("ingredient_weight"), 4)',
        compiled_ast: {},
        dependency_json: ['juice_weight', 'ingredient_weight'],
        scope: 'row',
        formula_version: 'v1',
        status: 'published',
      },
      {
        id: 'fd_pure',
        schema_version_id: 'sv1',
        output_dimension_key: 'pure_juice_yield',
        formula_dsl: 'ROUND(SELF("filtered_juice_weight") / SELF("juice_weight"), 4)',
        compiled_ast: {},
        dependency_json: ['filtered_juice_weight', 'juice_weight'],
        scope: 'row',
        formula_version: 'v1',
        status: 'published',
      },
      {
        id: 'fd_pulp',
        schema_version_id: 'sv1',
        output_dimension_key: 'pulp_ratio',
        formula_dsl: 'ROUND(SELF("pulp_in_juice_weight") / SELF("juice_weight"), 4)',
        compiled_ast: {},
        dependency_json: ['pulp_in_juice_weight', 'juice_weight'],
        scope: 'row',
        formula_version: 'v1',
        status: 'published',
      },
    ],
    matrix_dimension_bindings: [
      { schema_version_id: 'sv1', dimension_key: 'juice_weight', display_name: '出汁重量', column_group: 'observed', value_kind: 'number', unit_code: 'g', editable: true, sort_order: 2 },
      { schema_version_id: 'sv1', dimension_key: 'ingredient_weight', display_name: '食材重量', column_group: 'observed', value_kind: 'number', unit_code: 'g', editable: true, sort_order: 1 },
      { schema_version_id: 'sv1', dimension_key: 'juice_yield', display_name: '出汁率含渣', column_group: 'calculated', value_kind: 'number', unit_code: '%', editable: false, sort_order: 6, display_format_json: { decimals: 4 } },
      { schema_version_id: 'sv1', dimension_key: 'pure_juice_yield', display_name: '纯汁率', column_group: 'calculated', value_kind: 'number', unit_code: '%', editable: false, sort_order: 7 },
      { schema_version_id: 'sv1', dimension_key: 'pulp_ratio', display_name: '果汁含渣率', column_group: 'calculated', value_kind: 'number', unit_code: '%', editable: false, sort_order: 8 },
    ],
    comparison_item_nodes: [
      { id: 'g1', assembly_id: 'a1', parent_id: null, node_type: 'section', node_label: '胡萝卜', sort_order: 0, depth: 0, config: {} },
      { id: 'r1', assembly_id: 'a1', parent_id: 'g1', node_type: 'item', node_label: '160mm口径', sort_order: 0, depth: 1, config: { subject_key: 'aperture_160' } },
    ],
    metric_evaluations: [
      // raw inputs (manual)
      { id: 'me_jw', cell_id: 'r1', metric_key: 'juice_weight', value_kind: 'number', numeric_value: 558.7, unit_code: 'g', input_state: 'valid', calculation_mode: 'manual', version: 1 },
      { id: 'me_iw', cell_id: 'r1', metric_key: 'ingredient_weight', value_kind: 'number', numeric_value: 1193.1, unit_code: 'g', input_state: 'valid', calculation_mode: 'manual', version: 1 },
    ],
    matrix_calculation_runs: [],
  };
}

async function main() {
  // --- Happy path: juice_yield ≈ 0.4683 ---------------------------------
  {
    const { root, records } = makeStubClient(baseFixtures());
    const result = await recomputeAffected({
      client: root,
      assemblyId: 'a1',
      schemaVersionId: 'sv1',
      triggeredRowId: 'r1',
      triggeredDimensionKey: 'juice_weight',
      traceId: 'trace-1',
    });

    // juice_yield must be present with the authoritative value.
    const yieldUpdate = result.updated.find((u) => u.metricKey === 'juice_yield');
    assert.ok(yieldUpdate, 'juice_yield update missing');
    assert.equal(yieldUpdate.status, 'valid');
    assert.ok(yieldUpdate.value !== undefined, 'juice_yield value missing');
    assert.ok(
      Math.abs(yieldUpdate.value! - 0.4683) < 1e-6,
      `juice_yield expected ≈ 0.4683, got ${yieldUpdate.value}`,
    );
    assert.equal(yieldUpdate.formulaVersion, 'v1');
    assert.equal(yieldUpdate.formulaDefinitionId, 'fd_yield');

    // A calculation run was inserted.
    assert.equal(records.matrix_calculation_runs.length, 1, 'expected one run insert');
    assert.equal(records.matrix_calculation_runs[0]!.matrix_instance_id, 'a1');
    assert.equal(records.matrix_calculation_runs[0]!.trace_id, 'trace-1');

    // The juice_yield metric_evaluations row was upserted with the value +
    // calculated provenance. (update path, since me_jw/me_iw exist but
    // juice_yield did not — so it's an INSERT here.)
    const yieldRow = records.metric_evaluations.find((m) => m.metric_key === 'juice_yield');
    assert.ok(yieldRow, 'juice_yield metric_evaluations row missing');
    assert.ok(
      Math.abs(Number(yieldRow.numeric_value) - 0.4683) < 1e-6,
      `juice_yield stored numeric_value expected ≈ 0.4683, got ${yieldRow.numeric_value}`,
    );
    assert.equal(yieldRow.calculation_mode, 'calculated');
    assert.equal(yieldRow.input_state, 'valid');
    assert.equal(yieldRow.error_code, null);
    assert.equal(yieldRow.formula_definition_id, 'fd_yield');
    assert.equal(yieldRow.source_run_id, result.runId);
    assert.equal(yieldRow.unit_code, '%');
    assert.equal(yieldRow.version, 1);

    // juice_yield succeeds (has both inputs). The other two formulas
    // (pure_juice_yield, pulp_ratio) lack their numerator inputs
    // (filtered_juice_weight, pulp_in_juice_weight) → INPUT_MISSING, so the
    // run is 'partial'. This verifies partial-run detection for free.
    assert.equal(result.status, 'partial');
    const pureUpdate = result.updated.find((u) => u.metricKey === 'pure_juice_yield');
    assert.ok(pureUpdate, 'pure_juice_yield update missing');
    assert.equal(pureUpdate.status, 'calculation_failed');
    assert.equal(pureUpdate.errorCode, 'MATRIX_CALC_INPUT_MISSING');

    // --- Idempotency: re-running with the same inputs must NOT recompute ---
    const runsBefore = records.matrix_calculation_runs.length;
    const metricsBefore = records.metric_evaluations.length;
    const result2 = await recomputeAffected({
      client: root,
      assemblyId: 'a1',
      schemaVersionId: 'sv1',
      triggeredRowId: 'r1',
      triggeredDimensionKey: 'juice_weight',
      traceId: 'trace-2',
    });
    assert.equal(result2.runId, result.runId, 'idempotent run should return same runId');
    assert.equal(
      records.matrix_calculation_runs.length,
      runsBefore,
      'idempotent re-run must not insert another run',
    );
    assert.equal(
      records.metric_evaluations.length,
      metricsBefore,
      'idempotent re-run must not write more metrics',
    );
    const yieldUpdate2 = result2.updated.find((u) => u.metricKey === 'juice_yield');
    assert.ok(yieldUpdate2 && Math.abs((yieldUpdate2.value ?? NaN) - 0.4683) < 1e-6);
  }

  // --- Divide-by-zero: ingredient_weight = 0 → MATRIX_CALC_DIVIDE_BY_ZERO -
  {
    const fixtures = baseFixtures();
    fixtures.metric_evaluations = [
      { id: 'me_jw', cell_id: 'r1', metric_key: 'juice_weight', value_kind: 'number', numeric_value: 100, unit_code: 'g', input_state: 'valid', calculation_mode: 'manual', version: 1 },
      { id: 'me_iw', cell_id: 'r1', metric_key: 'ingredient_weight', value_kind: 'number', numeric_value: 0, unit_code: 'g', input_state: 'valid', calculation_mode: 'manual', version: 1 },
    ];
    const { root, records } = makeStubClient(fixtures);
    const result = await recomputeAffected({
      client: root,
      assemblyId: 'a1',
      schemaVersionId: 'sv1',
      triggeredRowId: 'r1',
      triggeredDimensionKey: 'ingredient_weight',
      traceId: 'trace-dz',
    });

    const yieldUpdate = result.updated.find((u) => u.metricKey === 'juice_yield');
    assert.ok(yieldUpdate, 'juice_yield update missing in divide-by-zero case');
    assert.equal(yieldUpdate.status, 'calculation_failed');
    assert.equal(yieldUpdate.errorCode, 'MATRIX_CALC_DIVIDE_BY_ZERO');
    assert.equal(yieldUpdate.value, undefined);

    const yieldRow = records.metric_evaluations.find((m) => m.metric_key === 'juice_yield');
    assert.ok(yieldRow, 'failed juice_yield row should still be written');
    assert.equal(yieldRow.numeric_value, null);
    assert.equal(yieldRow.error_code, 'MATRIX_CALC_DIVIDE_BY_ZERO');
    assert.equal(yieldRow.calculation_mode, 'calculated');
    // input_state stays valid: the *input* is fine; the calculation failed.
    assert.equal(yieldRow.input_state, 'valid');
    assert.equal(yieldRow.source_run_id, result.runId);

    // Some formulas failed (those depending on ingredient_weight) and others
    // could fail too (pure_juice_yield/pulp_ratio depend on juice_weight=100,
    // which is fine, but pulp depends on pulp_in_juice_weight which is missing).
    // juice_yield definitely failed → status is at least 'partial' or 'failed'.
    assert.ok(
      result.status === 'partial' || result.status === 'failed',
      `expected partial/failed, got ${result.status}`,
    );
  }

  console.log('recompute tests passed');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
