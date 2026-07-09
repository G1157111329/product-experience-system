# Report Content and Media Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make comparison reports, function-effect evaluations, AI summaries, issue evidence, and PDF downloads preserve the same content and media from source input through frozen report rendering.

**Architecture:** Add small shared pure helpers for report text selection, summary serialization, and presign batching. Keep frozen snapshots immutable; fix adapters and renderers so existing `process_notes`, `effect_summary`, and material links are interpreted consistently by report center, share, print, and server-side PDF paths.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript 5, Tailwind CSS 4, node:assert tests executed with `pnpm exec tsx`.

---

## File map

- Create `src/lib/report-content-rules.ts`: pure manual/AI evaluation selection and AI-summary single-text serialization/parsing.
- Create `src/lib/report-content-rules.test.ts`: regression tests for evaluation precedence and summary round trips.
- Create `src/lib/presign-batches.ts`: pure unique-path chunking and merge orchestration.
- Create `src/lib/presign-batches.test.ts`: verifies more than 50 paths are fully resolved.
- Modify `src/lib/use-presigned-url.ts`: route all browser presign requests through batch orchestration.
- Modify `src/app/reports/print/page.tsx`: use the same batch presign and function-effect selection rule.
- Modify `src/app/reports/share/[token]/page.tsx`: use the same function-effect selection rule.
- Modify `src/app/(main)/reports/[id]/components/report-function-effect-tab.tsx`: render exactly one chosen evaluation.
- Modify `src/app/(main)/reports/[id]/components/report-matrix-tab.tsx`: render `process_notes` separately from `effect_summary`.
- Modify `src/lib/server/report-detail.ts`: carry process notes into the PDF model, apply function-effect precedence, and attach comparison/recipe issue media.
- Modify `src/lib/server/report-print-renderer.ts`: label and render process notes separately from conclusions.
- Modify `src/app/(main)/tasks/[id]/utils.ts`: expose single-text summary conversion helpers.
- Modify `src/app/(main)/tasks/[id]/components/ai-summary-dialog.tsx`: replace split fields with one textarea.
- Modify `src/app/(main)/tasks/[id]/page.tsx`: save parsed summary text and remove the legacy split-field dialog.
- Verify existing `src/app/api/recipes/[id]/ai-evaluate/route.ts` and `src/app/(main)/tasks/[id]/components/functions-tab.tsx`: retain the already-present DELETE behavior and cover it in acceptance checks.

### Task 1: Shared report content rules

**Files:**
- Create: `src/lib/report-content-rules.ts`
- Create: `src/lib/report-content-rules.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import assert from 'node:assert/strict';
import {
  formatAiSummaryText,
  parseAiSummaryText,
  selectEffectEvaluationText,
} from './report-content-rules';

assert.equal(
  selectEffectEvaluationText({
    effect_description: '  人工效果评价  ',
    effect_ai_result: { summary: 'AI 评价' },
  }),
  '人工效果评价',
);
assert.equal(
  selectEffectEvaluationText({
    effect_description: '   ',
    effect_ai_result: { summary: 'AI 评价' },
  }),
  'AI 评价',
);
assert.equal(selectEffectEvaluationText({}), '');

const summary = {
  tag: '良好',
  satisfaction_score: 8,
  summary: '整体稳定',
  strengths: ['加热均匀', '操作清晰'],
  risks: ['水量偏少'],
  historical_position: '较上一轮提升',
  suggestions: ['补充连续运行测试'],
};
const text = formatAiSummaryText(summary);
assert.match(text, /^总结：整体稳定/m);
assert.match(text, /^满意度：8\/10/m);
assert.deepEqual(parseAiSummaryText(text, summary), summary);

const freeText = parseAiSummaryText('没有标签的自由编辑内容', summary);
assert.equal(freeText.summary, '没有标签的自由编辑内容');
assert.deepEqual(freeText.strengths, []);
console.log('report-content-rules tests passed');
```

