# Task Authoring and Matrix Interaction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the hidden task AI entry, restore recipe context and automatic issue closure feedback, open the current data matrix directly, and give data/comparison matrices efficient desktop and mobile interaction modes.

**Architecture:** Keep the task page's existing APIs and top status-card navigation, then extract focused presentation components from the large task page. Reuse canonical meaningful-content and inline-save contracts. Preserve the V3 data grid for desktop, add navigation/focus helpers around it, and replace the comparison matrix's always-expanded cell forms with a compact overview plus one focused item editor.

**Tech Stack:** Next.js 15, React 19, TypeScript 5, Tailwind CSS 4, shadcn/Radix, Playwright, node:assert tests through `pnpm exec tsx`.

---

## File map

- Modify `src/app/(main)/tasks/[id]/page.tsx`: remove task Agent state/branch and connect recipe issue output.
- Create `recipe-context-summary.tsx`: recipe/function tags below the selected title.
- Modify ingredient components: awaitable close-time flush.
- Modify recipe issue output helper/panel: read-only synchronization status, no registration button.
- Create `src/lib/matrix/current-matrix-selection.ts`: deterministic current instance selection.
- Create matrix zone/mobile model helpers and focused editor components.
- Create comparison overview/focused/mobile components and shrink `comparison-workspace.tsx` to orchestration.

### Task 1: Remove the task Agent route and default to functions

**Files:**
- Modify: `src/app/(main)/tasks/[id]/page.tsx`
- Modify: `src/app/(main)/tasks/[id]/components/report-authoring-shell.tsx`
- Modify: `tests/e2e/task-detail-layout.spec.ts`

- [ ] Add a failing E2E that opens `/tasks/golden-task-single` and expects the function/recipe workspace, then opens `?tab=agent` and expects the URL/content to fall back to functions.
- [ ] Assert the DOM does not contain the task-level Agent preset or platform-operation copy, while `?tab=info`, `materials`, `senses`, `comparison` and `matrix` remain reachable.
- [ ] Run RED: `pnpm exec playwright test tests/e2e/task-detail-layout.spec.ts --project=chromium --grep "default|Agent"`.
- [ ] Remove `'agent'` from the active Tab union, URL allow-list and render branch; remove the two task Agent imports. Initialize `activeTab` to `'functions'`.
- [ ] Run GREEN and `pnpm ts-check`.
- [ ] Commit: `git commit -m "refactor: remove embedded task AI entry"`.

### Task 2: Restore selected recipe/function context and lossless ingredient saving

**Files:**
- Create: `src/app/(main)/tasks/[id]/components/recipe-context-summary.tsx`
- Create: `src/app/(main)/tasks/[id]/components/recipe-context-summary.test.ts`
- Modify: `src/app/(main)/tasks/[id]/components/functions-input-workspace.tsx`
- Modify: `src/app/(main)/tasks/[id]/components/recipe-ingredient-summary.tsx`
- Modify: `src/app/(main)/tasks/[id]/components/recipe-ingredient-editor.tsx`
- Modify/Create: `src/app/(main)/tasks/[id]/components/recipe-ingredient-editor.test.ts`
- Modify: `tests/e2e/task-detail-layout.spec.ts`

- [ ] Write RED pure tests: recipe items format to `香蕉 100g`, overflow produces `+N`, and function type uses only real mode/speed/temperature/duration parameters.

```ts
assert.deepEqual(recipeContextTags(recipeFixture), ['香蕉 100g', '牛奶 200ml', '+2']);
assert.deepEqual(recipeContextTags(functionFixture), ['功能', '模式：奶昔', '转速：3档']);
```

- [ ] Write a RED close-time test: change the final ingredient and immediately close the Popover; the awaitable flush must save the last draft exactly once, and a failed save keeps the draft/error visible.
- [ ] Implement `RecipeContextSummary` below the active right-side recipe title and in the compact list. Do not invent function parameters when the source is empty.
- [ ] Change the ingredient editor to expose `flush(): Promise<void>` or register its pending save with the shared inline-save registry. Popover close awaits flush; unmount cleanup must not discard the final draft.
- [ ] Run the two tsx tests plus the E2E `--grep "ingredient|function tag"` and `pnpm ts-check`.
- [ ] Commit: `git commit -m "feat: restore recipe context summaries"`.

