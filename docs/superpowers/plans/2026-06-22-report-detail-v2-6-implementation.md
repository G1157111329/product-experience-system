# V2.6 Report Detail Implementation Plan

> **For agentic workers:** implement task-by-task. Keep every task independently verifiable. Do not accept log-only tests or soft skips as completion proof.

**Goal:** Deliver the V2.6 report detail experience: a unified report detail shell, type-specific templates, inline evidence, AI confirmation boundaries, and PDF/print mapping for four report asset types.

**Source PRD:** `docs/product_experience_platform_prd_v2_6_report_detail_enhanced.md`

**Non-goals:**
- Do not create a new top-level comparison center.
- Do not rebuild the V2.5 report center home page in this plan.
- Do not introduce a free-canvas report editor.
- Do not publish AI-generated conclusions without human confirmation.
- Do not move key evidence into appendix-only presentation.

---

## Phase 0: Baseline And Golden Contracts

### Task 0.1: Inventory Current Report Contracts

**Description:** Map current report, snapshot, comparison, material, issue, and re-evaluation fields against the V2.6 detail model.

**Acceptance criteria:**
- [ ] Field gap list exists for header, conclusion, sections, blocks, evidence slots, actions, AI status, and PDF profile.
- [ ] Each gap is marked as required now, content JSON fallback, or later structural migration.
- [ ] Existing user changes and uncommitted implementation work are not reverted.

**Verification:**
- [ ] Manual review of `reports.content`, `report_snapshots`, `comparison_*`, `materials`, `issues`, and `issue_re_evaluations`.
- [ ] `pnpm check:golden` reports actionable contract gaps.

**Files likely touched:**
- `scripts/check-golden-test-contract.ts`
- `docs/product_experience_platform_prd_v2_6_report_detail_enhanced.md`

**Dependencies:** None

### Task 0.2: Stabilize Golden Samples

**Description:** Ensure the representative report samples can be regenerated and opened consistently.

**Acceptance criteria:**
- [ ] Golden data covers single report, image matrix comparison, metric comparison, model merged report, and custom merged report.
- [ ] Sample material paths do not depend on hidden local files.
- [ ] Every sample has a stable way to identify its report ID or lookup key.

**Verification:**
- [ ] `pnpm seed:golden`
- [ ] `pnpm check:golden`

**Files likely touched:**
- `scripts/seed-golden-test-data.ts`
- `src/lib/golden-test-data.ts`
- `scripts/check-golden-test-contract.ts`

**Dependencies:** Task 0.1

---

## Phase 1: Detail Data Model And API

### Task 1.1: Add Report Detail Model Helpers

**Description:** Create pure helpers that convert stored report/snapshot/comparison data into the V2.6 detail model.

**Acceptance criteria:**
- [ ] Helpers return `header`, `conclusion`, `sections`, `blocks`, `evidenceSlots`, `actions`, and `qualityChecks`.
- [ ] Helpers support `single_report`, `comparison_report`, `model_merged_report`, and `custom_merged_report`.
- [ ] Missing optional data is represented as quality warnings, not runtime crashes.

**Verification:**
- [ ] Unit or script tests cover all four report types.
- [ ] `pnpm ts-check`

**Files likely touched:**
- `src/lib/server/report-detail.ts`
- `src/lib/server/report-snapshots.ts`
- `src/lib/report-center-dashboard.ts`

**Dependencies:** Phase 0

### Task 1.2: Expose Report Detail Endpoint

**Description:** Add a stable endpoint or service path for authenticated report detail and shared read-only detail.

**Acceptance criteria:**
- [ ] Report detail returns the same core model for logged-in detail page, print page, and share page.
- [ ] Permission checks use server-side auth and resource access helpers.
- [ ] Share access only exposes read-safe fields and published/draft status.

**Verification:**
- [ ] Anonymous cannot access private report detail.
- [ ] Share token can access only the matching shared report.
- [ ] `pnpm ts-check`

**Files likely touched:**
- `src/app/api/reports/[id]/route.ts`
- `src/app/api/reports/share/route.ts`
- `src/lib/server/auth.ts`
- `src/lib/server/report-detail.ts`

**Dependencies:** Task 1.1

---

## Phase 2: Universal Report Shell

### Task 2.1: Build Shared Detail Shell Components

**Description:** Implement the common detail layout used by all report types.

**Acceptance criteria:**
- [ ] Shell includes header, conclusion bar, view mode switch, navigation rail, content canvas, action rail, and evidence drawer.
- [ ] Long reports keep orientation through sticky mini header and active section state.
- [ ] Mobile layout keeps the main reading path usable without dense desktop chrome.

**Verification:**
- [ ] Manual browser check on desktop and mobile viewport.
- [ ] No console errors on report detail.

**Files likely touched:**
- `src/components/reports/report-detail-shell.tsx`
- `src/components/reports/report-header.tsx`
- `src/components/reports/report-conclusion-bar.tsx`
- `src/components/reports/report-navigation-rail.tsx`
- `src/components/reports/report-action-rail.tsx`
- `src/components/reports/evidence-drawer.tsx`

