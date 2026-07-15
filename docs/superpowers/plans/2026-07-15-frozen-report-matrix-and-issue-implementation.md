# 冻结报告、双矩阵与统一问题归集 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让冻结报告在详情、分享、打印/下载中稳定呈现独立的对比矩阵与数据矩阵，支持可复用素材关联、统一来源问题展开和 A4 横向分页。

**Architecture:** 保留现有 `report_frozen_view` 和快照锚定，将素材关联统一收敛到 `material_links`，将 V3 矩阵精度和问题来源身份冻结到 projection。报告读者继续以 `FrozenReportReader` 为唯一详情/分享表面，浏览器打印与服务端 PDF 从同一冻结模型渲染 A4 横向文档。

**Tech Stack:** Next.js 15, React 19, TypeScript, Drizzle/PostgreSQL, Tailwind CSS 4, node:test, Playwright, Docker Compose.

---

## 当前工作树约束

- 当前工作树已有大量用户未提交修改。实现者必须先执行 `git status --short`，只修改本任务明确列出的文件，不得还原、格式化或暂存其他文件。
- 所有新行为遵循 RED -> GREEN -> REFACTOR。每个任务先运行指定的失败测试，再写生产代码。
- 不在子任务结束时启动 Docker。Docker 仅由主代理在所有队列清空后启动一次。

## 文件边界

| 任务 | 独占主文件 |
| --- | --- |
| 1. 素材关联 | `material-asset-service.ts`、`material-picker.tsx`、`api/v1/material-links/*`、recipe/retest migrations 与相关服务测试 |
| 2. V3 矩阵契约 | V3 hierarchy API/UI/bootstrap、projection adapter、recompute、任务顶部状态与矩阵测试 |
| 3. 冻结问题与功能效果 | `report-frozen-view.ts`、`frozen-report-reader.tsx`、issue context tests、function effect presentation tests |
| 4. 报告阅读与纸张交付 | report matrix readers、detail/share/print/PDF renderer、report print and E2E tests |

任务 1 和任务 2 可独立实施。任务 3 在任务 1 和任务 2 的接口完成后实施。任务 4 最后实施，消费任务 2 和任务 3 的冻结 DTO。

### Task 1: 让素材绑定真正支持多目标复用

**Files:**
- Modify: `src/lib/server/material-asset-service.ts`
- Modify: `src/app/api/v1/material-links/route.ts`
- Modify: `src/app/api/v1/material-links/[id]/route.ts`
- Modify: `src/components/material-picker.tsx`
- Modify: `src/app/api/materials/route.ts`
- Modify: `src/storage/database/shared/migrations/0017_atomic_recipe_evaluation.sql`
- Modify: `src/storage/database/shared/migrations/0016_recipe_evaluation_retest.sql`
- Modify: recipe/retest/material integration tests that currently expect occupied materials to fail
- Create: `src/lib/material-links-contract.test.ts`

- [ ] **Step 1: RED, prove one asset may bind to multiple targets**

```ts
test('one material can bind to a recipe, a step and a matrix cell', async () => {
  const recipe = await bindMaterial({ materialId: 'm1', targetType: 'recipe', targetId: 'r1', bindingMethod: 'click_select', boundBy: 'u1' });
  const step = await bindMaterial({ materialId: 'm1', targetType: 'recipe_step', targetId: 's1', bindingMethod: 'click_select', boundBy: 'u1' });
  const cell = await bindMaterial({ materialId: 'm1', targetType: 'dynamic_matrix_cell_value', targetId: 'c1', bindingMethod: 'click_select', boundBy: 'u1' });
  assert.notEqual(recipe.linkId, step.linkId);
  assert.notEqual(step.linkId, cell.linkId);
});
```

- [ ] **Step 2: Run RED**

Run: `pnpm exec tsx src/lib/material-links-contract.test.ts`
Expected: FAIL because recipe and step target validation/legacy save logic treats the existing asset as occupied.

- [ ] **Step 3: Implement target validation and idempotent link writes**

Define a closed `MaterialLinkTargetType` union for record, recipe, recipe step, issue, re-evaluation, comparison cell and V3 cell. Validate target existence and caller authorization before `bindMaterial`. Preserve the unique `(material_id, target_type, target_id)` contract and use per-target deterministic `bindingOrder`.

- [ ] **Step 4: Replace legacy exclusive recipe/retest writes**

Update recipe effect and re-evaluation save paths to replace only links for their own target, never clear `materials.recipe_id` or reject another target's link. Retain legacy FK reads for old rows. MaterialPicker selection, upload and removal must create/remove one link and show all currently selected target links.

- [ ] **Step 5: GREEN and regression checks**

Run:

```powershell
pnpm exec tsx src/lib/material-links-contract.test.ts
pnpm exec tsx src/lib/server/recipe-evaluation-save.test.ts
pnpm exec tsx src/lib/server/issue-retest-service.integration.test.ts
pnpm exec tsx src/lib/media-source-policy.test.ts
```