### Task 3: Show automatically synchronized issue output

**Files:**
- Modify: `src/lib/recipe-issue-output.ts`
- Modify: `src/lib/recipe-issue-output.test.ts`
- Modify: `src/app/(main)/tasks/[id]/components/recipe-issue-output-panel.tsx`
- Modify: `src/app/(main)/tasks/[id]/components/functions-input-workspace.tsx`
- Modify: `src/app/(main)/tasks/[id]/page.tsx`
- Modify if contract requires: `src/app/api/issues/route.ts`
- Modify: `tests/e2e/task-detail-layout.spec.ts`

- [ ] Write RED tests mapping effect/step issue sources to display rows with problem point, optional detail, source, material IDs, level, state and sync state.
- [ ] Add E2E: blur an effect problem, wait for `已进入问题管理`, assert no `登记为问题`/`确认输出` button, then repeat for a step issue.
- [ ] Rework `RecipeIssueOutputPanel` into a read-only status/output component. It may link to issue detail but may not create the issue on click.
- [ ] Keep `source_type='recipe_problem'`; attach `recipe_step_id` for step sources. Retry must remain idempotent under the existing unique contract.
- [ ] Run `pnpm exec tsx src/lib/recipe-issue-output.test.ts`, focused E2E, and type check.
- [ ] Commit: `git commit -m "feat: show synchronized recipe issue output"`.

### Task 4: Open the current data matrix directly

**Files:**
- Create: `src/lib/matrix/current-matrix-selection.ts`
- Create: `src/lib/matrix/current-matrix-selection.test.ts`
- Modify: `src/app/api/v1/tasks/[id]/matrix-tab-state/route.ts`
- Modify: `src/app/(main)/tasks/[id]/components/matrix-tab.tsx`
- Modify: `tests/e2e/v3124-closure.spec.ts`

- [ ] Write RED selector tests: meaningful older matrix beats newer empty matrix; among meaningful matrices the latest content update wins; only empty drafts choose latest; no matrix requests auto-create once.

```ts
assert.equal(selectCurrentMatrix([
  { id: 'empty-new', meaningful: false, contentUpdatedAt: 20 },
  { id: 'filled-old', meaningful: true, contentUpdatedAt: 10 },
])?.id, 'filled-old');
```

- [ ] Add `hasMeaningfulContent` and `contentUpdatedAt` to the matrix-tab-state projection using cell, media, narrative and issue timestamps, not only `task_matrices.updated_at`.
- [ ] Make `MatrixTab` open the selected instance immediately. Move other active/history matrices into a compact title selector showing name, status, meaningful state and update time.
- [ ] Preserve first-entry idempotent auto-create and archive/recreate behavior.
- [ ] Run selector tests and focused `v3124-closure` E2E.
- [ ] Commit: `git commit -m "feat: open the current data matrix directly"`.

### Task 5: Add desktop data-matrix zone navigation and pinned hierarchy

**Files:**
- Create: `src/lib/matrix/matrix-zone-layout.ts`
- Create: `src/lib/matrix/matrix-zone-layout.test.ts`
- Create: `src/app/(main)/tasks/[id]/components/matrix-zone-navigator.tsx`
- Create if needed: `src/app/(main)/tasks/[id]/components/matrix-row-focus-editor.tsx`
- Modify: `src/app/(main)/tasks/[id]/components/matrix-v3-grid.tsx`
- Modify: `tests/e2e/v3124-closure.spec.ts`

