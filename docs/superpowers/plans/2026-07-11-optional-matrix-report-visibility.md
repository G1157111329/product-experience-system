# Optional Matrix and Report Visibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make comparison/data matrices safe to try and abandon: data matrix opens directly, matrix structures are deletable, and only substantive matrix content appears in newly generated reports.

**Architecture:** Introduce one pure, shared matrix-content predicate used by report generation, report headers, and report matrix APIs. Keep frozen snapshots immutable; only the next generated report reevaluates current source content. Treat archive/deactivation separately from content detection so empty structures can remain editable without contaminating reports.

**Tech Stack:** Next.js route handlers, TypeScript 5, Supabase-compatible query layer, Drizzle ORM for transactional clear operations, React 19, Playwright 1.60, Node `assert` tests.

---

## File map

- Create `src/lib/matrix/meaningful-content.ts`: pure predicates for comparison cells, V2 projections, and V3 frozen projections.
- Create `src/lib/matrix/meaningful-content.test.ts`: blank/filled/media/issue/narrative fixtures.
- Modify `src/app/api/reports/route.ts`: freeze matrix projections only when meaningful; avoid comparison report mode for empty matrices.
- Modify `src/app/api/reports/[id]/header/route.ts`: derive Matrix Tab visibility from the frozen report payload, not live matrix existence.
- Modify `src/app/api/reports/[id]/matrix/route.ts`: never fall back to a live empty matrix for a frozen report.
- Modify `src/app/api/v1/tasks/[id]/matrices/route.ts`: idempotently return the existing active matrix on automatic creation.
- Modify `src/app/(main)/tasks/[id]/components/matrix-tab.tsx`: auto-create/select on first entry; remove empty intermediary and extra new button.
- Create `src/lib/server/matrix-deactivation.ts`: transactional clear-and-archive for V2/V3 task-matrix content while preserving structure/history boundaries.
- Create `src/lib/server/comparison-assembly-selection.test.ts`: archived-assembly selection regression.
- Modify `src/app/api/v1/matrices/[id]/lifecycle/route.ts`: add audited `clear_and_archive` action.
- Modify `src/app/(main)/tasks/[id]/components/comparison-workspace.tsx`: visible delete labels and assembly deactivate action.
- Modify `src/lib/server/comparison-assembly.ts`: ignore archived assemblies when resolving a task.
- Modify `tests/e2e/v3124-closure.spec.ts`: real report inclusion/omission and frozen-history checks.

### Task 1: Define one meaningful-content predicate

**Files:**
- Create: `src/lib/matrix/meaningful-content.ts`
- Create: `src/lib/matrix/meaningful-content.test.ts`

- [ ] **Step 1: Write the failing pure tests**

Create `meaningful-content.test.ts`:

```ts
import assert from 'node:assert/strict';
import {
  hasMeaningfulComparisonCell,
  hasMeaningfulV2Projection,
  hasMeaningfulV3Projection,
} from './meaningful-content';

assert.equal(hasMeaningfulComparisonCell({ process_notes: ['  '], problem_points: [], params: {} }), false);
assert.equal(hasMeaningfulComparisonCell({ effect_summary: '颗粒感明显' }), true);
assert.equal(hasMeaningfulComparisonCell({ process_notes: ['噪声偏高'] }), true);

assert.equal(hasMeaningfulV2Projection({ groups: [{ rows: [{
  metrics: { speed: { state: 'missing' } },
  slots: { result: {}, process: {}, issues: { count: 0, severitySummary: [] } },
  evidence: { primaryCount: 0, previewIds: [] },
}]}] }), false);
assert.equal(hasMeaningfulV2Projection({ groups: [{ rows: [{
  metrics: { speed: { state: 'valid', value: 12000 } },
  slots: { result: {}, process: {}, issues: { count: 0, severitySummary: [] } },
  evidence: { primaryCount: 0, previewIds: [] },
}]}] }), true);

assert.equal(hasMeaningfulV3Projection({
  rows: [{ cells: { col1: '' } }], cellMedia: {}, narratives: [], issuePoints: [], summary: { filledCells: 0 },
}), false);
assert.equal(hasMeaningfulV3Projection({
  rows: [{ cells: { col1: '85℃' } }], cellMedia: {}, narratives: [], issuePoints: [], summary: { filledCells: 1 },
}), true);
assert.equal(hasMeaningfulV3Projection({
  rows: [], cellMedia: { 'r1:c1': [{ materialId: 'm1' }] }, narratives: [], issuePoints: [], summary: { filledCells: 0 },
}), true);
```