- [ ] **Step 2: Run the tests and verify RED**

Run: `pnpm exec tsx src/lib/report-content-rules.test.ts`

Expected: FAIL because `./report-content-rules` does not exist.

- [ ] **Step 3: Implement the minimal helpers**

```ts
export interface AiSummaryContent {
  tag: string;
  satisfaction_score: number;
  summary: string;
  strengths: string[];
  risks: string[];
  historical_position: string;
  suggestions: string[];
  updated_at?: string;
}

export function selectEffectEvaluationText(recipe: {
  effect_description?: unknown;
  effect_ai_result?: { summary?: unknown } | null;
}) {
  const manual = String(recipe.effect_description ?? '').trim();
  if (manual) return manual;
  return String(recipe.effect_ai_result?.summary ?? '').trim();
}

const LABELS = ['总结', '满意度', '主要优势', '主要风险', '历史表现', '后续建议'] as const;

export function formatAiSummaryText(summary: AiSummaryContent) {
  return [
    `总结：${summary.summary || ''}`,
    `满意度：${Number.isFinite(summary.satisfaction_score) ? `${summary.satisfaction_score}/10` : ''}`,
    `主要优势：${(summary.strengths || []).join('；')}`,
    `主要风险：${(summary.risks || []).join('；')}`,
    `历史表现：${summary.historical_position || ''}`,
    `后续建议：${(summary.suggestions || []).join('；')}`,
  ].join('\n');
}

function list(value: string) {
  return value.split(/[；;\n]/).map((item) => item.trim()).filter(Boolean);
}

export function parseAiSummaryText(value: string, previous: AiSummaryContent): AiSummaryContent {
  const source = value.trim();
  const hasLabels = LABELS.some((label) => new RegExp(`(?:^|\\n)${label}：`).test(source));
  if (!hasLabels) {
    return {
      ...previous,
      summary: source,
      strengths: [],
      risks: [],
      historical_position: '',
      suggestions: [],
    };
  }
  const fields = Object.fromEntries(LABELS.map((label) => [label, ''])) as Record<(typeof LABELS)[number], string>;
  const pattern = new RegExp(`(?:^|\\n)(${LABELS.join('|')})：([\\s\\S]*?)(?=\\n(?:${LABELS.join('|')})：|$)`, 'g');
  for (const match of source.matchAll(pattern)) fields[match[1] as (typeof LABELS)[number]] = match[2].trim();
  const scoreMatch = fields.满意度.match(/\d+(?:\.\d+)?/);
  return {
    ...previous,
    summary: fields.总结,
    satisfaction_score: scoreMatch ? Math.min(10, Math.max(0, Number(scoreMatch[0]))) : previous.satisfaction_score,
    strengths: list(fields.主要优势),
    risks: list(fields.主要风险),
    historical_position: fields.历史表现,
    suggestions: list(fields.后续建议),
  };
}
```

- [ ] **Step 4: Run the tests and verify GREEN**

Run: `pnpm exec tsx src/lib/report-content-rules.test.ts`

Expected: `report-content-rules tests passed`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/report-content-rules.ts src/lib/report-content-rules.test.ts
git commit -m "feat: centralize report content selection rules"
```

### Task 2: Resolve every presigned media URL beyond the 50-item API batch

**Files:**
- Create: `src/lib/presign-batches.ts`
- Create: `src/lib/presign-batches.test.ts`
- Modify: `src/lib/use-presigned-url.ts`
- Modify: `src/app/reports/print/page.tsx`

- [ ] **Step 1: Write the failing test**

```ts
import assert from 'node:assert/strict';
import { resolvePresignBatches } from './presign-batches';

const paths = Array.from({ length: 123 }, (_, index) => `uploads/${index}.jpg`);
const batches: string[][] = [];
const result = await resolvePresignBatches(paths, async (batch) => {
  batches.push(batch);
  return Object.fromEntries(batch.map((path) => [path, `signed:${path}`]));
});

