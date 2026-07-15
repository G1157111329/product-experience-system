# Platform P0 Release Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the verified security, data-integrity, frozen-report, autosave, destructive-action, mobile-accessibility, and startup blockers without reverting the current dirty-worktree implementation, then perform one consolidated local Docker acceptance.

**Architecture:** Preserve the current worktree as the baseline and add narrow server services for resource authorization, transactional lifecycle operations, material linking, and schema readiness. Keep frozen facts immutable and layer only authorized live rectification state. Implement UI changes against these server contracts, use focused RED/GREEN checks while coding, and defer Docker deployment until every queued package and code gate is green.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript 5, Drizzle ORM, PostgreSQL 16, Tailwind CSS 4, Playwright 1.60, pnpm 9, Docker Compose.

---

## Current-worktree rules

- The 256 pre-existing modified/untracked entries are protected in-progress work.
- Before every task run `git status --short` and record the task allowlist.
- Never reset, restore, reformat, stage, or delete unrelated files.
- Implementation remains on the current explicitly approved `main` worktree because the work to close exists only in this dirty baseline.
- Each implementation task gets implementer self-review, spec review, and code-quality review before the next shared-file task starts.
- Do not run Docker in Tasks 0-8.

## File-boundary map

| Task | Exclusive primary files |
|---|---|
| 0 | `eslint.config.mjs`, stale contract tests only |
| 1 | WeCom callback/auth, Agent access service/routes, unassigned-material ownership migration/routes |
| 2 | Issue/record/recipe deletion transaction services and DELETE routes |
| 3 | Material asset service, material routes, frozen-media reference guard |
| 4 | Frozen issue DTO/projection/reader/print tests and report detail action |
| 5 | Inline-save registry, debounced save hook, task report-generation/navigation gate |
| 6 | Five-senses and comparison destructive-action UI plus impact API |
| 7 | Frozen comparison/data-matrix responsive readers, mobile row controls, recipe keyboard sorting |
| 8 | Startup security/schema manifest, database-mode validation, docs/env contract |
| 9 | Focused/full local code gates only |
| 10 | Docker Compose, browser/API/database/PDF acceptance artifacts |

## Required execution order

Execute the numbered sections in this dependency order, not in numeric display order:

```text
Task 0 → Task 8 → Task 1 → Task 3 → Task 2 → Task 4 → Task 5 → Task 6 → Task 7 → Task 9 → Task 10
```

Task 8 fixes the supported database contract before new transactional services are added. Task 3 establishes atomic material operations before Task 2 deletion services reuse them. Task 4 waits for frozen-media protection; UI-only Tasks 5-7 follow the server truth contracts. Task 10 remains the only initial Docker deployment.

### Task 0: Lock the current baseline and restore truthful code gates

**Files:**
- Modify: `src/lib/report-frozen-view.test.ts`
- Modify: `src/lib/frozen-report-reader-presentation.test.ts`
- Modify: `src/lib/matrix-create-response.test.ts`
- Modify: `src/lib/project-phase-options.test.ts`
- Modify: `src/lib/report-list-projection.test.ts`
- Modify: `src/lib/task-ai-entry.test.ts`
- Modify: `src/lib/task-report-info-options.test.ts`
- Modify: `eslint.config.mjs`
- Test: the files above

- [ ] **Step 1: Capture the protected baseline**

Run:

```powershell
New-Item -ItemType Directory -Force 'qa-output/platform-p0-release-closure' | Out-Null
git status --short | Set-Content -Encoding utf8 'qa-output/platform-p0-release-closure/baseline-status.txt'
git diff --stat
```

Expected: the baseline file records every pre-existing path; no product file changes.

- [ ] **Step 2: Make the latest issue-row rule the RED contract**

Update the frozen-reader tests to require one status field and forbid the superseded `查看整改` action:

```ts
assert.match(readerSource, /data-issue-field="status"/);
assert.match(readerSource, /issueStatusLabel\(issue\.liveOverlay\.status \|\| 'open'\)/);
assert.doesNotMatch(readerSource, />\s*查看整改\s*</);
```

Run:

```powershell
pnpm exec tsx src/lib/report-frozen-view.test.ts
pnpm exec tsx src/lib/frozen-report-reader-presentation.test.ts
```

