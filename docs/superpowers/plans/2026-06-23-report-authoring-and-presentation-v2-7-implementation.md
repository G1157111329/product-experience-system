# Report Authoring And Presentation V2.7 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the approved V2.7 report authoring, multi-model matrix presentation, A3 PDF matrix, material naming, and image editing upgrades.

**Architecture:** Keep one report detail model as the source for in-app, print, PDF, and share views. Add a typed `matrix` section block for model/material/config comparison, and keep material naming in a pure utility consumed by upload/edit flows. Extend the existing image editor rather than replacing it.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, Tailwind CSS 4, shadcn/ui, Playwright PDF route, tsx check scripts.

---

### Task 1: Material Naming Contract

**Files:**
- Create: `src/lib/material-naming.ts`
- Create: `scripts/check-material-naming.ts`
- Modify: `package.json`
- Modify: `src/app/api/materials/upload/route.ts`

- [x] **Step 1: Write the failing test**

Create `scripts/check-material-naming.ts` with assertions for Beijing timestamp naming, shared image/video sequence, 99-per-second rollover, and edited-copy suffix naming.

- [x] **Step 2: Run the failing test**

Run: `pnpm tsx scripts/check-material-naming.ts`
Expected: FAIL because `src/lib/material-naming.ts` does not exist.

- [x] **Step 3: Implement `material-naming.ts`**

Add `toBeijingTimestampBase`, `allocateMaterialFileName`, and `allocateEditedCopyFileName`. Use UTC getters after adding eight hours so local machine timezone does not alter the result.

- [x] **Step 4: Wire upload route**

Before storing a material, query existing `materials.file_name` values for the related task/library/cell scope, allocate the next file name, use it both as `file_name` and in the storage key, and keep images/videos on the same sequence.

- [x] **Step 5: Verify**

Run: `pnpm check:material-naming`.

### Task 2: Matrix Section Block

**Files:**
- Modify: `src/lib/server/report-detail.ts`
- Modify: `src/components/reports/report-section-block-renderer.tsx`
- Modify: `src/lib/server/report-print-renderer.ts`
- Modify: `scripts/check-golden-test-contract.ts`

- [x] **Step 1: Write the failing contract**

Extend `scripts/check-golden-test-contract.ts` to require comparison reports to expose at least one `matrix` block with object columns, cell media, row conclusions, and A3 landscape print profile.

- [x] **Step 2: Run the failing contract**

Run: `pnpm check:golden`
Expected: FAIL because `matrix` block type is not implemented.

- [x] **Step 3: Add typed matrix block**

Extend `ReportDetailSectionBlockType` with `matrix` and add `ReportDetailMatrix` types. Build matrix rows from `snapshot_json.objects`, `item_nodes`, `cells`, and cell media.

- [x] **Step 4: Render interactive media in report detail**

Render matrix cells as horizontal object columns. Images open a large preview; videos open a playable dialog. Preserve model/dimension/item/media context in the dialog.

- [x] **Step 5: Render A3 matrix PDF**

Update server print renderer so `matrix` blocks become A3-friendly tables with 1-3 thumbnails/video markers, structured data, conclusion, risk tags, and row conclusion.

- [x] **Step 6: Verify**

Run: `pnpm check:golden`.

### Task 3: Report Detail Presentation Weight

**Files:**
- Modify: `src/lib/server/report-detail.ts`
- Modify: `src/components/reports/report-detail-shell.tsx`
- Modify: `src/components/reports/report-section-block-renderer.tsx`

- [x] **Step 1: Make normal report first screen clearer**

Keep global conclusion, template/report tags, key metrics, issue closure overview, function effect aggregation, and module entry cards at the top.

- [x] **Step 2: Remove default standalone five-sense chapter**

Do not render five-sense experience as an independent default chapter in normal reports. Keep five-sense standard fields inside issue closure/source facts.

- [x] **Step 3: Collapse full function details**

Default function effect to recipe/effect aggregation. Show the full function effect evaluation template only inside a collapsible detail block.

- [x] **Step 4: Verify**

Run `pnpm check:golden` and inspect report detail in browser.

### Task 4: Authoring Rail And Shared Material Library

**Files:**
- Modify: `src/app/(main)/tasks/[id]/components/report-authoring-shell.tsx`
- Modify: `src/app/(main)/tasks/[id]/page.tsx`
- Modify: `src/app/(main)/tasks/[id]/components/material-evidence-rail.tsx`

- [x] **Step 1: Move shared material management to the left rail**

Place the shared material manager below the authoring navigation on wide screens, keep progress/preflight in the middle, and move the rail to a top horizontal summary on narrower screens.

- [x] **Step 2: Avoid main-form compression**

Use fixed rail width on large screens and top rail/drawer behavior on smaller screens so page resizing does not crush the authoring form.

- [x] **Step 3: Verify**

Run responsive smoke checks at desktop and narrow widths.

### Task 5: Image Editor Output Options

**Files:**
- Modify: `src/components/image-editor-dialog.tsx`
- Modify: `src/components/image-preview.tsx`
- Modify: `src/app/api/materials/route.ts`

- [x] **Step 1: Add editor controls**

Add flip, crop preset buttons, brightness/contrast/saturation/highlights/shadows/temperature/hue, filter presets with intensity, resize width/height, and JPG/PNG/WEBP output selection.

- [x] **Step 2: Add save modes**

Support overwrite original and save-as-new. Save-as-new uses `（副）` / `（副2）` naming and does not auto-rebind existing report references.

- [x] **Step 3: Expose edit entry from image preview**

Images can be enlarged and then edited. Videos keep playback only.

- [x] **Step 4: Verify**

Run material naming check and a browser upload/edit smoke.

### Task 6: Final Verification

**Files:**
- Existing changed files only

- [x] **Step 1: Run contract checks**

Run: `pnpm check:material-naming && pnpm check:golden && pnpm check:v2.6-success`

- [x] **Step 2: Run TypeScript**

Run: `pnpm ts-check`

- [ ] **Step 3: Browser/PDF QA**

Open report detail and PDF route. Confirm matrix media can enlarge/play in-app, comparison PDF uses A3 landscape, normal report PDF no longer falls back to the old vertical body.
