# Platform Interaction Convergence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply one interaction vocabulary for page structure, tabs, filters, async states, status truth, issue editing, mobile analysis and the global AI assistant after the report and task core flows are stable.

**Architecture:** Build small shared app-level primitives first, then migrate pages by behavior rather than by visual restyling. Centralize request race handling and status presentation. Preserve the current Golden Yellow theme and existing business APIs unless a status/statistics contract is demonstrably wrong.

**Tech Stack:** Next.js 15, React 19, TypeScript 5, Tailwind CSS 4, shadcn/Radix, Playwright, node:assert tests.

---

### Task 1: Add shared async, save, Tab and filter primitives

**Files:**
- Create: `src/components/app/error-state.tsx`
- Create: `src/components/app/save-status.tsx`
- Create: `src/components/app/semantic-tab-bar.tsx`
- Create: `src/components/app/segmented-filter.tsx`
- Create: `src/lib/client/latest-request.ts`
- Create: `src/lib/client/latest-request.test.ts`
- Create: `src/hooks/use-debounced-value.ts`
- Modify: `src/components/app/control-styles.ts`
- Modify: `src/components/app/filter-bar.tsx`
- Modify: `src/components/app/loading-state.tsx`
- Modify: `src/components/app/empty-state.tsx`
- Modify: `src/components/app/status-badge.tsx`
- Modify: `src/components/app/index.ts`

- [ ] Write RED tests proving a newer request aborts the previous request, stale generations return `isCurrent() === false`, and dispose aborts pending work.

```ts
const first = latest.begin();
const second = latest.begin();
assert.equal(first.signal.aborted, true);
assert.equal(first.isCurrent(), false);
assert.equal(second.isCurrent(), true);
latest.dispose();
assert.equal(second.signal.aborted, true);
```

- [ ] Implement the latest-request helper and 300ms debounced-value hook.
- [ ] Implement `SemanticTabBar` with tablist/tab/tabpanel, arrows, Home/End and linked IDs.
- [ ] Implement `SegmentedFilter` with buttons and `aria-pressed`; do not use Tab roles.
- [ ] Implement `SaveStatus` states `idle/saving/saved/error` with retry, and an `ErrorState` with a concrete retry action.
- [ ] Set mobile controls to at least 44px while retaining appropriate desktop density.
- [ ] Run pure tests, type check and lint; commit `feat: add shared platform interaction primitives`.

### Task 2: Migrate Tab, filter and module-selection semantics

**Files:**
- Modify: `src/app/(main)/standards/page.tsx`
- Modify: `src/app/(main)/reports/[id]/components/report-tab-bar.tsx`
- Modify: `src/app/(main)/reports/[id]/page.tsx`
- Modify: `src/app/(main)/tasks/[id]/components/task-authoring-header.tsx`
- Modify: `src/app/(main)/tasks/page.tsx`
- Modify: `src/app/(main)/reports/page.tsx`
- Modify: `src/app/(main)/agent/page.tsx`
- Create: `tests/e2e/platform-interaction-wave2.spec.ts`

- [ ] Write RED E2E for ArrowRight Tab selection, correct panels, report Tab semantics, `aria-pressed` task/report filters, active task module state and 44px mobile targets.
- [ ] Migrate content Tabs to `SemanticTabBar`; migrate state/range controls to `SegmentedFilter`.
- [ ] Pass `activeSection` into task module controls and expose selected state without color alone.
- [ ] Run `pnpm exec playwright test tests/e2e/platform-interaction-wave2.spec.ts --grep "semantic|touch"` and commit.

### Task 3: Fix search races and page async states

**Files:**
- Modify: `src/app/(main)/standards/page.tsx`
- Modify: `src/app/(main)/standards/components/experience-standards-section.tsx`
- Modify: `src/app/(main)/standards/components/recipe-library-section.tsx`
- Modify: `src/app/(main)/tasks/page.tsx`
- Modify: `src/app/(main)/reports/page.tsx`
- Modify: `src/app/(main)/dashboard/page.tsx`
- Modify: `tests/e2e/platform-interaction-wave2.spec.ts`

