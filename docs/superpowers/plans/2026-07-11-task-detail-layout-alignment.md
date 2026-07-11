# Task Detail Layout Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align the task-detail page with the approved professional workbench layout: stronger task header, compact ingredient tags, and a full-width evidence gallery at the bottom of the authoring workspace.

**Architecture:** Keep `page.tsx` as the data container while extracting focused presentational components for the task header/status strip and recipe ingredient summary. Keep the existing recipe and material APIs; only reshape how their data is presented and edited. The frozen report detail/share/print/PDF routes are outside this plan.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript 5, Tailwind CSS 4, shadcn/Radix Popover, Playwright 1.60, Node `assert` tests.

---

## File map

- Create `src/app/(main)/tasks/[id]/components/task-authoring-header.tsx`: enlarged task context header, top actions, and six status cards.
- Create `src/app/(main)/tasks/[id]/components/recipe-ingredient-summary.tsx`: ingredient tags and compact popover editor.
- Modify `src/app/(main)/tasks/[id]/components/recipe-ingredient-editor.tsx`: expose a controlled ingredient-fields primitive without changing normalization/autosave behavior.
- Modify `src/app/(main)/tasks/[id]/components/recipe-ingredient-editor.test.ts`: cover tag formatting and compact overflow behavior.
- Modify `src/app/(main)/tasks/[id]/components/functions-input-workspace.tsx`: remove the permanent ingredient form and render the compact tag summary under recipe names.
- Modify `src/app/(main)/tasks/[id]/components/report-authoring-shell.tsx`: move material evidence out of the left navigation and render it full-width after the active workspace.
- Modify `src/app/(main)/tasks/[id]/components/material-evidence-rail.tsx`: add a full-width bottom-gallery presentation while preserving upload, filtering, preview, drag, and bind behavior.
- Modify `src/app/(main)/tasks/[id]/page.tsx`: mount the new header/status strip, pass callbacks and counts, and use structured ingredients in the create/edit dialogs.
- Create `tests/e2e/task-detail-layout.spec.ts`: browser-visible desktop/mobile acceptance for the approved layout.

### Task 1: Lock the ingredient tag contract

**Files:**
- Modify: `src/app/(main)/tasks/[id]/components/recipe-ingredient-editor.tsx`
- Modify: `src/app/(main)/tasks/[id]/components/recipe-ingredient-editor.test.ts`

- [ ] **Step 1: Write the failing tag-format tests**

Add these assertions to `recipe-ingredient-editor.test.ts`:

```ts
import {
  createIngredientDraft,
  formatIngredientTag,
  ingredientTagSummary,
  shouldShowIngredientEditor,
  toIngredientPayload,
} from './recipe-ingredient-editor';

assert.equal(formatIngredientTag({ name: '香蕉', quantity: 100, unit: 'g' }), '香蕉 100g');
assert.equal(formatIngredientTag({ name: '冰块', quantity: 4, unit: '块', note: '去冰可删' }), '冰块 4块');
assert.deepEqual(
  ingredientTagSummary([
    { name: '香蕉', quantity: 100, unit: 'g' },
    { name: '牛奶', quantity: 200, unit: 'ml' },
    { name: '冰块', quantity: 4, unit: '块' },
    { name: '蜂蜜', quantity: 10, unit: 'g' },
  ], 3),
  { visible: ['香蕉 100g', '牛奶 200ml', '冰块 4块'], hiddenCount: 1 },
);
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```powershell
pnpm tsx 'src/app/(main)/tasks/[id]/components/recipe-ingredient-editor.test.ts'
```

Expected: FAIL because `formatIngredientTag` and `ingredientTagSummary` are not exported.

- [ ] **Step 3: Implement the pure tag helpers**

Add to `recipe-ingredient-editor.tsx` before the React component:

```ts
export function formatIngredientTag(item: IngredientDraftItem) {
  const amount = item.quantity === undefined || item.quantity === '' ? '' : String(item.quantity);
  return [item.name.trim(), `${amount}${(item.unit || '').trim()}`.trim()].filter(Boolean).join(' ');
}