Expected: FAIL because anonymous/read-only rows do not always render a dedicated status field.

- [ ] **Step 3: Remove lint false positives without hiding source problems**

Replace each newly added test-only `@ts-ignore` with a narrowly explained `@ts-expect-error`. Add generated deployment output to ESLint global ignores:

```js
globalIgnores([
  '.next/**',
  'tmp/**/.next/**',
  'tmp/deploy-report-runtime/**',
]);
```

Run:

```powershell
pnpm eslint src/lib/matrix-create-response.test.ts src/lib/project-phase-options.test.ts src/lib/report-list-projection.test.ts src/lib/task-ai-entry.test.ts src/lib/task-report-info-options.test.ts
```

Expected: exit 0. Do not fix unrelated warnings in this task.

- [ ] **Step 4: Commit only Task 0 paths**

```powershell
git add -- eslint.config.mjs src/lib/report-frozen-view.test.ts src/lib/frozen-report-reader-presentation.test.ts src/lib/matrix-create-response.test.ts src/lib/project-phase-options.test.ts src/lib/report-list-projection.test.ts src/lib/task-ai-entry.test.ts src/lib/task-report-info-options.test.ts
git diff --cached --check
git commit -m "test: align P0 release gates"
```

### Task 1: Close external-entry and cross-user authorization gaps

**Files:**
- Create: `src/lib/server/wecom-callback-auth.ts`
- Create: `src/lib/server/wecom-callback-auth.test.ts`
- Modify: `src/app/api/v1/wecom/callback/route.ts`
- Create: `src/lib/server/agent-resource-access.ts`
- Create: `src/lib/server/agent-resource-access.test.ts`
- Modify: `src/app/api/v1/agent/skills/matrix-evaluation-summary/route.ts`
- Modify: `src/app/api/v1/agent/suggestion-blocks/[id]/decide/route.ts`
- Modify: `src/lib/server/hermes/skills.ts`
- Modify: `src/lib/server/material-asset-service.ts`
- Modify: `src/app/api/v1/materials/unassigned/route.ts`
- Modify: `src/app/api/materials/upload/route.ts`
- Modify: `src/storage/database/shared/schema.ts`
- Create: `src/storage/database/shared/migrations/0024_material_owner_and_wecom_replay.sql`
- Modify: `src/storage/database/shared/migrations/meta/_journal.json`
- Modify: `database-schema.sql`

- [ ] **Step 1: Write RED tests for WeCom fail-closed behavior**

Define the verification boundary:

```ts
export interface VerifiedWecomCallback {
  corpId: string;
  messageId: string;
  mediaId: string;
  externalUserId: string;
  timestamp: number;
  nonce: string;
}

export function verifyWecomCallback(input: {
  signature: string | null;
  timestamp: string | null;
  nonce: string | null;
  encryptedBody: string;
  now?: number;
}): VerifiedWecomCallback;
```

Tests must cover missing token/key, bad signature, stale timestamp, CorpId mismatch, invalid AES payload, and repeated message ID.

Run:

```powershell
pnpm exec tsx src/lib/server/wecom-callback-auth.test.ts
```

Expected: FAIL because the verifier does not exist.

- [ ] **Step 2: Implement verification before queue writes**

The callback route must call `verifyWecomCallback()` before `enqueueWecomMediaJob()` and insert the verified message ID into a unique replay table in the same transaction used to enqueue. It must never accept plain client JSON on the public callback route.

Run the test from Step 1. Expected: PASS with zero enqueue calls for all rejected cases.

- [ ] **Step 3: Write RED dual-user Agent authorization tests**

Define one reusable boundary:

```ts
export async function assertSuggestionDecisionAccess(input: {
  userId: string;
  suggestionBlockId: string;
}): Promise<{ matrixId: string; suggestionPayload: unknown }>;

export async function assertMatrixSkillAccess(input: {
  userId: string;
  matrixId: string;
}): Promise<void>;
```

Tests must prove user B cannot read/run/decide user A's matrix or suggestion, a client body cannot replace `matrixId`, and denial creates no run/narrative.

Run:

```powershell
pnpm exec tsx src/lib/server/agent-resource-access.test.ts
```

Expected: FAIL against current route-only `requireUser` behavior.

- [ ] **Step 4: Enforce resource access in route and skill layers**

