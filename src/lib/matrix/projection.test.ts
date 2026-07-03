import assert from 'node:assert/strict';
import { buildMatrixReadProjection } from './projection';

/**
 * Minimal chainable stub that mimics the Supabase builder API used by the
 * projection: `.from(t).select().eq(col,val)… .order(col,{ascending}).limit(n)`
 * and `.maybeSingle()`. `select()` (no maybeSingle) resolves to the full match
 * list; `maybeSingle()` resolves to the first match or null.
 *
 * Each builder instance owns mutable state (table, filters, order, limit,
 * single) stored on a plain object via closure so the methods can chain
 * mutably like the real Supabase client.
 */
interface StubState {
  _table: string | null;
  _filters: Array<{ col: string; val: any }>;
  _order: { col: string; ascending: boolean } | null;
  _limit: number | null;
  _single: boolean;
}

function makeStubClient(tables: Record<string, any[]>) {
  const resolve = (state: StubState): Promise<{ data: any; error: null }> => {
    let rows = (tables[state._table!] || []).filter((r: any) =>
      state._filters.every((f) => r[f.col] === f.val),
    );
    if (state._order) {
      const { col, ascending } = state._order;
      rows = [...rows].sort((a, b) => {
        const av = a[col];
        const bv = b[col];
        return ascending ? (av < bv ? -1 : av > bv ? 1 : 0) : (av > bv ? -1 : av < bv ? 1 : 0);
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
      this._order = { col, ascending: opts.ascending };
      return this;
    },
    limit(this: StubState, n: number) { this._limit = n; return this; },
    maybeSingle(this: StubState) { this._single = true; return resolve(this); },
    then(this: StubState, onFulfilled: any, onRejected?: any) {
      return resolve(this).then(onFulfilled, onRejected);
    },
  };

  const newState = (): StubState => ({
    _table: null,
    _filters: [],
    _order: null,
    _limit: null,
    _single: false,
  });

  const root = { ...newState(), ...api, from(t: string) { return { ...newState(), ...api, _table: t }; } };
  return root;
}

const fixtures: Record<string, any[]> = {
  comparison_assemblies: [
    {
      id: 'a1',
      name: '原汁机',
      matrix_role: 'data_matrix',
      matrix_schema_version_id: 'sv1',
      source_task_ids: ['t1'],
      comparability_status: 'unknown',
      updated_at: '2026-01-01T00:00:00Z',
    },
  ],
  matrix_schema_versions: [
    {
      id: 'sv1',
      schema_id: 's1',
      version_no: 1,
      status: 'published',
      schema_json: {
        schemaKey: 'juicer_aperture_comparison',
        version: 1,
        title: '原汁机口径 × 食材性能对比',
        axes: [],
        dimensions: [],
        formulas: [],
      },
    },
  ],
  matrix_dimension_bindings: [
    {
      schema_version_id: 'sv1',
      dimension_key: 'juice_weight',
      display_name: '出汁重量',
      column_group: 'observed',
      value_kind: 'number',
      unit_code: 'g',
      required: true,
      editable: true,
      sort_order: 2,
    },
  ],
  matrix_formula_definitions: [
    {
      schema_version_id: 'sv1',
      output_dimension_key: 'juice_yield',
      formula_dsl: 'ROUND(SELF("juice_weight")/SELF("ingredient_weight"),4)',
      compiled_ast: {},
      dependency_json: ['juice_weight', 'ingredient_weight'],
      scope: 'row',
      formula_version: 'v1',
      status: 'published',
    },
  ],
  comparison_item_nodes: [
    { id: 'g1', assembly_id: 'a1', parent_id: null, node_type: 'section', node_label: '胡萝卜', sort_order: 0, depth: 0, config: {} },
    {
      id: 'r1',
      assembly_id: 'a1',
      parent_id: 'g1',
      node_type: 'item',
      node_label: '160mm口径',
      sort_order: 0,
      depth: 1,
      config: {
        subject_key: 'aperture_160',
        record_item_id: 'rec1',
        result_status: 'pass',
        result_summary: '效果OK',
        process_note: '按标准速度',
      },
    },
  ],
  metric_evaluations: [
    { cell_id: 'r1', metric_key: 'juice_weight', value_kind: 'number', numeric_value: 558.7, unit_code: 'g', input_state: 'valid', calculation_mode: 'manual', version: 1 },
    { cell_id: 'r1', metric_key: 'juice_yield', value_kind: 'number', numeric_value: 0.4683, unit_code: '%', input_state: 'valid', calculation_mode: 'calculated', formula_definition_id: 'fd1', version: 1 },
  ],
  issues: [
    { id: 'is1', source_item_node_id: 'r1', level: '一类', status: 'open' },
    { id: 'is2', source_item_node_id: 'r1', level: '二类', status: 'verified_closed' },
  ],
  materials: [
    { id: 'm1', comparison_cell_id: 'r1', media_role: 'cell_primary', media_display_order: 2 },
    { id: 'm2', comparison_cell_id: 'r1', media_role: 'cell_primary', media_display_order: 1 },
    { id: 'm3', comparison_cell_id: 'r1', media_role: 'cell_secondary', media_display_order: 0 },
  ],
  matrix_calculation_runs: [
    { id: 'run1', matrix_instance_id: 'a1', status: 'succeeded', computed_at: '2026-01-02T00:00:00Z' },
    { id: 'run0', matrix_instance_id: 'a1', status: 'failed', computed_at: '2026-01-01T00:00:00Z' },
  ],
};

async function main() {
  // --- Happy path projection ---------------------------------------------
  const proj = await buildMatrixReadProjection(makeStubClient(fixtures), 'a1', { userId: 'u1' });

  assert.equal(proj.matrixId, 'a1');
  assert.equal(proj.taskId, 't1');
  assert.equal(proj.schema.key, 'juicer_aperture_comparison');
  assert.equal(proj.schema.version, 1);
  assert.equal(proj.schema.name, '原汁机口径 × 食材性能对比');
  assert.equal(proj.schema.dimensions.length, 1);
  assert.equal(proj.schema.dimensions[0].dimensionKey, 'juice_weight');
  assert.equal(proj.schema.formulas.length, 1);
  assert.equal(proj.schema.formulas[0].outputDimensionKey, 'juice_yield');
  assert.equal(proj.schema.formulas[0].formulaVersion, 'v1');

  assert.equal(proj.viewport.totalGroups, 1);
  assert.equal(proj.viewport.totalRows, 1);

  assert.equal(proj.groups.length, 1);
  assert.equal(proj.groups[0].id, 'g1');
  assert.equal(proj.groups[0].label, '胡萝卜');

  assert.equal(proj.groups[0].rows.length, 1);
  const row = proj.groups[0].rows[0];
  assert.equal(row.id, 'r1');
  assert.equal(row.recordItemId, 'rec1');
  assert.equal(row.subject.key, 'aperture_160');
  assert.equal(row.subject.label, '160mm口径');

  // three-slot fields (config fallback)
  assert.equal(row.slots.result.status, 'pass');
  assert.equal(row.slots.result.summary, '效果OK');
  assert.equal(row.slots.process.note, '按标准速度');

  // metrics mapping: manual + calculated
  assert.equal(row.metrics.juice_weight.value, 558.7);
  assert.equal(row.metrics.juice_weight.state, 'valid');
  assert.equal(row.metrics.juice_weight.unit, 'g');
  assert.equal(row.metrics.juice_weight.formulaVersion, undefined);
  assert.equal(row.metrics.juice_yield.value, 0.4683);
  assert.equal(row.metrics.juice_yield.state, 'valid');
  assert.equal(row.metrics.juice_yield.formulaVersion, 'v1');

  // issues: one open (一类), one closed (verified_closed) excluded from severity
  assert.equal(row.slots.issues.count, 1);
  assert.deepEqual(row.slots.issues.severitySummary, ['一类']);

  // evidence: 2 cell_primary (ordered), cell_secondary excluded, limit 3
  assert.equal(row.evidence.primaryCount, 2);
  assert.deepEqual(row.evidence.previewIds, ['m2', 'm1']);

  // permissions
  assert.equal(proj.permissions.canEditRows, true);
  assert.equal(proj.permissions.canEditObservedMetrics, true);
  assert.equal(proj.permissions.canEditFormula, false);

  // calculation status — most recent run wins
  assert.equal(proj.calculation.status, 'succeeded');
  assert.equal(proj.calculation.lastRunId, 'run1');

  // --- Non-data-matrix assembly throws ----------------------------------
  await assert.rejects(
    () =>
      buildMatrixReadProjection(
        makeStubClient({ comparison_assemblies: [{ id: 'a2', matrix_role: 'comparison' }] }),
        'a2',
      ),
    /不是数据矩阵/,
  );

  // --- Missing assembly throws ------------------------------------------
  await assert.rejects(
    () => buildMatrixReadProjection(makeStubClient({ comparison_assemblies: [] }), 'nope'),
    /未找到组装/,
  );

  // --- No userId → no row edit permission -------------------------------
  const noUserProj = await buildMatrixReadProjection(makeStubClient(fixtures), 'a1');
  assert.equal(noUserProj.permissions.canEditRows, false);
  assert.equal(noUserProj.permissions.canEditObservedMetrics, false);
  assert.equal(noUserProj.permissions.canEditFormula, false);

  // --- Empty calculation runs → unknown --------------------------------
  const emptyCalc = { ...fixtures, matrix_calculation_runs: [] };
  const unknownProj = await buildMatrixReadProjection(makeStubClient(emptyCalc), 'a1');
  assert.equal(unknownProj.calculation.status, 'unknown');
  assert.equal(unknownProj.calculation.lastRunId, undefined);

  console.log('projection builder tests passed');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
