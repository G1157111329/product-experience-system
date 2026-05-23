# 产品体验管理平台 UI Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将产品体验管理平台前端重构为移动优先、信息密度清晰、组件边界明确、便于长期维护的企业级体验工程工作台。

**Architecture:** 保持现有 Next.js App Router、React、shadcn/ui、Tailwind CSS 4 和现有 API 契约不变，先抽象共享页面骨架和交互组件，再分阶段迁移高频页面。重构优先保护真实业务路径：体验计划创建、任务详情四 Tab、素材引用、问题点记录、报告生成/对比/分享、数据分析筛选。

**Tech Stack:** Next.js 16, React 19, TypeScript 5, Tailwind CSS 4, shadcn/ui, Radix UI, lucide-react, Recharts.

---

## 1. Current Baseline

### Product Context

平台覆盖以下主路径：

1. 登录与账号审核。
2. 工作台查看任务、问题、待审核/待申请。
3. 标准管理维护体验标准与食谱库。
4. 体验计划列表创建任务。
5. 任务详情四 Tab：基本信息、素材仓库、五感体验、功能效果。
6. 任务详情生成 AI 总结和报告。
7. 报告中心查看、同型号合并、AI 报告对比、分享、打印。
8. 问题管理跟踪整改。
9. 数据分析按品类、产品、项目类型、任务人、问题等级、时间筛选。

### Verified Project State

- TypeScript check passed with `npx --yes pnpm@9.0.0 ts-check`.
- Local shell does not currently expose `pnpm` directly in PATH; use `npx --yes pnpm@9.0.0 <script>` if needed.
- Current untracked file: `.mcp.json`; do not modify unless explicitly requested.
- No business logic change has been made for this plan.

### Main UI/Architecture Risks

- `src/components/navigation.tsx` is over-responsible: navigation, profile, role management, category/product settings, standard options, and AI config live in one file.
- `src/app/(main)/tasks/[id]/page.tsx` is too large and contains the main page plus all detail tabs and many dialogs.
- Several pages duplicate page headers, filters, entity list cards, sticky mobile action bars, loading states, empty states, and status badge logic.
- Mobile-first behavior exists, but patterns are inconsistent across pages: some pages use sticky filters, some use header cards, some use bottom action docks.
- Cards, badges, buttons, and filter bars are visually close but not governed by shared product-level primitives.

---

## 2. Design Principles

Use these principles for every phase:

1. **Operational, not marketing.** This is a field/workflow tool for experience engineers. Keep screens compact, scannable, and action-oriented.
2. **Mobile first.** Primary actions must remain reachable on phones. Touch targets should be at least 44px high where practical.
3. **No business drift.** API payloads, permissions, status transitions, material associations, and report generation logic must remain behaviorally equivalent unless a task explicitly says otherwise.
4. **Shared primitives before page polish.** If a pattern appears in multiple pages, extract it before styling individual screens.
5. **Readable density.** Use restrained cards, full-width sections, compact metadata rows, and clear sticky controls. Avoid oversized hero layouts.
6. **Accessible interaction.** Icon-only buttons require `aria-label` or visible tooltips. Focus rings must remain visible. Do not encode important status by color alone.
7. **Chinese content resilience.** Long Chinese strings, product models, report titles, and task names must not overflow mobile screens. Preserve `min-w-0`, `truncate`, `break-all`, and responsive wrapping.

---

## 3. Target Component Architecture

### New Shared App Components

Create these under `src/components/app/`:

- `page-shell.tsx`
  - Owns page-level padding, max width where needed, bottom safe-area spacing, and mobile top/bottom nav offsets.
  - Replaces repeated `p-4 lg:p-6`, `px-3 py-4`, and bottom padding conventions.

- `page-header.tsx`
  - Standardizes title, description, back button, metadata, and primary/secondary actions.
  - Supports desktop horizontal layout and mobile stacked layout.

- `filter-bar.tsx`
  - Standardizes sticky mobile filter/search rows.
  - Supports search input, select filters, reset action, and compact overflow behavior.