Use the suggestion block's persisted target matrix only. Call the access assertion before model invocation and again inside `runMatrixSummarySkill()` before projection loading. Accept/reject and narrative upsert must share one transaction.

Run the test from Step 3. Expected: PASS.

- [ ] **Step 5: Add material ownership and scope the unassigned pool**

Add `materials.created_by`, backfill from the owning task or known upload audit where deterministic, and leave unresolved legacy rows admin-only. Upload must set `createdBy: user.id`. The query contract becomes:

```ts
export async function getUnassignedMaterials(input: {
  userId: string;
  isAdmin: boolean;
}): Promise<MaterialAsset[]>;
```

Normal users filter `created_by = userId`; admins may request the global pool explicitly.

Run:

```powershell
pnpm exec tsx src/lib/material-links-contract.test.ts
pnpm exec tsx src/lib/server/agent-resource-access.test.ts
pnpm exec tsx src/lib/server/wecom-callback-auth.test.ts
```

Expected: all PASS.

- [ ] **Step 6: Commit the Task 1 allowlist**

Commit message: `fix: close external and agent authorization gaps`.

### Task 2: Make issue, record, step, and recipe lifecycle writes atomic

**Files:**
- Create: `src/lib/server/issue-rectification-service.ts`
- Create: `src/lib/server/issue-rectification-service.test.ts`
- Modify: `src/app/api/issues/[id]/route.ts`
- Create: `src/lib/server/content-delete-service.ts`
- Create: `src/lib/server/content-delete-service.test.ts`
- Modify: `src/app/api/records/[id]/route.ts`
- Modify: `src/app/api/recipe-steps/[id]/route.ts`
- Modify: `src/app/api/recipes/[id]/route.ts`
- Modify: `src/app/(main)/tasks/[id]/page.tsx`

- [ ] **Step 1: Write RED failure-injection tests**

Use explicit transaction interfaces:

```ts
export async function transitionIssueWithRectification(input: {
  issueId: string;
  actorId: string;
  nextStatus: 'rectifying';
  action: { plan: string; dueAt?: string | null };
}): Promise<void>;

export async function deleteRecordAtomically(input: { recordId: string; actorId: string }): Promise<void>;
export async function deleteRecipeStepAtomically(input: { stepId: string; actorId: string }): Promise<void>;
export async function deleteRecipeAtomically(input: { recipeId: string; actorId: string }): Promise<void>;
```

Inject failure after each intermediate write and assert the issue/status/action or content/material-link state is identical to the pre-call snapshot.

Run:

```powershell
pnpm exec tsx src/lib/server/issue-rectification-service.test.ts
pnpm exec tsx src/lib/server/content-delete-service.test.ts
```

Expected: FAIL because current routes orchestrate independent writes.

- [ ] **Step 2: Move route orchestration into single Drizzle transactions**

Each service must open exactly one `getDb().transaction(async tx => ...)` and pass `tx` to every delete, unlink, status transition, and audit write. Do not delete physical files in these transactions. Frozen snapshots remain untouched.

- [ ] **Step 3: Remove client-side step pre-deletion**

In task detail, replace the loop of step DELETE requests plus recipe DELETE with one recipe DELETE request. Treat non-2xx as failure and retain client state.

- [ ] **Step 4: Run GREEN and regression tests**

```powershell
pnpm exec tsx src/lib/server/issue-rectification-service.test.ts
pnpm exec tsx src/lib/server/content-delete-service.test.ts
pnpm exec tsx src/lib/server/issue-delete-service.test.ts
pnpm exec tsx src/lib/server/recipe-evaluation-save.integration.test.ts
```

Expected: all PASS; integration test may only skip when its documented database flag is absent, and must run later in Docker.

- [ ] **Step 5: Commit the Task 2 allowlist**

Commit message: `fix: make lifecycle deletion transactional`.

### Task 3: Make material linking atomic and protect frozen media