export function ingredientTagSummary(items: IngredientDraftItem[], limit = 3) {
  const labels = items.map(formatIngredientTag).filter(Boolean);
  return {
    visible: labels.slice(0, limit),
    hiddenCount: Math.max(0, labels.length - limit),
  };
}
```

- [ ] **Step 4: Run the ingredient tests and type-check**

Run:

```powershell
pnpm tsx 'src/app/(main)/tasks/[id]/components/recipe-ingredient-editor.test.ts'
pnpm ts-check
```

Expected: both commands exit 0.

- [ ] **Step 5: Commit the contract**

```powershell
git add -- 'src/app/(main)/tasks/[id]/components/recipe-ingredient-editor.tsx' 'src/app/(main)/tasks/[id]/components/recipe-ingredient-editor.test.ts'
git commit -m "test: define compact ingredient tags"
```

### Task 2: Replace the permanent ingredient form with tags and a popover

**Files:**
- Create: `src/app/(main)/tasks/[id]/components/recipe-ingredient-summary.tsx`
- Modify: `src/app/(main)/tasks/[id]/components/functions-input-workspace.tsx`
- Modify: `src/app/(main)/tasks/[id]/components/recipe-ingredient-editor.tsx`

- [ ] **Step 1: Add a failing browser assertion for compact ingredients**

Create the first test in `tests/e2e/task-detail-layout.spec.ts`:

```ts
import { expect, test } from '@playwright/test';
import { loginForE2E } from './auth-session';

test.beforeEach(async ({ page }) => {
  await loginForE2E(page, 'dockeradmin', 'DockerLocal2026');
});

test('食谱常态显示食材标签而不是常驻大表单', async ({ page }) => {
  const created = await page.request.post('/api/recipes', {
    data: {
      task_id: 'golden-task-single',
      name: `E2E食材标签-${Date.now()}`,
      recipe_type: '食谱',
      ingredients: '',
      ingredient_items: [{ name: '香蕉切块', quantity: 100, unit: 'g', note: '' }],
    },
  });
  const payload = await created.json();
  expect(payload.code, payload.message).toBe(0);
  const recipeId = payload.data.id as string;
  try {
    await page.goto('/tasks/golden-task-single');
    await page.getByRole('button', { name: '功能效果', exact: true }).click();
    await page.getByText(/^E2E食材标签-/).click();
    await expect(page.getByRole('region', { name: '食材参数' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: '编辑食材参数' })).toBeVisible();
    await expect(page.getByText('香蕉切块 100g', { exact: true })).toBeVisible();
  } finally {
    await page.request.delete(`/api/recipes/${recipeId}`);
  }
});
```

- [ ] **Step 2: Run the focused E2E and verify RED**

Run against the current Docker stack:

```powershell
pnpm smoke:e2e -- tests/e2e/task-detail-layout.spec.ts --grep "食谱常态"
```

Expected: FAIL because the permanent `食材参数` region is still rendered.

- [ ] **Step 3: Create the compact summary component**

Create `recipe-ingredient-summary.tsx` with this component boundary:

```tsx
'use client';

import { useState } from 'react';
import { Pencil } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { IngredientItem } from '@/lib/task-context-contract';
import { createIngredientDraft, ingredientTagSummary, RecipeIngredientEditor } from './recipe-ingredient-editor';

