# Recipe Evaluation, Retest, and Report Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace recipe/function problem-point entry with one three-state judgment, shared retest history, and a frozen-report issue projection that preserves original facts while showing current rectification.

**Architecture:** A small shared status module normalizes all judgment values. Server services own stable issue upsert and transactional retest/status recalculation; task and issue pages share one retest panel. `FrozenReportViewModel` remains the only source for detail, anonymous share, browser print, and server PDF.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, PostgreSQL/Supabase-compatible client, Drizzle, Tailwind/shadcn, Node contract tests, Playwright.

---

### Task 1: Canonical judgment and issue identity

**Files:**
- Create: `src/lib/evaluation-status.ts`
- Create: `src/lib/evaluation-status.test.ts`
- Create: `src/lib/server/evaluation-issue-sync.ts`
- Create: `src/lib/server/evaluation-issue-sync.test.ts`
- Modify: `src/app/api/recipes/route.ts`
- Modify: `src/app/api/recipes/[id]/route.ts`
- Modify: `src/app/api/records/route.ts`
- Modify: `src/app/api/records/[id]/route.ts`
- Modify: `src/lib/server/inline-values.ts`
- Modify: `src/lib/recipe-issue-output.ts`
- Modify: `src/storage/database/shared/schema.ts`
- Modify: `database-schema.sql`
- Create: `src/storage/database/shared/migrations/0016_recipe_evaluation_retest.sql`
- Modify: `src/storage/database/shared/migrations/meta/_journal.json`

- [ ] Write RED tests for `normalizeEvaluationStatus`, Chinese compatibility, default pending, recipe/record titles, and stable source identity.
- [ ] Run `pnpm tsx src/lib/evaluation-status.test.ts` and verify failure because the module is missing.
- [ ] Implement the canonical contract:

```ts
export type EvaluationStatus = 'qualified' | 'unqualified' | 'pending';
export function normalizeEvaluationStatus(value: unknown): EvaluationStatus;
export function evaluationStatusLabel(value: unknown): '合格' | '不合格' | '待定';
export function evaluationIssueTitle(subjectName: string, kind: 'recipe' | 'record', status: EvaluationStatus): string;
```

- [ ] Write RED service tests proving pending/unqualified create one issue per `recipe_id` or `record_id`, status/title changes retain the same issue id, and qualified never creates or deletes an issue.
- [ ] Run `pnpm tsx src/lib/server/evaluation-issue-sync.test.ts` and verify the missing service failure.
- [ ] Implement `syncEvaluationIssue` and route all recipe/check-record POST, PUT, batch, and inline status writes through it.
- [ ] Add migration 0016: backfill/default/check recipe status and retest result, add stable partial unique indexes for recipe and record sources, merge duplicate legacy source issues deterministically, and add the retest transaction function used in Task 2. Register it in Drizzle and the fresh schema.
- [ ] Run both focused tests plus existing `src/lib/recipe-issue-output.test.ts`; self-review that no title-based dedupe remains on the changed paths.
- [ ] Stage only this task's allowlist, run `git diff --cached --check`, `pnpm ts-check`, `pnpm lint`, and commit `feat: unify evaluation status and issue identity` after specification and quality review.

### Task 2: Shared retest service and UI

**Files:**
- Create: `src/lib/server/issue-retest-service.ts`
- Create: `src/lib/server/issue-retest-service.test.ts`
- Create: `src/components/issues/issue-retest-panel.tsx`
- Create: `src/lib/issue-retest-ui.test.ts`
- Modify: `src/app/api/issue-re-evaluations/route.ts`
- Modify: `src/app/api/issue-re-evaluations/[id]/route.ts`
- Modify: `src/app/api/issue-re-evaluations/[id]/ai-evaluate/route.ts`
- Modify: `src/components/issues/issue-rectification-dialog.tsx`

- [ ] Write RED service tests for create/edit/delete, latest ordering by `created_at,id`, all three result mappings, deleting latest/non-latest/only record, material unlink without asset deletion, and full rollback on failure.
- [ ] Run `pnpm tsx src/lib/server/issue-retest-service.test.ts` and verify the expected missing-service failure.
- [ ] Implement the service against the 0016 transaction function; routes validate `result`, authorize the issue, and return the recalculated issue state with the record.
- [ ] Write a RED source contract proving both task and issue surfaces import `IssueRetestPanel`, the panel contains a three-option radiogroup and delete action, and standalone AI score/result blocks are absent.
- [ ] Implement `IssueRetestPanel`: explicit save, default pending, textarea-embedded AI action, latest-first display, older-history disclosure, confirmation delete, and refresh after each mutation.
- [ ] Replace the duplicated retest block in `issue-rectification-dialog.tsx` with the shared panel. AI returns summary text to the current draft and never selects a result.
- [ ] Run the service/UI contracts, `pnpm ts-check`, and `pnpm lint`; self-review material cleanup, unauthorized deletion, empty draft, and stale request handling.
- [ ] Stage only this task's allowlist, run `git diff --cached --check`, and commit `feat: add shared issue retest workflow` after specification and quality review.

### Task 3: Recipe/function authoring convergence

