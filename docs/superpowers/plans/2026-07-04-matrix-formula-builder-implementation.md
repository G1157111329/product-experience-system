# Matrix Formula Builder Implementation Plan (Wave 2-2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let admin compose计算列公式 in a structured point-and-click UI (SELF + arithmetic + ROUND only), create the output column in the same form, save as draft, and publish — reusing Wave 1's DSL engine + publish endpoint. No text-box DSL input, no A1 coords, no REF/GROUP_*/IF.

**Architecture:** New `PUT /api/matrix-schema-versions/[id]/draft` endpoint writes dimensions+formulas to DB (publish reads from DB, so drafts must persist). New `GET /api/matrix-schema-versions/[id]` returns the version + its bindings + formulas. New `MatrixSchemaSettings` Dialog (settings panel) + `FormulaBuilder` structured-form component. Token-stream → DSL via pure `tokensToDsl`; preview via shared `compileFormula`/`evaluate`.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript 5, Tailwind 4 + shadcn/ui, Supabase-compatible client, `node:assert/strict` tests via `tsx`.

**Spec:** `docs/superpowers/specs/2026-07-04-matrix-formula-builder-design.md`

**Conventions (verified):**
- API: `getSupabaseClient()` + `requireAdmin`/`isAuthResponse` + `writeSecurityAudit`, `{code:0,message,data}` / `{code:1,message}` + status.
- Tests: standalone `.test.ts` with `node:assert/strict`, `pnpm tsx`.
- Commit: `feat(matrix): ...`.
- Wave 1 anchors: `compileFormula`/`evaluate`/`buildDependencyGraph` from `src/lib/matrix/formula-engine.ts`. `POST /api/matrix-schema-versions/[id]/publish` reads `matrix_dimension_bindings` + `matrix_formula_definitions` by `schema_version_id` (confirmed in publish/route.ts). Admin settings Dialog pattern in `src/components/settings/ai-agent-settings.tsx`. Admin menu entries at `src/components/navigation.tsx` (AiAgentSettings rendered at ~line 1040/1175, gated by role).

---

## File Structure

**New files (5):**
- `src/lib/matrix/formula-tokens.ts` — `FormulaToken` type + pure `tokensToDsl(tokens)` + `tokensToExampleKeys(tokens)`.
- `src/lib/matrix/formula-tokens.test.ts` — node:assert tests.
- `src/app/api/matrix-schema-versions/[id]/route.ts` — GET version + bindings + formulas (read endpoint).
- `src/app/api/matrix-schema-versions/[id]/draft/route.ts` — PUT draft (replace-strategy write + compile verify).
- `src/components/settings/matrix-schema-settings.tsx` — Dialog: schema list + version list + draft editor + FormulaBuilder mount + save/publish.
- `src/components/settings/formula-builder.tsx` — structured point-and-click form (token stream + DSL preview + example preview + add-to-draft callback).

**Modified files (1):**
- `src/components/navigation.tsx` — add admin-only "数据矩阵模式管理" menu entry + render `<MatrixSchemaSettings>`.

---

### Task 1: `formula-tokens.ts` — token type + `tokensToDsl` pure function (TDD)

**Files:**
- Create: `src/lib/matrix/formula-tokens.ts`
- Create: `src/lib/matrix/formula-tokens.test.ts`

The pure-function core: token → DSL conversion + example-key extraction. No React, no DB. Shared by FormulaBuilder UI + tests.

- [ ] **Step 1: Write the failing test**

Create `src/lib/matrix/formula-tokens.test.ts`:

```ts
import assert from 'node:assert/strict';
import { tokensToDsl, tokensToExampleKeys, type FormulaToken } from './formula-tokens';

// Simple division: SELF("a") / SELF("b")
{
  const tokens: FormulaToken[] = [
    { kind: 'self', dimensionKey: 'a' },
    { kind: 'op', symbol: '/' },
    { kind: 'self', dimensionKey: 'b' },
  ];
  const dsl = tokensToDsl(tokens);
  assert.equal(dsl, 'SELF("a") / SELF("b")');
  // Round-trip: the generated DSL must compile.
  const { compileFormula } = await import('./formula-engine');
  compileFormula(dsl);  // throws if invalid
}

// ROUND wrapper: ROUND(SELF("a") / SELF("b"), 4)
{
  const tokens: FormulaToken[] = [
    { kind: 'round', decimals: 4, inner: [
      { kind: 'self', dimensionKey: 'a' },
      { kind: 'op', symbol: '/' },
      { kind: 'self', dimensionKey: 'b' },
    ] },
  ];
  const dsl = tokensToDsl(tokens);
  assert.equal(dsl, 'ROUND(SELF("a") / SELF("b"), 4)');
  const { compileFormula } = await import('./formula-engine');
  compileFormula(dsl);
}

// Number literal + arithmetic
{
  const tokens: FormulaToken[] = [
    { kind: 'self', dimensionKey: 'x' },
    { kind: 'op', symbol: '*' },
    { kind: 'number', value: 2 },
  ];
  assert.equal(tokensToDsl(tokens), 'SELF("x") * 2');
}

// Example keys: only SELF tokens contribute
{
  const tokens: FormulaToken[] = [
    { kind: 'round', decimals: 4, inner: [
      { kind: 'self', dimensionKey: 'juice_weight' },
      { kind: 'op', symbol: '/' },
      { kind: 'self', dimensionKey: 'ingredient_weight' },
    ] },
  ];
  assert.deepEqual(tokensToExampleKeys(tokens).sort(), ['ingredient_weight', 'juice_weight']);
}

console.log('formula-tokens tests passed');
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm tsx src/lib/matrix/formula-tokens.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `formula-tokens.ts`**

```ts
export type FormulaToken =
  | { kind: 'self'; dimensionKey: string }
  | { kind: 'number'; value: number }
  | { kind: 'op'; symbol: '+' | '-' | '*' | '/' | '^' }
  | { kind: 'round'; inner: FormulaToken[]; decimals: number };

/**
 * Convert a token stream to DSL source. The DSL parser ignores whitespace,
 * so single-space separation is fine. Output must round-trip through
 * compileFormula (verified in tests).
 */
export function tokensToDsl(tokens: FormulaToken[]): string {
  return tokens.map(tokenToString).join(' ');
}

function tokenToString(t: FormulaToken): string {
  switch (t.kind) {
    case 'self':
      return `SELF("${t.dimensionKey}")`;
    case 'number':
      return String(t.value);
    case 'op':
      return t.symbol;
    case 'round':
      return `ROUND(${tokensToDsl(t.inner)}, ${t.decimals})`;
  }
}

/**
 * Collect all dimension keys referenced via SELF in the token stream.
 * Used to render example-input fields in the FormulaBuilder preview.
 */
export function tokensToExampleKeys(tokens: FormulaToken[]): string[] {
  const keys: string[] = [];
  for (const t of tokens) {
    if (t.kind === 'self') keys.push(t.dimensionKey);
    else if (t.kind === 'round') keys.push(...tokensToExampleKeys(t.inner));
  }
  return Array.from(new Set(keys));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm tsx src/lib/matrix/formula-tokens.test.ts`
Expected: `formula-tokens tests passed`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/matrix/formula-tokens.ts src/lib/matrix/formula-tokens.test.ts
git commit -m "feat(matrix): add formula token → DSL conversion"
```

---

### Task 2: `GET /api/matrix-schema-versions/[id]` — read version + bindings + formulas

**Files:**
- Create: `src/app/api/matrix-schema-versions/[id]/route.ts`

Read endpoint so the settings UI can load a draft's current state. `requireAdmin` (only admin edits schemas; reads could be `requireUser` per Task 13's list endpoint, but the draft state is admin-only territory so tighten to admin).

- [ ] **Step 1: Implement the route**

```ts
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { isAuthResponse, requireAdmin } from '@/lib/server/auth';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const client = getSupabaseClient();
  const admin = await requireAdmin(request, client);
  if (isAuthResponse(admin)) return admin;
  const { id: versionId } = await params;

  const { data: version, error: vErr } = await client.from('matrix_schema_versions')
    .select('id, schema_id, version_no, status, schema_json, published_at, published_by')
    .eq('id', versionId).maybeSingle();
  if (vErr) return NextResponse.json({ code: 1, message: vErr.message }, { status: 500 });
  if (!version) return NextResponse.json({ code: 1, message: '版本不存在' }, { status: 404 });

  const { data: bindings, error: bErr } = await client.from('matrix_dimension_bindings')
    .select('dimension_key, display_name, column_group, value_kind, unit_code, required, editable, sort_order, display_format_json, validation_rule_json')
    .eq('schema_version_id', versionId)
    .order('sort_order', { ascending: true });
  if (bErr) return NextResponse.json({ code: 1, message: bErr.message }, { status: 500 });

  const { data: formulas, error: fErr } = await client.from('matrix_formula_definitions')
    .select('id, output_dimension_key, formula_dsl, scope, formula_version, status')
    .eq('schema_version_id', versionId);
  if (fErr) return NextResponse.json({ code: 1, message: fErr.message }, { status: 500 });

  return NextResponse.json({ code: 0, message: 'success', data: { version, dimensions: bindings || [], formulas: formulas || [] } });
}
```