export function RecipeIngredientSummary({
  items,
  legacyText,
  onSave,
}: {
  items: IngredientItem[];
  legacyText?: string | null;
  onSave: (items: IngredientItem[]) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const summary = ingredientTagSummary(createIngredientDraft(items, legacyText));

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="ghost" size="sm" aria-label="编辑食材参数" className="h-auto min-h-8 justify-start px-0 hover:bg-transparent">
          <span className="flex flex-wrap gap-1.5">
            {summary.visible.map((label) => <Badge key={label} variant="outline">{label}</Badge>)}
            {summary.hiddenCount > 0 && <Badge variant="secondary">+{summary.hiddenCount}</Badge>}
            {summary.visible.length === 0 && <span className="text-xs text-muted-foreground">添加食材</span>}
          </span>
          <Pencil className="ml-2 h-3.5 w-3.5 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(92vw,640px)] p-3">
        <RecipeIngredientEditor items={items} legacyText={legacyText} onSave={onSave} />
      </PopoverContent>
    </Popover>
  );
}
```

- [ ] **Step 4: Mount tags beneath recipe names and remove the main permanent form**

In `functions-input-workspace.tsx`:

```tsx
import { RecipeIngredientSummary } from './recipe-ingredient-summary';
```

Inside each recipe list item, directly after the recipe name:

```tsx
{shouldShowIngredientEditor(recipe.recipe_type) && (
  <RecipeIngredientSummary
    items={recipe.ingredient_items || []}
    legacyText={recipe.ingredients}
    onSave={(items) => onSaveIngredients(recipe, items)}
  />
)}
```

Remove the `RecipeIngredientEditor` block from the selected-recipe detail header. Keep the recipe title and edit action only.

- [ ] **Step 5: Verify compact editing and autosave**

Run:

```powershell
pnpm ts-check
pnpm lint
pnpm smoke:e2e -- tests/e2e/task-detail-layout.spec.ts --grep "食谱常态"
```

Expected: all commands exit 0; clicking `编辑食材参数` opens the popover and no permanent form occupies the main workspace.

- [ ] **Step 6: Commit the compact ingredient UI**

```powershell
git add -- 'src/app/(main)/tasks/[id]/components/recipe-ingredient-summary.tsx' 'src/app/(main)/tasks/[id]/components/recipe-ingredient-editor.tsx' 'src/app/(main)/tasks/[id]/components/functions-input-workspace.tsx' 'tests/e2e/task-detail-layout.spec.ts'
git commit -m "feat: compact recipe ingredients into tags"
```

### Task 3: Put structured ingredients in the create/edit recipe dialog

**Files:**
- Modify: `src/app/(main)/tasks/[id]/page.tsx`
- Modify: `src/app/(main)/tasks/[id]/components/recipe-ingredient-editor.tsx`
- Modify: `tests/e2e/task-detail-layout.spec.ts`

- [ ] **Step 1: Add the failing create-dialog E2E**

Append:

```ts
test('新建食谱时完整录入结构化食材', async ({ page }) => {
  await page.goto('/tasks/golden-task-single');
  await page.getByRole('button', { name: '功能效果', exact: true }).click();
  await page.getByRole('button', { name: '新增', exact: true }).click();
  await expect(page.getByRole('textbox', { name: '新食材 1 名称' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: '新食材 1 克重' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: '新食材 1 单位' })).toBeVisible();
});
```

- [ ] **Step 2: Run the test and verify RED**

```powershell
pnpm smoke:e2e -- tests/e2e/task-detail-layout.spec.ts --grep "新建食谱"
```

Expected: FAIL because the dialog still has a single legacy `填写食材` textbox.

- [ ] **Step 3: Add structured ingredient draft state**

In `FunctionsTab` replace the recipe draft shape with:

```ts
const [newRecipe, setNewRecipe] = useState({
  name: '',
  ingredients: '',
  ingredient_items: [{ name: '', quantity: '', unit: '', note: '' }] as IngredientDraftItem[],
  recipe_type: '食谱',
});
```

Update the recipe POST body:

```ts
body: JSON.stringify({
  name: newRecipe.name.trim(),
  recipe_type: newRecipe.recipe_type,
  ingredients: newRecipe.ingredients,
  ingredient_items: toIngredientPayload(newRecipe.ingredient_items),
  task_id: taskId,
}),
```

Render the four structured fields for each row with accessible names `新食材 N 名称/克重/单位/备注`, plus `添加食材` and `删除新食材 N` buttons. Use the same `IngredientDraftItem` type and `toIngredientPayload` normalizer as the popover editor.

- [ ] **Step 4: Keep post-create ingredient editing exclusively in the tag popover**

The general “编辑食谱” dialog may change name and type, but must not render the full ingredient rows. Preserve existing ingredients in its PUT body so a name/type edit cannot erase them:

```ts
body: JSON.stringify({
  name: editRecipeForm.name.trim(),
  recipe_type: editRecipeForm.recipe_type,
  ingredients: editingRecipe?.ingredients || '',
  ingredient_items: editingRecipe?.ingredient_items || [],
  problem_count: editingRecipe?.problem_count || 0,
}),
```

Legacy text is converted by `createIngredientDraft` only when the user opens the tag popover; the subsequent popover autosave writes structured `ingredient_items`.

- [ ] **Step 5: Run tests and commit**

```powershell
pnpm tsx 'src/app/(main)/tasks/[id]/components/recipe-ingredient-editor.test.ts'
pnpm ts-check
pnpm lint
pnpm smoke:e2e -- tests/e2e/task-detail-layout.spec.ts --grep "新建食谱"
git add -- 'src/app/(main)/tasks/[id]/page.tsx' 'src/app/(main)/tasks/[id]/components/recipe-ingredient-editor.tsx' 'tests/e2e/task-detail-layout.spec.ts'
git commit -m "feat: capture recipe ingredients during creation"
```

Expected: tests pass and the commit succeeds.

### Task 4: Move material evidence to the full-width workspace bottom

**Files:**
- Modify: `src/app/(main)/tasks/[id]/components/report-authoring-shell.tsx`
- Modify: `src/app/(main)/tasks/[id]/components/material-evidence-rail.tsx`
- Modify: `tests/e2e/task-detail-layout.spec.ts`

- [ ] **Step 1: Add the failing placement test**

```ts
test('素材证据位于主工作区底部而非录入目录', async ({ page }) => {
  await page.goto('/tasks/golden-task-single');
  await page.getByRole('button', { name: '功能效果', exact: true }).click();
  const directory = page.getByRole('complementary').filter({ has: page.getByRole('heading', { name: '录入目录' }) });
  await expect(directory.getByRole('heading', { name: '素材证据' })).toHaveCount(0);
  const workspaceEvidence = page.getByRole('region', { name: '任务级素材证据' });
  await expect(workspaceEvidence).toBeVisible();
  await expect(workspaceEvidence.locator('img')).toHaveCount(3);
});
```

- [ ] **Step 2: Verify RED**

```powershell
pnpm smoke:e2e -- tests/e2e/task-detail-layout.spec.ts --grep "素材证据位于"
```

Expected: FAIL because `materialRail` is currently cloned into the desktop left aside.

- [ ] **Step 3: Simplify `ReportAuthoringShell` placement**

Remove `cloneElement`, `isValidElement`, and `useMemo`. Delete `compactRail`. Remove the desktop aside material block and both mobile/collapsed material blocks. Render the rail after active content:

```tsx
<div className="min-w-0 space-y-4">
  {children}
  {materialRail && (
    <div className="rounded-lg border bg-card p-3 shadow-sm" data-testid="task-evidence-bottom">
      {materialRail}
    </div>
  )}
  <div className="h-20 lg:hidden" />