- [ ] Add RED E2E where a 600ms `slow` request is followed by a 50ms `new` request; only `new` may remain visible.
- [ ] Assert five keystrokes do not generate five requests and refreshing keeps existing results instead of flashing a full skeleton.
- [ ] Use 300ms debounce, abort/latest guards and `aria-busy` local refresh states.
- [ ] Render ErrorState for failed first load; preserve old data with inline retry for failed refresh; show EmptyState only after successful empty response.
- [ ] Dashboard failure must not render four zero-valued metric cards. Keep only one audit entry point.
- [ ] Add recipe library keyword search through the existing API contract.
- [ ] Run `--grep "search|async|dashboard"` and commit.

### Task 4: Make report, issue and analysis states truthful

**Files:**
- Create: `src/lib/analysis-presentation.ts`
- Create: `src/lib/analysis-presentation.test.ts`
- Modify: `src/lib/server/issue-state-machine.ts`
- Modify: `src/lib/server/issue-status-presentation.test.ts`
- Modify: `src/components/app/status-badge.tsx`
- Modify: `src/app/(main)/reports/page.tsx`
- Modify: `src/app/api/dashboard/route.ts`
- Modify: `src/app/api/analysis/route.ts`
- Modify: `src/app/(main)/analysis/page.tsx`

- [ ] Write RED tests normalizing historical and canonical statuses: verified/已验证/已整改/verified_closed count and display as 已整改; open does not; assigned/rectifying/pending_verification/reopened display as 整改中.
- [ ] Assert report status `草稿` remains `草稿` and analysis does not split one semantic status into multiple rows.
- [ ] Remove component-level `草稿 → 已完成` translation.
- [ ] Update dashboard/analysis queries to include canonical and supported legacy states instead of only `status='已验证'`.
- [ ] Run both tsx tests, type check and commit.

### Task 5: Unify issue list, detail and rectification saving

**Files:**
- Create: `src/components/issues/issue-status-control.tsx`
- Create: `src/components/issues/issue-list-row.tsx`
- Modify: `src/app/(main)/issues/page.tsx`
- Modify: `src/app/(main)/issues/[id]/page.tsx`
- Modify: `src/components/issues/issue-rectification-dialog.tsx`
- Modify: `tests/e2e/platform-interaction-wave2.spec.ts`

- [ ] Write RED E2E: a 500 save response allows only one pending PUT, retains draft/edit mode, and retry succeeds; rectification typing sends no PUT until blur; verified_closed displays identically in list/detail.
- [ ] Move list/detail to shared PageHeader and Loading/Error/Empty states.
- [ ] Use real buttons for report-group disclosure with `aria-expanded/controls`; keep row navigation and status actions as siblings, never nested interactive elements.
- [ ] Store canonical codes and render labels through one presenter.
- [ ] Add pending, duplicate-submit protection, inline error, retry, cancel and close-time flush.
- [ ] Verify 390px targets are at least 44px; run issue E2E and commit.

### Task 6: Make analysis and global AI mobile layouts usable

**Files:**
- Modify: `src/app/(main)/analysis/page.tsx`
- Modify: `src/app/(main)/agent/page.tsx`
- Modify: `src/components/agent/hermes-chat.tsx`
- Modify: `src/app/(main)/layout.tsx`
- Modify carefully: `src/components/navigation.tsx`
- Modify: `tests/e2e/platform-interaction-wave2.spec.ts`

- [ ] Write RED E2E at 390×844: analysis has no page horizontal overflow and uses at most two metric-detail columns; Agent input/send sits above bottom navigation; message list is the only chat scroll region; high-frequency targets are 44px.
- [ ] Change analysis filters/details to mobile two-column/row-card layouts while keeping desktop tables where useful.
- [ ] Use `100dvh` minus mobile top/bottom navigation and safe-area for Agent; keep composer fixed above bottom navigation.
- [ ] Separate conversation and task-list errors; size upload/send/new-conversation/mode/task controls for touch.
- [ ] `src/components/navigation.tsx` already has unrelated user WeCom changes. Modify only navigation sizing lines, inspect the patch before staging, and never overwrite the WeCom area.
- [ ] Run `--grep "analysis|agent|navigation"`, type check and commit only scoped hunks.

### Task 7: Full platform and Docker gate

- [ ] Run all new pure tests, `pnpm ts-check`, `pnpm lint`, `pnpm build`, and `git diff --check`.
- [ ] Run `platform-interaction-wave2`, `platform-smoke`, and `task-detail-layout` serially.
- [ ] Rebuild local Docker and rerun at 390/768/1024/1440.
- [ ] Inspect console, network, accessibility roles, focus order and live API values.
- [ ] Preserve unrelated working-tree changes and stop before cloud deployment for user confirmation.
