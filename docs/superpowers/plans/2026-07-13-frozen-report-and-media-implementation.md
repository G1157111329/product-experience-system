# Frozen Report Contract and Media Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every frozen report surface read the report's anchored snapshot, expose explicit matrix tabs, share one detail/share reader, render data matrices without horizontal scrolling, and present media at evidence-appropriate sizes while keeping print/PDF as an independent paper layout.

**Architecture:** Introduce pure snapshot-resolution and tab-contract helpers first, then build one canonical frozen view model consumed by report detail and anonymous share. Keep browser print and server PDF as separate renderers derived from the same frozen model. Reuse existing meaningful-content, presigned media, thumbnail, poster, and issue aggregation logic.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript 5, Tailwind CSS 4, PostgreSQL/Supabase compatibility layer, Playwright 1.60, node:assert tests through `pnpm exec tsx`.

---

## File map

- Modify `src/lib/server/report-snapshots.ts`: resolve the report's anchored snapshot and expose an explicit legacy fallback result.
- Create `src/lib/server/report-snapshots.test.ts`: snapshot anchoring and integrity regression tests.
- Create `src/lib/report-frozen-tabs.ts`: canonical explicit Tab contract and meaningful-content gate.
- Create `src/lib/report-frozen-tabs.test.ts`: normal/comparison and empty/non-empty Tab tests.
- Create `src/lib/report-frozen-view.ts`: frozen reader DTO types.
- Create `src/lib/server/report-frozen-view.ts`: canonical model builder for detail/share/print adapters.
- Create `src/lib/report-frozen-view.test.ts`: content and capability invariants.
- Create `src/components/reports/frozen-report-reader.tsx`: shared detail/share Tab reader.
- Create `src/components/reports/report-data-matrix-read-view.tsx`: V2/V3 row-based read-only matrix renderer.
- Create `src/components/reports/report-media-preview.tsx`: one report media preview.
- Create `src/components/reports/report-media-grid.tsx`: semantic primary/evidence/appendix/compact grids.
- Modify report header/matrix/detail/share/PDF routes to use the anchored snapshot and canonical model.
- Modify report detail/share pages to use the shared reader.
- Modify report function, issue, matrix and section renderers to use semantic media and no-scroll data-matrix reading.
- Modify browser print and server PDF renderers to derive paper output from the canonical model.

### Task 1: Anchor reports to `reports.snapshot_id`

**Files:**
- Create: `src/lib/server/report-snapshots.test.ts`
- Modify: `src/lib/server/report-snapshots.ts`
- Modify: `src/app/api/reports/[id]/header/route.ts`
- Modify: `src/app/api/reports/[id]/matrix/route.ts`
- Modify: `src/app/api/reports/[id]/detail/route.ts`
- Modify: `src/app/api/reports/share/route.ts`
- Modify: `src/app/api/reports/[id]/pdf/route.ts`
- Modify: `src/app/api/reports/route.ts`

- [ ] **Step 1: Write a failing snapshot resolution test**

```ts
import assert from 'node:assert/strict';
import { loadAnchoredReportSnapshot } from './report-snapshots';

const anchored = await loadAnchoredReportSnapshot(fakeClient({
  reports: [{ id: 'r1', snapshot_id: 's1' }],
  report_snapshots: [
    { id: 's1', report_id: 'r1', version: 1 },
    { id: 's2', report_id: 'r1', version: 2 },
  ],
}), { id: 'r1', snapshot_id: 's1' });
assert.equal(anchored.resolution, 'anchored');
assert.equal(anchored.snapshot?.id, 's1');

await assert.rejects(
  loadAnchoredReportSnapshot(fakeClient({
    report_snapshots: [{ id: 's1', report_id: 'other', version: 1 }],
  }), { id: 'r1', snapshot_id: 's1' }),
  /snapshot integrity/i,
);

const legacy = await loadAnchoredReportSnapshot(fakeClient({
  report_snapshots: [{ id: 's2', report_id: 'r1', version: 2 }],
}), { id: 'r1', snapshot_id: null });
assert.equal(legacy.resolution, 'legacy_latest');
assert.equal(legacy.snapshot?.id, 's2');
```

- [ ] **Step 2: Run RED**

Run: `pnpm exec tsx src/lib/server/report-snapshots.test.ts`

Expected: FAIL because `loadAnchoredReportSnapshot` does not exist.

- [ ] **Step 3: Implement the anchored resolver**