**Files:**
- Create: `src/components/recipes/recipe-evaluation-panel.tsx`
- Create: `src/lib/recipe-evaluation-ui.test.ts`
- Modify: `src/app/(main)/tasks/[id]/page.tsx`
- Modify: `src/app/(main)/tasks/[id]/types.ts`
- Modify: `src/app/(main)/tasks/[id]/components/functions-input-workspace.tsx`
- Modify: `src/app/(main)/tasks/[id]/components/functions-tab.tsx`
- Modify: `src/app/api/recipes/[id]/ai-evaluate/route.ts`
- Modify: `src/app/api/recipe-steps/route.ts`
- Modify: `src/app/api/recipe-steps/[id]/route.ts`

- [ ] Write a RED source/UI contract asserting: no default-tab change; no effect/step problem-point controls; no save-material button; no standalone AI result/score; a three-state control, autosave feedback, embedded AI action, and shared retest panel are present.
- [ ] Run `pnpm tsx src/lib/recipe-evaluation-ui.test.ts` and verify it fails against the current problem-point/AI-score UI.
- [ ] Implement `RecipeEvaluationPanel` with immediate status save, blur description save, queued material autosave with saving/saved/error feedback, and embedded AI summary fill/save.
- [ ] Use it from the active task-page `FunctionsTab`; bind `IssueRetestPanel` by stable recipe issue identity when the judgment is pending/unqualified or an issue already exists.
- [ ] Remove step problem-point state, payloads, dialogs, badges, AI-detect UI, and effect-problem-point issue generation. Keep legacy DB fields read-compatible but unwritten and unrendered. Remove or align the unused duplicate `functions-tab.tsx` so it cannot reintroduce the old workflow.
- [ ] Change the recipe AI route to return a summary suitable for `effect_description`; do not write score/result or status.
- [ ] Run focused UI/status/recipe contracts, `pnpm ts-check`, and `pnpm lint`; self-review autosave races, failed AI calls, material removal, and issue id stability.
- [ ] Stage only this task's allowlist, run `git diff --cached --check`, and commit `feat: converge recipe evaluation entry` after specification and quality review.

### Task 4: Frozen issue projection and paper parity

**Files:**
- Modify: `src/lib/report-frozen-view.ts`
- Modify: `src/lib/server/report-frozen-view.ts`
- Modify: `src/components/reports/frozen-report-reader.tsx`
- Modify: `src/lib/server/report-print-renderer.ts`
- Modify: `src/components/reports/report-section-block-renderer.tsx`
- Modify: `src/lib/report-frozen-view.test.ts`
- Modify: `src/lib/report-share-view.test.ts`
- Modify: `src/lib/report-print-renderer.test.ts`
- Modify: `tests/e2e/report-frozen-reader.spec.ts`

- [ ] Write RED projection tests for anchored recipe facts, pending/unqualified recipe issues, no legacy effect/step problem issue generation, typed 0/1/2+ retests, latest/count, and live deletion fallback.
- [ ] Run the focused frozen/share/print contracts and verify failures on the current problem-point-driven projection.
- [ ] Extend the frozen types with canonical judgment, typed recipe steps without problem points, stable recipe subject identity, and typed retest summary (`count`, `latest`, optional history).
- [ ] Build original recipe facts only from the anchored snapshot; use live issue/retest/material data only in the rectification overlay.
- [ ] Update the shared reader: overall issue title, name, ingredients/parameters, hidden zero-step row, default-collapsed steps with content/evidence only, original evaluation/media, rectification evaluation/media, and one-vs-many retest display.
- [ ] Make browser-print and server-PDF renderers project the same fields without showing legacy problem points or all historical retests.
- [ ] Run frozen/share/print/PDF loading and asset tests plus `pnpm ts-check` and `pnpm lint`; self-review snapshot anchoring and all four output surfaces.
- [ ] Stage only this task's allowlist, run `git diff --cached --check`, and commit `feat: align frozen reports with overall judgments` after specification and quality review.

### Task 5: Workflow note and full acceptance

**Files:**
- Modify: `AGENTS.md`
- Modify only if tests expose defects: files already allowlisted in Tasks 1-4

- [ ] Add the confirmed authoring/retest/report regression boundaries to `AGENTS.md`, including pending-as-issue, no step/effect problem-point entry, issue permanence, and snapshot/live overlay separation.
- [ ] Run all new focused contracts, existing report contracts, `pnpm ts-check`, `pnpm lint`, and `pnpm build`.
- [ ] Rebuild with `docker compose -f docker-compose.local.yml up -d --build`; verify healthy app/database and `/login` 200 at `http://127.0.0.1:5000`.
- [ ] Run real-browser acceptance at mobile and desktop widths for authoring, pending/unqualified issue sync, retest create/delete/status fallback, report detail, anonymous share, browser print, and a real server-generated PDF.
- [ ] Confirm the five protected user files, `report-v3-matrix-view.tsx`, and session drafts were never staged or overwritten.
- [ ] Stage only `AGENTS.md` and any reviewed defect fixes, run `git diff --cached --check`, final type/lint/focused tests, and commit `docs: record evaluation workflow boundaries` after final specification and quality review.
- [ ] Do not push or deploy; report local evidence and wait for user confirmation.
