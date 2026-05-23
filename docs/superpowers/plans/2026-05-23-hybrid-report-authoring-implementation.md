# Hybrid Report Authoring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the approved hybrid report workflow: source facts are edited from task detail, report conclusions can be edited in report detail, and regeneration preserves manual review edits.

**Architecture:** Keep the existing task/report data model, add pure helpers for report readiness and review overrides, then wire those helpers into task detail, report generation, report detail, print, and share pages. First phase uses `content.review_overrides` and does not add database columns.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, shadcn/ui, Tailwind CSS 4, Supabase-compatible API routes.

---

### Task 1: Review Override Data Model

**Files:**
- Create: `src/lib/report-review-overrides.ts`
- Create: `src/lib/report-review-overrides.test.ts`
- Modify: `src/app/api/reports/route.ts`
- Modify: `src/app/(main)/reports/[id]/page.tsx`
- Modify: `src/app/reports/print/page.tsx`
- Modify: `src/app/reports/share/[token]/page.tsx`

- [x] Add tests for merging `review_overrides` over generated `ai_summary`.
- [ ] Add tests for preserving old overrides during regeneration.
- [ ] Implement helper functions.
- [ ] Use helpers in report detail, print, and share displays.
- [ ] Modify report generation to preserve overrides by default.

### Task 2: Report Review Editor

**Files:**
- Create: `src/app/(main)/reports/[id]/components/report-review-editor.tsx`
- Modify: `src/app/(main)/reports/[id]/page.tsx`

- [ ] Add a right-side review editor for title, summary, strengths, risks, historical position, suggestions, review note, and review status.
- [ ] Save edits into `content.review_overrides` through existing `PUT /api/reports/[id]`.
- [ ] Add reset-to-generated action for summary fields.
- [ ] Keep factual report sections read-only.

### Task 3: Task Detail Authoring Workspace

**Files:**
- Keep: `src/lib/report-readiness.ts`
- Keep: `src/lib/report-readiness.test.ts`
- Replace/extend: `src/app/(main)/tasks/[id]/components/report-input-panel.tsx`
- Modify: `src/app/(main)/tasks/[id]/page.tsx`

- [ ] Upgrade the temporary report input panel into a formal authoring side panel.
- [ ] Add report outline navigation and draft-preview language.
- [ ] Keep the existing source-data editing UI intact in this phase.
- [ ] Generate flow still calls existing `/api/reports`, but UI makes the pre-generation quality check explicit.

### Task 4: Report Center Review Signals

**Files:**
- Modify: `src/app/(main)/reports/page.tsx`

- [ ] Show review status and evidence/risk signals on report cards.
- [ ] Keep compare/share/print/delete behavior unchanged.

### Task 5: Verification

**Commands:**
- `corepack pnpm exec tsx src/lib/report-readiness.test.ts`
- `corepack pnpm exec tsx src/lib/report-review-overrides.test.ts`
- `corepack pnpm lint`
- `corepack pnpm ts-check`
- `corepack pnpm exec next build`