- [ ] **Step 2: Type check + commit**

Run: `pnpm ts-check` — must pass.

```bash
git add src/app/api/matrix-schema-versions/[id]/route.ts
git commit -m "feat(matrix): add schema version read endpoint"
```

---

### Task 3: `PUT /api/matrix-schema-versions/[id]/draft` — save draft (replace strategy + compile verify)

**Files:**
- Create: `src/app/api/matrix-schema-versions/[id]/draft/route.ts`

The load-bearing backend task. Replace strategy makes it idempotent. Compile-verify prevents bypassing the FormulaBuilder UI.

- [ ] **Step 1: Implement the route**

```ts
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { isAuthResponse, requireAdmin } from '@/lib/server/auth';
import { writeSecurityAudit } from '@/lib/server/security-audit';
import { compileFormula, buildDependencyGraph, parseErrorToCode } from '@/lib/matrix/formula-engine';

interface DraftDimension {
  dimensionKey: string;
  displayName: string;
  columnGroup: 'observed' | 'calculated';
  valueKind: string;
  unitCode?: string;
  required?: boolean;
  editable?: boolean;
  sortOrder: number;
  displayFormat?: { decimals?: number; durationFormat?: string };
  validation?: { min?: number; max?: number; enumValues?: string[] };
}

interface DraftFormula {
  outputDimensionKey: string;
  formulaDsl: string;
  scope: 'row' | 'group';
  formulaVersion: string;
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const client = getSupabaseClient();
  const admin = await requireAdmin(request, client);
  if (isAuthResponse(admin)) return admin;
  const { id: versionId } = await params;

  // 1. Load version; reject if published.
  const { data: version, error: vErr } = await client.from('matrix_schema_versions')
    .select('id, status').eq('id', versionId).maybeSingle();
  if (vErr) return NextResponse.json({ code: 1, message: vErr.message }, { status: 500 });
  if (!version) return NextResponse.json({ code: 1, message: '版本不存在' }, { status: 404 });
  if (version.status === 'published') {
    return NextResponse.json({ code: 1, message: '该版本已发布，不能修改', data: { code: 'MATRIX_SCHEMA_VERSION_IMMUTABLE' } }, { status: 409 });
  }

  const body = await request.json().catch(() => null) as { dimensions?: DraftDimension[]; formulas?: DraftFormula[] } | null;
  if (!body || !Array.isArray(body.dimensions) || !Array.isArray(body.formulas)) {
    return NextResponse.json({ code: 1, message: '请求格式不正确' }, { status: 400 });
  }

  // 2. Compile-verify every formula (defense vs frontend bypass).
  for (const f of body.formulas) {
    try {
      compileFormula(f.formulaDsl);
      const deps = buildDependencyGraph(f.formulaDsl);
      // Every dependency must be a known dimension key (in the incoming dimensions array).
      const knownKeys = new Set(body.dimensions.map(d => d.dimensionKey));
      for (const dep of deps) {
        if (!knownKeys.has(dep)) {
          return NextResponse.json({ code: 1, message: `公式 ${f.outputDimensionKey} 引用了未知维度 ${dep}`, data: { code: 'MATRIX_FORMULA_DIMENSION_NOT_FOUND' } }, { status: 422 });
        }
      }
    } catch (err) {
      const code = parseErrorToCode(err) ?? 'MATRIX_FORMULA_PARSE_ERROR';
      return NextResponse.json({ code: 1, message: err instanceof Error ? err.message : '公式编译失败', data: { code } }, { status: 422 });
    }
  }

  // 3. Replace strategy: delete existing draft bindings + formulas, then insert.
  //    Idempotent — repeated saves don't accumulate. Only touches this version's rows.
  const { error: delBErr } = await client.from('matrix_dimension_bindings').delete().eq('schema_version_id', versionId);
  if (delBErr) return NextResponse.json({ code: 1, message: delBErr.message }, { status: 500 });
  const { error: delFErr } = await client.from('matrix_formula_definitions').delete().eq('schema_version_id', versionId);
  if (delFErr) return NextResponse.json({ code: 1, message: delFErr.message }, { status: 500 });

  // 4. Insert dimensions.
  if (body.dimensions.length > 0) {
    const dimRows = body.dimensions.map(d => ({
      schema_version_id: versionId,
      dimension_key: d.dimensionKey,
      display_name: d.displayName,
      column_group: d.columnGroup,
      value_kind: d.valueKind,
      unit_code: d.unitCode ?? null,
      required: d.required ?? false,
      editable: d.editable ?? true,
      sort_order: d.sortOrder,
      display_format_json: d.displayFormat ?? {},
      validation_rule_json: d.validation ?? {},
    }));
    const { error: insBErr } = await client.from('matrix_dimension_bindings').insert(dimRows);
    if (insBErr) return NextResponse.json({ code: 1, message: insBErr.message }, { status: 500 });
  }

  // 5. Insert formulas.
  if (body.formulas.length > 0) {
    const formulaRows = body.formulas.map(f => ({
      schema_version_id: versionId,
      output_dimension_key: f.outputDimensionKey,
      formula_dsl: f.formulaDsl,
      scope: f.scope,
      formula_version: f.formulaVersion,
      status: 'draft',
    }));
    const { error: insFErr } = await client.from('matrix_formula_definitions').insert(formulaRows);
    if (insFErr) return NextResponse.json({ code: 1, message: insFErr.message }, { status: 500 });
  }

  // 6. Audit.
  try {
    await writeSecurityAudit(client, {
      request, actor: admin, action: 'matrix_schema_draft.saved', outcome: 'success',
      targetType: 'matrix_schema_version', targetId: versionId,
      metadata: { dimensions: body.dimensions.length, formulas: body.formulas.length },
    });
  } catch { /* ignore audit failure */ }

  return NextResponse.json({ code: 0, message: '草稿已保存', data: { versionId, dimensions: body.dimensions.length, formulas: body.formulas.length } });
}
```