- [ ] **Step 2: Verify RED**

```powershell
pnpm tsx src/lib/matrix/meaningful-content.test.ts
```

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement the predicates**

Create `meaningful-content.ts`:

```ts
type Row = Record<string, unknown>;

function nonBlank(value: unknown) {
  if (typeof value === 'string') return value.trim().length > 0;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value === 'boolean') return true;
  return false;
}

function nonBlankList(value: unknown) {
  return Array.isArray(value) && value.some((item) => nonBlank(item) || (item && typeof item === 'object' && Object.values(item as Row).some(nonBlank)));
}

export function hasMeaningfulComparisonCell(cell: Row) {
  if (['effect_summary', 'manual_score', 'ai_score', 'conclusion_tag'].some((key) => nonBlank(cell[key]))) return true;
  if (['process_notes', 'problem_points'].some((key) => nonBlankList(cell[key]))) return true;
  const params = cell.params;
  return Boolean(params && typeof params === 'object' && Object.values(params as Row).some((value) => nonBlank(value) || nonBlankList(value)));
}

export function hasMeaningfulV2Projection(projection: unknown) {
  const groups = (projection as { groups?: Array<{ rows?: Row[] }> } | null)?.groups || [];
  return groups.some((group) => (group.rows || []).some((row) => {
    const metrics = row.metrics && typeof row.metrics === 'object' ? Object.values(row.metrics as Row) as Row[] : [];
    if (metrics.some((metric) => metric.state === 'valid' && [metric.value, metric.durationMs, metric.text, metric.display].some(nonBlank))) return true;
    const slots = row.slots as Row | undefined;
    const result = slots?.result as Row | undefined;
    const process = slots?.process as Row | undefined;
    const issues = slots?.issues as Row | undefined;
    if (nonBlank(result?.summary) || nonBlank(process?.note)) return true;
    if (Number(issues?.count || 0) > 0 || nonBlankList(issues?.severitySummary)) return true;
    const evidence = row.evidence as Row | undefined;
    return Number(evidence?.primaryCount || 0) > 0 || nonBlankList(evidence?.previewIds) || nonBlankList(evidence?.media);
  }));
}

export function hasMeaningfulV3Projection(projection: unknown) {
  const value = (projection || {}) as Row;
  const rows = Array.isArray(value.rows) ? value.rows as Row[] : [];
  if (rows.some((row) => row.cells && typeof row.cells === 'object' && Object.values(row.cells as Row).some(nonBlank))) return true;
  const media = value.cellMedia && typeof value.cellMedia === 'object' ? Object.values(value.cellMedia as Row) : [];
  if (media.some(nonBlankList)) return true;
  if (nonBlankList(value.narratives)) return true;
  return nonBlankList(value.issuePoints);
}
```

- [ ] **Step 4: Run test and type-check**

```powershell
pnpm tsx src/lib/matrix/meaningful-content.test.ts
pnpm ts-check
```

Expected: both pass.

- [ ] **Step 5: Commit**

```powershell
git add -- 'src/lib/matrix/meaningful-content.ts' 'src/lib/matrix/meaningful-content.test.ts'
git commit -m "feat: define meaningful matrix content"
```

### Task 2: Apply the predicate when generating and reading reports

**Files:**
- Modify: `src/app/api/reports/route.ts`
- Modify: `src/app/api/reports/[id]/header/route.ts`
- Modify: `src/app/api/reports/[id]/matrix/route.ts`
- Modify: `src/lib/server/report-detail.ts`

- [ ] **Step 1: Add a failing frozen-payload unit test**