assert.deepEqual(batches.map((batch) => batch.length), [50, 50, 23]);
assert.equal(Object.keys(result).length, 123);
assert.equal(result['uploads/122.jpg'], 'signed:uploads/122.jpg');
console.log('presign-batches tests passed');
```

- [ ] **Step 2: Run the test and verify RED**

Run: `pnpm exec tsx src/lib/presign-batches.test.ts`

Expected: FAIL because `resolvePresignBatches` does not exist.

- [ ] **Step 3: Implement deterministic batching**

```ts
export const PRESIGN_BATCH_SIZE = 50;

export async function resolvePresignBatches(
  paths: string[],
  requestBatch: (paths: string[]) => Promise<Record<string, string>>,
) {
  const unique = [...new Set(paths.map((path) => path.trim()).filter(Boolean))];
  const result: Record<string, string> = {};
  for (let index = 0; index < unique.length; index += PRESIGN_BATCH_SIZE) {
    const batch = unique.slice(index, index + PRESIGN_BATCH_SIZE);
    Object.assign(result, await requestBatch(batch));
  }
  return result;
}
```

- [ ] **Step 4: Route both browser and print presign requests through the helper**

In `src/lib/use-presigned-url.ts`, wrap the existing `fetch('/api/materials/presign')` callback:

```ts
const urlMap = await resolvePresignBatches(filePaths, async (paths) => {
  const res = await fetch('/api/materials/presign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      paths,
      report_id: getReportIdFromLocation(),
      share_token: getShareTokenFromLocation(),
    }),
  });
  const json = await readJsonResponse<{ code: number; data?: Record<string, string> }>(res);
  return json.code === 0 && json.data ? json.data : {};
});
```

In both `batchPresignUrls` and `presignReportUrls` in `src/app/reports/print/page.tsx`, use `resolvePresignBatches` with the existing `report_id` and `share_token` payload.

- [ ] **Step 5: Run tests**

Run:

```bash
pnpm exec tsx src/lib/presign-batches.test.ts
pnpm exec tsx src/lib/report-content-rules.test.ts
```

Expected: both print their passing messages.

- [ ] **Step 6: Commit**

```bash
git add src/lib/presign-batches.ts src/lib/presign-batches.test.ts src/lib/use-presigned-url.ts src/app/reports/print/page.tsx
git commit -m "fix: load every report media URL beyond fifty items"
```

### Task 3: Preserve comparison process notes separately from conclusions

**Files:**
- Modify: `src/lib/server/report-detail.ts`
- Modify: `src/lib/server/report-print-renderer.ts`
- Modify: `src/app/(main)/reports/[id]/components/report-matrix-tab.tsx`
- Create: `src/lib/server/report-comparison-fields.test.ts`

- [ ] **Step 1: Add a failing pure projection test**

Extract and export a small function from `report-detail.ts`:

```ts
export function comparisonCellFields(cell: Record<string, unknown>) {
  return {
    processNotes: stringArray(cell.process_notes),
    conclusion: firstNonEmpty(cell.effect_summary, cell.conclusion, cell.conclusion_tag, '-'),
  };
}
```

Test it:

```ts
import assert from 'node:assert/strict';
import { comparisonCellFields } from './report-detail';

