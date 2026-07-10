# Experience Closure and AI Assistant Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `executing-plans` to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Deliver the unified issue closure flow, reliable Chinese input and media playback, report sharing parity, direct matrix editing, comparison-matrix usability, and controlled AI assistant actions without importing historical Agent data.

**Architecture:** Preserve stored issue history while projecting it into four canonical business states (`open`, `rectifying`, `waived`, `verified_closed`). Centralize client composition handling, media URL normalization, report-sharing UI, and AI output/action policy in small helpers. Build all state-changing Agent actions behind server-side allow lists and existing per-user authorization.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Drizzle/PostgreSQL, Supabase-compatible client, shadcn/ui, Tailwind, Playwright, Docker Compose.

---

### Task 1: Four-state issue closure contract

**Files:**
- Modify: `src/lib/server/issue-state-machine.ts`
- Modify: `src/app/api/issues/[id]/route.ts`
- Modify: `src/app/(main)/issues/page.tsx`
- Modify: `src/components/issues/issue-rectification-dialog.tsx`
- Test: `src/lib/server/issue-state-machine.test.ts`

- [ ] Write a failing test proving that historical eight-state values normalize into `待整改` / `整改中` / `不整改` / `已整改`, and that direct `已整改` is permitted without a re-evaluation row.
- [ ] Update the state helper to expose label, text-color class, and transition policy; preserve existing stored codes and map `triaged`, `assigned`, `pending_verification`, and `reopened` to the user-visible in-progress state.
- [ ] Make the issue API accept only the four projected target states, map them back to canonical stored codes, and validate reason/plan fields for `整改中` and `不整改`.
- [ ] Replace the list controls and dialog with the four text-color labels: black, yellow, gray, green. Use one plan/reason dialog for `整改中` and `不整改`.
- [ ] Run the state-machine test and `pnpm ts-check`.

### Task 2: Frozen-report issue parity and share expiry picker

**Files:**
- Modify: `src/app/(main)/reports/[id]/components/issue-row.tsx`
- Modify: `src/app/(main)/reports/[id]/components/report-sticky-header.tsx`
- Modify: `src/app/(main)/reports/page.tsx`
- Modify: `src/app/reports/share/[token]/page.tsx`
- Modify: `src/components/reports/report-detail-shell.tsx`
- Test: `src/lib/report-share-view.test.ts`

- [ ] Write a failing contract test requiring `ReportSummaryTab` and `ReportMatrixTab` in the public share route.
- [ ] Extract one expiry picker dialog (`7d`, `30d`, `permanent`) used by both the report list and frozen-report header.
- [ ] Make frozen report issues update the linked live issue through the same API and refresh the status projection after a successful mutation.
- [ ] Render public share reports with the frozen report summary and matrix components in read-only mode.
- [ ] Run the share contract test and golden contract check.

### Task 3: IME-safe inline editing

**Files:**
- Modify: `src/components/inline-editable.tsx`
- Modify: `src/hooks/use-debounced-save.ts`
- Test: `src/components/inline-editable.ime.test.ts`

- [ ] Write a failing test that simulates composition start, interim `haochi1`, composition end `好吃`, and asserts only `好吃` is scheduled for save.
- [ ] Add composition state to the shared editor engine; defer change scheduling and value resynchronization while composing, then flush one final value at composition end/blur.
- [ ] Apply handlers to both single-line and textarea variants.
- [ ] Run the IME test and a browser input regression.

### Task 4: Same-origin video loading

**Files:**
- Modify: `src/lib/server/material-asset-service.ts`
- Modify: `src/components/presigned-media.tsx`
- Modify: `src/components/image-preview.tsx`
- Modify: `next.config.mjs` only if same-origin CSP policy needs an explicit header
- Test: `src/lib/media-source-policy.test.ts`

- [ ] Write a failing test that rejects direct HTTP redirect URLs and accepts local protected material URLs or HTTPS presigned URLs.
- [ ] Normalize video source generation to return a same-origin material route for local assets; allow only HTTPS S3-compatible presigned URLs for remote storage.
- [ ] Render an inline media error state instead of assigning an untrusted URL to `<video>`.
- [ ] Verify browser console has no `media-src` CSP violation for a local uploaded video.

### Task 5: Direct data-matrix editing