**Note:** the dependency check uses `knownKeys` from the incoming `body.dimensions` only. This means a formula can only reference dimensions sent in THIS request — the frontend must include observed dimensions in the payload too (not just the new calculated ones). Document this clearly in the FormulaBuilder: "保存草稿时会把该版本全部维度（observed + calculated）一起发送。" Read how the GET endpoint in Task 2 returns dimensions — the frontend will merge loaded + edited and send the full set.

- [ ] **Step 2: Type check + commit**

Run: `pnpm ts-check` — must pass.

```bash
git add src/app/api/matrix-schema-versions/[id]/draft/route.ts
git commit -m "feat(matrix): add schema version draft save endpoint"
```

---

### Task 4: `FormulaBuilder` component — structured point-and-click form

**Files:**
- Create: `src/components/settings/formula-builder.tsx`

The interactive core. Token stream + add-token buttons + DSL preview + example preview + add-to-draft callback. No DB calls — pure React, calls back to parent.

- [ ] **Step 1: Implement the component**

Props:
```ts
interface FormulaBuilderProps {
  observedDimensions: Array<{ dimensionKey: string; displayName: string }>;
  onAdd: (dimension: DraftDimensionPayload, formula: DraftFormulaPayload) => void;
  onCancel: () => void;
}
```

State:
- `outputName: string` (输出列名)
- `unit: string` (单位, default '%')
- `decimals: number` (default 4)
- `tokens: FormulaToken[]` (公式 token 流)
- `exampleValues: Record<string, string>` (示例输入, keyed by dimensionKey)
- `compileError: string | null`
- `compileResult: number | null` (示例预览结果)

Behavior:
- "添加到草稿"按钮 disabled unless `outputName` non-empty AND `tokens.length > 0` AND compile succeeds.
- Token add buttons:
  - `+ SELF` → opens a `<Select>` of `observedDimensions` → adds `{kind:'self', dimensionKey}`.
  - `+ 数字` → opens a small `<Input type="number">` → adds `{kind:'number', value}`.
  - `+ 运算符` → opens a popover with `+ - * / ^` buttons → adds `{kind:'op', symbol}`.
  - `+ ROUND` → wraps the entire current token stream in `{kind:'round', inner: [...tokens], decimals}`. (For first version, ROUND wraps everything; nested ROUND not supported. The token stream becomes a single round token.) If already wrapped, button is disabled.