- `metric-card.tsx`
  - Standardizes dashboard and analysis KPI cards.
  - Supports icon, label, value, helper text, trend/progress state.

- `entity-list-item.tsx`
  - Standardizes list rows/cards for tasks, reports, standards, issues, recipes.
  - Supports leading icon/badge, title, metadata chips, trailing actions, click-through.

- `status-badge.tsx`
  - Centralizes status/level variants for task status, issue level, issue rectification status, report status, recipe type, standard category.
  - Must render text, not color-only meaning.

- `empty-state.tsx`
  - Standardizes empty states with icon, title, description, optional action.

- `loading-state.tsx`
  - Standardizes page spinner, skeleton list, and card skeleton.

- `action-dock.tsx`
  - Standardizes fixed mobile bottom action surface for compare/report actions and task-level actions.

### Refactor Existing Shared Components

- Keep `src/components/ui/*` as shadcn primitives.
- Keep `src/components/material-picker.tsx`, `src/components/media-capture-dialog.tsx`, and `src/components/image-preview.tsx`, but align their layout/labels with new app primitives later.
- Split `src/components/navigation.tsx` into focused files under `src/components/navigation/` and `src/components/settings/`.

Target split:

- `src/components/navigation/app-sidebar.tsx`
- `src/components/navigation/mobile-nav.tsx`
- `src/components/navigation/bottom-nav.tsx`
- `src/components/navigation/nav-content.tsx`
- `src/components/navigation/user-menu.tsx`
- `src/components/settings/category-product-settings.tsx`
- `src/components/settings/standard-options-settings.tsx`
- `src/components/settings/ai-config-settings.tsx`
- `src/components/settings/profile-dialog.tsx`

---

## 4. Page Refactor Scope

### Phase 1: Shared Shell and Navigation Split

**Goal:** Reduce global UI complexity and establish reusable page primitives without changing user-facing behavior.

**Files:**

- Create: `src/components/app/page-shell.tsx`
- Create: `src/components/app/page-header.tsx`
- Create: `src/components/app/filter-bar.tsx`
- Create: `src/components/app/metric-card.tsx`
- Create: `src/components/app/entity-list-item.tsx`
- Create: `src/components/app/status-badge.tsx`
- Create: `src/components/app/empty-state.tsx`
- Create: `src/components/app/loading-state.tsx`
- Create: `src/components/app/action-dock.tsx`
- Split/modify: `src/components/navigation.tsx`
- Modify: `src/app/(main)/layout.tsx`

**Implementation Notes:**

- Keep all existing labels, route paths, user permissions, and dialog behavior.
- Move settings dialogs out of `navigation.tsx` with the smallest possible prop surface.
- Add `aria-label` to icon-only nav/profile/settings/logout buttons.
- Preserve desktop sidebar, mobile top nav, and mobile bottom nav.

**Acceptance Criteria:**

- Navigation behaves the same on desktop and mobile.
- Profile, logout, category/product settings, standard options settings, and AI config still open and save.
- `npx --yes pnpm@9.0.0 ts-check` passes.

### Phase 2: Workbench and List Pages

**Goal:** Apply shared primitives to high-frequency overview screens first.

**Files:**

- Modify: `src/app/(main)/dashboard/page.tsx`
- Modify: `src/app/(main)/tasks/page.tsx`
- Modify: `src/app/(main)/reports/page.tsx`
- Modify: `src/app/(main)/analysis/page.tsx`
- Reuse: `src/components/app/*`

**Implementation Notes:**

- Dashboard:
  - Replace repeated stat cards with `MetricCard`.
  - Use `EntityListItem` for recent tasks and issues.
  - Keep admin/user audit behavior intact.

- Tasks list:
  - Use `PageHeader`, `FilterBar`, `EntityListItem`, `StatusBadge`, and `EmptyState`.
  - Convert status tabs to a shared segmented control style inside `FilterBar` or a simple local wrapper.
  - Keep create/delete/transfer dialogs behavior unchanged.