**Files:**
- Modify: `src/app/(main)/tasks/[id]/components/matrix-tab.tsx`
- Modify: `src/app/(main)/tasks/[id]/components/matrix-v3-grid.tsx`
- Modify: `src/app/(main)/tasks/[id]/components/matrix-v3-mobile.tsx`
- Modify: `src/app/api/v1/tasks/[id]/matrix-tab-state/route.ts`
- Test: `src/lib/matrix/direct-entry.test.ts`

- [ ] Write a failing test requiring a created matrix to enter grid mode without the guide/design screen and requiring new level-3 nodes to be expanded while existing level-3 nodes remain collapsed.
- [ ] Persist matrix expansion state by task and matrix; use separate sticky left hierarchy and independently scrollable data body so fixed columns do not cover later columns.
- [ ] Convert level-2 and level-3 labels to IME-safe autosave editors, with level-2 inputs using an available-width editor instead of a narrow fixed input.
- [ ] Run desktop and mobile matrix browser checks for create, expand, horizontal scroll, and Chinese text edit.

### Task 6: Comparison-matrix direct editing and folding

**Files:**
- Modify: `src/app/(main)/tasks/[id]/components/comparison-workspace.tsx`
- Modify: `src/app/api/comparison-item-nodes/route.ts`
- Test: `src/lib/comparison-workspace-behavior.test.ts`

- [ ] Write failing tests for default `大类 N`, blur/Enter autosave without check/cancel buttons, and collapsed section/item descendants.
- [ ] Replace object/node check/cancel controls with focused inline inputs that save on blur/Enter after composition ends.
- [ ] Add per-node collapse state; default sections and items are collapsed, and a chevron expands or collapses all descendant matrix rows.
- [ ] Add a new section as `大类 N`, retain the existing success notification, and immediately focus its label editor.
- [ ] Run comparison behavior tests and a browser keyboard/IME check.

### Task 7: AI assistant naming, safe output, and platform actions

**Files:**
- Modify: `src/components/agent/hermes-chat.tsx`
- Modify: `src/components/agent/agent-floating-assistant.tsx`
- Modify: `src/app/(main)/agent/page.tsx`
- Modify: `src/app/api/v1/agent/conversations/[conversationId]/stream/route.ts`
- Create: `src/lib/server/agent-action-policy.ts`
- Modify: `src/app/api/tasks/[id]/agent-actions/route.ts`
- Test: `src/lib/server/agent-action-policy.test.ts`

- [ ] Write failing tests for stripping streamed `<think>` blocks and denying settings/delete action names.
- [ ] Replace every user-visible Hermes label with `AI助手`; keep internal runtime names unchanged.
- [ ] Strip think blocks before SSE emission and persistence, with a client-side defensive renderer.
- [ ] Implement an audited action registry for create/update tasks, recipes, standards, issues, records, matrix values, and material bindings. Reuse existing upload flow for user-attached files. Enforce current-user authorization and deny settings/delete server-side.
- [ ] Run action-policy tests and access-control tests.

### Task 8: WeChat scan-and-confirm binding

**Files:**
- Modify: `src/app/api/v1/admin/wecom-bindings/qr/route.ts`
- Modify: `src/app/api/v1/bindings/oauth/callback/route.ts`
- Modify: `src/components/wecom-bindings-settings.tsx`
- Modify: `.env.example`
- Test: `src/lib/server/binding-state.test.ts`

- [ ] Write failing tests for a pending binding session, one-time callback consumption, and an explicit `wechat_not_configured` response.
- [ ] Require official WeChat OAuth configuration before creating a scan URL; emit a QR payload only for a valid provider configuration.
- [ ] Make the admin UI present WeChat scan/confirmation state and actionable missing-variable names without showing secrets.
- [ ] Verify callback replay cannot bind a second user and does not create or overwrite conversation/history records.

### Task 9: Documentation, Docker, deployment, and data-isolation audit

**Files:**
- Modify: `AGENTS.md`
- Modify: `docs/operations/` deployment note if runtime behavior changes

- [ ] Record the four-state issue contract, same-origin media rule, report-share composition, AI action deny list, and Agent history isolation rule.
- [ ] Run `pnpm ts-check`, `pnpm lint`, relevant unit tests, `pnpm check:matrix-formula`, `pnpm check:golden`, and `docker compose -f docker-compose.local.yml up -d --build app`.
- [ ] Compare Agent conversations, messages, memory namespaces, and binding-session row counts before and after production artifact deployment.
- [ ] Deploy verified `.next` and `dist/server.js` only, synchronize source/docs without environment or data files, then verify PM2 and `/login`, `/reports`, `/agent`, and dictionary routes.
