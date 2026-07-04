# Matrix Batch Paste Implementation Plan (Wave 2-1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let matrix录入人员 paste a region of raw observed metrics from Excel into the desktop grid via Cmd/Ctrl+V, with one batch endpoint that writes all values and集中重算受影响计算列, returning per-command success/conflict/validation failure.

**Architecture:** New `POST /api/task-matrices/[id]/batch-commands` endpoint + new `src/lib/matrix/batch-paste.ts` orchestrator that复用 Wave 1's `upsertMetricEvaluation` (needs export) and `recomputeAffected` (needs `triggerType: 'batch_paste'` added to its union). Frontend adds `focusedCell` state to `MatrixInputView` + an `onPaste` handler in `MatrixVirtualGrid` that builds commands from clipboard geometry against the schema's observed-dimension sortOrder. Partial-success semantics — failed cells get red-border highlight overlay.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript 5, Tailwind 4 + shadcn/ui, Supabase-compatible client, `node:assert/strict` tests via `tsx`.

**Spec:** `docs/superpowers/specs/2026-07-04-matrix-batch-paste-design.md`

**Conventions (verified against codebase):**
- API: `getSupabaseClient()` + `requireUser`/`canAccessAssembly`/`isAuthResponse` + `writeSecurityAudit`, response `{code:0,message,data}` / `{code:1,message}` + status.
- Tests: standalone `.test.ts` with `import assert from 'node:assert/strict'`, run `pnpm tsx <file>`.
- Commit style: `feat(matrix): ...` / `fix(matrix): ...`.
- Wave 1 anchors: `recomputeAffected` at `src/lib/matrix/recompute.ts:159` (signature `RecomputeInput` at :20, `triggerType` union at :29). `upsertMetricEvaluation` at `src/lib/matrix/recompute.ts:540` (currently NOT exported). `MatrixMetricConflictError` at :70 (exported). `matrix_dimension_bindings` table has `dimension_key`, `column_group`, `editable`, `sort_order`, `schema_version_id`.

---

## File Structure

**New files (4):**
- `src/lib/matrix/batch-paste.ts` — orchestrator: geometry validation, per-command write loop,集中重算, idempotency, response shaping.
- `src/lib/matrix/batch-paste.test.ts` — node:assert tests covering geometry, partial success, idempotency, limit, calc-readonly.
- `src/app/api/task-matrices/[id]/batch-commands/route.ts` — POST endpoint, thin wrapper over `batch-paste.ts`.
- `tests/e2e/matrix-batch-paste.spec.ts` — Playwright AT-19~22 (best-effort; skip if no DB).

**Modified files (4):**
- `src/lib/matrix/recompute.ts` — (a) export `upsertMetricEvaluation` + its `UpsertMetricInput` type; (b) extend `RecomputeInput.triggerType` union with `'batch_paste'`.
- `src/app/(main)/tasks/[id]/components/matrix-input-view.tsx` — add `focusedCell` state + `handleBatchPaste` handler + `failedCells` overlay state; pass to grid.
- `src/app/(main)/tasks/[id]/components/matrix-virtual-grid.tsx` — accept `focusedCell`, `onFocusedCellChange`, `onPaste`, `failedCells` props; render red-border on failed cells; mount paste event listener on the grid container.
- `src/app/(main)/tasks/[id]/components/matrix-cell.tsx` — accept optional `failedError` prop for red-border + tooltip rendering.

---

### Task 1: Export `upsertMetricEvaluation` and extend `triggerType` union

**Files:**
- Modify: `src/lib/matrix/recompute.ts`

This unblocks Task 2 (batch-paste.ts needs both). Pure mechanical change — no behavior change.

- [ ] **Step 1: Read the current `upsertMetricEvaluation` signature**

Run: `grep -n "upsertMetricEvaluation\|UpsertMetricInput" src/lib/matrix/recompute.ts`
Note the line numbers of the function (~540) and its input type. The input type is likely defined inline or just above the function — read those lines.

- [ ] **Step 2: Export the function and its input type**