const result = comparisonCellFields({
  process_notes: ['加水 1650ml', '运行 1 小时'],
  effect_summary: '粥底绵密',
});
assert.deepEqual(result.processNotes, ['加水 1650ml', '运行 1 小时']);
assert.equal(result.conclusion, '粥底绵密');
assert.notEqual(result.processNotes.join('；'), result.conclusion);
console.log('report comparison field tests passed');
```

- [ ] **Step 2: Run and verify RED**

Run: `pnpm exec tsx src/lib/server/report-comparison-fields.test.ts`

Expected: FAIL because `comparisonCellFields` is not exported.

- [ ] **Step 3: Extend the report matrix model**

Add `processNotes: string[]` to `ReportDetailMatrixCell`. When building each cell:

```ts
const fields = comparisonCellFields(cell);
const matrixCell: ReportDetailMatrixCell = {
  id: firstNonEmpty(cell.id, `${text(item.id)}:${object.id}`),
  value: firstNonEmpty(cell.metric_value, cell.measurement_value, cell.manual_score, '-'),
  processNotes: fields.processNotes,
  conclusion: fields.conclusion,
  score: firstNonEmpty(cell.manual_score, cell.ai_score),
  conclusionTag: firstNonEmpty(cell.conclusion_tag, cell.status),
  problems: stringArray(cell.problem_points),
  aiStatus: firstNonEmpty(cell.ai_status, cell.ai_confirmation_status),
  anomaly: firstNonEmpty(cell.anomaly_reason, cell.metric_anomaly_reason),
  media: comparisonCellMedia(cell, `${comparisonCellOwnerLabel(item)} / ${object.label}`),
};
```

Do not use `effect_summary` as `value`.

- [ ] **Step 4: Render the two fields explicitly**

In report center `MatrixCell`, add:

```tsx
const processNotes = Array.isArray(cell.process_notes)
  ? cell.process_notes.map(String).filter(Boolean)
  : [];
{processNotes.length > 0 && (
  <div className="text-[10px] text-muted-foreground">
    <span className="font-medium">过程记录：</span>{processNotes.join('；')}
  </div>
)}
{summary && (
  <p className="text-[10px] text-muted-foreground">
    <span className="font-medium">效果结论：</span>{summary}
  </p>
)}
```

In server PDF HTML:

```ts
const process = cell.processNotes.length
  ? `<p><strong>过程记录：</strong>${escapeHtml(cell.processNotes.join('；'))}</p>`
  : '';
const conclusion = !isBlankMatrixText(cell.conclusion)
  ? `<p><strong>效果结论：</strong>${escapeHtml(cell.conclusion)}</p>`
  : '';