Extend `meaningful-content.test.ts` with fixtures proving structures alone are false and narratives/media are true. Run the test before route changes and keep it green as the contract for all route integrations.

- [ ] **Step 2: Replace the private comparison predicate**

In `src/app/api/reports/route.ts` import:

```ts
import {
  hasMeaningfulComparisonCell,
  hasMeaningfulV2Projection,
  hasMeaningfulV3Projection,
} from '@/lib/matrix/meaningful-content';
```

Delete the private `hasMeaningfulComparisonCell`. Keep the object/node requirement, but only return comparison source when a cell or cell media is meaningful.

- [ ] **Step 3: Filter data-matrix projections before freeze**

Immediately after `loadDataMatrixProjection` resolves:

```ts
const loadedDataMatrix = await loadDataMatrixProjection(client, body.task_id);
const dataMatrixProjection = loadedDataMatrix?.kind === 'v3'
  ? (hasMeaningfulV3Projection(loadedDataMatrix.projection) ? loadedDataMatrix.projection : null)
  : loadedDataMatrix?.kind === 'v2'
    ? (hasMeaningfulV2Projection(loadedDataMatrix.projection) ? loadedDataMatrix.projection : null)
    : null;
```

Write `data_matrix_projection: dataMatrixProjection` only when non-null, and only write `snapshot_json.matrix_projection` when non-null. Do not change an already saved report snapshot.

- [ ] **Step 4: Make report header visibility read frozen substantive content**

In `header/route.ts`, import the same predicates. For comparison snapshots, set `hasMatrix` from meaningful cells or snapshot cell media rather than `cells.length`. For ordinary reports:

```ts
const dataMatrixProjection = content?.data_matrix_projection;
hasMatrix = hasMeaningfulV3Projection(dataMatrixProjection) || hasMeaningfulV2Projection(dataMatrixProjection);
```

- [ ] **Step 5: Remove live-matrix fallback from frozen report reads**

In `reports/[id]/matrix/route.ts`, resolve matrix data from `snapshot_json.matrix_projection` or `content.data_matrix_projection`. Remove both live-source calls, `findTaskMatrixId(client, taskId)` and `findDataMatrixAssemblyId(client, taskId)`, from the visibility guard for an existing report. Return `matrixType: 'single_waterfall'` when the frozen report has no meaningful matrix payload.

- [ ] **Step 6: Prevent empty sections in the enhanced detail projection**

In `report-detail.ts`, call `hasMeaningfulV2Projection`/`hasMeaningfulV3Projection` before appending the data-matrix section. If false, return no matrix section rather than an `empty` matrix block.

- [ ] **Step 7: Verify and commit**

```powershell
pnpm tsx src/lib/matrix/meaningful-content.test.ts
pnpm ts-check
pnpm lint
git diff --check
git add -- 'src/app/api/reports/route.ts' 'src/app/api/reports/[id]/header/route.ts' 'src/app/api/reports/[id]/matrix/route.ts' 'src/lib/server/report-detail.ts'
git commit -m "fix: omit empty matrices from reports"
```

Expected: all checks pass.

### Task 3: Auto-create and directly enter the default data matrix

**Files:**
- Modify: `src/app/api/v1/tasks/[id]/matrices/route.ts`
- Modify: `src/app/(main)/tasks/[id]/components/matrix-tab.tsx`
- Modify: `tests/e2e/v3124-closure.spec.ts`

- [ ] **Step 1: Add the failing E2E**

```ts
test('首次点击数据矩阵直接进入默认空矩阵', async ({ page }) => {
  await page.goto('/tasks/b220702d-0dbb-4f0d-9b56-472f432ab55c');
  await page.getByRole('button', { name: '数据矩阵', exact: true }).click();
  await expect(page.getByRole('button', { name: '新建数据矩阵' })).toHaveCount(0);
  await expect(page.getByText('当前任务尚未建立数据矩阵')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: /数据矩阵/ })).toBeVisible();
});
```

- [ ] **Step 2: Verify RED**

```powershell
pnpm smoke:e2e -- tests/e2e/v3124-closure.spec.ts --grep "首次点击数据矩阵"
```

Expected: FAIL on the current empty-state card.