**Files:**
- Modify: `src/lib/server/material-asset-service.ts`
- Create: `src/lib/server/material-asset-service.integration.test.ts`
- Create: `src/lib/server/frozen-media-retention.ts`
- Create: `src/lib/server/frozen-media-retention.test.ts`
- Modify: `src/app/api/materials/route.ts`
- Modify: `src/app/api/v1/material-links/route.ts`
- Modify: `src/app/api/v1/material-links/[id]/route.ts`
- Modify: `src/app/(main)/tasks/[id]/components/matrix-v3-media-cell.tsx`
- Modify: `src/storage/database/shared/schema.ts`
- Create: `src/storage/database/shared/migrations/0025_frozen_media_reference_guard.sql`
- Modify: `src/storage/database/shared/migrations/meta/_journal.json`
- Modify: `database-schema.sql`

- [ ] **Step 1: Write RED atomic bind/unbind tests**

Refactor around a transaction-aware contract:

```ts
export async function replaceMaterialTargets(input: {
  materialId: string;
  actorId: string;
  add: Array<{ targetType: MaterialTargetType; targetId: string }>;
  remove: Array<{ targetType: MaterialTargetType; targetId: string }>;
}): Promise<{ links: MaterialLink[]; status: MaterialAssetStatus }>;
```

Tests inject failure after additions and before removals, after link deletion and before status update, and during legacy FK synchronization. Assert no partial state.

Run:

```powershell
pnpm exec tsx src/lib/server/material-asset-service.integration.test.ts
```

Expected: FAIL against sequential link/status writes.

- [ ] **Step 2: Implement add-first atomic replacement**

All target validation, new-link insertion, old-link removal, legacy FK compatibility, and derived status calculation happen inside one transaction. The API accepts one replacement command; the UI must stop issuing DELETE then POST loops.

- [ ] **Step 3: Write RED frozen-media deletion tests**

Define:

```ts
export async function assertMaterialMayBePhysicallyDeleted(input: {
  materialId: string;
  actorId: string;
}): Promise<{ fileKey: string }>;
```

Tests cover active links, frozen snapshot references, another user's asset, and an unreferenced owned asset.

- [ ] **Step 4: Guard database and file deletion**

Business-context removal deletes one link only. Asset deletion calls the guard, commits the database removal, then deletes the file; if file deletion fails, record an auditable cleanup job instead of restoring a partially deleted database row. A snapshot reference always blocks physical deletion in this release.

- [ ] **Step 5: Run GREEN and media regressions**

```powershell
pnpm exec tsx src/lib/server/material-asset-service.integration.test.ts
pnpm exec tsx src/lib/server/frozen-media-retention.test.ts
pnpm exec tsx src/lib/report-media-semantics.test.ts
pnpm exec tsx src/lib/server/report-media-freeze.test.ts
```

Expected: all PASS.

- [ ] **Step 6: Commit the Task 3 allowlist**

Commit message: `fix: preserve material links and frozen media`.

### Task 4: Preserve stable frozen issue identity and complete retest history

**Files:**
- Modify: `src/lib/report-frozen-view.ts`
- Modify: `src/lib/server/report-frozen-view.ts`
- Modify: `src/components/reports/frozen-report-reader.tsx`
- Modify: `src/lib/server/report-print-renderer.ts`
- Modify: `src/app/(main)/reports/[id]/page.tsx`
- Modify: `src/lib/report-frozen-view.test.ts`
- Modify: `src/lib/frozen-report-reader-presentation.test.ts`
- Modify: `src/lib/server/report-frozen-live-overlay.test.ts`
- Modify: `src/lib/report-print-renderer.test.ts`
- Modify: `src/lib/report-share-view.test.ts`
- Modify: `tests/e2e/report-frozen-reader.spec.ts`

- [ ] **Step 1: Expand RED identity and history contracts**

Change the DTO to retain history:

```ts
export interface FrozenRetestSummary {
  count: number;
  latest: FrozenRetest | null;
  history: FrozenRetest[];
}
```

Add tests proving title-only matching returns no live issue, two same-title sources remain separate, opening an unlinked frozen issue cannot POST `/api/issues`, anonymous rows contain one non-interactive status, managed rows contain one clickable status, and N >= 2 exposes ordered history.

Run the five focused test files above. Expected: at least the title fallback, history, and anonymous status assertions FAIL.

- [ ] **Step 2: Remove title fallback and report-side issue creation**

`findFrozenFactForLiveIssue()` may use stable IDs only. Report detail receives `liveIssueId` from the model; if absent, render `关联缺失，无法进入整改` and do not create a canonical issue.

- [ ] **Step 3: Preserve and render retest history**