**Dependencies:** Task 1.2

### Task 2.2: Wire Shell Into Detail, Print, And Share Pages

**Description:** Use the shared detail model and shell across authenticated detail, share, and print contexts.

**Acceptance criteria:**
- [ ] Authenticated detail page shows owner/admin actions.
- [ ] Share page is read-only and keeps evidence/PDF access where allowed.
- [ ] Print preview uses print-oriented blocks instead of copying interactive layout directly.

**Verification:**
- [x] `pnpm smoke:e2e` includes hard assertions for detail and share rendering.
- [x] `pnpm ts-check`

**Files likely touched:**
- `src/app/(main)/reports/[id]/page.tsx`
- `src/app/reports/share/[token]/page.tsx`
- `src/app/reports/print/page.tsx`
- `src/components/reports/*`

**Dependencies:** Task 2.1

---

## Phase 3: Single Report Template

### Task 3.1: Implement Single Report Narrative Sections

**Description:** Render ordinary report details as a business narrative instead of generic content blocks.

**Acceptance criteria:**
- [ ] Overview, issue closure, function effect, five-sense/operation, AI confirmation, source/version, and evidence archive sections render in stable order.
- [ ] Issue rows show level, status, source, responsibility, plan, validation, and key evidence.
- [ ] Function effect sections show recipe/function name, ingredients/parameters, steps, effect summary, problem points, and score summary.

**Verification:**
- [ ] Golden single report opens and key fields are visible.
- [ ] Share page and print page contain matching factual content.

**Files likely touched:**
- `src/components/reports/templates/single-report-template.tsx`
- `src/components/reports/blocks/issue-closure-block.tsx`
- `src/components/reports/blocks/function-effect-block.tsx`
- `src/components/reports/blocks/sensory-experience-block.tsx`

**Dependencies:** Phase 2

### Task 3.2: Inline Evidence For Issues, Steps, Effects, And Re-evaluations

**Description:** Ensure key evidence appears next to the business object it supports.

**Acceptance criteria:**
- [ ] Issue evidence, step evidence, effect evidence, and re-evaluation evidence render inline.
- [ ] Missing evidence displays a quality warning in review mode.
- [ ] Evidence archive remains available but does not replace inline evidence.

**Verification:**
- [ ] Golden single report has no key evidence hidden only in appendix.
- [ ] Image and video thumbnails do not break mobile layout.

**Files likely touched:**
- `src/components/reports/inline-evidence-strip.tsx`
- `src/components/reports/evidence-drawer.tsx`
- `src/lib/server/report-detail.ts`

**Dependencies:** Task 3.1

---

## Phase 4: Comparison Report Templates

### Task 4.1: Implement Image Matrix And Metric Table Blocks

**Description:** Render comparison reports with object context, comparability, difference filters, and evidence-aware cells.

**Acceptance criteria:**
- [ ] Object strip, test condition summary, comparability statement, and difference summary render above matrix/table.
- [ ] Image matrix supports object columns and item rows with stable headers.
- [ ] Metric table shows formula, threshold, raw value, result, anomaly reason, and evidence.

**Verification:**
- [ ] Three-machine mixer image matrix sample is readable.
- [ ] Juicer metric sample shows formula and anomaly details.

**Files likely touched:**
- `src/components/reports/templates/comparison-report-template.tsx`
- `src/components/reports/blocks/comparison-image-matrix-block.tsx`
- `src/components/reports/blocks/comparison-metric-table-block.tsx`
- `src/lib/server/comparison-assembly.ts`
- `src/lib/server/report-detail.ts`

**Dependencies:** Phase 2

### Task 4.2: AI Confirmation And Publish Boundaries

**Description:** Make Cell AI, Row AI, and Report AI states visible and enforce publish/share/PDF boundaries.

**Acceptance criteria:**
- [ ] Pending, generated, confirmed, rejected, and not-applicable AI states are visible.
- [ ] Unconfirmed AI blocks formal publish and PDF generation.
- [ ] Rejected AI does not appear as official conclusion.

**Verification:**
- [ ] Permission and state tests prove unconfirmed AI cannot publish.
- [ ] `pnpm check:golden`

**Files likely touched:**
- `src/lib/server/report-detail.ts`
- `src/lib/server/report-snapshots.ts`
- `src/app/api/reports/[id]/route.ts`
- `src/components/reports/report-action-rail.tsx`

**Dependencies:** Task 4.1

---

## Phase 5: Merged Report Templates

### Task 5.1: Implement Model Merged Timeline

**Description:** Render same-model multi-stage reports around stage evolution rather than ranking.

**Acceptance criteria:**
- [x] Model dossier, stage timeline, issue evolution, function effect evolution, current risks, and next-stage validation render.
- [x] Each stage links back to source report or snapshot.
- [x] Weak comparability is visible and prevents ranking language.

**Verification:**
- [x] Golden model merged sample renders stage timeline through the unified section block renderer.
- [x] Source trace includes source report and task IDs.

**Files likely touched:**
- `src/lib/server/report-detail.ts`
- `src/lib/golden-test-data.ts`
- `scripts/check-golden-test-contract.ts`
- `tests/e2e/platform-smoke.spec.ts`