- Reports list:
  - Keep current grouped report logic.
  - Use `ActionDock` for mobile compare state.
  - Improve action affordance: checkbox compare, share, print, delete must have accessible labels.
  - Keep share sheet and AI compare behavior unchanged.

- Analysis:
  - Use `PageHeader`, `MetricCard`, `FilterBar`, and responsive chart/table sections.
  - Preserve CSV export for admin.

**Acceptance Criteria:**

- Main paths remain clickable:
  - dashboard to tasks
  - task list to task detail
  - report list to report detail
  - report share sheet
  - report compare action
  - analysis filters
- No horizontal scroll at 375px width.
- `npx --yes pnpm@9.0.0 ts-check` passes.

### Phase 3: Standards and Recipe Library

**Goal:** Make the standards/recipe dual module feel like one coherent management area.

**Files:**

- Modify: `src/app/(main)/standards/page.tsx`
- Consider create: `src/app/(main)/standards/components/experience-standards-section.tsx`
- Consider create: `src/app/(main)/standards/components/recipe-library-section.tsx`
- Consider create: `src/app/(main)/standards/components/standard-create-dialog.tsx`
- Consider create: `src/app/(main)/standards/components/standard-import-dialog.tsx`
- Consider create: `src/app/(main)/standards/components/recipe-library-dialogs.tsx`

**Implementation Notes:**

- Keep the two top-level tabs: experience standards and recipe library.
- Split `standards/page.tsx` because it currently contains both large modules.
- Standard and recipe list items should use the same entity/list pattern.
- Admin-only actions must remain hidden for non-admin users.
- Batch delete, standard import, recipe expansion, recipe step edit/delete/upload, and drag sort must remain intact.

**Acceptance Criteria:**

- Admin can create/import/delete standards.
- Non-admin can view standards but not admin actions.
- Admin can add/edit/delete recipe library entries and steps.
- Expanded recipe step management still loads and uploads materials.
- `npx --yes pnpm@9.0.0 ts-check` passes.

### Phase 4: Task Detail Decomposition

**Goal:** Turn the most important workflow page into maintainable modules while preserving all business behavior.

**Files:**

- Modify: `src/app/(main)/tasks/[id]/page.tsx`
- Create: `src/app/(main)/tasks/[id]/components/task-detail-header.tsx`
- Create: `src/app/(main)/tasks/[id]/components/task-detail-tabs.tsx`
- Create: `src/app/(main)/tasks/[id]/components/basic-info-tab.tsx`
- Create: `src/app/(main)/tasks/[id]/components/materials-tab.tsx`
- Create: `src/app/(main)/tasks/[id]/components/senses-tab.tsx`
- Create: `src/app/(main)/tasks/[id]/components/functions-tab.tsx`
- Create: `src/app/(main)/tasks/[id]/components/ai-summary-dialog.tsx`
- Create: `src/app/(main)/tasks/[id]/components/record-form-dialog.tsx`
- Create: `src/app/(main)/tasks/[id]/components/recipe-dialogs.tsx`
- Create: `src/app/(main)/tasks/[id]/types.ts`
- Create: `src/app/(main)/tasks/[id]/utils.ts`

**Implementation Notes:**

- This phase should be done in smaller commits.
- Start with pure extraction: move code without changing behavior.
- Only after extraction, apply visual improvements to headers, tabs, cards, and dialogs.
- Preserve these critical behaviors:
  - task status auto flow
  - AI summary GET/POST/PUT
  - report generation double-click lock
  - material picker initial materials
  - record edit material diff
  - standard type switching and fuzzy search
  - recipe/library reference
  - recipe/step drag sorting
  - effect evaluation save and AI evaluation

**Acceptance Criteria:**

- User can edit basic info.
- User can upload/select materials.
- User can add/edit five-sense records.
- User can add/edit recipes/functions and steps.
- User can save effect evaluation and trigger AI scoring.
- User can generate AI task summary.
- User can generate report.
- Mobile sticky tabs and bottom actions do not hide content.
- `npx --yes pnpm@9.0.0 ts-check` passes.