Return newest-first `history`, show latest by default, and render a nested keyboard-operable disclosure for older records. Print/PDF renders latest plus a compact chronological history section.

- [ ] **Step 4: Render the status field exactly once**

Use one element with `data-issue-field="status"`; it is a button only when `liveIssueId && onManageIssue`, otherwise a span. Its text is always `issueStatusLabel(...)`. Do not add `查看整改`.

- [ ] **Step 5: Run GREEN**

```powershell
pnpm exec tsx src/lib/report-frozen-view.test.ts
pnpm exec tsx src/lib/frozen-report-reader-presentation.test.ts
pnpm exec tsx src/lib/server/report-frozen-live-overlay.test.ts
pnpm exec tsx src/lib/report-print-renderer.test.ts
pnpm exec tsx src/lib/report-share-view.test.ts
```

Expected: all PASS.

- [ ] **Step 6: Commit the Task 4 allowlist**

Commit message: `fix: keep frozen issue identity stable`.

### Task 5: Block report generation and navigation on failed saves

**Files:**
- Modify: `src/lib/inline-save-registry.ts`
- Modify: `src/hooks/use-debounced-save.ts`
- Create: `src/hooks/use-unsaved-navigation-guard.ts`
- Create: `src/hooks/use-unsaved-navigation-guard.test.ts`
- Modify: `src/app/(main)/tasks/[id]/page.tsx`
- Modify: `src/lib/autosave-flush-contract.test.ts`
- Modify: `tests/e2e/v3124-closure.spec.ts`

- [ ] **Step 1: Write RED save-failure tests**

Require report generation to use `waitForPendingInlineSavesOrThrow()` and assert a rejected inline save prevents the report POST. Define guard state:

```ts
export interface UnsavedNavigationGuard {
  isDirty: boolean;
  attemptNavigation(next: () => void): Promise<void>;
  confirmDiscard(): void;
  cancelDiscard(): void;
}
```

Run:

```powershell
pnpm exec tsx src/lib/autosave-flush-contract.test.ts
pnpm exec tsx src/hooks/use-unsaved-navigation-guard.test.ts
```

Expected: FAIL because generation swallows failures and no navigation guard exists.

- [ ] **Step 2: Use one failure-propagating flush path**

Report generation, task-module changes, row changes, and controlled navigation call `waitForPendingInlineSavesOrThrow()`. On failure, preserve draft state, show the failing save message, and do not invoke the continuation.

- [ ] **Step 3: Add unload and in-app navigation protection**

Register `beforeunload` only while dirty. In-app navigation first awaits flush; if it fails, show a discard/retry dialog. The hook cleanup must not treat fire-and-forget save as proof of persistence.

- [ ] **Step 4: Run GREEN and focused browser test without Docker**

```powershell
pnpm exec tsx src/lib/autosave-flush-contract.test.ts
pnpm exec tsx src/hooks/use-unsaved-navigation-guard.test.ts
```

Expected: PASS. The Playwright 500/slow-save scenario remains queued for Task 10.

- [ ] **Step 5: Commit the Task 5 allowlist**

Commit message: `fix: block publishing on unsaved task data`.

### Task 6: Add authoritative destructive-action impact and confirmation

**Files:**
- Create: `src/lib/server/deletion-impact.ts`
- Create: `src/lib/server/deletion-impact.test.ts`
- Create: `src/app/api/v1/deletion-impact/route.ts`
- Modify: `src/app/(main)/tasks/[id]/page.tsx`
- Modify: `src/app/(main)/tasks/[id]/components/senses-input-workspace.tsx`
- Modify: `src/app/(main)/tasks/[id]/components/comparison-workspace.tsx`
- Modify: `tests/e2e/task-detail-layout.spec.ts`
- Modify: `tests/e2e/v3124-closure.spec.ts`

- [ ] **Step 1: Write RED impact projection tests**

```ts
export interface DeletionImpact {
  records: number;
  childNodes: number;
  cells: number;
  materialLinks: number;
  issues: number;
}

export async function getDeletionImpact(input: {
  kind: 'record' | 'comparison_section' | 'comparison_item' | 'recipe';
  id: string;
  actorId: string;
}): Promise<DeletionImpact>;
```

Tests prove authorization and counts for a section with children/cells/materials, a record, and a recipe.

