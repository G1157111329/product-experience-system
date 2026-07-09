# Report Media, Autosave, and PDF Process Notes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every report material previewable, preserve and autosave function-effect problem points, and include comparison process notes in the downloaded print report.

**Architecture:** Reuse the repository's existing media preview and debounced-save patterns. Keep report snapshots immutable, fix only the report-detail consumers and print renderer, and isolate problem-point state transitions in tested pure helpers.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, existing shadcn dialogs, existing presign APIs, self-running `node:assert` tests.

---

### Task 1: Preserve function-effect problem-point state

**Files:**
- Create: `src/lib/effect-problem-points.ts`
- Create: `src/lib/effect-problem-points.test.ts`
- Modify: `src/app/(main)/tasks/[id]/page.tsx`

- [ ] Write a failing test proving that editing recipe problem point 0 starts from the server list when local state has no recipe key.
- [ ] Run `node_modules/.bin/tsx.cmd src/lib/effect-problem-points.test.ts` and confirm the expected assertion failure.
- [ ] Implement `initializeEffectProblemPoints` and `updateEffectProblemPoint` as immutable helpers.
- [ ] Use the helpers when recipes load and when problem points are edited, added, removed, or have material IDs changed.
- [ ] Run the test and `node_modules/.bin/tsc.cmd -p tsconfig.json --noEmit`.
- [ ] Commit as `fix: preserve function effect problem points while editing`.

### Task 2: Add recipe-level debounced autosave

**Files:**
- Modify: `src/app/(main)/tasks/[id]/page.tsx`
- Test: `src/lib/effect-problem-points.test.ts`

- [ ] Add a failing test for the normalized autosave payload: trimmed problem points plus the union of effect and problem-point material IDs.
- [ ] Implement the payload helper and recipe-level 800ms timers.
- [ ] Schedule saves after problem text/material/add/remove/effect-material changes; flush before AI evaluation.
- [ ] Keep the existing manual save button as an explicit retry/flush control and display saving/saved/error status.
- [ ] Verify the helper tests and TypeScript.
- [ ] Commit as `feat: autosave function effect drafts`.

### Task 3: Make report materials interactive

**Files:**
- Create: `src/app/(main)/reports/[id]/components/report-media-preview.tsx`
- Modify: `src/app/(main)/reports/[id]/components/report-matrix-tab.tsx`
- Modify: `src/app/(main)/reports/[id]/components/report-function-effect-tab.tsx`
- Modify: `src/app/(main)/reports/[id]/components/issue-row.tsx`
- Create: `src/lib/report-media-preview.test.ts`

- [ ] Add a failing source contract test requiring report media buttons to open the shared preview and videos to render with controls in the dialog.
- [ ] Implement a read-only report media thumbnail/preview component using existing presigned URL logic.
- [ ] Replace non-interactive matrix, function-effect, and issue thumbnails with the shared component.
- [ ] Ensure lists do not silently truncate appendix media.
- [ ] Run the contract test, TypeScript, and changed-file ESLint.
- [ ] Commit as `feat: preview every report material`.

### Task 4: Include process notes in print downloads

**Files:**
- Modify: `src/app/reports/print/page.tsx`
- Create: `src/lib/report-print-matrix.test.ts`

- [ ] Add a failing source contract test requiring `PrintInlineMatrix` to render `cell.processNotes` and label process notes separately from conclusions.
- [ ] Render process notes before the conclusion and preserve independent labels.
- [ ] Run the regression test and TypeScript.
- [ ] Commit as `fix: include comparison process notes in print reports`.

### Task 5: Record regression rules

**Files:**
- Modify: `AGENTS.md`

- [ ] Add a dated “报告/矩阵/素材回归防护” section documenting previous and current fixes, root causes, invariants, and production verification commands.
- [ ] Confirm no credentials, tokens, or connection secrets are added.
- [ ] Commit as `docs: record report and media regression safeguards`.

### Task 6: Review, verify, and deploy

**Files:**
- Review all files changed from `main...HEAD`.

- [ ] Run all new regression tests and existing report-related tests.
- [ ] Run `node_modules/.bin/tsc.cmd -p tsconfig.json --noEmit`.
- [ ] Run ESLint on changed TypeScript/TSX files and distinguish errors from pre-existing warnings.
- [ ] Run a complete production build.
- [ ] Review correctness, readability, architecture, security, and performance; fix all blocking findings.
- [ ] Back up current production artifacts, upload the verified build, restart PM2, and retain rollback artifacts.
- [ ] Validate login, report APIs, clickable media in a real browser, problem-point autosave, and a downloaded PDF containing non-empty process notes.