```

- [ ] **Step 5: Run the comparison test and type check**

Run:

```bash
pnpm exec tsx src/lib/server/report-comparison-fields.test.ts
pnpm ts-check
```

Expected: test message passes and TypeScript exits 0.

- [ ] **Step 6: Commit**

```bash
git add src/lib/server/report-detail.ts src/lib/server/report-print-renderer.ts src/app/\(main\)/reports/\[id\]/components/report-matrix-tab.tsx src/lib/server/report-comparison-fields.test.ts
git commit -m "fix: keep comparison process notes in frozen reports"
```

### Task 4: Make manual function-effect evaluation authoritative

**Files:**
- Modify: `src/app/(main)/reports/[id]/components/report-function-effect-tab.tsx`
- Modify: `src/app/reports/print/page.tsx`
- Modify: `src/app/reports/share/[token]/page.tsx`
- Modify: `src/lib/server/report-detail.ts`
- Verify: `src/app/(main)/tasks/[id]/components/functions-tab.tsx`
- Verify: `src/app/api/recipes/[id]/ai-evaluate/route.ts`

- [ ] **Step 1: Add precedence assertions to the existing content-rule test**

Add cases proving whitespace-only manual input falls back to AI and non-empty manual input hides AI.

- [ ] **Step 2: Run the test and verify the assertions fail before consumer changes are complete**

Run: `pnpm exec tsx src/lib/report-content-rules.test.ts`

Expected: helper assertions pass; then use `rg` below to prove old AI-first consumers remain:

```bash
rg -n "effect_ai_result.*effect_description|!recipe.effect_ai_result && recipe.effect_description" src/app/reports
```

Expected: matches in print/share renderers.

- [ ] **Step 3: Replace consumer-specific branches**

At each report renderer:

```ts
const evaluationText = selectEffectEvaluationText(recipe);
```

Render only `evaluationText`. Do not render the AI summary a second time when manual text exists.

In `report-detail.ts`, use the same value for function-effect aggregation and detail blocks:

```ts
'效果评价': firstNonEmpty(selectEffectEvaluationText(recipe), '-')
```

- [ ] **Step 4: Verify deletion behavior remains complete**

Confirm the DELETE route still updates:

```ts
{
  effect_ai_result: null,
  effect_score: null,
}
```

Confirm `handleDeleteAiEval` removes local state, refetches recipes, and shows a success/error toast. No additional endpoint is required.

- [ ] **Step 5: Run tests and static checks**

Run:

```bash
pnpm exec tsx src/lib/report-content-rules.test.ts
rg -n "effect_ai_result.*effect_description|!recipe.effect_ai_result && recipe.effect_description" src/app/reports
pnpm ts-check
```

Expected: test passes, the old AI-first patterns return no matches, type check exits 0.

- [ ] **Step 6: Commit**

```bash
git add src/app/\(main\)/reports/\[id\]/components/report-function-effect-tab.tsx src/app/reports/print/page.tsx src/app/reports/share/\[token\]/page.tsx src/lib/server/report-detail.ts
git commit -m "fix: prefer adopted function evaluation in every report"
```

### Task 5: Show issue evidence in report-center downloads

**Files:**
- Modify: `src/lib/server/report-detail.ts`
- Create: `src/lib/server/report-issue-media.test.ts`
- Verify: `src/app/api/reports/[id]/issues/route.ts`
- Verify: `src/app/(main)/reports/[id]/components/issue-row.tsx`

- [ ] **Step 1: Extract and test issue material matching**

Export:

```ts
export function issueMaterialRows(issue: Row, allMaterials: Row[]) {
  const issueId = text(issue.id);
  const recordId = text(issue.record_id);
  const sourceCellId = text(issue.source_cell_id);
  return uniqueMaterials(allMaterials.filter((material) => (
    (issueId && text(material.issue_id) === issueId)
    || (recordId && text(material.record_id) === recordId)
    || (sourceCellId && text(material.comparison_cell_id) === sourceCellId)
  )));
}
```

Test:

```ts
import assert from 'node:assert/strict';
import { issueMaterialRows } from './report-detail';

const matched = issueMaterialRows(
  { id: 'issue-1', record_id: 'record-1', source_cell_id: 'cell-1' },
  [
    { id: 'm1', issue_id: 'issue-1' },
    { id: 'm2', record_id: 'record-1' },
    { id: 'm3', comparison_cell_id: 'cell-1' },
    { id: 'm4', comparison_cell_id: 'other' },
  ],
);
assert.deepEqual(matched.map((item) => item.id), ['m1', 'm2', 'm3']);
console.log('report issue media tests passed');
```

- [ ] **Step 2: Run and verify RED**

Run: `pnpm exec tsx src/lib/server/report-issue-media.test.ts`

Expected: FAIL because `issueMaterialRows` is not exported.

- [ ] **Step 3: Use the matcher in PDF report detail**

Update `issueEvidenceMedia` so its direct material list includes `source_cell_id`. Keep `issue.materials` and record-level materials, then deduplicate through `uniqueMediaItems`.

The existing report-center issues API already covers direct issue, record, comparison cell, recipe step, recipe effect, and material-ID links. Do not duplicate its route logic elsewhere.

- [ ] **Step 4: Run tests and inspect PDF model output**

Run:

```bash
pnpm exec tsx src/lib/server/report-issue-media.test.ts
pnpm ts-check
```

Expected: test passes and type check exits 0.

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/report-detail.ts src/lib/server/report-issue-media.test.ts
git commit -m "fix: include issue evidence in downloaded reports"
```

### Task 6: Replace split AI-summary inputs with one editable text area

**Files:**
- Modify: `src/app/(main)/tasks/[id]/utils.ts`
- Modify: `src/app/(main)/tasks/[id]/components/ai-summary-dialog.tsx`
- Modify: `src/app/(main)/tasks/[id]/page.tsx`

- [ ] **Step 1: Reuse the tested summary helpers**