- [ ] Write RED tests for ordered zone anchors and cumulative pinned offsets for hierarchy columns.
- [ ] Render a compact zone navigator for hierarchy, primary media, inputs, calculations, effect media, evaluation and issues; clicking scrolls the existing grid container to the first column in that zone.
- [ ] Apply sticky left offsets to the hierarchy columns without changing canonical column order.
- [ ] Add numeric Enter-to-blur/save parity. Keep Shift+Enter and IME behavior safe for multiline text.
- [ ] If a row focus editor is added, limit it to media/long text/evaluation/issues; numeric, batch paste, formulas and column configuration remain in the grid.
- [ ] Verify horizontal scrolling keeps the hierarchy path visible and the navigator reaches each zone.
- [ ] Commit: `git commit -m "feat: improve data matrix desktop navigation"`.

### Task 6: Make the V3 mobile matrix a current-row workflow

**Files:**
- Create: `src/lib/matrix/matrix-mobile-model.ts`
- Create: `src/lib/matrix/matrix-mobile-model.test.ts`
- Modify: `src/app/(main)/tasks/[id]/components/matrix-v3-mobile.tsx`
- Modify: `src/components/inline-editable.tsx`
- Modify: `src/components/inline-editable.test.ts`
- Modify: `tests/e2e/v3124-closure.spec.ts`

- [ ] Write RED tests grouping one row into input/calculation/media/evaluation/problem sections, default-collapsing empty optional groups, and keeping error/problem groups open.
- [ ] Extend `InlineEditable.Textarea` with optional `submitOnEnter`; default false prevents global behavior changes. Test Enter, Shift+Enter and IME composition.
- [ ] Render one current row with path and `1 / N`, plus previous/next controls. Before changing row, flush pending saves; failure keeps the same row and draft.
- [ ] At 390px assert no page horizontal overflow and no bottom-navigation overlap.
- [ ] Run pure tests, focused E2E and type check.
- [ ] Commit: `git commit -m "feat: add current-row mobile matrix input"`.

### Task 7: Refactor comparison matrix into overview and focused editing

**Files:**
- Create: `src/app/(main)/tasks/[id]/components/comparison-matrix-model.ts`
- Create: `src/app/(main)/tasks/[id]/components/comparison-matrix-model.test.ts`
- Create: `src/app/(main)/tasks/[id]/components/comparison-matrix-overview.tsx`
- Create: `src/app/(main)/tasks/[id]/components/comparison-item-editor.tsx`
- Create: `src/app/(main)/tasks/[id]/components/comparison-mobile-item.tsx`
- Modify: `src/app/(main)/tasks/[id]/components/comparison-workspace.tsx`
- Modify: `tests/e2e/v3124-closure.spec.ts`
- Modify: `tests/e2e/platform-smoke.spec.ts`

- [ ] Write RED model tests producing compact cells with first media, media count, one-line conclusion and issue count, while preserving full cell data for the focused editor.
- [ ] Desktop E2E: overview contains no always-expanded effect/process/problem textareas; selecting one item reveals one full-width A/B/C editor; switching item flushes the first editor and failure prevents switching.
- [ ] Mobile E2E: 390px does not render the desktop Table/ScrollBar; current item shows A/B/C vertically and previous/next traverses all items.
- [ ] Extract existing cell media and inline-save behavior into `ComparisonItemEditor`; do not change API payloads.
- [ ] Keep object/item naming autosave, material binding and summary behavior. Consolidate object/structure deletion into low-emphasis management controls.
- [ ] Run model test plus comparison-focused E2E at desktop and mobile.
- [ ] Commit: `git commit -m "feat: focus comparison matrix editing by item"`.

### Task 8: Task and matrix acceptance gate

- [ ] Run all new pure tests.
- [ ] Run `pnpm exec playwright test tests/e2e/task-detail-layout.spec.ts tests/e2e/v3124-closure.spec.ts tests/e2e/platform-smoke.spec.ts --project=chromium --workers=1`.
- [ ] Run `pnpm ts-check`, `pnpm lint`, `pnpm build`, and `git diff --check`.
- [ ] Rebuild local Docker and verify task default, recipe context, issue output, data matrix and comparison matrix at 390/768/1024/1440.
- [ ] Verify console/network, focus retention, save failure behavior and stored API values, not screenshots alone.
- [ ] Stop before cloud deployment for user confirmation.