Change the declaration of `UpsertMetricInput` (the interface/type used as `upsertMetricEvaluation`'s `input` parameter) from internal to `export`. Change `async function upsertMetricEvaluation` to `export async function upsertMetricEvaluation`. Do NOT change any logic inside the function.

- [ ] **Step 3: Extend the `triggerType` union**

Find `RecomputeInput` (line ~20) and the `triggerType` field (line ~29):
```ts
triggerType?: 'api_save' | 'api_recalculate' | 'snapshot_build';
```
Change to:
```ts
triggerType?: 'api_save' | 'api_recalculate' | 'snapshot_build' | 'batch_paste';
```

- [ ] **Step 4: Verify nothing breaks**

Run: `pnpm ts-check`
Expected: PASS (this is purely additive — adds an export and a union member).

Run: `pnpm tsx src/lib/matrix/recompute.test.ts`
Expected: `recompute tests passed` (no regression — the function body is unchanged).

- [ ] **Step 5: Commit**

```bash
git add src/lib/matrix/recompute.ts
git commit -m "feat(matrix): export upsertMetricEvaluation and accept batch_paste trigger"
```

---

### Task 2: `batch-paste.ts` orchestrator — types and geometry validation

**Files:**
- Create: `src/lib/matrix/batch-paste.ts`
- Create: `src/lib/matrix/batch-paste.test.ts`

This task delivers the pure-function geometry/validation layer plus the types. The DB-touching orchestrator body comes in Task 3. TDD: write the failing test first.

- [ ] **Step 1: Write the failing test**

Create `src/lib/matrix/batch-paste.test.ts`:

```ts
import assert from 'node:assert/strict';
import {
  validateBatchRequest,
  type BatchCommand,
  type BatchPasteRequest,
  BATCH_LIMIT,
} from './batch-paste';

const observedOrder = ['duration', 'ingredient_weight', 'juice_weight', 'pulp_weight'];

// Geometry: commands inside the anchor rectangle (same group, cols >= anchor col, rows >= anchor row)
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
  const groupRows = ['r1', 'r2', 'r3'];  // sort_order ascending
  const result = validateBatchRequest(req, { observedSortOrder: observedOrder, groupRows });
  assert.equal(result.valid, true);
}

// Anchor invalid: dimensionKey is not observed
{
  const req: BatchPasteRequest = {
    clientOperationId: 'op1', baseVersion: 1,
    anchor: { rowId: 'r1', dimensionKey: 'juice_yield' },  // calculated
    commands: [],
  };
  const result = validateBatchRequest(req, { observedSortOrder: observedOrder, groupRows: ['r1'] });
  assert.equal(result.valid, false);
  if (!result.valid) assert.equal(result.code, 'MATRIX_BATCH_ANCHOR_INVALID');
}

// Command out of range: row in different group
{
  const req: BatchPasteRequest = {
    clientOperationId: 'op1', baseVersion: 1,
    anchor: { rowId: 'r1', dimensionKey: 'ingredient_weight' },
    commands: [
      { type: 'setMetric', rowId: 'rX', dimensionKey: 'ingredient_weight', value: 100 },  // not in groupRows
    ],
  };
  const result = validateBatchRequest(req, { observedSortOrder: observedOrder, groupRows: ['r1', 'r2'] });
  assert.equal(result.valid, false);
  if (!result.valid) assert.equal(result.code, 'MATRIX_BATCH_COMMAND_OUT_OF_RANGE');
}

// Command out of range: column before anchor (跳列)
{
  const req: BatchPasteRequest = {
    clientOperationId: 'op1', baseVersion: 1,
    anchor: { rowId: 'r1', dimensionKey: 'juice_weight' },  // index 2
    commands: [
      { type: 'setMetric', rowId: 'r1', dimensionKey: 'ingredient_weight', value: 100 },  // index 1 < 2
    ],
  };
  const result = validateBatchRequest(req, { observedSortOrder: observedOrder, groupRows: ['r1'] });
  assert.equal(result.valid, false);
  if (!result.valid) assert.equal(result.code, 'MATRIX_BATCH_COMMAND_OUT_OF_RANGE');
}

// Limit exceeded
{
  const commands: BatchCommand[] = Array.from({ length: BATCH_LIMIT + 1 }, (_, i) => ({
    type: 'setMetric' as const, rowId: 'r1', dimensionKey: 'ingredient_weight', value: i,
  }));
  const req: BatchPasteRequest = {
    clientOperationId: 'op1', baseVersion: 1,
    anchor: { rowId: 'r1', dimensionKey: 'ingredient_weight' },
    commands,
  };
  const result = validateBatchRequest(req, { observedSortOrder: observedOrder, groupRows: ['r1'] });
  assert.equal(result.valid, false);
  if (!result.valid) assert.equal(result.code, 'MATRIX_BATCH_LIMIT_EXCEEDED');
}

// Empty commands
{
  const req: BatchPasteRequest = {
    clientOperationId: 'op1', baseVersion: 1,
    anchor: { rowId: 'r1', dimensionKey: 'ingredient_weight' },
    commands: [],
  };
  const result = validateBatchRequest(req, { observedSortOrder: observedOrder, groupRows: ['r1'] });
  assert.equal(result.valid, false);
  if (!result.valid) assert.equal(result.code, 'MATRIX_BATCH_INVALID_SHAPE');
}

console.log('batch-paste validation tests passed');
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm tsx src/lib/matrix/batch-paste.test.ts`
Expected: FAIL — module `./batch-paste` not found.

- [ ] **Step 3: Implement types + `validateBatchRequest`**

Create `src/lib/matrix/batch-paste.ts`:

```ts
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

export type BatchValidationError =
  | { valid: true }
  | { valid: false; code: 'MATRIX_BATCH_INVALID_SHAPE' | 'MATRIX_BATCH_ANCHOR_INVALID' | 'MATRIX_BATCH_COMMAND_OUT_OF_RANGE' | 'MATRIX_BATCH_LIMIT_EXCEEDED'; message?: string };

export interface ValidationContext {
  observedSortOrder: string[];   // dimension_keys of observed+editable columns in sort_order
  groupRows: string[];            // row ids of the anchor's group in sort_order ascending
}

/**
 * Pure-function validation of the request shape, anchor, and command geometry
 * against the schema's observed-dimension order and the anchor's group rows.
 * Does NOT touch the DB.
 */
export function validateBatchRequest(req: BatchPasteRequest, ctx: ValidationContext): BatchValidationError {
  if (!Array.isArray(req.commands) || req.commands.length === 0) {
    return { valid: false, code: 'MATRIX_BATCH_INVALID_SHAPE', message: 'commands 为空' };
  }
  if (req.commands.length > BATCH_LIMIT) {
    return { valid: false, code: 'MATRIX_BATCH_LIMIT_EXCEEDED', message: `粘贴超出 ${BATCH_LIMIT} 单元格上限` };
  }
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

  for (const cmd of req.commands) {
    if (cmd.type !== 'setMetric') {
      return { valid: false, code: 'MATRIX_BATCH_INVALID_SHAPE', message: `不支持的命令类型 ${cmd.type}` };
    }
    const cmdColIdx = ctx.observedSortOrder.indexOf(cmd.dimensionKey);
    if (cmdColIdx < 0) {
      // Not an observed column (could be calculated or unknown) — handled per-command at write time,
      // but for geometry we treat out-of-order/unknown as range violation.
      return { valid: false, code: 'MATRIX_BATCH_COMMAND_OUT_OF_RANGE', message: `命令列 ${cmd.dimensionKey} 不是原始指标` };
    }
    if (cmdColIdx < anchorColIdx) {
      return { valid: false, code: 'MATRIX_BATCH_COMMAND_OUT_OF_RANGE', message: `命令列 ${cmd.dimensionKey} 在 anchor 之前` };
    }
    const cmdRowIdx = ctx.groupRows.indexOf(cmd.rowId);
    if (cmdRowIdx < 0) {
      return { valid: false, code: 'MATRIX_BATCH_COMMAND_OUT_OF_RANGE', message: `命令行 ${cmd.rowId} 不在当前组内（跨组禁止）` };
    }
    if (cmdRowIdx < anchorRowIdx) {
      return { valid: false, code: 'MATRIX_BATCH_COMMAND_OUT_OF_RANGE', message: `命令行 ${cmd.rowId} 在 anchor 之前` };
    }
  }
  return { valid: true };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm tsx src/lib/matrix/batch-paste.test.ts`
Expected: `batch-paste validation tests passed`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/matrix/batch-paste.ts src/lib/matrix/batch-paste.test.ts
git commit -m "feat(matrix): add batch paste validation and types"
```

---

### Task 3: `batch-paste.ts` orchestrator — `executeBatchPaste` (DB layer)

**Files:**
- Modify: `src/lib/matrix/batch-paste.ts` (add `executeBatchPaste`)
- Modify: `src/lib/matrix/batch-paste.test.ts` (add execution tests with a stub client)

This is the load-bearing task. The orchestrator: validates → checks idempotency → loads schema bindings + group rows → per-command write (partial success) →集中重算 → audit → shape response.

- [ ] **Step 1: Write the failing execution tests (append to batch-paste.test.ts)**

```ts
import { executeBatchPaste } from './batch-paste';

// Build a stub supabase-like client matching the shape recompute.ts/projection.ts use.
// Tables fixture keyed by table name; .from(t).select().eq(...) chainable; .maybeSingle()/list; .insert/.update.
function makeStubClient(tables: Record<string, any[]>, opts: { conflicts?: Record<string, any> } = {}) {
  // Reuse the same chainable pattern used in projection.test.ts / recompute.test.ts.
  // Read those files first to copy the exact chainable shape (from/select/eq/order/limit/maybeSingle/insert/update).
  // ...implement minimally, supporting the queries executeBatchPaste issues:
  //   - comparison_assemblies (eq id, maybeSingle)
  //   - comparison_item_nodes (eq assembly_id, order sort_order) — for group rows
  //   - matrix_dimension_bindings (eq schema_version_id, order sort_order) — for observedSortOrder
  //   - metric_evaluations (eq cell_id) — read current for upsert
  //   - matrix_calculation_runs (eq trace_id + matrix_instance_id, maybeSingle) — idempotency; insert
  // For update/insert, mutate the tables fixture so subsequent reads see the change.
  // (Adapt from recompute.test.ts's stub which already supports most of this.)
}

// Happy path: 2 commands, both succeed, recompute returns juice_yield
{
  const tables = {
    comparison_assemblies: [{ id: 'a1', matrix_role: 'data_matrix', matrix_schema_version_id: 'sv1', source_task_ids: ['t1'] }],
    comparison_item_nodes: [
      { id: 'g1', assembly_id: 'a1', parent_id: null, node_type: 'section', node_label: '胡萝卜', sort_order: 0 },
      { id: 'r1', assembly_id: 'a1', parent_id: 'g1', node_type: 'item', sort_order: 0, config: { subject_key: '160' } },
      { id: 'r2', assembly_id: 'a1', parent_id: 'g1', node_type: 'item', sort_order: 1, config: { subject_key: '120' } },
    ],
    matrix_dimension_bindings: [
      { dimension_key: 'ingredient_weight', column_group: 'observed', editable: true, sort_order: 0, schema_version_id: 'sv1', value_kind: 'number', unit_code: 'g' },
      { dimension_key: 'juice_weight', column_group: 'observed', editable: true, sort_order: 1, schema_version_id: 'sv1', value_kind: 'number', unit_code: 'g' },
      { dimension_key: 'juice_yield', column_group: 'calculated', editable: false, sort_order: 2, schema_version_id: 'sv1', value_kind: 'number', unit_code: '%' },
    ],
    matrix_formula_definitions: [{ output_dimension_key: 'juice_yield', formula_dsl: 'ROUND(SELF("juice_weight")/SELF("ingredient_weight"),4)', formula_version: 'v1', status: 'published', schema_version_id: 'sv1', dependencies: ['juice_weight','ingredient_weight'] }],
    metric_evaluations: [],
    matrix_calculation_runs: [],
  };
  const result = await executeBatchPaste(makeStubClient(tables), 'a1', {
    clientOperationId: 'op_happy', baseVersion: 1,
    anchor: { rowId: 'r1', dimensionKey: 'ingredient_weight' },
    commands: [
      { type: 'setMetric', rowId: 'r1', dimensionKey: 'ingredient_weight', value: 1193.1, unitCode: 'g' },
      { type: 'setMetric', rowId: 'r1', dimensionKey: 'juice_weight', value: 558.7, unitCode: 'g' },
    ],
  }, { actorId: 'u1' });
  assert.equal(result.status, 'succeeded');
  assert.equal(result.results.length, 2);
  assert.equal(result.results.every((r: any) => r.status === 'succeeded'), true);
  // juice_yield权威值 ≈ 0.4683
  const jy = result.authoritativeCalculations.find((c: any) => c.metricKey === 'juice_yield');
  assert.ok(jy, 'juice_yield should be in authoritativeCalculations');
  assert.ok(Math.abs((jy as any).value - 0.4683) < 1e-6, `juice_yield got ${(jy as any).value}`);
}

// Partial success: 2 commands, second hits version conflict
{
  // ... fixture with one existing metric_evaluations row at version 5 for (r1, juice_weight)
  // ... stub configured so the second upsert returns 0 rows (version guard) → conflict
  // assert result.status === 'partially_succeeded'
  // assert result.results[0].status === 'succeeded'
  // assert result.results[1].status === 'conflict'
  // assert result.results[1].error.code === 'MATRIX_METRIC_VERSION_CONFLICT'
}

// Idempotency: same clientOperationId twice → second returns first's results, no new run
{
  // ... call executeBatchPaste twice with same clientOperationId
  // assert second.results deep-equal first.results
  // assert matrix_calculation_runs.length === 1 (not 2)
}

console.log('batch-paste execution tests passed');
```

(The full stub-client implementation should mirror `recompute.test.ts`'s stub — read that file first and adapt. The key extension: support `.eq()` chaining on multiple columns, `.insert()` mutating the table, and `.update()` with `.eq('id', ...).eq('version', ...).select().maybeSingle()` returning the affected row or null.)

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm tsx src/lib/matrix/batch-paste.test.ts`
Expected: FAIL — `executeBatchPaste` not exported.

- [ ] **Step 3: Implement `executeBatchPaste`**

In `src/lib/matrix/batch-paste.ts`, add (after the validation code):

```ts
import { recomputeAffected, upsertMetricEvaluation, MatrixMetricConflictError } from './recompute';

export interface ExecuteBatchPasteInput extends BatchPasteRequest {
  // (uses BatchPasteRequest fields)
}

export interface ExecuteOptions {
  actorId: string;
}

export async function executeBatchPaste(
  client: any,
  assemblyId: string,
  req: ExecuteBatchPasteInput,
  opts: ExecuteOptions,
): Promise<BatchPasteResult> {
  // 1. Load assembly
  const { data: assembly, error: aErr } = await client.from('comparison_assemblies')
    .select('id,matrix_role,matrix_schema_version_id').eq('id', assemblyId).maybeSingle();
  if (aErr) throw new Error(aErr.message);
  if (!assembly || assembly.matrix_role !== 'data_matrix') {
    throw new Error('未找到数据矩阵实例');
  }
  const schemaVersionId = String(assembly.matrix_schema_version_id);

  // 2. Idempotency: check existing run with this trace_id
  const { data: existingRun } = await client.from('matrix_calculation_runs')
    .select('id,status,input_version_hash').eq('matrix_instance_id', assemblyId)
    .eq('trace_id', req.clientOperationId).maybeSingle();
  if (existingRun) {
    // Re-fetch results: load metric_evaluations for cells whose source_run_id chain points here,
    // OR (simpler for v1) re-run projection of authoritativeCalculations by reading current metric_evaluations
    // for the rows that this batch touched. For v1 simplicity, return a minimal "already applied" result
    // — the client should rarely re-send the same clientOperationId.
    // Document this as a v1 simplification; full replay needs storing results snapshot.
    return {
      operationId: req.clientOperationId, status: 'succeeded',
      results: [], authoritativeCalculations: [], calculationRunIds: [String(existingRun.id)],
      warnings: ['该操作已执行过，返回幂等确认（v1 不重放逐项结果，请刷新投影）'],
    };
  }

  // 3. Load schema bindings (observed+editable, in sort_order)
  const { data: bindings, error: bErr } = await client.from('matrix_dimension_bindings')
    .select('dimension_key,column_group,editable,sort_order,value_kind,unit_code')
    .eq('schema_version_id', schemaVersionId).order('sort_order', { ascending: true });
  if (bErr) throw new Error(bErr.message);
  const observedSortOrder = (bindings || []).filter((b: any) => b.column_group === 'observed' && b.editable !== false).map((b: any) => b.dimension_key);
  const bindingByKey = new Map((bindings || []).map((b: any) => [b.dimension_key, b]));

  // 4. Load group rows: find anchor row's parent_id (group), then rows of that group in sort_order
  const { data: allNodes, error: nErr } = await client.from('comparison_item_nodes')
    .select('id,parent_id,node_type,sort_order').eq('assembly_id', assemblyId).order('sort_order', { ascending: true });
  if (nErr) throw new Error(nErr.message);
  const anchorNode = (allNodes || []).find((n: any) => n.id === req.anchor.rowId);
  if (!anchorNode || !['item', 'condition'].includes(anchorNode.node_type)) {
    return failedResult(req, 'MATRIX_BATCH_ANCHOR_INVALID', 'anchor 行不是数据行');
  }
  const groupId = String(anchorNode.parent_id);
  const groupRows = (allNodes || []).filter((n: any) => n.parent_id === groupId && ['item', 'condition'].includes(n.node_type)).map((n: any) => n.id);

  // 5. Geometry validation (pure)
  const validation = validateBatchRequest(req, { observedSortOrder, groupRows });
  if (!validation.valid) {
    return failedResult(req, validation.code, validation.message);
  }

  // 6. Per-command write (partial success)
  const results: BatchCommandResult[] = [];
  for (let i = 0; i < req.commands.length; i++) {
    const cmd = req.commands[i];
    const binding = bindingByKey.get(cmd.dimensionKey);
    if (!binding || binding.column_group !== 'observed' || binding.editable === false) {
      results.push({ index: i, status: 'validation_failed', rowId: cmd.rowId, dimensionKey: cmd.dimensionKey,
        error: { code: 'MATRIX_CALCULATED_VALUE_READONLY', message: '该列为计算指标或不可编辑' } });
      continue;
    }
    try {
      // Build the typed payload
      const valueKind = String(binding.value_kind || 'number');
      const unitCode = cmd.unitCode || binding.unit_code || undefined;
      const payload: any = { calculation_mode: 'manual', input_state: 'valid', unit_code: unitCode ?? null, error_code: null };
      if (valueKind === 'duration') payload.duration_ms = typeof cmd.value === 'number' ? cmd.value : Number(cmd.value);
      else if (valueKind === 'text') payload.text_value = String(cmd.value);
      else payload.numeric_value = typeof cmd.value === 'number' ? cmd.value : Number(cmd.value);
      if (!Number.isFinite(payload.numeric_value ?? payload.duration_ms ?? 0) && valueKind !== 'text') {
        throw new Error('MATRIX_VALUE_INVALID');
      }
      await upsertMetricEvaluation(client, { cell_id: cmd.rowId, metric_key: cmd.dimensionKey, ...payload });
      // Read back the new version (upsertMetricEvaluation increments version)
      const { data: row } = await client.from('metric_evaluations').select('version')
        .eq('cell_id', cmd.rowId).eq('metric_key', cmd.dimensionKey).maybeSingle();
      results.push({ index: i, status: 'succeeded', rowId: cmd.rowId, dimensionKey: cmd.dimensionKey, newVersion: row?.version });
    } catch (err) {
      if (err instanceof MatrixMetricConflictError) {
        const { data: latest } = await client.from('metric_evaluations').select('version,numeric_value,duration_ms,text_value')
          .eq('cell_id', cmd.rowId).eq('metric_key', cmd.dimensionKey).maybeSingle();
        results.push({ index: i, status: 'conflict', rowId: cmd.rowId, dimensionKey: cmd.dimensionKey,
          error: { code: 'MATRIX_METRIC_VERSION_CONFLICT', latestVersion: latest?.version, latestValue: latest?.numeric_value ?? latest?.duration_ms ?? latest?.text_value } });
      } else {
        const code = (err instanceof Error && err.message) || 'MATRIX_VALUE_INVALID';
        results.push({ index: i, status: 'validation_failed', rowId: cmd.rowId, dimensionKey: cmd.dimensionKey,
          error: { code, message: err instanceof Error ? err.message : undefined } });
      }
    }
  }

  // 7.集中重算: dedupe affected rows
  const affectedRowIds = Array.from(new Set(results.filter(r => r.status === 'succeeded').map(r => r.rowId)));
  const authoritativeCalculations: AuthoritativeCalc[] = [];
  const calculationRunIds: string[] = [];
  for (const rowId of affectedRowIds) {
    const recompute = await recomputeAffected({
      client, assemblyId, schemaVersionId,
      triggeredRowId: rowId, triggeredDimensionKey: '<batch>',
      traceId: req.clientOperationId, triggerType: 'batch_paste',
    });
    authoritativeCalculations.push(...recompute.updated.map(u => ({
      rowId: u.rowId, metricKey: u.metricKey, value: u.value, status: u.status,
      formulaVersion: u.formulaVersion, errorCode: u.errorCode,
    })));
    calculationRunIds.push(recompute.runId);
  }

  // 8. Compose status
  const succeeded = results.filter(r => r.status === 'succeeded').length;
  const status: BatchPasteResult['status'] = succeeded === results.length ? 'succeeded'
    : succeeded === 0 ? 'failed' : 'partially_succeeded';

  // 9. Audit (best-effort — don't let audit failure lose the result)
  try {
    // Use the same writeSecurityAudit signature existing routes use; pass via client directly if no request ctx.
    // Since executeBatchPaste doesn't have the NextRequest, the route layer does the audit call instead.
    // (Audit moved to route layer in Task 4.)
  } catch { /* ignore audit errors */ }

  return {
    operationId: req.clientOperationId, status, results,
    authoritativeCalculations, calculationRunIds, warnings: [],
  };
}

function failedResult(req: ExecuteBatchPasteInput, code: string, message?: string): BatchPasteResult {
  return {
    operationId: req.clientOperationId, status: 'failed',
    results: req.commands.map((cmd, i) => ({ index: i, status: 'validation_failed' as const, rowId: cmd.rowId, dimensionKey: cmd.dimensionKey, error: { code, message } })),
    authoritativeCalculations: [], calculationRunIds: [], warnings: [],
  };
}
```

**Note for implementer:** the idempotency replay path in step 2 is a v1 simplification — full per-command replay would require storing the results snapshot. The warning returned tells the client to refetch the projection. Document this in a code comment.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm tsx src/lib/matrix/batch-paste.test.ts`
Expected: `batch-paste validation tests passed` followed by `batch-paste execution tests passed`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/matrix/batch-paste.ts src/lib/matrix/batch-paste.test.ts
git commit -m "feat(matrix): add batch paste orchestrator with central recompute"
```

---

### Task 4: `POST /api/task-matrices/[id]/batch-commands` endpoint

**Files:**
- Create: `src/app/api/task-matrices/[id]/batch-commands/route.ts`

Thin route wrapper over `executeBatchPaste`. Handles auth, body parsing, error mapping, audit.

- [ ] **Step 1: Implement the route**

Create `src/app/api/task-matrices/[id]/batch-commands/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { canAccessAssembly, isAuthResponse, requireUser } from '@/lib/server/auth';
import { writeSecurityAudit } from '@/lib/server/security-audit';
import { executeBatchPaste, type BatchPasteRequest } from '@/lib/matrix/batch-paste';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const client = getSupabaseClient();
  const user = await requireUser(request, client);
  if (isAuthResponse(user)) return user;
  const { id: assemblyId } = await params;
  if (!(await canAccessAssembly(client, user, assemblyId))) {
    return NextResponse.json({ code: 1, message: '无权访问该矩阵' }, { status: 403 });
  }

  const body = await request.json().catch(() => null) as BatchPasteRequest | null;
  if (!body || !body.clientOperationId || !body.anchor || !Array.isArray(body.commands)) {
    return NextResponse.json({ code: 1, message: '请求格式不正确' }, { status: 400 });
  }

  try {
    const result = await executeBatchPaste(client, assemblyId, body, { actorId: user.id });

    // Audit (best-effort)
    try {
      await writeSecurityAudit(client, {
        request, actor: user, action: 'matrix_batch.executed', outcome: 'success',
        targetType: 'comparison_assembly', targetId: assemblyId,
        metadata: {
          clientOperationId: body.clientOperationId,
          commandCount: body.commands.length,
          succeeded: result.results.filter(r => r.status === 'succeeded').length,
          failed: result.results.filter(r => r.status !== 'succeeded').length,
          status: result.status,
        },
      });
    } catch { /* audit failure must not lose the result */ }

    // HTTP status: 200 for succeeded/partial, 207-ish for partial would be non-idiomatic here;
    // stick with 200 + status field; client inspects result.status.
    return NextResponse.json({ code: 0, message: 'success', data: result });
  } catch (err) {
    return NextResponse.json(
      { code: 1, message: err instanceof Error ? err.message : '批量粘贴失败' },
      { status: 500 },
    );
  }
}
```

**Note:** the route does NOT do baseVersion 409 here — `executeBatchPaste` returns a `failed` result with code `MATRIX_VERSION_CONFLICT` when applicable (or, for v1 where projection.version is hardcoded to 1, this check is a no-op; see spec §8.5). Map the error code → HTTP status in the catch block if needed; for v1 keep it simple: 200 with result.status='failed' for validation failures, 500 for unexpected.

Actually — to honor the spec's HTTP contract (422 for anchor/range, 429 for limit, 409 for baseVersion), inspect `result.status` and the first result's `error.code`:

After `const result = await executeBatchPaste(...)`:
```ts
if (result.status === 'failed' && result.results[0]?.error) {
  const code = result.results[0].error.code;
  const status = code === 'MATRIX_BATCH_LIMIT_EXCEEDED' ? 429
    : code === 'MATRIX_BATCH_ANCHOR_INVALID' || code === 'MATRIX_BATCH_COMMAND_OUT_OF_RANGE' || code === 'MATRIX_BATCH_INVALID_SHAPE' ? 422
    : code === 'MATRIX_VERSION_CONFLICT' ? 409
    : 200;
  return NextResponse.json({ code: 1, message: result.results[0].error.message || code, data: { code } }, { status });
}
```
Place this BEFORE the success-return so validation failures get the right HTTP status.

- [ ] **Step 2: Type check**

Run: `pnpm ts-check`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/task-matrices/[id]/batch-commands/route.ts
git commit -m "feat(matrix): add batch-commands endpoint"
```

---

### Task 5: Frontend — `focusedCell` state and `onPaste` handler in `MatrixInputView`

**Files:**
- Modify: `src/app/(main)/tasks/[id]/components/matrix-input-view.tsx`
- Modify: `src/app/(main)/tasks/[id]/components/matrix-virtual-grid.tsx`
- Modify: `src/app/(main)/tasks/[id]/components/matrix-cell.tsx`

Adds the desktop paste UX. Mobile is unchanged (no paste).

- [ ] **Step 1: Add `focusedCell` and `failedCells` state to `MatrixInputView`**

In `matrix-input-view.tsx`, near the existing state declarations (around line 333-338):

```ts
const [focusedCell, setFocusedCell] = useState<{ rowId: string; dimensionKey: string } | null>(null);
const [failedCells, setFailedCells] = useState<Record<string, { code: string; message?: string }>>({});
// failedCells key: `${rowId}::${dimensionKey}`
```

- [ ] **Step 2: Add `handleBatchPaste` callback**

In `matrix-input-view.tsx`, add a handler that the grid calls when the user pastes:

```ts
const handleBatchPaste = useCallback(async (
  anchor: { rowId: string; dimensionKey: string },
  clipboardGrid: (string | number)[][],
) => {
  if (!projection || !instanceId) return;
  // Build commands by aligning clipboardGrid against the schema's observed sortOrder
  // starting at anchor.
  const observedDims = projection.schema.dimensions
    .filter(d => d.columnGroup === 'observed' && d.editable !== false)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const anchorColIdx = observedDims.findIndex(d => d.dimensionKey === anchor.dimensionKey);
  if (anchorColIdx < 0) { toast.error('错点不是原始指标列'); return; }
  const groupRows = projection.groups
    .flatMap(g => g.rows)
    .filter(r => /* r is in the same group as anchor — find anchor's group */ true);  // see note
  const anchorRowGroupIdx = /* find anchor.rowId in groupRows */ -1;
  // Build commands
  const commands = [];
  for (let r = 0; r < clipboardGrid.length; r++) {
    for (let c = 0; c < clipboardGrid[r].length; c++) {
      const targetDim = observedDims[anchorColIdx + c];
      const targetRow = groupRows[anchorRowGroupIdx + r];
      if (!targetDim || !targetRow) continue;  // out of range — skip (server will also catch)
      commands.push({ type: 'setMetric' as const, rowId: targetRow.id, dimensionKey: targetDim.dimensionKey, value: clipboardGrid[r][c] });
    }
  }
  if (commands.length === 0) return;

  // Optimistic calc using shared DSL engine (same as handleMetricChange)
  // ... compute optimistic for affected calculated metrics, setOptimistic

  try {
    const res = await fetch(`/api/task-matrices/${instanceId}/batch-commands`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientOperationId: `op_${Date.now()}_${Math.random().toString(36).slice(2,8)}`, baseVersion: projection.version, anchor, commands }),
    });
    const json = await res.json();
    if (json.code !== 0) { toast.error(json.message || '批量粘贴失败'); return; }
    const data = json.data;
    // Apply authoritativeCalculations + clear optimistic for affected
    setProjection(prev => {
      if (!prev) return prev;
      // Merge succeeded metric versions + authoritativeCalculations into prev
      // (functional update — same pattern as Task 10's fix)
      // ... implement merge: for each succeeded result, set the row's metric version;
      // for each authoritativeCalc, set the row's calculated metric value/state.
      return merged;
    });
    // Set failedCells overlay
    const newFailed: Record<string, { code: string; message?: string }> = {};
    for (const r of data.results) {
      if (r.status !== 'succeeded' && r.error) {
        newFailed[`${r.rowId}::${r.dimensionKey}`] = { code: r.error.code, message: r.error.message };
      }
    }
    setFailedCells(newFailed);
    if (data.status === 'partially_succeeded') {
      toast.message(`粘贴部分成功：${data.results.filter((r:any)=>r.status==='succeeded').length}/${data.results.length}`);
    }
  } catch (err) {
    toast.error('批量粘贴失败');
  }
}, [projection, instanceId]);
```

**Note for implementer:** the "find anchor's group" logic — `projection.groups` is the group tree; find which group contains `anchor.rowId`, then `groupRows` = that group's `rows` array (already in sort_order from the projection). The `anchorRowGroupIdx` is the index of `anchor.rowId` within that group's rows. Read the existing `MatrixReadProjection` type in `projection.ts` to confirm the shape.

- [ ] **Step 3: Pass new props to `MatrixVirtualGrid`**

In `matrix-input-view.tsx`, where `<MatrixVirtualGrid>` is rendered (the `hidden md:block` block), add:
```tsx
<MatrixVirtualGrid
  {...existingProps}
  focusedCell={focusedCell}
  onFocusedCellChange={setFocusedCell}
  onBatchPaste={handleBatchPaste}
  failedCells={failedCells}
  onClearCellFailure={(key) => setFailedCells(prev => { const n = {...prev}; delete n[key]; return n; })}