Expected: all pass; removing one link leaves other links and asset status intact.

### Task 2: 收紧 V3 数据矩阵层级、精度和任务入口状态

**Files:**
- Modify: `src/app/api/v1/matrices/[id]/hierarchy-nodes/route.ts`
- Modify: `src/app/(main)/tasks/[id]/components/matrix-v3-grid.tsx`
- Modify: `src/lib/matrix/bootstrap-v3.ts`
- Modify: `src/lib/matrix/recompute-v3.ts`
- Modify: `src/lib/matrix/report-projection-v3-adapter.ts`
- Modify: `src/lib/matrix/v3-types.ts`
- Modify: `src/app/(main)/tasks/[id]/page.tsx`
- Modify: `src/app/(main)/tasks/[id]/components/task-authoring-header.tsx`
- Modify: `src/app/api/v1/tasks/[id]/matrix-tab-state/route.ts`
- Modify: `src/lib/matrix/matrix-v3-ui-regressions.test.ts`
- Modify: `tests/e2e/v3124-closure.spec.ts`
- Create: `src/lib/matrix/frozen-matrix-display-contract.test.ts`

- [ ] **Step 1: RED, define the new two-level and precision contract**

```ts
test('rejects creation of third hierarchy level', async () => {
  const response = await createHierarchyNode({ parentId: 'level-2', kind: 'level3', label: 'forbidden' });
  assert.equal(response.status, 422);
});

test('formats calculation with column decimalPlaces zero', () => {
  assert.equal(formatFrozenMatrixNumber(7.375, { decimalPlaces: 0 }), '7');
});
```

- [ ] **Step 2: Run RED**

Run: `pnpm exec tsx src/lib/matrix/frozen-matrix-display-contract.test.ts`
Expected: FAIL because current V3 API/UI/bootstrap accepts level 3 and frozen adapter returns raw numeric values.

- [ ] **Step 3: Implement hierarchy and display policy**

Reject new level-3 creation at API boundary with a localized 422 response. Remove `InlineNewLevel3` and seeded C hierarchy from V3 bootstrap. Preserve old level-3 text only when projecting historical issue context. Add `decimalPlaces` to frozen columns, use it for raw and computed formatting, and make recompute output conform to column display precision without changing stored source precision.

- [ ] **Step 4: Implement meaningful saved-content matrix status**

Update `matrix-tab-state` to exclude archived/empty matrices. Task header state must refresh after successful matrix content save and show `已创建` only for saved meaningful content, never merely for a created shell or a frozen report.

- [ ] **Step 5: GREEN**

Run:

```powershell
pnpm exec tsx src/lib/matrix/frozen-matrix-display-contract.test.ts
pnpm exec tsx src/lib/matrix/matrix-v3-ui-regressions.test.ts
pnpm exec playwright test tests/e2e/v3124-closure.spec.ts --workers=1
```

Expected: no third-level creation, `0` precision is stable, and task header reflects saved content.

### Task 3: 冻结四来源问题与功能效果的统一阅读模型

**Files:**
- Modify: `src/lib/report-frozen-view.ts`
- Modify: `src/lib/server/report-frozen-view.ts`
- Modify: `src/lib/matrix/issue-point-sync.ts`
- Modify: `src/components/reports/frozen-report-reader.tsx`
- Modify: `src/lib/report-frozen-issue-context.test.ts`
- Modify: `src/lib/report-frozen-view.test.ts`
- Modify: `src/lib/frozen-report-reader-presentation.test.ts`
- Modify: `tests/e2e/report-frozen-reader.spec.ts`

- [ ] **Step 1: RED, preserve stable source identity and link-aware evidence**

```ts
test('frozen matrix issue retains issue id, source cell and linked retest', () => {
  const issue = buildFrozenIssue(matrixIssueFixture());
  assert.equal(issue.kind, 'matrix');
  assert.equal(issue.sourceCellId, 'cell-1');
  assert.equal(issue.linkedIssueId, 'issue-1');
  assert.equal(issue.retests.length, 2);
});
```

- [ ] **Step 2: Run RED**

Run: `pnpm exec tsx src/lib/report-frozen-issue-context.test.ts`
Expected: FAIL because V3 `ReportV3IssuePoint` omits linked issue/source identity and `matrix_issue` does not match report classification.

- [ ] **Step 3: Implement canonical issue source contract**

Normalize V3 sync and frozen issue classification to one stable matrix source type, preserve linked issue ID and source cell ID in the frozen projection, and join material links for frozen evidence and live rectification overlays. Do not use title matching. Build four discriminated expansion models: sensory, function, comparison and matrix.

- [ ] **Step 4: Implement the default-collapsed issue row UI**