```ts
export type SnapshotResolution = 'anchored' | 'legacy_latest' | 'none';

export async function loadAnchoredReportSnapshot(
  client: ClientLike,
  report: { id: string; snapshot_id?: string | null },
): Promise<{ snapshot: Record<string, unknown> | null; resolution: SnapshotResolution }> {
  if (report.snapshot_id) {
    const { data, error } = await client.from('report_snapshots').select('*')
      .eq('id', report.snapshot_id).eq('report_id', report.id).maybeSingle();
    if (error || !data) throw new Error('Report snapshot integrity error');
    return { snapshot: data, resolution: 'anchored' };
  }
  const snapshot = await loadLatestReportSnapshot(client, report.id);
  return { snapshot, resolution: snapshot ? 'legacy_latest' : 'none' };
}
```

Update every report query to select `snapshot_id`, then replace direct `loadLatestReportSnapshot` calls with the new resolver. If `snapshot_id` is present but invalid, return an integrity error rather than reading another version.

- [ ] **Step 4: Make report generation fail closed when a meaningful matrix snapshot cannot be inserted**

In `src/app/api/reports/route.ts`, remove the empty catch around normal data-matrix snapshot insertion. If a meaningful matrix projection exists and snapshot creation fails, delete the newly created report or roll back the transaction and return an error. Reports without a matrix remain unaffected.

- [ ] **Step 5: Run GREEN and type check**

Run:

```powershell
pnpm exec tsx src/lib/server/report-snapshots.test.ts
pnpm ts-check
```

Expected: snapshot tests pass and TypeScript exits 0.

- [ ] **Step 6: Commit only Task 1 files**

```powershell
git add -- src/lib/server/report-snapshots.ts src/lib/server/report-snapshots.test.ts src/app/api/reports
git commit -m "fix: anchor reports to frozen snapshots"
```

### Task 2: Emit explicit data and comparison matrix Tabs

**Files:**
- Create: `src/lib/report-frozen-tabs.ts`
- Create: `src/lib/report-frozen-tabs.test.ts`
- Modify: `src/app/api/reports/[id]/header/route.ts`
- Modify: `src/app/(main)/reports/[id]/page.tsx`
- Modify: `tests/e2e/v3124-closure.spec.ts`
- Modify: `tests/e2e/platform-smoke.spec.ts`

- [ ] **Step 1: Write failing pure contract tests**

```ts
import assert from 'node:assert/strict';
import { buildReportFrozenTabs } from './report-frozen-tabs';

assert.deepEqual(buildReportFrozenTabs({
  reportType: 'single',
  dataMatrixProjection: meaningfulV3Projection(),
  recipes: [],
}), ['summary', 'issues', 'data_matrix']);

assert.deepEqual(buildReportFrozenTabs({
  reportType: 'comparison_report',
  comparisonSnapshot: meaningfulComparisonSnapshot(),
  recipes: [{}],
}), ['summary', 'issues', 'comparison_matrix', 'function_effect']);

assert.deepEqual(buildReportFrozenTabs({
  reportType: 'single',
  dataMatrixProjection: emptyV3Projection(),
  recipes: [],
}), ['summary', 'issues']);
```

- [ ] **Step 2: Run RED**

Run: `pnpm exec tsx src/lib/report-frozen-tabs.test.ts`

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement the canonical key union and helper**

```ts
export type ReportFrozenTabKey =
  | 'summary'
  | 'issues'
  | 'data_matrix'
  | 'comparison_matrix'
  | 'function_effect';

export function buildReportFrozenTabs(input: FrozenTabInput): ReportFrozenTabKey[] {
  const tabs: ReportFrozenTabKey[] = ['summary', 'issues'];
  if (input.reportType === 'comparison_report' && hasMeaningfulComparison(input.comparisonSnapshot)) {
    tabs.push('comparison_matrix');
  } else if (hasMeaningfulDataMatrix(input.dataMatrixProjection)) {
    tabs.push('data_matrix');
  }
  if (input.recipes.length > 0) tabs.push('function_effect');
  return tabs;
}
```

Reuse `src/lib/matrix/meaningful-content.ts`; do not duplicate shape checks in the route.

- [ ] **Step 4: Update the report detail page contract**

Map labels to `数据矩阵` and `对比矩阵`. Both keys fetch `/api/reports/[id]/matrix`, but the active Tab and API header payload remain explicit. Accept legacy `matrix` only as a client compatibility input; the new header route never emits it.

- [ ] **Step 5: Update E2E assertions and run GREEN**

Run:

```powershell
pnpm exec tsx src/lib/report-frozen-tabs.test.ts
pnpm exec playwright test tests/e2e/v3124-closure.spec.ts --grep "matrix" --workers=1
```