/>
```

Also add `focusedCell`/`failedCells`/`handleBatchPaste` to the `sharedHandlers` bundle if the mobile cards need them (they don't for paste, but `failedCells` overlay should render on mobile too if a cell is marked failed — pass `failedCells` to mobile cards so the red-border shows; do NOT pass `onBatchPaste` to mobile).

- [ ] **Step 4: `MatrixVirtualGrid` — accept props, mount paste listener, render failure overlay**

In `matrix-virtual-grid.tsx`:
- Add to `MatrixVirtualGridProps`: `focusedCell`, `onFocusedCellChange`, `onBatchPaste`, `failedCells`, `onClearCellFailure`.
- Mount a `paste` event listener on the grid's scroll container via `useEffect`:
```ts
useEffect(() => {
  const container = containerRef.current;
  if (!container) return;
  const onPaste = (e: ClipboardEvent) => {
    if (!focusedCell) return;
    const text = e.clipboardData?.getData('text/plain') ?? '';
    if (!text) return;
    e.preventDefault();
    const rows = text.split(/\r?\n/).filter(r => r.length > 0);
    const grid = rows.map(r => r.split(/\t/).map(cell => {
      const n = Number(cell);
      return Number.isFinite(n) ? n : cell;
    }));
    onBatchPaste(focusedCell, grid);
  };
  container.addEventListener('paste', onPaste);
  return () => container.removeEventListener('paste', onPaste);
}, [focusedCell, onBatchPaste]);
```
- Pass `failedError={failedCells[`${row.id}::${dim.dimensionKey}`]}` and `onClearFailure` to each `<ObservedMetricCell>`.

- [ ] **Step 5: `MatrixCell` — accept `failedError`, render red border + tooltip**

In `matrix-cell.tsx`, `ObservedMetricCell` accepts an optional `failedError?: { code: string; message?: string }` and `onClearFailure?: () => void`. When set:
- Wrap the cell content in a div with `className="ring-2 ring-destructive rounded"` (or `border-2 border-destructive`).
- Add `title={failedError.message || failedError.code}` for the tooltip.
- On next focus/typing in the cell, call `onClearFailure?.()` to clear the overlay.

Add a `failedErrorToText(code)` helper near `errorCodeToText` mapping the batch error codes (MATRIX_BATCH_LIMIT_EXCEEDED etc.) — extend the existing `errorCodeToText` map.

- [ ] **Step 6: Type check + smoke**

Run: `pnpm ts-check`
Expected: PASS.

Manual smoke (if dev server + DB available): open a task with a matrix, click a cell, paste a 2×2 region from Excel, observe optimistic update then authoritative refresh. If no DB, rely on ts-check + careful prop wiring.

- [ ] **Step 7: Commit**

```bash
git add src/app/(main)/tasks/[id]/components/matrix-input-view.tsx src/app/(main)/tasks/[id]/components/matrix-virtual-grid.tsx src/app/(main)/tasks/[id]/components/matrix-cell.tsx
git commit -m "feat(matrix): add desktop paste UX with failure overlay"
```

---

### Task 6: Playwright E2E smoke (AT-19~22, best-effort)

**Files:**
- Create: `tests/e2e/matrix-batch-paste.spec.ts`

Mirrors `tests/e2e/matrix-juicer.spec.ts` structure. Skips gracefully if no DB/seed.

- [ ] **Step 1: Read the juicer spec + auth-session helper**

Read `tests/e2e/matrix-juicer.spec.ts` and `tests/e2e/auth-session.ts` to copy: auth pattern, task provisioning, skip-when-not-seeded, afterAll cleanup.

- [ ] **Step 2: Write the spec covering AT-19~22**

```ts
import { test, expect, type Page, type APIRequestContext } from '@playwright/test';
// ... import loginForE2E, constants, etc. from the juicer spec's pattern