- [ ] **Step 2: Implement the read-only impact API**

The API uses resource-level authorization and returns `{ code, message, data }`. It does not perform deletion.

- [ ] **Step 3: Add confirmation dialogs**

The first click loads impact and opens `AlertDialog`. Cancel sends no DELETE. Confirm sends one transactional DELETE request. Failure preserves the UI and uses error Toast. Change the five-senses success message to `检查记录已删除`.

- [ ] **Step 4: Run focused tests**

```powershell
pnpm exec tsx src/lib/server/deletion-impact.test.ts
pnpm exec tsx src/lib/comparison-workspace-layout.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit the Task 6 allowlist**

Commit message: `fix: confirm destructive task actions`.

### Task 7: Make frozen matrices readable on mobile and sorting keyboard-operable

**Files:**
- Modify: `src/components/reports/comparison-report-view.tsx`
- Modify: `src/components/reports/report-data-matrix-read-view.tsx`
- Create: `src/lib/report-mobile-matrix-layout.ts`
- Create: `src/lib/report-mobile-matrix-layout.test.ts`
- Modify: `src/app/(main)/tasks/[id]/components/matrix-v3-mobile.tsx`
- Modify: `src/app/(main)/tasks/[id]/components/functions-input-workspace.tsx`
- Create: `src/lib/keyboard-sort.ts`
- Create: `src/lib/keyboard-sort.test.ts`
- Modify: `src/lib/report-comparison-matrix-read.test.ts`
- Modify: `src/lib/frozen-v3-matrix-table.test.ts`
- Modify: `tests/e2e/report-frozen-reader.spec.ts`
- Modify: `tests/e2e/v3124-closure.spec.ts`

- [ ] **Step 1: Write RED responsive-layout tests**

Define pure projections rather than CSS-only guesses:

```ts
export function buildMobileComparisonSections(model: ComparisonReportModel): MobileComparisonSection[];
export function buildMobileDataMatrixRows(model: DataMatrixReadModel): MobileDataMatrixRow[];
```

Use a 12-column fixture with long Chinese text, image/video evidence, calculation values, evaluation, and issue points. Tests require every frozen value to remain present exactly once.

- [ ] **Step 2: Implement desktop/mobile render branches**

Desktop keeps the latest compact fixed-table contract. Below the desktop breakpoint, comparison renders project/item sections with object summaries; data matrix renders row cards with field groups. Neither mobile branch uses `overflow-x-auto` as its primary reader.

- [ ] **Step 3: Enlarge mobile row navigation**

Change both previous/next controls to a minimum `min-h-11 min-w-11` hit area while keeping icons compact. Preserve the existing flush-before-row-change behavior.

- [ ] **Step 4: Add keyboard sorting**

```ts
export function moveByKeyboard<T>(items: T[], index: number, key: 'ArrowUp' | 'ArrowDown'): {
  items: T[];
  nextIndex: number;
};
```

Focused drag handles enter sort mode with Space/Enter, move with ArrowUp/ArrowDown, announce `已移动到第 N 项`, persist through the existing batch order API, and exit with Escape.

- [ ] **Step 5: Run focused tests**

```powershell
pnpm exec tsx src/lib/report-mobile-matrix-layout.test.ts
pnpm exec tsx src/lib/keyboard-sort.test.ts
pnpm exec tsx src/lib/report-comparison-matrix-read.test.ts
pnpm exec tsx src/lib/frozen-v3-matrix-table.test.ts
```

Expected: all PASS.

- [ ] **Step 6: Commit the Task 7 allowlist**

Commit message: `fix: make matrix workflows mobile accessible`.

### Task 8: Fail startup on unsupported database mode or incomplete schema

**Files:**
- Create: `src/lib/server/schema-manifest.ts`
- Create: `src/lib/server/schema-manifest.test.ts`
- Modify: `src/lib/server/startup-security.ts`
- Modify: `src/lib/server/startup-security.test.ts`
- Modify: `src/server.ts`
- Modify: `src/lib/server/security-config.ts`
- Modify: `.env.example`
- Modify: `AGENTS.md`
- Modify: `scripts/verify-security-schema.sql`

- [ ] **Step 1: Write RED manifest and mode tests**

```ts
export interface RequiredSchemaObject {
  migrationTag: string;
  table: string;
  columns: string[];
  foreignKeys?: string[];
  indexes?: string[];
}