Render a fixed row head with level, source type, description and rectification status. Default collapsed. Expand only the exact source fields: recipe name/parameters/optional steps/effect media; comparison object/project/item/problem/media; data matrix hierarchy/dimension/problem/media; sensory standard or non-standard fields. Show only the latest rectification by default and a secondary history disclosure when count is at least two. Change comparison label to `食谱/功能-对比矩阵`.

- [ ] **Step 5: Implement function effect list structure**

Keep preview cards, then render one recipe list entry with recipe name, step/score/problem chips, ingredients, effect media, default-collapsed steps and effect evaluation media. Do not render an extra `问题` row.

- [ ] **Step 6: GREEN**

Run:

```powershell
pnpm exec tsx src/lib/report-frozen-issue-context.test.ts
pnpm exec tsx src/lib/report-frozen-view.test.ts
pnpm exec tsx src/lib/frozen-report-reader-presentation.test.ts
pnpm exec playwright test tests/e2e/report-frozen-reader.spec.ts --workers=1
```

Expected: all four sources render the required collapsed header and source-specific expansion with latest rectification and linked media.

### Task 4: 统一冻结报告详情、分享、打印和下载的双矩阵文档输出

**Files:**
- Modify: `src/app/api/reports/route.ts`
- Modify: `src/lib/matrix/report-projection-v3-adapter.ts`
- Modify: `src/components/reports/frozen-report-reader.tsx`
- Modify: `src/components/reports/report-data-matrix-read-view.tsx`
- Modify: `src/app/(main)/reports/[id]/components/report-matrix-tab.tsx`
- Modify: `src/app/reports/share/[token]/page.tsx`
- Modify: `src/app/reports/print/page.tsx`
- Modify: `src/components/reports/report-section-block-renderer.tsx`
- Modify: `src/lib/server/report-print-renderer.ts`
- Modify: `src/lib/report-print-renderer.test.ts`
- Modify: `src/lib/report-print-matrix.test.ts`
- Modify: `src/lib/report-share-view.test.ts`
- Modify: `tests/e2e/report-frozen-reader.spec.ts`

- [ ] **Step 1: RED, require both matrices and A4 paper output**

```ts
test('print model keeps comparison and data matrices on A4 landscape', () => {
  const html = renderFrozenReportForPrint(reportWithBothMatrices());
  assert.match(html, /@page\s*\{\s*size:\s*A4 landscape/);
  assert.match(html, /GT-03 双口径指标对比/);
  assert.match(html, /测试过程与结果数据/);
  assert.doesNotMatch(html, /overflow-x:\s*auto/);
});
```

- [ ] **Step 2: Run RED**

Run: `pnpm exec tsx src/lib/report-print-renderer.test.ts`
Expected: FAIL because current matrix pages force A3 landscape and comparison/PaperMatrix still use horizontal overflow.

- [ ] **Step 3: Freeze media and render both matrix kinds independently**

Report generation must aggregate legacy FK media and new `material_links` media, preserve ordering and freeze video poster descriptor, duration and fallback placeholder. Reader must expose independent comparison and data matrix Tabs when both exist. Remove matrix internal overflow containers; use fixed paper/document layouts and semantic column widths. Never add an appendix Tab or collect media at report end: every image, video poster and rectification asset remains at its source matrix cell, issue expansion, recipe step or effect evaluation.

- [ ] **Step 4: Implement A4 landscape pagination**

Use A4 landscape for reports with any matrix. Repeat table headers per page, keep group rows with their first data row when CSS permits, retain comparison group summary, calculation columns, video posters and appendix media. Browser print and server PDF use equivalent paper contract. A poster generation failure uses a labeled stable placeholder, not a broken image.

- [ ] **Step 5: GREEN and Docker-independent checks**

Run:

```powershell
pnpm exec tsx src/lib/report-print-renderer.test.ts
pnpm exec tsx src/lib/report-print-matrix.test.ts
pnpm exec tsx src/lib/report-share-view.test.ts
pnpm exec tsx src/lib/report-media-preview.test.ts
pnpm exec playwright test tests/e2e/report-frozen-reader.spec.ts --workers=1
```

Expected: detail/share/print expose matching frozen matrices, A4 paper data, video poster and complete appendix media.

### Task 5: 单次 Docker 全局验收

**Files:**
- Modify only if an acceptance failure is demonstrably within the approved scope.

- [ ] Run all focused tests from Tasks 1-4, then `pnpm ts-check`, `pnpm lint`, `git diff --check` and `pnpm build`.
- [ ] Start the only local deployment for this task: `docker compose -f docker-compose.local.yml up --build -d`.
- [ ] Verify health, create or use a fixture report containing both matrices, four issue types, reused video and at least two retests.
- [ ] Browser-verify at desktop and mobile report detail, anonymous share, task matrix header and `reports/print`. Confirm default-collapsed issue rows, no matrix inner scrolling, A4 landscape output, repeated headers, media posters, and no failed network requests.
- [ ] Record PASS/BLOCKED result per acceptance item before stopping containers.