test.describe.serial('Matrix batch paste (AT-19~22)', () => {
  // Setup: provision task, apply juicer schema, add group + 3 rows (160/120/extra)
  // Reuse juicer schema's ingredient_weight/juice_weight dimensions

  test('AT-19 paste 2x2 observed region recomputes juice_yield', async ({ page, request }) => {
    // Navigate to matrix tab, focus ingredient_weight cell on row 1
    // Dispatch a paste event with clipboard text "1193.1\t558.7\n1182.3\t305.5"
    // Poll GET /api/task-matrices/${assemblyId} until row 1's juice_yield ≈ 0.4683
    // Assert DOM shows 0.4683 in row 1's 出汁率含渣 cell
  });

  test('AT-20 paste region including a calculated column rejects that column', async ({ page, request }) => {
    // Paste a region whose second column is juice_yield (calculated)
    // Assert that cell shows red failure overlay (or that the request response includes MATRIX_CALCULATED_VALUE_READONLY for that command)
    // Assert the observed column in the same paste succeeded
  });

  test('AT-21 paste 501 cells returns 429', async ({ page, request }) => {
    // POST directly to /api/task-matrices/${assemblyId}/batch-commands with 501 commands
    // Assert response status 429 and code MATRIX_BATCH_LIMIT_EXCEEDED
  });

  test('AT-22 concurrent edit during paste surfaces conflict', async ({ page, request }) => {
    // Pre-set (r1, ingredient_weight) to version N via direct PATCH
    // POST batch-commands with stale baseVersion or a command whose expectedVersion mismatches
    // Assert that command's result.status === 'conflict'
  });
});
```

- [ ] **Step 3: Verify ts-check + skip-when-no-DB**

Run: `pnpm ts-check`
Expected: PASS (Playwright types resolve).

The spec self-skips if the juicer schema isn't seeded or no DB (mirror the juicer spec's skip logic).

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/matrix-batch-paste.spec.ts
git commit -m "test(matrix): add batch paste end-to-end smoke"
```