- Each token renders as a chip with a delete (×) button.
- DSL preview (read-only): `tokensToDsl(tokens)` — green if compiles, red + error message if not.
- Example preview: for each key in `tokensToExampleKeys(tokens)`, render a number input. On any input change, recompile + evaluate (reuse `compileFormula` + `evaluate` from `@/lib/matrix/formula-engine`).
- "添加到草稿" builds:
  - dimension payload: `{ dimensionKey: outputName (or a slugified version), displayName: outputName, columnGroup: 'calculated', valueKind: 'number', unitCode: unit, editable: false, sortOrder: <next>, displayFormat: { decimals } }`.
  - formula payload: `{ outputDimensionKey: <same key>, formulaDsl: tokensToDsl(tokens), scope: 'row', formulaVersion: 'v1' }`.
  - calls `onAdd(dimension, formula)`.

**Note on `dimensionKey` vs `displayName`**: for first version, use the admin-entered `outputName` as both (e.g. "出汁率"). A future improvement could slugify to English keys. Document this simplification.

Use shadcn `Input`, `Button`, `Select`, `Popover`, `Badge`, `Tooltip` as needed. Match the style of `ai-agent-settings.tsx`.

- [ ] **Step 2: Type check**

Run: `pnpm ts-check` — must pass.

- [ ] **Step 3: Commit**

```bash
git add src/components/settings/formula-builder.tsx
git commit -m "feat(matrix): add structured formula builder component"
```

---

### Task 5: `MatrixSchemaSettings` Dialog — schema/version list + draft editor

**Files:**
- Create: `src/components/settings/matrix-schema-settings.tsx`

The orchestrating Dialog. Loads schemas, lets admin pick a draft version, edit it (add calculated columns via FormulaBuilder), save draft, publish.

- [ ] **Step 1: Implement the Dialog**

Props: `{ open: boolean; onOpenChange: (open: boolean) => void }` (matches ai-agent-settings pattern).

Layout: Dialog + ScrollArea + two-column flex (left: schema/version list, right: draft editor).

State:
- `schemas: SchemaSummary[]` (from `GET /api/matrix-schemas`).
- `selectedVersionId: string | null`.
- `versionDetail: { version, dimensions, formulas } | null` (from `GET /api/matrix-schema-versions/[id]`).
- `draftDimensions: DraftDimension[]` (editable copy of versionDetail.dimensions).
- `draftFormulas: DraftFormula[]` (editable copy of versionDetail.formulas).
- `showBuilder: boolean` (FormulaBuilder toggle).

Behavior:
- On open: `GET /api/matrix-schemas` → populate left list.
- Click a draft version → `GET /api/matrix-schema-versions/[id]` → populate right editor.
- Click a published version → right shows read-only + "派生新版本" button → `POST /api/matrix-schemas/[schemaId]/versions` with `schema_json` from the published version → new draft appears in left list → auto-select it.
- "添加计算列" button → shows `<FormulaBuilder>` at the bottom. On `onAdd(dimension, formula)`: push to `draftDimensions` + `draftFormulas`, hide builder.
- Each calculated dimension in the list shows its formula DSL (read-only chip).
- "保存草稿" button → `PUT /api/matrix-schema-versions/[id]/draft` with `{ dimensions: draftDimensions, formulas: draftFormulas }`. Toast on success/failure.
- "发布" button → `POST /api/matrix-schema-versions/[id]/publish`. On success: toast + refresh left list (version status → published). On 422 (compile/cycle error): toast with the error message.

**Note**: the draft save sends ALL dimensions (observed + calculated), not just new ones — because the backend's dependency check (Task 3) validates against the incoming dimensions array. So the editor must preserve the loaded observed dimensions in `draftDimensions`.

- [ ] **Step 2: Type check**

Run: `pnpm ts-check` — must pass.

- [ ] **Step 3: Commit**

```bash
git add src/components/settings/matrix-schema-settings.tsx
git commit -m "feat(matrix): add schema settings dialog with draft editor"
```

---

### Task 6: Navigation entry — admin-only "数据矩阵模式管理"

**Files:**
- Modify: `src/components/navigation.tsx`

- [ ] **Step 1: Read the existing admin menu entries**

Read `src/components/navigation.tsx` around lines 1038-1040 and 1173-1175 (where `<AiAgentSettings>` and `<CategoryProductSettings>` are rendered). Note how the admin gate works (`user.role === 'admin'` or a `showSettings` conditional) and copy the pattern.

- [ ] **Step 2: Add the entry**

Add:
1. `import { MatrixSchemaSettings } from '@/components/settings/matrix-schema-settings';` near the existing settings imports.
2. `const [matrixSchemaOpen, setMatrixSchemaOpen] = useState(false);` near other settings state.
3. A menu button (admin-gated) labeled "数据矩阵模式管理" that calls `setMatrixSchemaOpen(true)`.
4. `<MatrixSchemaSettings open={matrixSchemaOpen} onOpenChange={setMatrixSchemaOpen} />` near the other settings renders.