Expected: normal reports expose `data_matrix`, comparison reports expose `comparison_matrix`, empty matrices expose neither.

- [ ] **Step 6: Commit**

```powershell
git add -- src/lib/report-frozen-tabs.ts src/lib/report-frozen-tabs.test.ts src/app/api/reports/[id]/header/route.ts src/app/(main)/reports/[id]/page.tsx tests/e2e
git commit -m "feat: distinguish frozen report matrix tabs"
```

### Task 3: Build one canonical frozen reader model

**Files:**
- Create: `src/lib/report-frozen-view.ts`
- Create: `src/lib/server/report-frozen-view.ts`
- Create: `src/lib/report-frozen-view.test.ts`
- Modify: `src/app/api/reports/[id]/detail/route.ts`
- Modify: `src/app/api/reports/share/route.ts`

- [ ] **Step 1: Write a failing model invariant test**

```ts
const internal = await buildFrozenReportViewModel(fixture(), { audience: 'internal' });
const shared = await buildFrozenReportViewModel(fixture(), { audience: 'share' });
assert.deepEqual(shared.tabs, internal.tabs);
assert.deepEqual(shared.issues.map((x) => x.id), internal.issues.map((x) => x.id));
assert.deepEqual(shared.functionEffects, internal.functionEffects);
assert.deepEqual(shared.matrix, internal.matrix);
assert.equal(shared.capabilities.canManageIssues, false);
assert.equal(internal.capabilities.canManageIssues, true);
```

- [ ] **Step 2: Run RED**

Run: `pnpm exec tsx src/lib/report-frozen-view.test.ts`

Expected: FAIL because the model builder does not exist.

- [ ] **Step 3: Define the discriminated model**

```ts
export type FrozenMatrixView =
  | { kind: 'comparison'; snapshot: ComparisonSnapshot }
  | { kind: 'data_v2'; projection: MatrixReadProjectionV2 }
  | { kind: 'data_v3'; projection: ReportV3MatrixProjection }
  | null;

export interface FrozenReportViewModel {
  header: FrozenReportHeader;
  tabs: ReportFrozenTabKey[];
  summary: FrozenSummary;
  issues: FrozenIssue[];
  matrix: FrozenMatrixView;
  functionEffects: FrozenFunctionEffect[];
  capabilities: { canManageIssues: boolean; canShare: boolean; canExport: boolean };
}
```

The builder may overlay live issue status/rectification state, but original issue title, details and evidence remain sourced from the frozen report model. Document that distinction in types.

- [ ] **Step 4: Return the same model from internal detail and share APIs**

Keep old fields additive during migration so existing print consumers do not break in the same commit.

- [ ] **Step 5: Run GREEN**

Run:

```powershell
pnpm exec tsx src/lib/report-frozen-view.test.ts
pnpm exec tsx src/lib/report-issue-media.test.ts
pnpm ts-check
```

- [ ] **Step 6: Commit**

```powershell
git add -- src/lib/report-frozen-view.ts src/lib/server/report-frozen-view.ts src/lib/report-frozen-view.test.ts src/app/api/reports/[id]/detail/route.ts src/app/api/reports/share/route.ts
git commit -m "feat: add canonical frozen report view model"
```

### Task 4: Reuse one reader in detail and anonymous share

**Files:**
- Create: `src/components/reports/frozen-report-reader.tsx`
- Create: `src/lib/report-share-view.test.ts`
- Create: `tests/e2e/report-frozen-reader.spec.ts`
- Modify: `src/app/(main)/reports/[id]/page.tsx`
- Modify: `src/app/reports/share/[token]/page.tsx`
- Modify: `src/app/(main)/reports/[id]/components/report-tab-bar.tsx`

- [ ] **Step 1: Write RED source and behavior tests**

Assert both pages import `FrozenReportReader`, the share page no longer contains `{false &&`, and `ReportTabBar` renders `role="tablist"`, `role="tab"`, `aria-selected` and linked panels.

- [ ] **Step 2: Implement the shared reader**

```tsx
export function FrozenReportReader({ model }: { model: FrozenReportViewModel }) {
  const [active, setActive] = useState<ReportFrozenTabKey>(model.tabs[0]);
  return (
    <section data-testid="frozen-report-reader">
      <ReportTabBar tabs={model.tabs} active={active} onChange={setActive} />
      <FrozenReportPanel model={model} active={active} />
    </section>
  );
}
```

Detail and share provide different outer headers/capabilities, but the reader's Tab order, labels, content and media order remain identical.

- [ ] **Step 3: Add anonymous equivalence E2E**