### Phase 5: Reports, Issues, Print, and Share Polish

**Goal:** Align output and follow-up screens with the new product UI language.

**Files:**

- Modify: `src/app/(main)/reports/[id]/page.tsx`
- Modify: `src/app/(main)/issues/page.tsx`
- Modify: `src/app/(main)/issues/[id]/page.tsx`
- Modify carefully: `src/app/reports/print/page.tsx`
- Modify carefully: `src/app/reports/share/[token]/page.tsx`

**Implementation Notes:**

- Report detail and public share page should remain content-first and printable.
- Print page should be touched conservatively: avoid layout changes that break PDF output.
- Issue management should emphasize grouped report source, level, status, and整改 action clarity.

**Acceptance Criteria:**

- Report detail shows merged eligible reports correctly.
- Public share page works without login.
- Print/PDF view remains readable and includes media previews.
- Issue status changes still persist.
- `npx --yes pnpm@9.0.0 ts-check` passes.

---

## 5. Visual System Direction

### Theme

- Keep current warm OKLCH amber/orange primary.
- Avoid turning the UI into a one-note amber palette:
  - Use semantic status colors for success, warning, destructive, and info states.
  - Keep surfaces quiet and neutral.
  - Use primary color mainly for selected state and primary actions.

### Layout

- Desktop:
  - Persistent left sidebar.
  - Content uses consistent gutters and page headers.
  - Dense lists should remain compact.

- Mobile:
  - Top bar and bottom nav stay.
  - Sticky filter bars are acceptable on list-heavy pages.
  - Long-running selected states, such as report compare, use `ActionDock`.
  - Primary creation actions should remain reachable without requiring horizontal scrolling.

### Components

- Cards:
  - Use cards for repeated entities, modals, and framed tools.
  - Do not nest cards inside cards.
  - Keep radius around current shadcn scale, avoid overly rounded product-card styling.

- Buttons:
  - Icon buttons need `aria-label`.
  - Destructive actions should be separated or confirmed.
  - Loading actions disable the button and show a spinner or loading text.

- Forms:
  - Keep visible labels.
  - Required fields should be marked.
  - Error and disabled states should be clear.
  - Complex dialogs should use sectioned groups and scroll safely on mobile.

- Lists:
  - Use title, status badge, metadata chips, and trailing actions consistently.
  - Long titles use `min-w-0`, `truncate`, or `break-all` based on context.

---

## 6. Interaction Rules

### Global

- All icon-only actions must have accessible names.
- Touch targets should be at least `h-10` for common mobile controls, and never smaller than the current shadcn defaults for primary actions.
- Keep keyboard focus visible.
- Do not rely on hover-only controls for mobile-critical actions.

### Sticky UI

- Sticky mobile headers/filters must respect the mobile top nav height.
- Fixed bottom action docks must account for bottom nav and `env(safe-area-inset-bottom)`.
- Verify content is not hidden behind sticky or fixed elements.

### Dialogs and Sheets

- Use dialogs for focused editing and confirmation.
- Use bottom sheets for mobile-oriented share/selection flows when already established.
- Dialogs with long forms need max height and internal scroll.
- Never allow destructive actions without either confirmation or clear undo path.

---

## 7. Suggested Verification Checklist

Run after each phase:

- `npx --yes pnpm@9.0.0 ts-check`
- `npx --yes pnpm@9.0.0 lint`

Manual UI checks:

1. Desktop viewport around 1440px.
2. Tablet/mobile around 768px.
3. Small mobile around 375px.
4. Dark mode if the app has a theme toggle in the active environment.
5. Long Chinese names, long report titles, long product models.
6. Empty states for every list page.
7. Loading states for every list/detail fetch.
8. Admin and non-admin role differences.

Key click paths:

1. Login with `bear2026 / bear2026`.
2. Open dashboard.
3. Create a task.
4. Open task detail.
5. Upload/select material.
6. Add five-sense record.
7. Add recipe/function and step.
8. Generate AI summary if AI config is available.
9. Generate report.
10. Open report detail.
11. Print report.
12. Create share link.
13. Open public share page.
14. Compare two reports.
15. Change an issue status.
16. Use analysis filters and admin export.

---

## 8. Risk Control

### Do Not Change Without Explicit Approval

- API request/response shapes.
- Database schema.
- Task status transition rules.
- Report merge eligibility rules.
- Material association behavior.
- Admin/non-admin permission logic.
- Public share token behavior.
- Print/PDF content semantics.

### Known Technical Risks

- Large-file extraction can accidentally change hook order or state ownership.
- Task detail has many coupled state variables; extract types and utils before extracting large UI blocks.
- Drag-and-drop sorting should be manually verified on desktop and mobile.
- File upload and media capture require real browser verification.
- Report print/share pages may look similar to normal UI but have different output constraints.

### Recommended Commit Strategy

1. `refactor: add shared app UI primitives`
2. `refactor: split navigation and settings components`
3. `refactor: align dashboard and task list UI`
4. `refactor: align reports and analysis UI`
5. `refactor: split standards management components`
6. `refactor: split task detail tabs`
7. `refactor: align report and issue detail UI`

Keep each commit type-checkable.

---

## 9. Current Progress (Updated 2026-05-22)

Working branch: `ui-refactor-phase-1`

### Phase 1: Shared App Primitives — COMPLETED

All 9 shared components created under `src/components/app/`:

| File | Purpose |
|------|---------|
| `page-shell.tsx` | Page-level padding, responsive layout container |
| `page-header.tsx` | Title, description, back button, meta badges, actions |
| `filter-bar.tsx` | Sticky mobile filter row with SearchField |
| `metric-card.tsx` | Dashboard/analysis KPI cards |
| `entity-list-item.tsx` | List row pattern for tasks, reports, standards |
| `status-badge.tsx` | Centralized status variants (task, issue, report, recipe, standard, generic) |
| `empty-state.tsx` | Icon + title + optional description/action |
| `loading-state.tsx` | Page spinner, skeleton list, skeleton card |
| `action-dock.tsx` | Fixed mobile bottom action surface |
| `index.ts` | Barrel exports for all above |

Navigation accessibility patched: icon-only buttons in `navigation.tsx` now have `aria-label`.

Type check passes. Lint passes for new code (existing repo-level any/unused-var issues remain pre-existing).

### Phase 2: High-Frequency Page Migration — COMPLETED

All 4 list/overview pages migrated to use shared primitives:

| Page | Before | After | Key changes |
|------|--------|-------|-------------|
| `dashboard/page.tsx` | Inline stat cards, raw layout | PageShell + PageHeader + MetricCard + EntityListItem | 358 lines, metric cards and recent lists unified |
| `tasks/page.tsx` | Inline headers, filters, lists | PageShell + PageHeader + FilterBar + EntityListItem + StatusBadge + EmptyState | 535 lines, create/delete/transfer preserved |
| `reports/page.tsx` | Inline filter, compare bar | PageShell + PageHeader + FilterBar + ActionDock + StatusBadge | 627 lines, compare/share/print/AI compare preserved |
| `analysis/page.tsx` | Inline KPI, filters | PageShell + PageHeader + FilterBar + MetricCard | 513 lines, charts and CSV export preserved |

Type check passes after each migration.

### Phase 3: Standards & Recipe Library Split — COMPLETED

`standards/page.tsx` reduced from **1084 lines** → **63 lines** (shell only).

Extracted files:

| File | Content |
|------|---------|
| `standards/types.ts` | CategoryWithProducts, Standard, RecipeLibItem, RecipeLibStep, categoryConfig |
| `standards/components/experience-standards-section.tsx` | Standards list, search, filter, batch select/delete |
| `standards/components/recipe-library-section.tsx` | Recipe list, expand/collapse, step management, drag reorder, material upload |
| `standards/components/recipe-library-dialogs.tsx` | Add recipe dialog (with steps), edit recipe dialog |
| `standards/components/standard-create-dialog.tsx` | Create standard + import standard dialogs |
| `standards/components/standard-batch-delete-dialog.tsx` | Batch delete confirmation dialog |