</div>
```

- [ ] **Step 4: Give the gallery an explicit accessible region**

In `MaterialEvidenceRail`, change the root element to:

```tsx
<section
  aria-label="任务级素材证据"
  className={cn(embedded ? 'space-y-3' : 'rounded-lg border bg-card p-3 shadow-sm')}
>
```

Keep the existing horizontal `ScrollArea`, filters, upload inputs, previews, drag payload, binding, and delete confirmation unchanged.

- [ ] **Step 5: Verify desktop and mobile behavior**

```powershell
pnpm ts-check
pnpm lint
pnpm smoke:e2e -- tests/e2e/task-detail-layout.spec.ts --grep "素材证据位于"
```

Expected: all commands pass; the evidence gallery is full-width under the active workspace and does not create main-content horizontal overflow at 390px viewport width.

- [ ] **Step 6: Commit**

```powershell
git add -- 'src/app/(main)/tasks/[id]/components/report-authoring-shell.tsx' 'src/app/(main)/tasks/[id]/components/material-evidence-rail.tsx' 'tests/e2e/task-detail-layout.spec.ts'
git commit -m "feat: move task evidence below the workspace"
```

### Task 5: Add the stronger task header and status strip

**Files:**
- Create: `src/app/(main)/tasks/[id]/components/task-authoring-header.tsx`
- Modify: `src/app/(main)/tasks/[id]/page.tsx`
- Modify: `tests/e2e/task-detail-layout.spec.ts`

- [ ] **Step 1: Add the failing header test**

```ts
test('顶部任务栏呈现上下文状态和两个主操作', async ({ page }) => {
  await page.goto('/tasks/golden-task-single');
  const header = page.getByRole('region', { name: '任务上下文' });
  await expect(header.getByRole('heading', { name: 'GT-01 原汁机双口径指标表' })).toBeVisible();
  await expect(header.getByRole('button', { name: '生成总结' })).toBeVisible();
  await expect(header.getByRole('button', { name: '生成报告' })).toBeVisible();
  for (const name of ['五感体验', '单一食谱功能', '数据矩阵', '对比矩阵', '报告信息', '问题管理']) {
    await expect(header.getByText(name, { exact: true })).toBeVisible();
  }
});
```

- [ ] **Step 2: Verify RED**

```powershell
pnpm smoke:e2e -- tests/e2e/task-detail-layout.spec.ts --grep "顶部任务栏"
```

Expected: FAIL because the current compact header contains neither top actions nor the six-card strip.

- [ ] **Step 3: Create `TaskAuthoringHeader`**

Define props explicitly:

```tsx
type TaskAuthoringHeaderProps = {
  title: string;
  metadata: string;
  statusLabel: string;
  statusClassName?: string;
  issueCount: number;
  recipeCount: number;
  sensesCount: number;
  hasMatrixInstance: boolean;
  hasAiSummary: boolean;
  generatingReport: boolean;
  summarizing: boolean;
  onBack: () => void;
  onGenerateSummary: () => void;
  onGenerateReport: () => void;
  onOpenSection: (section: 'senses' | 'functions' | 'matrix' | 'comparison' | 'info') => void;
  transferAction?: React.ReactNode;
};
```

Render a `section aria-label="任务上下文"` with `min-h-24`, `p-4 sm:p-5`, a `text-xl sm:text-2xl` heading, metadata, text status badges, top-right `生成总结` and primary `生成报告`, then a responsive `grid-cols-2 md:grid-cols-3 xl:grid-cols-6` status strip. Each status card is a button that calls `onOpenSection`.

- [ ] **Step 4: Replace the inline page header and remove duplicate report actions**

In `page.tsx`, replace the current header block with:

```tsx
<TaskAuthoringHeader
  title={task.task_name}
  metadata={`${task.product_model}${task.project_number ? ` | ${task.project_number}` : ''} | ${task.product_category}${task.product ? ` - ${task.product}` : ''}${task.project_type ? ` | ${task.project_type}` : ''}${task.project_phase ? ` | ${task.project_phase}` : ''}`}
  statusLabel={statusConfig[task.status]?.label || task.status}
  statusClassName={statusConfig[task.status]?.color}
  issueCount={task.issues?.length || 0}
  recipeCount={reportRecipes.length}
  sensesCount={task.records?.length || 0}
  hasMatrixInstance={hasMatrixInstance}
  hasAiSummary={Boolean(aiSummary)}
  generatingReport={generatingReport}
  summarizing={aiSummarizing}
  onBack={() => router.back()}
  onGenerateSummary={handleGenerateAiSummary}
  onGenerateReport={handleRequestGenerateReport}
  onOpenSection={setActiveTab}
  transferAction={isAdmin ? <Button variant="outline" size="sm" onClick={handleOpenTransfer}>转移</Button> : undefined}