Create a share token, open detail authenticated and share anonymous, collect Tab labels and selected content identifiers, and assert equality. Assert the share page has no issue-management button.

- [ ] **Step 4: Run tests**

```powershell
pnpm exec tsx src/lib/report-share-view.test.ts
pnpm exec playwright test tests/e2e/report-frozen-reader.spec.ts --workers=1
pnpm ts-check
```

- [ ] **Step 5: Commit**

```powershell
git add -- src/components/reports/frozen-report-reader.tsx src/app/(main)/reports/[id]/page.tsx src/app/reports/share/[token]/page.tsx src/app/(main)/reports/[id]/components/report-tab-bar.tsx src/lib/report-share-view.test.ts tests/e2e/report-frozen-reader.spec.ts
git commit -m "refactor: share one frozen report reader"
```

### Task 5: Replace data-matrix tables with a no-scroll read view

**Files:**
- Create: `src/components/reports/report-data-matrix-read-view.tsx`
- Create: `src/lib/report-data-matrix-layout.ts`
- Create: `src/lib/report-data-matrix-layout.test.ts`
- Modify: `src/app/(main)/reports/[id]/components/report-matrix-tab.tsx`
- Modify: `src/app/(main)/reports/[id]/components/report-v3-matrix-view.tsx`
- Modify: `src/components/reports/report-section-block-renderer.tsx`
- Modify: `tests/e2e/report-frozen-reader.spec.ts`

- [ ] **Step 1: Write RED projection tests**

```ts
const cards = dataMatrixReadCards(v3Fixture());
assert.deepEqual(cards[0].path, ['一级', '二级', '三级']);
assert.deepEqual(cards[0].fields.map((x) => x.label), ['温度', '效果评价']);
assert.equal(cards[0].fields.find((x) => x.value === 0)?.value, 0);
assert.equal(cards.some((x) => x.fields.some((f) => f.value === '')), false);
```

- [ ] **Step 2: Run RED**

Run: `pnpm exec tsx src/lib/report-data-matrix-layout.test.ts`

- [ ] **Step 3: Implement row cards and responsive field grids**

Use one renderer for V2 and V3 discriminated inputs. Render path header, meaningful fields, media, issue and narrative blocks with `grid-cols-1 sm:grid-cols-2 xl:grid-cols-3`. Do not render `table`, `overflow-x-auto`, editable inputs, drag handles or column controls.

- [ ] **Step 4: Replace all three data-matrix browser render paths**

Comparison matrix rendering remains unchanged in this task. Delegate V2/V3 data-matrix branches in `report-matrix-tab`, `report-v3-matrix-view` and `report-section-block-renderer` to the shared read view.

- [ ] **Step 5: Verify 390/768/1024 widths**

Assert `[data-testid="report-data-matrix-read-view"]` has `scrollWidth <= clientWidth` and contains no `input`, `textarea` or `[draggable=true]`.

- [ ] **Step 6: Commit**

```powershell
git add -- src/components/reports/report-data-matrix-read-view.tsx src/lib/report-data-matrix-layout.ts src/lib/report-data-matrix-layout.test.ts src/app/(main)/reports/[id]/components/report-matrix-tab.tsx src/app/(main)/reports/[id]/components/report-v3-matrix-view.tsx src/components/reports/report-section-block-renderer.tsx tests/e2e/report-frozen-reader.spec.ts
git commit -m "feat: add responsive frozen data matrix reader"
```

### Task 6: Add semantic report media grids

**Files:**
- Create: `src/components/reports/report-media-preview.tsx`
- Create: `src/components/reports/report-media-grid.tsx`
- Create: `src/lib/report-media-semantics.test.ts`
- Modify: `src/lib/report-media-preview.test.ts`
- Modify: `src/app/(main)/reports/[id]/components/report-media-preview.tsx`
- Modify: `src/app/(main)/reports/[id]/components/report-function-effect-tab.tsx`
- Modify: `src/app/(main)/reports/[id]/components/issue-row.tsx`
- Modify: `src/app/(main)/reports/[id]/components/report-matrix-tab.tsx`
- Modify: `src/components/reports/report-section-block-renderer.tsx`

- [ ] **Step 1: Write RED semantic limit and aspect-ratio tests**

```ts
assert.deepEqual(mediaPresentation('primary'), { limit: 6, imageAspect: '4/3', videoAspect: '16/9' });
assert.equal(mediaPresentation('evidence').limit, 4);
assert.equal(mediaPresentation('appendix').limit, 4);
assert.equal(mediaPresentation('compact').limit, 2);
assert.deepEqual(visibleMedia(items(5), 'compact'), { items: items(2), remaining: 3 });
```