- [ ] **Step 3: Make POST idempotent for one default active matrix**

Before insert in `v1/tasks/[id]/matrices/route.ts`:

```ts
const { data: existing } = await client
  .from('task_matrices')
  .select('*')
  .eq('task_id', taskId)
  .neq('status', 'archived')
  .order('created_at', { ascending: false })
  .limit(1);
if (existing?.[0]) {
  return NextResponse.json({ code: 0, message: 'success', created: false, data: existing[0] });
}
```

Return `created: true` for a new insert.

- [ ] **Step 4: Auto-create from `MatrixTab`**

When `tabState === 'empty' || matrices.length === 0`, trigger `handleCreate()` once through a ref-guarded effect:

```ts
const autoCreateStartedRef = useRef(false);

useEffect(() => {
  if (tabState !== 'empty' || !canCreate || autoCreateStartedRef.current) return;
  autoCreateStartedRef.current = true;
  void handleCreate();
}, [canCreate, handleCreate, tabState]);
```

Wrap `handleCreate` in `useCallback`, select the returned matrix ID, and render a compact loading card while creation runs. Place the ref-guarded auto-create effect immediately after the `handleCreate` declaration so its dependency is initialized before use. Remove the empty intermediary card and remove the list-level `新建` button because the approved model is one default task matrix.

- [ ] **Step 5: Verify no duplicate instance on repeated entry**

Extend the E2E to click another tab, return to Data Matrix, and assert the same matrix heading appears without another POST-created card.

- [ ] **Step 6: Run and commit**

```powershell
pnpm ts-check
pnpm lint
pnpm smoke:e2e -- tests/e2e/v3124-closure.spec.ts --grep "首次点击数据矩阵"
git add -- 'src/app/api/v1/tasks/[id]/matrices/route.ts' 'src/app/(main)/tasks/[id]/components/matrix-tab.tsx' 'tests/e2e/v3124-closure.spec.ts'
git commit -m "feat: enter the default data matrix directly"
```

### Task 4: Make deletion and deactivation explicit

**Files:**
- Create: `src/lib/server/matrix-deactivation.ts`
- Modify: `src/app/api/v1/matrices/[id]/lifecycle/route.ts`
- Modify: `src/lib/matrix/matrix-lifecycle.ts`
- Modify: `src/lib/matrix/matrix-lifecycle.test.ts`
- Modify: `src/app/(main)/tasks/[id]/components/matrix-tab.tsx`
- Modify: `src/app/(main)/tasks/[id]/components/comparison-workspace.tsx`
- Modify: `src/lib/server/comparison-assembly.ts`
- Create: `src/lib/server/comparison-assembly-selection.test.ts`

- [ ] **Step 1: Extend the lifecycle test RED**

Add:

```ts
assert.deepEqual(matrixLifecyclePatch('clear_and_archive', now, 'user_clear'), {
  status: 'archived',
  archived_at: now,
  archived_reason: 'user_clear',
  updated_at: now,
});
```

Run `pnpm tsx src/lib/matrix/matrix-lifecycle.test.ts`; expect a TypeScript failure because the action is not allowed.

- [ ] **Step 2: Add the lifecycle action**

Change:

```ts
export type MatrixLifecycleAction = 'archive' | 'restore' | 'clear_and_archive';
```

Treat `clear_and_archive` like archive in `matrixLifecyclePatch`, with default reason `user_clear`.

- [ ] **Step 3: Implement transactional content clearing**

Create `matrix-deactivation.ts` with `clearTaskMatrixContent(matrixId: string)`. In one Drizzle transaction:

1. Select V3 `matrix_cell_values.id` for the matrix.
2. Delete `material_links` where `target_type='dynamic_matrix_cell_value'` and `target_id` is in those IDs.
3. Delete `matrix_issue_points`, `matrix_narrative_blocks`, `matrix_formula_runs_v3`, and `matrix_cell_values` for the matrix.
4. Select V2 `matrix_rows.id`, delete matching `matrix_field_values`, and delete `matrix_narratives` for the matrix.
5. Update `materials.comparison_cell_id` to null for V2 row IDs instead of deleting media assets.
6. Leave hierarchy, rows, columns, design versions, and formulas intact so the archived matrix remains auditable.