/>
```

Keep the summary content in the `info` section, but remove its duplicate `生成AI总结`/`生成报告` action row. The top header becomes the only primary action location.

- [ ] **Step 5: Verify and commit**

```powershell
pnpm ts-check
pnpm lint
pnpm smoke:e2e -- tests/e2e/task-detail-layout.spec.ts --grep "顶部任务栏"
git add -- 'src/app/(main)/tasks/[id]/components/task-authoring-header.tsx' 'src/app/(main)/tasks/[id]/page.tsx' 'tests/e2e/task-detail-layout.spec.ts'
git commit -m "feat: strengthen the task authoring header"
```

Expected: all checks pass and the top actions are unique.

### Task 6: Full local production acceptance

**Files:**
- Modify only if acceptance reveals a scoped defect in files already listed above.

- [ ] **Step 1: Run all focused and static checks**

```powershell
pnpm tsx 'src/app/(main)/tasks/[id]/components/recipe-ingredient-editor.test.ts'
pnpm ts-check
pnpm lint
git diff --check
```

Expected: all commands exit 0.

- [ ] **Step 2: Build and start the local production Docker stack**

```powershell
docker compose -f docker-compose.local.yml up -d --build
docker compose -f docker-compose.local.yml ps
```

Expected: `product-experience-app-local` and `product-experience-postgres-local` are `healthy`.

- [ ] **Step 3: Run the complete layout E2E**

```powershell
pnpm smoke:e2e -- tests/e2e/task-detail-layout.spec.ts
```

Expected: all tests pass with no skips.

- [ ] **Step 4: Browser-visible manual gate**

At `http://127.0.0.1:5000/tasks/b220702d-0dbb-4f0d-9b56-472f432ab55c`, verify:

1. Header is visibly stronger but does not dominate the screen.
2. Ingredients display as tags; click opens a compact editor and autosaves `香蕉切块 / 100 / g` across refresh.
3. Evidence is a full-width horizontal gallery at the workspace bottom.
4. No main-content horizontal scrolling at 390px, 768px, 1024px, or 1440px.
5. Frozen report detail, share, print, and PDF pages have no file changes in `git diff HEAD~6 --name-only`.

- [ ] **Step 5: Commit acceptance-only fixes, if any, then stop**

```powershell
git status --short
git log -6 --oneline
```

Expected: clean worktree. Do not deploy to the cloud or push remotes until the user accepts the local Docker result.