Match the exact gating + placement of the existing `AiAgentSettings` entry.

- [ ] **Step 3: Type check + commit**

Run: `pnpm ts-check` — must pass.

```bash
git add src/components/navigation.tsx
git commit -m "feat(matrix): add schema settings entry in admin menu"
```

---

### Task 7: E2E smoke test (FB-01~04, best-effort)

**Files:**
- Create: `tests/e2e/matrix-formula-builder.spec.ts`

- [ ] **Step 1: Read the precedent**

Read `tests/e2e/matrix-juicer.spec.ts` for auth + skip-when-no-DB pattern.

- [ ] **Step 2: Write the spec**

Cover:
- FB-01: admin opens settings → schema management → picks juicer → derives new version → adds calculated column via FormulaBuilder (click SELF buttons, assemble juice_weight/ingredient_weight, ROUND) → fills example → preview shows 0.4683 → save draft → publish → new task applies the new version → matrix shows the new column.

  (Full FB-01 is intricate; for the smoke test, focus on the FORMULA BUILDER UI path — assembling tokens, seeing preview, save draft. The end-to-end "new task applies version" can be a follow-up integration test.)

- FB-02: assemble a cycle (formula A output key = formula B's dependency, and vice versa) → publish rejected with `MATRIX_FORMULA_CYCLE`.
- FB-03: assert the builder UI only exposes SELF/数字/运算符/ROUND buttons (no INDIRECT/A1/VBA entries — structural).
- FB-04: save draft → reload page → draft still present.

- [ ] **Step 3: Type check + commit**

Run: `pnpm ts-check` — must pass. Self-skip if no DB.

```bash
git add tests/e2e/matrix-formula-builder.spec.ts
git commit -m "test(matrix): add formula builder end-to-end smoke"
```

---

### Task 8: Update AGENTS.md

**Files:**
- Modify: `AGENTS.md`

- [ ] **Step 1: Add API rows**

In "API 接口" add:
```
| GET | `/api/matrix-schema-versions/[id]` | 读取模式版本详情（含 dimensions + formulas，admin） |
| PUT | `/api/matrix-schema-versions/[id]/draft` | 保存模式版本草稿（dimensions + formulas，replace 策略幂等，admin，编译校验） |
```

- [ ] **Step 2: Add design-decision item**

In "关键设计决策" append (continue numbering after #91):
```
92. **受限公式构建器 (Wave 2-2)**: admin 在设置面板「数据矩阵模式管理」Dialog 里通过结构化点选表单（积木块：SELF/数字/算术运算符/ROUND）组装计算列公式 + 同表单创输出列 → 保存草稿 → 发布（复用 Wave 1 编译校验 + 循环检测）。最小能力集（SELF+算术+ROUND+数字字面量），不暴露 REF/GROUP_*/IF/COALESCE（DSL 引擎支持但 UI 不开放，后续可扩）；强制结构化点选（无文本框，避免手写非法 DSL）；语义化存储（`SELF("juice_weight")` 非 A1 坐标）；草稿保存走 replace 策略幂等；admin 直接发布无审批。token 流 → DSL 转换是纯函数 `tokensToDsl`，前端预览复用 `compileFormula`/`evaluate`。
```

- [ ] **Step 3: Commit**

```bash
git add AGENTS.md
git commit -m "docs(matrix): document formula builder enhancement"
```

---

## Self-Review Notes (post-write)

- **Spec coverage:** §1 goals → Tasks 1-7. §5 draft API → Task 3. §6 settings Dialog → Task 5. §7 FormulaBuilder → Task 4. §10 open items F-01 (GET version) → Task 2; F-02 (manual save) → Task 5 (save button); F-03 (multiple formulas) → Task 5 (draftFormulas array); F-04 (decimals default 4) → Task 4.
- **Type consistency:** `FormulaToken` defined in Task 1, used in Task 4. `DraftDimension`/`DraftFormula` shapes in Task 3 (backend) match Task 4/5 (frontend payloads). `tokensToDsl`/`tokensToExampleKeys` from Task 1 used in Task 4.
- **Key constraint honored:** publish reads from DB → draft must persist → Task 3 endpoint exists and Task 5 calls it before publish.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-04-matrix-formula-builder-implementation.md`.

Subagent-Driven execution (per the user's choice — same flow as Wave 1 + Wave 2-1).