The exported signature is:

```ts
import { and, eq, inArray } from 'drizzle-orm';
import { getDb } from '@/storage/database/pg-db';
import {
  materialLinks,
  materials,
  matrixCellValues,
  matrixFieldValues,
  matrixFormulaRunsV3,
  matrixIssuePoints,
  matrixNarrativeBlocks,
  matrixNarratives,
  matrixRows,
} from '@/storage/database/shared/schema';

export async function clearTaskMatrixContent(matrixId: string): Promise<void> {
  const db = getDb();
  await db.transaction(async (tx) => {
    const cellRows = await tx.select({ id: matrixCellValues.id }).from(matrixCellValues).where(eq(matrixCellValues.matrixId, matrixId));
    const cellIds = cellRows.map((row) => row.id);
    if (cellIds.length > 0) {
      await tx.delete(materialLinks).where(and(
        eq(materialLinks.targetType, 'dynamic_matrix_cell_value'),
        inArray(materialLinks.targetId, cellIds),
      ));
    }
    await tx.delete(matrixIssuePoints).where(eq(matrixIssuePoints.matrixId, matrixId));
    await tx.delete(matrixNarrativeBlocks).where(eq(matrixNarrativeBlocks.matrixId, matrixId));
    await tx.delete(matrixFormulaRunsV3).where(eq(matrixFormulaRunsV3.matrixId, matrixId));
    await tx.delete(matrixCellValues).where(eq(matrixCellValues.matrixId, matrixId));

    const v2Rows = await tx.select({ id: matrixRows.id }).from(matrixRows).where(eq(matrixRows.matrixId, matrixId));
    const rowIds = v2Rows.map((row) => row.id);
    if (rowIds.length > 0) {
      await tx.delete(matrixFieldValues).where(inArray(matrixFieldValues.rowId, rowIds));
      await tx.update(materials).set({ comparisonCellId: null }).where(inArray(materials.comparisonCellId, rowIds));
    }
    await tx.delete(matrixNarratives).where(eq(matrixNarratives.matrixId, matrixId));
  });
}
```

- [ ] **Step 4: Wire audited `clear_and_archive`**

In the lifecycle route accept the third action. Before applying the status patch:

```ts
if (body.action === 'clear_and_archive') {
  await clearTaskMatrixContent(id);
}
```

Write audit action `task_matrix.cleared_and_archived`; return message `矩阵内容已清空并移入回收区`.

- [ ] **Step 5: Add explicit UI actions**

In `matrix-tab.tsx`, replace icon-only destructive controls with a visible menu/button labelled `清空并停用`. Its confirmation text must say:

```text
将清空本矩阵的单元格、问题、小结和素材关联，并移入回收区。矩阵将不进入后续生成的报告；已冻结报告不受影响。是否继续？
```

In `comparison-workspace.tsx`, make object and node deletion buttons visible at all times on desktop and give them text/tooltips. Add `清空并停用对比矩阵`: delete a draft assembly through `DELETE /api/comparison-assemblies/[id]`; for non-draft assemblies update status to `archived`.

- [ ] **Step 6: Ignore archived comparison assemblies**

Extract and export this pure helper from `comparison-assembly.ts`:

```ts
export function selectActiveAssemblyForTask(rows: Row[], taskId: string) {
  return rows.find((assembly) => (
    assembly.status !== 'archived'
    && Array.isArray(assembly.source_task_ids)
    && assembly.source_task_ids.includes(taskId)
  )) || null;
}
```

Use it in `findAssemblyForTask`. In the object fallback, call `getAssembly` and return null when its status is `archived`. Create `comparison-assembly-selection.test.ts`:

```ts
import assert from 'node:assert/strict';
import { selectActiveAssemblyForTask } from './comparison-assembly';

assert.equal(selectActiveAssemblyForTask([
  { id: 'archived-new', status: 'archived', source_task_ids: ['task-1'] },
  { id: 'active-old', status: 'draft', source_task_ids: ['task-1'] },
], 'task-1')?.id, 'active-old');
assert.equal(selectActiveAssemblyForTask([
  { id: 'archived-only', status: 'archived', source_task_ids: ['task-1'] },
], 'task-1'), null);
```