export async function verifyRequiredSchemaManifest(): Promise<void>;
export function assertSupportedDatabaseMode(env: NodeJS.ProcessEnv): 'self-hosted-postgres';
```

Tests remove one required V3 matrix table, snapshot FK, issue-status constraint, material-link table, and journal tag from mocked probe results. Each case must throw a named startup error. Production `supabase-service-role` must throw an explicit experimental-disabled error.

- [ ] **Step 2: Implement manifest verification**

Probe all runtime-critical tables/columns/FKs/indexes and the latest registered migration tags after the existing security probe. Do not run migrations automatically at startup. Log only object names and tags, never connection secrets.

- [ ] **Step 3: Align documentation and environment validation**

Document `self-hosted-postgres` as the supported production mode for this release. Preserve Supabase compatibility code but mark the mode experimental-disabled until parity is delivered.

- [ ] **Step 4: Run GREEN**

```powershell
pnpm exec tsx src/lib/server/schema-manifest.test.ts
pnpm exec tsx src/lib/server/startup-security.test.ts
pnpm exec tsx src/lib/server/storage-startup.test.ts
```

Expected: all PASS.

- [ ] **Step 5: Commit the Task 8 allowlist**

Commit message: `fix: enforce production schema readiness`.

### Task 9: Clear every pre-Docker code gate

**Files:**
- Modify only files with reproducible failures attributable to Tasks 0-8.
- Do not modify Docker configuration in this task unless the build itself proves a Docker-specific defect.

- [ ] **Step 1: Run all focused tests from Tasks 0-8**

Run every listed `pnpm exec tsx` command. Expected: zero failures and no unexplained skip for a test that does not require PostgreSQL.

- [ ] **Step 2: Run full static gates**

```powershell
pnpm ts-check
pnpm lint
git diff --check
pnpm build
```

Expected: all exit 0. Read complete output before claiming PASS.

- [ ] **Step 3: Review the final working-tree delta**

Compare `git status --short` with `qa-output/platform-p0-release-closure/baseline-status.txt`. Every newly changed path must map to a task allowlist. Preserve unrelated baseline changes. Dispatch final spec and code-quality reviews for the integrated diff.

### Task 10: Perform the single consolidated local Docker acceptance

**Files:**
- Create: `docs/acceptance/2026-07-15-platform-p0-release-closure.md`
- Create acceptance JSON/screenshots only under an explicitly named `qa-output/platform-p0-release-closure/` directory.
- Do not edit product code while recording evidence.

- [ ] **Step 1: Build and start once after the queue is empty**

```powershell
docker compose -f docker-compose.local.yml up -d --build
docker compose -f docker-compose.local.yml ps
```

Expected: PostgreSQL and application both `healthy`.

- [ ] **Step 2: Run PostgreSQL-backed failure injection and migration checks**

Run Task 1-3 and Task 8 integration tests with the documented Docker database environment. Verify transaction rollback, material ownership, snapshot retention, startup manifest, and replay uniqueness against PostgreSQL 16.

- [ ] **Step 3: Replay authenticated and anonymous browser chains**

Use the local admin plus a second ordinary user. Verify:

- double-user Agent and unassigned-material isolation;
- autosave 500 blocks report generation;
- slow save blocks navigation until retry or discard;
- deletion cancel/failure/success paths;
- same-title distinct issues and 0/1/multiple retests;
- one status field per issue row in detail/share/print;
- one reused video across three targets, unlink one target, all frozen readers retain it;
- 390/768/1024/1440 report views, including a 12-column data matrix and multi-object comparison matrix;
- keyboard recipe/step sorting and 44px mobile row navigation;
- browser console has no new errors and critical requests have no unexpected 4xx/5xx.

- [ ] **Step 4: Verify server PDF and runtime health**

Generate a report PDF and assert HTTP 200, `application/pdf`, and `%PDF` header. Check landscape matrix pagination, repeated headers, issue/retest counts, and video posters. Inspect app/PostgreSQL health and application logs.

- [ ] **Step 5: Record PASS/BLOCKED per item**

The acceptance report must include command, fixture identity, observed result, evidence path, and verdict for every P0 item. Any unresolved item is `BLOCKED`; do not replace it with a summary-level PASS.