Change `summaryToForm` to return:

```ts
export function summaryToForm(summary: AiTaskSummary) {
  return { text: formatAiSummaryText(summary) };
}
```

Keep `linesToList` only if another caller still uses it; otherwise remove its import after `rg -n "linesToList" src`.

- [ ] **Step 2: Replace the dialog body**

Render one textarea:

```tsx
<div className="space-y-1.5">
  <Label>AI 总结（可编辑）</Label>
  <Textarea
    rows={16}
    value={summaryForm.text}
    onChange={(event) => onFormChange({ text: event.target.value })}
    placeholder={'总结：\n满意度：\n主要优势：\n主要风险：\n历史表现：\n后续建议：'}
  />
</div>
```

Keep only “重新 AI 总结” and “保存总结” actions.

- [ ] **Step 3: Parse the one text value on save**

Before POSTing the summary:

```ts
const parsed = parseAiSummaryText(
  summaryForm.text,
  aiSummary || {
    tag: '',
    satisfaction_score: 0,
    summary: '',
    strengths: [],
    risks: [],
    historical_position: '',
    suggestions: [],
  },
);
body: JSON.stringify({ summary: parsed })
```

When generation completes, call `setSummaryForm(summaryToForm(data.data))`.

Remove the duplicated legacy split-field dialog from `page.tsx` if it is still reachable; the page must have one summary dialog implementation.

- [ ] **Step 4: Run summary tests and type check**

Run:

```bash
pnpm exec tsx src/lib/report-content-rules.test.ts
pnpm ts-check
```

Expected: summary round-trip passes and TypeScript exits 0.

- [ ] **Step 5: Commit**

```bash
git add src/app/\(main\)/tasks/\[id\]/utils.ts src/app/\(main\)/tasks/\[id\]/components/ai-summary-dialog.tsx src/app/\(main\)/tasks/\[id\]/page.tsx
git commit -m "feat: edit AI task summary in one structured text box"
```

### Task 7: Full verification and production deployment

**Files:**
- Modify only if verification exposes a task-scoped defect.

- [ ] **Step 1: Run all focused regression tests**

Run:

```bash
pnpm exec tsx src/lib/report-content-rules.test.ts
pnpm exec tsx src/lib/presign-batches.test.ts
pnpm exec tsx src/lib/server/report-comparison-fields.test.ts
pnpm exec tsx src/lib/server/report-issue-media.test.ts
```

Expected: four passing messages and exit 0.

- [ ] **Step 2: Run repository checks**

Run:

```bash
pnpm ts-check
pnpm lint
pnpm build
```

Expected: all exit 0. Record pre-existing warnings separately; do not conceal errors.

- [ ] **Step 3: Local browser smoke test**

Start the production build on an unused local port. Verify:

1. A comparison cell shows distinct “过程记录” and “效果结论”.
2. More than 50 appendix images produce requests in batches and all thumbnails resolve.
3. A manual effect evaluation hides the AI summary; clearing manual text reveals AI.
4. Deleting AI evaluation removes the AI card without clearing manual evaluation.
5. AI summary dialog contains one textarea and survives save/reopen.
6. Report issue list and downloaded PDF show linked images.

- [ ] **Step 4: Prepare a rollback-safe production release**

On the server:

1. Create a timestamped backup under the existing deployment-backup directory.
2. Do not overwrite the live `.next` directory until the local build artifacts are complete.
3. Compare SHA256 for uploaded `.next/BUILD_ID` and `dist/server.js`.
4. Restart only `product-experience-system` through the live `ecosystem.config.cjs`.

- [ ] **Step 5: Production smoke test**

Verify:

```bash
pm2 status product-experience-system
curl -f http://127.0.0.1:5001/login
curl -f http://127.0.0.1:5001/api/v1/dictionaries/project_phase_dict
curl -f http://127.0.0.1:5001/reports
```

Then sign in through the external entry and re-check the known comparison report, its appendix, issue images, and downloaded PDF.