- [ ] **Step 7: Verify and commit**

```powershell
pnpm tsx src/lib/matrix/matrix-lifecycle.test.ts
pnpm tsx src/lib/server/comparison-assembly-selection.test.ts
pnpm ts-check
pnpm lint
git diff --check
git add -- 'src/lib/server/matrix-deactivation.ts' 'src/app/api/v1/matrices/[id]/lifecycle/route.ts' 'src/lib/matrix/matrix-lifecycle.ts' 'src/lib/matrix/matrix-lifecycle.test.ts' 'src/app/(main)/tasks/[id]/components/matrix-tab.tsx' 'src/app/(main)/tasks/[id]/components/comparison-workspace.tsx' 'src/lib/server/comparison-assembly.ts' 'src/lib/server/comparison-assembly-selection.test.ts'
git commit -m "feat: clear and deactivate optional matrices"
```

### Task 5: Prove report omission, inclusion, and frozen history

**Files:**
- Modify: `tests/e2e/v3124-closure.spec.ts`
- Modify only if the test exposes a scoped defect in files already listed above.

- [ ] **Step 1: Add three API/browser assertions**

The E2E must exercise this order on a disposable local task:

```ts
test('矩阵只有实质内容时进入新报告且不改写历史冻结报告', async ({ page }) => {
  const taskResponse = await page.request.post('/api/tasks', {
    data: {
      task_name: `E2E可选矩阵-${Date.now()}`,
      product_category: '电动',
      product: '破壁机',
      product_model: 'E2E-MATRIX',
      project_type: '自研',
      project_phase: '试制阶段',
      task_mode: 'single',
    },
  });
  const taskPayload = await taskResponse.json();
  expect(taskPayload.code, taskPayload.message).toBe(0);
  const taskId = taskPayload.data.id as string;

  try {
    const matrixResponse = await page.request.post(`/api/v1/tasks/${taskId}/matrices`, {
      data: { name: '默认数据矩阵', view_mode: 'excel_like_dynamic_matrix' },
    });
    const matrixPayload = await matrixResponse.json();
    expect(matrixPayload.code, matrixPayload.message).toBe(0);
    const matrixId = matrixPayload.data.id as string;

    const projectionResponse = await page.request.get(`/api/v1/matrices/${matrixId}/v3-projection`);
    const projectionPayload = await projectionResponse.json();
    expect(projectionPayload.code, projectionPayload.message).toBe(0);
    const leafRowId = projectionPayload.data.rows[0].id as string;
    const columnId = projectionPayload.data.columns[0].id as string;

    const createReport = async (title: string) => {
      const response = await page.request.post('/api/reports', { data: { task_id: taskId, title } });
      const payload = await response.json();
      expect(payload.code, payload.message).toBe(0);
      return payload.data.id as string;
    };
    const availableTabs = async (reportId: string) => {
      const response = await page.request.get(`/api/reports/${reportId}/header`);
      const payload = await response.json();
      expect(payload.code, payload.message).toBe(0);
      return payload.data.availableTabs as string[];
    };

    const reportV1 = await createReport('空矩阵报告');
    expect(await availableTabs(reportV1)).not.toContain('matrix');

    const filled = await page.request.put(`/api/v1/matrices/${matrixId}/cells/${leafRowId}/${columnId}`, {
      data: { valueText: '85℃' },
    });
    expect(filled.ok()).toBeTruthy();
    const reportV2 = await createReport('有内容矩阵报告');
    expect(await availableTabs(reportV2)).toContain('matrix');

    const cleared = await page.request.put(`/api/v1/matrices/${matrixId}/cells/${leafRowId}/${columnId}`, {
      data: { valueText: '' },
    });
    expect(cleared.ok()).toBeTruthy();
    const deactivated = await page.request.post(`/api/v1/matrices/${matrixId}/lifecycle`, {
      data: { action: 'clear_and_archive', reason: 'e2e_cleanup' },
    });
    expect(deactivated.ok()).toBeTruthy();

    const reportV3 = await createReport('清空后报告');
    expect(await availableTabs(reportV3)).not.toContain('matrix');
    expect(await availableTabs(reportV2)).toContain('matrix');
  } finally {
    await page.request.delete(`/api/tasks/${taskId}`);
  }
});
```