**Dependencies:** Phase 2

### Task 5.2: Implement Custom Merge Synthesis

**Description:** Render custom merged reports with purpose, source alignment, comparability boundaries, synthesis, gaps, and validation suggestions.

**Acceptance criteria:**
- [x] Source reports and field alignment appear before synthesis.
- [x] Weak or mixed comparability is explicit.
- [x] Missing fields and validation suggestions are visible.

**Verification:**
- [x] Golden custom merged sample cannot be mistaken for strong ranking.
- [x] Source alignment and field alignment render before synthesis in the detail shell.

**Files likely touched:**
- `src/lib/server/report-detail.ts`
- `src/lib/golden-test-data.ts`
- `scripts/check-golden-test-contract.ts`
- `tests/e2e/platform-smoke.spec.ts`

**Dependencies:** Phase 2

---

## Phase 6: Print And PDF

### Task 6.1: Add Print Blocks And Preflight

**Description:** Generate print-specific blocks and preflight warnings from the detail model.

**Acceptance criteria:**
- [x] Print blocks exist for all four report types.
- [x] Preflight detects missing evidence, unconfirmed AI, missing video cover, over-wide matrix, and unpublished snapshot.
- [x] Users can see actionable preflight messages before export.

**Verification:**
- [x] Preflight fails the intended unconfirmed-AI negative sample.
- [x] `pnpm ts-check`

**Files likely touched:**
- `src/lib/server/report-detail.ts`
- `src/app/api/reports/[id]/pdf/route.ts`
- `src/lib/server/report-print-renderer.ts`
- `src/app/reports/print/page.tsx`
- `scripts/check-golden-test-contract.ts`
- `tests/e2e/platform-smoke.spec.ts`

**Dependencies:** Phases 3, 4, 5

### Task 6.2: Verify PDF Profiles

**Description:** Ensure profile-specific rendering is stable for A4 portrait and A3 landscape cases.

**Acceptance criteria:**
- [x] Single report and merged reports use A4 portrait.
- [x] Image matrix, metric table, and mixed comparison use A3 landscape or split profile.
- [x] Key evidence stays near its object in PDF output.

**Verification:**
- [x] PDF smoke output returns an `application/pdf` response with profile header.
- [x] Matrix/table print output uses profile-specific A3/A4 sizing and repeated table header CSS.

**Files likely touched:**
- `src/app/reports/print/page.tsx`
- `src/lib/server/report-print-renderer.ts`
- `src/app/api/reports/[id]/pdf/route.ts`

**Dependencies:** Task 6.1

---

## Phase 7: Final Verification

### Task 7.1: E2E And Permission Coverage

**Description:** Add hard-assertion browser coverage for report detail, share, print, evidence, and permission boundaries.

**Acceptance criteria:**
- [x] Tests assert visible headers, sections, evidence counts, AI state, share read-only state, and blocked unauthorized access.
- [x] Tests do not pass through soft skip or console-only checks.
- [x] Mobile viewport has at least one detail smoke path.

**Verification:**
- [x] `pnpm smoke:e2e` - passed on 2026-06-23 against local PostgreSQL/dev server.
- [x] `pnpm check:golden`
- [x] `pnpm check:v2.6-success`

**Files likely touched:**
- `tests/e2e/platform-smoke.spec.ts`
- `scripts/check-golden-test-contract.ts`
- `scripts/check-v2.6-success-metrics.ts`
- `scripts/seed-golden-test-data.ts`
- `package.json`

**Dependencies:** Phases 3, 4, 5, 6

### Task 7.2: Release Gate

**Description:** Run the full gate and document residual risks.

**Acceptance criteria:**
- [x] All blocking verification commands pass.
- [x] Any known risk is documented with owner and follow-up phase.
- [x] No unrelated user changes are reverted.

**Verification:**
- [x] `pnpm ts-check`
- [x] `pnpm lint`
- [x] `pnpm build`
- [x] `pnpm smoke:e2e`
- [x] `pnpm check:golden`
- [x] `pnpm check:v2.6-success`

**Dependencies:** Task 7.1

---

## Review Checkpoints

| Checkpoint | Review focus |
|---|---|
| After Phase 0 | Data contract, sample reproducibility, no hidden local dependencies |
| After Phase 2 | Unified shell, mobile readability, share read-only behavior |
| After Phase 4 | Comparison readability, evidence linkage, AI publish boundary |
| After Phase 6 | Print/PDF preflight and profile correctness |
| After Phase 7 | Full acceptance and residual risk list |

## Risk Controls

| Risk | Control |
|---|---|
| Existing uncommitted implementation changes are overwritten | Touch only owned files for each task and inspect git status before editing |
| Templates become too flexible and lose order | Prefer system templates and constrained blocks over arbitrary layout config |
| Evidence appears only in appendix | Enforce inline evidence slots in Golden Test |
| AI conclusion leaks into formal output | Publish/PDF/share gates check AI confirmation status |
| E2E reports false success | Require hard assertions and fail soft skips in review |