- [ ] **Step 2: Implement `ReportMediaGrid`**

The grid owns semantic size, limit, `+N`, inline expansion and stable placeholders. `ReportMediaPreview` owns one image/video, presigned URL, poster and full-screen preview. Keep route-private preview as a compatibility re-export until all consumers migrate.

- [ ] **Step 3: Map report contexts**

- Function effect → `primary`.
- Recipe step/process evidence → `evidence`.
- Original issue, rectification and re-evaluation → separate `appendix` grids.
- Matrix summary cells → `compact`.

- [ ] **Step 4: Verify image/video behavior**

Images use 4:3 thumbnails, videos use 16:9 poster with play icon and optional duration. Clicking either opens the existing full preview. The browser must not fetch raw large images when a derivative is available.

- [ ] **Step 5: Run tests and commit**

```powershell
pnpm exec tsx src/lib/report-media-preview.test.ts
pnpm exec tsx src/lib/report-media-semantics.test.ts
pnpm ts-check
git add -- src/components/reports src/lib/report-media-preview.test.ts src/lib/report-media-semantics.test.ts src/app/(main)/reports/[id]/components
git commit -m "feat: size frozen report media by evidence role"
```

### Task 7: Keep print/PDF independent but content-equivalent

**Files:**
- Modify: `src/app/reports/print/page.tsx`
- Modify: `src/components/reports/report-section-block-renderer.tsx`
- Modify: `src/lib/server/report-print-renderer.ts`
- Modify: `src/app/api/reports/[id]/pdf/route.ts`
- Create: `src/lib/report-print-renderer.test.ts`
- Modify: `src/lib/report-print-matrix.test.ts`
- Verify: `src/lib/report-pdf-loading.test.ts`
- Verify: `src/lib/print-assets.test.ts`

- [ ] **Step 1: Write RED browser-print and server-PDF tests**

Assert V2/V3 data matrices render matrix name, hierarchy, value and media; the paper DOM has no webpage Tab controls or horizontal browser scroll container; video renders poster/VIDEO/file name, not a playable control.

- [ ] **Step 2: Project print from `FrozenReportViewModel`**

`PrintReportViewModel` must be a pure projection of the frozen model. It must not refetch another snapshot or build another issue/media aggregation.

- [ ] **Step 3: Add data-matrix branches to server PDF**

Implement `data_matrix` and `data_matrix_v3` in `report-print-renderer.ts`, using paper row blocks and page-break-safe media grids. Use landscape paper only for comparison tables that cannot remain legible in portrait.

- [ ] **Step 4: Preserve print safety contracts**

Keep `data:` placeholders out of network conversion, preserve bounded asset concurrency and the existing DOM-content-loaded/loopback PDF behavior.

- [ ] **Step 5: Run focused and full report gates**

```powershell
pnpm exec tsx src/lib/report-print-renderer.test.ts
pnpm exec tsx src/lib/report-print-matrix.test.ts
pnpm exec tsx src/lib/report-pdf-loading.test.ts
pnpm exec tsx src/lib/print-assets.test.ts
pnpm exec playwright test tests/e2e/v3124-closure.spec.ts tests/e2e/report-frozen-reader.spec.ts --workers=1
pnpm ts-check
pnpm lint
```

- [ ] **Step 6: Commit**

```powershell
git add -- src/app/reports/print/page.tsx src/components/reports/report-section-block-renderer.tsx src/lib/server/report-print-renderer.ts src/app/api/reports/[id]/pdf/route.ts src/lib/report-print-renderer.test.ts src/lib/report-print-matrix.test.ts
git commit -m "feat: align paper reports with frozen content"
```

### Task 8: Docker and browser acceptance gate

**Files:**
- Modify only if verification exposes a task-scoped defect.

- [ ] Run focused contract tests from Tasks 1–7.
- [ ] Run `pnpm ts-check`, `pnpm lint`, `git diff --check`, and `pnpm build`.
- [ ] Rebuild with `docker compose -f docker-compose.local.yml up --build -d` and wait for both services to become healthy.
- [ ] Use Playwright at 390, 768, 1024 and 1440 to verify report detail, anonymous share and print.
- [ ] Verify explicit `数据矩阵` / `对比矩阵` labels, no empty matrix Tab, no data-matrix horizontal reader scroll, media aspect ratios, `+N` expansion, anonymous access, and PDF content.
- [ ] Inspect console and network failures; do not accept screenshot-only evidence.
- [ ] Stop before cloud deployment and hand the local URL to the user for confirmation.