---

### Task 7: Update AGENTS.md

**Files:**
- Modify: `AGENTS.md`

- [ ] **Step 1: Add the batch-commands API row**

In the "API 接口" section, add:
```
| POST | `/api/task-matrices/[id]/batch-commands` | 批量粘贴原始指标（≤500 单元格，部分成功+逐项错误，batch 末尾集中重算） |
```

- [ ] **Step 2: Add a design-decision item**

In "关键设计决策", append a new numbered item (continue from whatever the last number is after Wave 1's items):
```
N. **批量粘贴增强**: 仅原始指标区粘贴；点选错点决定起点；batch 末尾集中重算（按行去重）；500 单元格上限；部分成功不回滚（沿用 pg-query 无事务限制），失败格前端红色高亮 + 错误码 tooltip；复用 recomputeAffected/upsertMetricEvaluation，不新增表；移动端不开放批量粘贴。
```

- [ ] **Step 3: Commit**

```bash
git add AGENTS.md
git commit -m "docs(matrix): document batch paste enhancement"
```

---

## Self-Review Notes (post-write)

- **Spec coverage:** §1 goals → Tasks 2-6. §6 API → Task 4. §7 server flow → Task 3. §8 frontend → Task 5. §9 error mapping → Task 5 Step 5 (`failedErrorToText`). §10 security/auth → Task 4. §11 perf → no virtualization needed for ≤500; documented. §12 tests → Task 2/3 (unit) + Task 6 (E2E). §14 open items BP-01~04 → all resolved by design defaults. §8.5 version caveat → noted in Task 3 idempotency comment.
- **Type consistency:** `BatchPasteRequest`/`BatchCommand`/`BatchPasteResult` defined in Task 2, used in Task 3/4/5. `RecomputeInput.triggerType` extended in Task 1, used in Task 3. `upsertMetricEvaluation` exported in Task 1, used in Task 3.
- **Known gaps flagged for implementer:** (a) the idempotency replay path (Task 3 step 2) is a v1 simplification — full per-command replay needs a results snapshot, deferred; (b) `projection.version` is hardcoded to 1 in Wave 1 so baseVersion 409 won't fire in v1 — documented; (c) the `handleBatchPaste` "find anchor's group" logic needs the implementer to read the projection shape and find the containing group (the spec's geometry is per-group).

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-04-matrix-batch-paste-implementation.md`.

Two execution options:

1. **Subagent-Driven (recommended)** — fresh subagent per task + two-stage review (same flow as Wave 1).
2. **Inline Execution** — batch execution in this session.

Which approach?