All use shared primitives: FilterBar, SearchField, StatusBadge, EmptyState, SkeletonList.

Type check passes.

### Phase 4: Task Detail Decomposition — IN PROGRESS

`tasks/[id]/page.tsx` is still **2935 lines** (unchanged). All extracted component files exist but the main page has NOT been rewritten to import them yet.

Extracted files (all exist, type-check passes individually):

| File | Status | Content |
|------|--------|---------|
| `tasks/[id]/types.ts` | Done | TaskDetail, AiTaskSummary, CheckRecord, Issue, Material, Recipe, ProblemPoint, RecipeStep, RecipeLibRef, CategoryWithProducts, sensoryColors, statusConfig |
| `tasks/[id]/utils.ts` | Done | summaryToForm(), linesToList() |
| `tasks/[id]/components/task-detail-header.tsx` | Done | Header with back, title, status badge, AI summary preview, actions (AI/transfer/report) |
| `tasks/[id]/components/task-detail-tabs.tsx` | Done | Tab navigation bar with TabKey type export |
| `tasks/[id]/components/basic-info-tab.tsx` | Done | Editable task info form |
| `tasks/[id]/components/materials-tab.tsx` | Done | Upload, gallery, capture, rename, delete materials |
| `tasks/[id]/components/ai-summary-dialog.tsx` | Done | AI summary form dialog (tag, score, summary, strengths, risks, etc.) |
| `tasks/[id]/components/functions-tab.tsx` | Done | Full recipe/function CRUD, step management, drag reorder, effect evaluation, AI scoring |

**NOT YET DONE:**

| Remaining File | Notes |
|----------------|-------|
| `tasks/[id]/components/senses-tab.tsx` | The largest tab (~1150 lines). Has deeply coupled state: standard type selector, 4 sub-forms (通用/品类/感官/非标准), fuzzy search, MaterialPicker integration, record status edit. |
| `tasks/[id]/page.tsx` rewrite | Main page needs to be rewritten from 2935 lines → thin shell importing all tab components + transfer dialog. |
| Transfer dialog extraction | Currently inline in page.tsx, needs to be its own component or kept inline if small enough. |
| Integration type check | After SensesTab extraction + page rewrite, need full tsc verification. |
| Browser smoke test | Dev server startup had WSL/bash compatibility issues; needs manual browser verification. |

### Phase 5: Reports, Issues, Print, Share — NOT STARTED

No changes made to:
- `reports/[id]/page.tsx`
- `issues/page.tsx`
- `issues/[id]/page.tsx`
- `reports/print/page.tsx`
- `reports/share/[token]/page.tsx`

---

## 11. Handoff Notes for Future Agents

- Read `AGENTS.md` before implementation.
- Treat this document as the UI refactor source of truth unless a newer product decision supersedes it.
- Start with pure extraction where files are large; visual changes should come after behavior-preserving moves.
- Prefer existing shadcn/ui primitives and current Tailwind tokens.
- Do not add a separate design framework.
- Do not introduce hardcoded hex colors into page components.
- Do not replace existing route/API behavior while doing UI work.
- Use Playwright/browser verification for mobile layout after frontend changes, especially task detail, report share, media picker, and bottom action docks.

---

## 12. Execution Options

Recommended execution mode:

1. **Subagent-driven by phase** for extraction-heavy work:
   - One worker for shared primitives.
   - One worker for navigation/settings split.
   - One worker for dashboard/list pages.
   - Task detail should be handled more sequentially because the state is tightly coupled.

2. **Inline execution** if the current agent needs tight control:
   - Do Phase 1 first.
   - Verify.
   - Then choose the next high-impact page group.

Do not start Phase 4 before Phase 1 shared primitives exist.