- [ ] **Step 2: Add comparison-object deletion coverage**

Append this test:

```ts
test('对比对象可明确删除且空结构不进入报告', async ({ page }) => {
  const taskResponse = await page.request.post('/api/tasks', {
    data: {
      task_name: `E2E对比退出-${Date.now()}`,
      product_category: '电动',
      product: '破壁机',
      product_model: 'E2E-COMPARISON',
      project_type: '竞品研究',
      project_phase: '试制阶段',
      task_mode: 'comparison',
      comparison_layout_type: 'image_matrix',
    },
  });
  const taskPayload = await taskResponse.json();
  expect(taskPayload.code, taskPayload.message).toBe(0);
  const taskId = taskPayload.data.id as string;
  const assemblyId = taskPayload.data.comparison_assembly_id as string;

  try {
    const objectAResponse = await page.request.post('/api/comparison-objects', {
      data: { assembly_id: assemblyId, task_id: taskId, object_name: '对象 A', object_type: 'product_model', sort_order: 0 },
    });
    const objectBResponse = await page.request.post('/api/comparison-objects', {
      data: { assembly_id: assemblyId, task_id: taskId, object_name: '对象 B', object_type: 'product_model', sort_order: 1 },
    });
    expect((await objectAResponse.json()).code).toBe(0);
    expect((await objectBResponse.json()).code).toBe(0);

    await page.goto(`/tasks/${taskId}`);
    await page.getByRole('button', { name: '对比矩阵', exact: true }).click();
    await page.getByRole('button', { name: '删除对象 对象 B' }).click();
    await expect(page.getByRole('button', { name: '对象 B', exact: true })).toHaveCount(0);

    const reportResponse = await page.request.post('/api/reports', {
      data: { task_id: taskId, title: '空对比结构报告' },
    });
    const reportPayload = await reportResponse.json();
    expect(reportPayload.code, reportPayload.message).toBe(0);
    const headerResponse = await page.request.get(`/api/reports/${reportPayload.data.id}/header`);
    const headerPayload = await headerResponse.json();
    expect(headerPayload.data.availableTabs).not.toContain('matrix');
  } finally {
    await page.request.delete(`/api/tasks/${taskId}`);
  }
});
```

- [ ] **Step 3: Run focused E2E**

```powershell
pnpm smoke:e2e -- tests/e2e/v3124-closure.spec.ts --grep "矩阵只有实质内容|删除对象"
```

Expected: pass with no skips.

- [ ] **Step 4: Run full static and production checks**

```powershell
pnpm tsx src/lib/matrix/meaningful-content.test.ts
pnpm tsx src/lib/matrix/matrix-lifecycle.test.ts
pnpm ts-check
pnpm lint
pnpm build
git diff --check
```

Expected: all commands exit 0. Node 18 Supabase deprecation warnings may appear, but no build/type/lint errors are allowed.

- [ ] **Step 5: Rebuild Docker and replay the user story**

```powershell
docker compose -f docker-compose.local.yml up -d --build
docker compose -f docker-compose.local.yml ps
curl.exe -sS -o NUL -w "login=%{http_code}\n" http://127.0.0.1:5000/login
curl.exe -sS -o NUL -w "tasks=%{http_code}\n" http://127.0.0.1:5000/tasks
```

Expected: both containers healthy; both HTTP checks return 200.

- [ ] **Step 6: Commit acceptance coverage and stop before remote deployment**

```powershell
git add -- 'tests/e2e/v3124-closure.spec.ts'
git commit -m "test: verify optional matrix report visibility"
git status --short
```

Expected: clean worktree. Hand the local Docker URL to the user. Do not push GitHub/Gitee or deploy the cloud server until the user explicitly approves the local result.
