# Data Matrix Input View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a structured "数据矩阵" (data matrix) input tab to the experience task workbench that lets users record强类型测量值 (typed measurements: duration/weight/...) across 对象/规格 × 食材/功能 rows, with a semantic-DSL formula engine that auto-computes calculated columns (出汁率/纯汁率/含渣率), three-slot per-row entry (效果结论/过程记录/关联问题), evidence binding, mobile card view, and read-only report projection.

**Architecture:** Reuse the existing `comparison_*` table family as the matrix container (tagged via a new `matrix_role` column), reuse `metric_definitions`/`metric_formula_versions`/`metric_threshold_rules`/`metric_evaluations` for typed values (extended), add new `matrix_schemas`/`matrix_schema_versions`/`matrix_dimension_bindings`/`matrix_formula_definitions`/`matrix_calculation_runs` tables. The DSL formula engine is one shared TypeScript module (`src/lib/matrix/formula-engine.ts`) consumed by both frontend (optimistic calc) and backend (authoritative recompute), with `node:assert/strict` test files per repo convention. No async queue: frontend乐观计算 + 服务端复核. No cell-level rich text or A1 coordinate formulas — semantic references only.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript 5, Tailwind CSS 4, shadcn/ui, Drizzle ORM schema (`src/storage/database/shared/schema.ts`), Supabase-compatible client (`getSupabaseClient`), `node:assert/strict` test files run via `tsx`, PostgreSQL 16.

**Spec:** `docs/superpowers/specs/2026-07-03-data-matrix-input-view-design.md`

**Conventions used throughout (verified against the codebase):**
- API routes return `NextResponse.json({ code: 0, message: 'success', data })` on success and `NextResponse.json({ code: 1, message }, { status: 4xx })` on error — no shared helper, inline construction.
- Auth: `import { requireUser, requireAdmin, canAccessTask, canAccessAssembly, isAuthResponse } from '@/lib/server/auth'`. `requireUser`/`requireAdmin` return `AuthUser | NextResponse`; guard with `if (isAuthResponse(user)) return user;`.
- DB in API routes: `const client = getSupabaseClient();` then `client.from('table_name').select('*').eq('col', val)...` — NOT raw Drizzle, for the comparison/metric family.
- Drizzle schema uses camelCase TS names mapping to snake_case DB columns (e.g. `processNotes` → `process_notes`).
- Tests: standalone `.test.ts` files using `import assert from 'node:assert/strict'`, top-level assertions, run via `pnpm tsx <file>`. Add a `check:*` script in `package.json` for each contract test.
- Migrations live in `src/storage/database/shared/migrations/`, named `NNNN_snake_case.sql`. Next is `0002_`.

---

## File Structure

**New files (created):**
- `src/lib/matrix/formula-engine.ts` — DSL tokenizer + parser + AST + evaluator (shared front/back).
- `src/lib/matrix/formula-engine.test.ts` — golden-sample tests (node:assert).
- `src/lib/matrix/types.ts` — TS types: `DimensionBinding`, `FormulaDefinition`, `MatrixReadProjection`, `MetricValue`.
- `src/lib/matrix/projection.ts` — server-side `buildMatrixReadProjection(assemblyId)` aggregator.
- `src/lib/matrix/schema-bootstrap.ts` — the seeded原汁机 (juicer aperture) default schema + dimensions + formulas.
- `src/app/api/matrix-schemas/route.ts` — GET list / POST draft.
- `src/app/api/matrix-schemas/[id]/versions/route.ts` — POST new version draft.
- `src/app/api/matrix-schema-versions/[id]/publish/route.ts` — POST compile + publish.
- `src/app/api/tasks/[id]/matrices/route.ts` — GET list / POST apply schema → instance.
- `src/app/api/task-matrices/[id]/route.ts` — GET windowed projection.
- `src/app/api/task-matrices/[id]/groups/route.ts` — POST new group.
- `src/app/api/task-matrices/[id]/rows/route.ts` — POST new row(s).
- `src/app/api/task-matrices/[id]/validate/route.ts` — POST pre-submit validation.
- `src/app/api/matrix-rows/[id]/route.ts` — PATCH row metadata/order.
- `src/app/api/matrix-rows/[id]/slots/route.ts` — PATCH three-slot (result/process).
- `src/app/api/matrix-rows/[id]/metrics/[dimensionKey]/route.ts` — PATCH raw metric + server recompute.
- `src/app/(main)/tasks/[id]/components/matrix-input-view.tsx` — root matrix input component.
- `src/app/(main)/tasks/[id]/components/matrix-virtual-grid.tsx` — desktop virtualized grid.
- `src/app/(main)/tasks/[id]/components/matrix-mobile-cards.tsx` — mobile card view (first-class).
- `src/app/(main)/tasks/[id]/components/matrix-cell.tsx` — three-slot + metric cells.
- `src/app/(main)/tasks/[id]/components/matrix-toolbar.tsx` — sticky toolbar + group-add.
- `src/app/(main)/tasks/[id]/components/record-context-bar.tsx` — single/double-row fixed context.
- `src/storage/database/shared/migrations/0002_matrix_input_tables.sql` — new tables + ALTERs.
- `scripts/check-matrix-formula-engine.ts` — contract runner for formula golden samples.
- `scripts/seed-matrix-juicer-schema.ts` — seed the juicer schema (run once after migration).

**Modified files:**
- `src/storage/database/shared/schema.ts` — add `matrixSchemas`, `matrixSchemaVersions`, `matrixDimensionBindings`, `matrixFormulaDefinitions`, `matrixCalculationRuns`; extend `comparisonAssemblies` with `matrixRole`/`matrixSchemaVersionId`/`comparabilityStatus`; extend `metricEvaluations` typed-value columns.
- `src/app/(main)/tasks/[id]/page.tsx` — extend `activeTab` union with `'matrix'`; render `<MatrixInputView>`; include in `materialRail` condition.
- `src/app/(main)/tasks/[id]/components/report-authoring-shell.tsx` — extend `TaskTabKey`; splice matrix nav item when an instance exists.
- `package.json` — add `check:matrix-formula` and `seed:matrix-schema` scripts.
- `src/lib/server/report-detail.ts` — include matrix projection in report snapshot when assembly has `matrix_role='data_matrix'`.

---

### Task 1: DSL Formula Engine — Tokenizer & Parser

**Files:**
- Create: `src/lib/matrix/formula-engine.ts`
- Create: `src/lib/matrix/formula-engine.test.ts`
- Create: `scripts/check-matrix-formula-engine.ts`
- Modify: `package.json`

This task delivers the parser alone (no evaluator yet). Pure functions, trivially testable.

- [ ] **Step 1: Write the failing test**

Create `src/lib/matrix/formula-engine.test.ts`:

```ts
import assert from 'node:assert/strict';
import { tokenize, parse, parseErrorToCode } from './formula-engine';

// Self metric reference
{
  const tokens = tokenize('SELF("juice_weight")');
  assert.equal(tokens.length, 1);
  assert.equal(tokens[0].kind, 'self');
  assert.equal(tokens[0].metricKey, 'juice_weight');
}

// Arithmetic with ROUND
{
  const ast = parse('ROUND(SELF("juice_weight") / SELF("ingredient_weight"), 4)');
  assert.equal(ast.kind, 'call');
  if (ast.kind === 'call') {
    assert.equal(ast.fn, 'ROUND');
    assert.equal(ast.args.length, 2);
  }
}

// Reject A1 coordinate
{
  try {
    parse('=H3/G3');
    assert.fail('should have thrown');
  } catch (e) {
    assert.equal(parseErrorToCode(e), 'MATRIX_FORMULA_PARSE_ERROR');
  }
}

// Reject forbidden function
{
  try {
    parse('INDIRECT("H" & ROW())');
    assert.fail('should have thrown');
  } catch (e) {
    assert.equal(parseErrorToCode(e), 'MATRIX_FORMULA_PARSE_ERROR');
  }
}

console.log('formula-engine parser tests passed');
```

- [ ] **Step 2: Run the failing test**

Run: `pnpm tsx src/lib/matrix/formula-engine.test.ts`
Expected: FAIL — module `./formula-engine` not found.

- [ ] **Step 3: Implement tokenizer + parser**

Create `src/lib/matrix/formula-engine.ts`. Implement:
- `type Token` union: `{ kind: 'self'; metricKey: string }`, `{ kind: 'ref'; subjectKey: string; metricKey: string }`, `{ kind: 'group_agg'; fn: string; metricKey: string }`, `{ kind: 'number'; value: number }`, `{ kind: 'string'; value: string }`, `{ kind: 'ident'; name: string }`, `{ kind: 'op'; symbol: string }`, `{ kind: 'lparen' }`, `{ kind: 'rparen' }`, `{ kind: 'comma' }`.
- `function tokenize(src: string): Token[]` — recognize `SELF("...")`, `REF(subject_key="...", metric="...")`, `GROUP_AVG(metric="...")` / `GROUP_SUM` etc., string literals, numbers, identifiers against a `WHITELIST_FUNCTIONS` set (`IF COALESCE ROUND MIN MAX ABS SUM AVG UNIT TO_SECONDS` + the group aggregates), operators `+ - * / ^ > >= < <= == !=`, parens, comma. Anything else (including `=`, leading `&`, `INDIRECT`, `OFFSET`, `WEBSERVICE`, `VBA`, `MACRO`) throws `MatrixFormulaError('MATRIX_FORMULA_PARSE_ERROR', detail)`.
- `type Ast` union: `{ kind: 'self'; metricKey }`, `{ kind: 'ref'; subjectKey; metricKey }`, `{ kind: 'group_agg'; fn; metricKey }`, `{ kind: 'num'; value }`, `{ kind: 'str'; value }`, `{ kind: 'binop'; op; left; right }`, `{ kind: 'call'; fn; args: Ast[] }`.
- `function parse(src: string): Ast` — recursive-descent: expression → comparison → additive → multiplicative → power → unary → primary. Primary handles `SELF(...)`, `REF(...)`, `GROUP_*(...)`, number, string, ident-call, parenthesized.
- `class MatrixFormulaError extends Error` with `code` property; `function parseErrorToCode(e: unknown): string | null`.

No evaluator yet — `evaluate` will come in Task 2.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm tsx src/lib/matrix/formula-engine.test.ts`
Expected: PASS, prints `formula-engine parser tests passed`.

- [ ] **Step 5: Add contract runner script**

Create `scripts/check-matrix-formula-engine.ts`:

```ts
import assert from 'node:assert/strict';
import { tokenize, parse, parseErrorToCode } from '../src/lib/matrix/formula-engine';

// Re-run the same golden cases as the .test.ts, plus reject-offset and reject-webservice.
assert.equal(parseErrorToCode(catcher(() => parse('=OFFSET(A1,1,1)'))), 'MATRIX_FORMULA_PARSE_ERROR');
assert.equal(parseErrorToCode(catcher(() => parse('WEBSERVICE("http://x")'))), 'MATRIX_FORMULA_PARSE_ERROR');
function catcher(fn: () => unknown) { try { fn(); return null; } catch (e) { return e; } }
console.log('contract ok');
```

Add to `package.json` `scripts`:
```json
"check:matrix-formula": "tsx scripts/check-matrix-formula-engine.ts"
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/matrix/formula-engine.ts src/lib/matrix/formula-engine.test.ts scripts/check-matrix-formula-engine.ts package.json
git commit -m "feat(matrix): add DSL formula tokenizer and parser"
```

---

### Task 2: DSL Formula Engine — Evaluator & Dependency Graph

**Files:**
- Modify: `src/lib/matrix/formula-engine.ts`
- Modify: `src/lib/matrix/formula-engine.test.ts`
- Modify: `scripts/check-matrix-formula-engine.ts`

Add the evaluator that the frontend and backend both call. Define the runtime value model and the typed error codes the spec requires.

- [ ] **Step 1: Write the failing test (append to formula-engine.test.ts)**

Append before the final `console.log`:

```ts
import { evaluate, buildDependencyGraph, compileFormula } from './formula-engine';

// Happy path: juice_yield
{
  const compiled = compileFormula('ROUND(SELF("juice_weight") / SELF("ingredient_weight"), 4)');
  const result = evaluate(compiled, {
    self: (k) => k === 'juice_weight' ? { value: 558.7, unit: 'g' } : k === 'ingredient_weight' ? { value: 1193.1, unit: 'g' } : null,
    refSameGroup: () => null,
    groupAggregate: () => null,
  });
  assert.ok(result.ok);
  if (result.ok) assert.ok(Math.abs(result.value - 0.4683) < 1e-6);
}

// Divide by zero
{
  const compiled = compileFormula('SELF("a") / SELF("b")');
  const result = evaluate(compiled, {
    self: (k) => k === 'a' ? { value: 1, unit: 'g' } : k === 'b' ? { value: 0, unit: 'g' } : null,
    refSameGroup: () => null, groupAggregate: () => null,
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, 'MATRIX_CALC_DIVIDE_BY_ZERO');
}

// Missing input
{
  const compiled = compileFormula('SELF("missing")');
  const result = evaluate(compiled, { self: () => null, refSameGroup: () => null, groupAggregate: () => null });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, 'MATRIX_CALC_INPUT_MISSING');
}

// Dependency graph
{
  const deps = buildDependencyGraph('ROUND(SELF("juice_weight") / SELF("ingredient_weight"), 4)');
  assert.deepEqual(deps.sort(), ['ingredient_weight', 'juice_weight']);
}
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm tsx src/lib/matrix/formula-engine.test.ts`
Expected: FAIL — `evaluate`, `buildDependencyGraph`, `compileFormula` not exported.

- [ ] **Step 3: Implement evaluator**

In `src/lib/matrix/formula-engine.ts` add:
- `type MetricValue = { value: number; unit: string } | { durationMs: number } | { text: string } | null`.
- `type EvalContext = { self: (k: string) => MetricValue; refSameGroup: (subjectKey: string, k: string) => MetricValue; groupAggregate: (fn: string, k: string) => MetricValue | null }`.
- `type CompiledFormula = { ast: Ast; dependencies: string[] }`.
- `function compileFormula(src: string): CompiledFormula` — parse + walk AST collecting `SELF`/`REF`/`GROUP_*` referenced keys into `dependencies`.
- `function buildDependencyGraph(src: string): string[]` — same dependency walk, exposed for schema-publish validation.
- `type EvalResult = { ok: true; value: number } | { ok: false; code: string; detail?: string }`.
- `function evaluate(compiled: CompiledFormula, ctx: EvalContext): EvalResult` — recursive AST eval; on `self(k)` returning null → `MATRIX_CALC_INPUT_MISSING`; division by exact zero → `MATRIX_CALC_DIVIDE_BY_ZERO`; whitelist functions implemented: `ROUND, MIN, MAX, ABS, IF, COALESCE` (numbers only); `GROUP_AVG` etc. route through `ctx.groupAggregate`. Type errors (text in arithmetic) → `MATRIX_FORMULA_UNIT_MISMATCH`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm tsx src/lib/matrix/formula-engine.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/matrix/formula-engine.ts src/lib/matrix/formula-engine.test.ts scripts/check-matrix-formula-engine.ts
git commit -m "feat(matrix): add formula evaluator and dependency graph"
```

---

### Task 3: Database Migration — Matrix Tables & Typed Metric Values

**Files:**
- Create: `src/storage/database/shared/migrations/0002_matrix_input_tables.sql`
- Modify: `src/storage/database/shared/schema.ts`

- [ ] **Step 1: Write the migration SQL**

Create `src/storage/database/shared/migrations/0002_matrix_input_tables.sql`:

```sql
-- Matrix schema registry (admin-published, versioned, immutable once published)
CREATE TABLE IF NOT EXISTS matrix_schemas (
  id varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  schema_key varchar(100) NOT NULL UNIQUE,
  name varchar(200) NOT NULL,
  product_category varchar(100),
  experience_type_allowlist jsonb DEFAULT '[]',
  status varchar(20) NOT NULL DEFAULT 'draft',
  latest_published_version_id varchar(36),
  owner_id varchar(36) REFERENCES platform_users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS matrix_schema_versions (
  id varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  schema_id varchar(36) NOT NULL REFERENCES matrix_schemas(id) ON DELETE CASCADE,
  version_no integer NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'draft',
  schema_json jsonb NOT NULL,
  checksum varchar(80),
  published_at timestamptz,
  published_by varchar(36) REFERENCES platform_users(id) ON DELETE SET NULL,
  effective_from timestamptz,
  effective_to timestamptz,
  created_at timestamptz DEFAULT now(),
  UNIQUE (schema_id, version_no)
);

CREATE TABLE IF NOT EXISTS matrix_dimension_bindings (
  id varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  schema_version_id varchar(36) NOT NULL REFERENCES matrix_schema_versions(id) ON DELETE CASCADE,
  dimension_key varchar(100) NOT NULL,
  display_name varchar(200) NOT NULL,
  column_group varchar(20) NOT NULL,
  value_kind varchar(20) NOT NULL,
  unit_code varchar(40),
  metric_definition_id varchar(36) REFERENCES metric_definitions(id) ON DELETE SET NULL,
  required boolean DEFAULT false,
  editable boolean DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  display_format_json jsonb DEFAULT '{}',
  validation_rule_json jsonb DEFAULT '{}',
  UNIQUE (schema_version_id, dimension_key)
);

CREATE TABLE IF NOT EXISTS matrix_formula_definitions (
  id varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  schema_version_id varchar(36) NOT NULL REFERENCES matrix_schema_versions(id) ON DELETE CASCADE,
  output_dimension_key varchar(100) NOT NULL,
  formula_dsl text NOT NULL,
  compiled_ast jsonb,
  dependency_json jsonb,
  scope varchar(20) NOT NULL DEFAULT 'row',
  formula_version varchar(40) NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'draft',
  UNIQUE (schema_version_id, output_dimension_key)
);

CREATE TABLE IF NOT EXISTS matrix_calculation_runs (
  id varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  matrix_instance_id varchar(36) NOT NULL REFERENCES comparison_assemblies(id) ON DELETE CASCADE,
  trigger_type varchar(20) NOT NULL,
  input_version_hash varchar(80) NOT NULL,
  formula_version_hash varchar(80) NOT NULL,
  status varchar(20) NOT NULL,
  error_code varchar(60),
  error_detail_sanitized text,
  computed_at timestamptz DEFAULT now(),
  trace_id varchar(60)
);
CREATE INDEX IF NOT EXISTS matrix_calculation_runs_instance_idx ON matrix_calculation_runs(matrix_instance_id);

-- Mark comparison_assemblies that are data-matrix instances
ALTER TABLE comparison_assemblies
  ADD COLUMN IF NOT EXISTS matrix_schema_version_id varchar(36) REFERENCES matrix_schema_versions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS matrix_role varchar(20) DEFAULT 'comparison',
  ADD COLUMN IF NOT EXISTS comparability_status varchar(20) DEFAULT 'unknown';

-- Typed-value columns on metric_evaluations (raw + calculated)
ALTER TABLE metric_evaluations
  ADD COLUMN IF NOT EXISTS value_kind varchar(20),
  ADD COLUMN IF NOT EXISTS numeric_value numeric(18,6),
  ADD COLUMN IF NOT EXISTS text_value text,
  ADD COLUMN IF NOT EXISTS duration_ms bigint,
  ADD COLUMN IF NOT EXISTS unit_code varchar(40),
  ADD COLUMN IF NOT EXISTS input_state varchar(20) DEFAULT 'valid',
  ADD COLUMN IF NOT EXISTS calculation_mode varchar(20),
  ADD COLUMN IF NOT EXISTS formula_definition_id varchar(36),
  ADD COLUMN IF NOT EXISTS source_run_id varchar(36) REFERENCES matrix_calculation_runs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS error_code varchar(60),
  ADD COLUMN IF NOT EXISTS version integer DEFAULT 1;
```

- [ ] **Step 2: Add Drizzle schema definitions**

In `src/storage/database/shared/schema.ts`, after the `comparisonAiResults` block (around line 937), add `pgTable` definitions for `matrixSchemas`, `matrixSchemaVersions`, `matrixDimensionBindings`, `matrixFormulaDefinitions`, `matrixCalculationRuns` — column names matching the migration (camelCase TS aliases: e.g. `schemaKey`, `versionNo`, `dimensionKey`, `outputDimensionKey`, `formulaDsl`). Add new columns to `comparisonAssemblies` (`matrixSchemaVersionId`, `matrixRole: varchar('matrix_role').default('comparison').notNull()`, `comparabilityStatus`) and to `metricEvaluations` (`valueKind`, `numericValue: numeric('numeric_value', { precision: 18, scale: 6 })`, `textValue`, `durationMs: bigint('duration_ms', { mode: 'number' })`, `unitCode`, `inputState`, `calculationMode`, `formulaDefinitionId`, `sourceRunId`, `errorCode`, `version: integer('version').default(1)`).

- [ ] **Step 3: Type check**

Run: `pnpm ts-check`
Expected: PASS (no broken imports).

- [ ] **Step 4: Commit**

```bash
git add src/storage/database/shared/migrations/0002_matrix_input_tables.sql src/storage/database/shared/schema.ts
git commit -m "feat(matrix): add schema/instance/formula tables and typed metric values"
```

---

### Task 4: Schema Bootstrap & Seed Script (Juicer Aperture)

**Files:**
- Create: `src/lib/matrix/schema-bootstrap.ts`
- Create: `src/lib/matrix/types.ts`
- Create: `scripts/seed-matrix-juicer-schema.ts`
- Modify: `package.json`

Defines the canonical原汁机 schema used by all later acceptance tests, and provides a one-shot seeder.

- [ ] **Step 1: Define types**

Create `src/lib/matrix/types.ts`:

```ts
export type ValueKind = 'number' | 'duration' | 'text' | 'enum' | 'boolean';
export type ColumnGroup = 'observed' | 'calculated';

export interface DimensionBinding {
  dimensionKey: string;
  displayName: string;
  columnGroup: ColumnGroup;
  valueKind: ValueKind;
  unitCode?: string;
  metricDefinitionId?: string;
  required?: boolean;
  editable?: boolean;
  sortOrder: number;
  displayFormat?: { decimals?: number; durationFormat?: 'mmss' | 'mm'); };
  validation?: { min?: number; max?: number; enumValues?: string[] };
}

export interface FormulaDefinition {
  outputDimensionKey: string;
  formulaDsl: string;
  scope: 'row' | 'group';
  formulaVersion: string;
}

export interface MatrixSchemaJson {
  schemaKey: string;
  version: number;
  title: string;
  axes: Array<{ axisCode: string; axisRole: 'group' | 'row'; levels: Array<{ levelNo: number; label: string; required?: boolean }> }>;
  dimensions: DimensionBinding[];
  formulas: FormulaDefinition[];
}
```

- [ ] **Step 2: Define the juicer schema constant**

Create `src/lib/matrix/schema-bootstrap.ts` exporting `JUICER_APERTURE_SCHEMA: MatrixSchemaJson` with:
- `schemaKey: 'juicer_aperture_comparison'`, `version: 1`, `title: '原汁机口径 × 食材性能对比'`.
- axes: scenario (group, level 1 食材/功能), subject (row, levels: 1 产品, 2 口径规则, 3 可选细项 required:false).
- dimensions (observed): `duration` (duration, 'mmss', required), `ingredient_weight` (number, g, required), `juice_weight` (number, g, required), `pulp_weight` (number, g), `filtered_juice_weight` (number, g), `pulp_in_juice_weight` (number, g).
- dimensions (calculated, editable:false): `juice_yield` (%), `pure_juice_yield` (%), `pulp_ratio` (%).
- formulas:
  - `juice_yield = ROUND(SELF("juice_weight") / SELF("ingredient_weight"), 4)`
  - `pure_juice_yield = ROUND(SELF("filtered_juice_weight") / SELF("juice_weight"), 4)`
  - `pulp_ratio = ROUND(SELF("pulp_in_juice_weight") / SELF("juice_weight"), 4)`

- [ ] **Step 3: Write the seed script**

Create `scripts/seed-matrix-juicer-schema.ts` that:
1. Connects via `getSupabaseClient` using service-role credentials from env (the same way `scripts/seed-dictionaries.ts` does — read it first and mirror its auth pattern).
2. Idempotently inserts `matrix_schemas` (schema_key=`juicer_aperture_comparison`, status=`active`) if absent.
3. Creates a `matrix_schema_versions` row (version_no=1, status=`published`, schema_json=JUICER_APERTURE_SCHEMA), computing `checksum = sha256(JSON.stringify(schema_json)).slice(0,16)`.
4. Compiles each formula via `compileFormula` from Task 2 and inserts `matrix_formula_definitions` with `compiled_ast` + `dependency_json` + status=`published`.
5. Inserts one `matrix_dimension_bindings` row per dimension.
6. Updates `matrix_schemas.latest_published_version_id`.

Add to `package.json`:
```json
"seed:matrix-schema": "tsx scripts/seed-matrix-juicer-schema.ts"
```

- [ ] **Step 4: Verify against running DB (skip if no local DB)**

If a local Postgres is available, run the migration then the seed:
```bash
psql "$DATABASE_URL" -f src/storage/database/shared/migrations/0002_matrix_input_tables.sql
pnpm seed:matrix-schema
```
Expected: one schema, one version, three formulas, nine dimension bindings. If no DB, verify `pnpm ts-check` passes and `compileFormula` accepts all three formulas in a quick inline `pnpm tsx -e "import('./src/lib/matrix/schema-bootstrap').then(m => import('./src/lib/matrix/formula-engine').then(fe => { m.JUICER_APERTURE_SCHEMA.formulas.forEach(f => fe.compileFormula(f.formulaDsl)); console.log('ok'); }))"`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/matrix/types.ts src/lib/matrix/schema-bootstrap.ts scripts/seed-matrix-juicer-schema.ts package.json
git commit -m "feat(matrix): add juicer aperture schema bootstrap and seed script"
```

---

### Task 5: Matrix Read Projection Builder

**Files:**
- Create: `src/lib/matrix/projection.ts`

The server-side aggregator that the GET task-matrix endpoint and the report Aggregator both consume.

- [ ] **Step 1: Write the failing inline assertions**

Create `src/lib/matrix/projection.test.ts` (sibling test pattern) that mocks a supabase-like client returning fixtures and asserts the projection DTO shape. Because the function takes a `client`-like reader, the test injects a stub:

```ts
import assert from 'node:assert/strict';
import { buildMatrixReadProjection } from './projection';

const stubClient = {
  async from(table: string) {
    const data: Record<string, any[]> = {
      comparison_assemblies: [{ id: 'a1', matrix_role: 'data_matrix', matrix_schema_version_id: 'sv1', name: '原汁机' }],
      matrix_schema_versions: [{ id: 'sv1', schema_id: 's1', version_no: 1, status: 'published', schema_json: { title: '原汁机口径 × 食材性能对比', axes: [], dimensions: [], formulas: [] } }],
      comparison_item_nodes: [
        { id: 'g1', assembly_id: 'a1', parent_id: null, node_type: 'section', node_label: '胡萝卜', sort_order: 0, depth: 0 },
        { id: 'r1', assembly_id: 'a1', parent_id: 'g1', node_type: 'item', node_label: '160mm口径', sort_order: 0, depth: 1, config: { subject_key: 'aperture_160' } },
      ],
      metric_evaluations: [
        { cell_id: 'r1', metric_key: 'juice_weight', numeric_value: 558.7, unit_code: 'g', value_kind: 'number', calculation_mode: 'manual', version: 1 },
      ],
    };
    return {
      select() { return this; },
      eq(_col: string, _val: string) { return this; },
      async maybeSingle() { return { data: data[table]?.[0] ?? null, error: null }; },
      async then() {},
    };
  },
};
```
(Adapt as needed to match the actual chain shape used in `src/app/api/comparison-cells/[id]/route.ts`.)

Then assert: `buildMatrixReadProjection(stubClient as any, 'a1')` returns `{ matrixId, schema, groups: [{ id, label, rows: [{ id, subject, metrics: { juice_weight: {...} } }] }] }`.

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm tsx src/lib/matrix/projection.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement projection**

Create `src/lib/matrix/projection.ts` exporting:

```ts
export interface MatrixReadProjection {
  matrixId: string;
  taskId?: string;
  schema: { key: string; version: number; name: string; dimensions: DimensionBinding[]; formulas: FormulaDefinition[] };
  permissions: { canEditRows: boolean; canEditObservedMetrics: boolean; canEditFormula: boolean };
  viewport: { totalGroups: number; totalRows: number };
  groups: Array<{
    id: string; label: string; conditionSummary?: string;
    rows: Array<{
      id: string; recordItemId?: string; version: number;
      subject: { key: string; label: string };
      slots: { result: { status?: string; summary?: string }; process: { note?: string }; issues: { count: number; severitySummary: string[] } };
      metrics: Record<string, { state: string; value?: number; durationMs?: number; text?: string; unit?: string; display?: string; formulaVersion?: string; errorCode?: string }>;
      evidence: { primaryCount: number; previewIds: string[] };
    }>;
  }>;
  calculation: { status: string; lastRunId?: string };
  version: number;
}

export async function buildMatrixReadProjection(client: any, assemblyId: string, options?: { userId?: string }): Promise<MatrixReadProjection>;
```

Implementation:
1. `client.from('comparison_assemblies').select('*').eq('id', assemblyId).maybeSingle()` → must be `matrix_role='data_matrix'`.
2. Fetch the bound `matrix_schema_versions` row + its `matrix_dimension_bindings` + `matrix_formula_definitions`.
3. Fetch `comparison_item_nodes` where `assembly_id=assemblyId` ordered by `sort_order`; build the section→item tree.
4. For each row node, fetch `metric_evaluations` where `cell_id = item_node_id` (the existing convention uses cell_id, and for matrix rows the "cell" is the row node id — document this in a top-of-file comment). Map each evaluation to the metrics record keyed by `metric_key`.
5. Fetch issue counts via `issues` where the matching record/task — for first version, count `issues` joined to the record the row binds to (if `recordItemId` is set on the node config). If binding is not yet wired, return `count: 0` and TODO comment.
6. Fetch evidence previews via `materials` where `comparison_cell_id = item_node_id`, role `cell_primary`, ordered by `media_display_order`, limit 3.
7. Return the DTO.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm tsx src/lib/matrix/projection.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/matrix/projection.ts src/lib/matrix/projection.test.ts
git commit -m "feat(matrix): add matrix read projection builder"
```

---

### Task 6: API — Apply Schema to Task (Create Instance)

**Files:**
- Create: `src/app/api/tasks/[id]/matrices/route.ts`

- [ ] **Step 1: Implement GET (list task's matrix instances)**

```ts
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { canAccessTask, isAuthResponse, requireUser } from '@/lib/server/auth';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: taskId } = await params;
  const client = getSupabaseClient();
  const user = await requireUser(request, client);
  if (isAuthResponse(user)) return user;
  if (!(await canAccessTask(client, user, taskId))) return NextResponse.json({ code: 1, message: '无权限' }, { status: 403 });
  const { data, error } = await client.from('comparison_assemblies')
    .select('id,name,matrix_role,matrix_schema_version_id,status,comparability_status,created_at')
    .eq('source_task_ids', JSON.stringify([taskId]))  // task binding lives in source_task_ids jsonb
    .or maybe a task_id column — verify pattern in comparison-assemblies usage first
    .order('created_at', { ascending: false });
  if (error) return NextResponse.json({ code: 1, message: error.message }, { status: 500 });
  return NextResponse.json({ code: 0, message: 'success', data });
}
```

**Note for implementer:** before finalizing the `eq` filter, read `src/app/api/tasks/[id]/comparison/init/route.ts` to confirm exactly how the existing code links an assembly to a task (it may use a dedicated column rather than `source_task_ids`). Match that pattern.

- [ ] **Step 2: Implement POST (apply schema → create instance)**

POST body: `{ schemaVersionId: string }`. Steps:
1. Auth + `canAccessTask`.
2. Fetch the `matrix_schema_versions` row; assert `status='published'`.
3. Insert `comparison_assemblies` with `matrix_role='data_matrix'`, `matrix_schema_version_id`, `assembly_type='task_comparison'`, `source_type='manual'`, `status='draft'`, name = task name + ' 数据矩阵', `source_task_ids=[taskId]`, `created_by=user.id`.
4. Insert one root `comparison_item_nodes` row is NOT needed — groups will be added by the user; but you may seed an empty summary node. For first version, do not pre-create groups.
5. Audit log to `security_audit_logs` (action `task_matrix.applied`, object_type `comparison_assembly`).
6. Return `{ code: 0, data: { assemblyId } }`.

- [ ] **Step 3: Type check**

Run: `pnpm ts-check`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/tasks/[id]/matrices/route.ts
git commit -m "feat(matrix): add apply-schema-to-task API"
```

---

### Task 7: API — Windowed Projection & Group/Row CRUD

**Files:**
- Create: `src/app/api/task-matrices/[id]/route.ts`
- Create: `src/app/api/task-matrices/[id]/groups/route.ts`
- Create: `src/app/api/task-matrices/[id]/rows/route.ts`
- Create: `src/app/api/task-matrices/[id]/validate/route.ts`
- Create: `src/app/api/matrix-rows/[id]/route.ts`
- Create: `src/app/api/matrix-rows/[id]/slots/route.ts`

- [ ] **Step 1: Implement `GET /api/task-matrices/[id]`**

Calls `buildMatrixReadProjection(client, id, { userId: user.id })` and returns `{ code: 0, data: projection }`. Guard: `canAccessAssembly(client, user, id)`. On assembly not being a `data_matrix` (matrix_role mismatch), return 404.

- [ ] **Step 2: Implement `POST /api/task-matrices/[id]/groups`**

Body: `{ label: string; conditionSummary?: string }`. Insert a `comparison_item_nodes` row with `node_type='section'`, `parent_id=null`, `assembly_id=id`, `node_label=label`, `config={ conditionSummary }`, `depth=0`, `sort_order` = max existing section sort + 1. Audit. Return `{ code: 0, data: { groupId } }`.

- [ ] **Step 3: Implement `POST /api/task-matrices/[id]/rows`**

Body: `{ groupId: string; subjectKey: string; subjectLabel: string; testObjectId?: string; level3Key?: string; level3Label?: string }`. Steps:
1. Insert a `comparison_item_nodes` row `node_type='item'`, `parent_id=groupId`, `assembly_id=id`, `node_label=subjectLabel`, `depth=1` (compute from parent), `config={ subject_key: subjectKey, test_object_id: testObjectId, level3: { key: level3Key, label: level3Label } }`, `sort_order` = max sibling + 1.
2. Optionally create a `check_records` row bound to this node (set the row's record reference in node config under `config.record_item_id`). For first version, defer record binding to slot write — just store the node.
3. Audit. Return `{ code: 0, data: { rowId } }`.

- [ ] **Step 4: Implement `PATCH /api/matrix-rows/[id]`**

Body: `{ subjectLabel?: string; subjectKey?: string; sortOrder?: number }`. Update the `comparison_item_nodes` row. Validate `node_type IN ('item','condition')`. Audit.

- [ ] **Step 5: Implement `PATCH /api/matrix-rows/[id]/slots`**

Body: `{ result?: { status?: string; summary?: string }; process?: { note?: string }; version: number }`. The row maps to a `check_records` row. Steps:
1. Find the `comparison_item_nodes` row; from `config.record_item_id` find the bound record (if not yet bound, create a `check_records` row now and store its id back into node config).
2. Update `check_records.result_status`, `check_records.summary` (or equivalent existing columns — verify column names in schema.ts for `checkRecords`), and a new `process_note` column (if not present, store in the node's `config.process_note`).
3. Optimistic-lock on `version` (use `check_records.updated_at` or a version column if present; if none, compare `updated_at`).
4. Audit `matrix_slot.updated`. Return `{ code: 0, data: { version: newVersion } }`.

**Note:** read `src/storage/database/shared/schema.ts` `checkRecords` definition before writing this to use the real column names.

- [ ] **Step 6: Implement `POST /api/task-matrices/[id]/validate`**

Iterate groups/rows, run the spec §12.1 blocking checks: required observed dimensions present, formula evaluations not in error state, threshold anomalies have process notes, archived rows not referenced. Return `{ code: 0, data: { blocking: [...], warnings: [...] } }`.

- [ ] **Step 7: Type check**

Run: `pnpm ts-check`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/app/api/task-matrices src/app/api/matrix-rows
git commit -m "feat(matrix): add projection, group/row CRUD, slots, validate APIs"
```

---

### Task 8: API — Metric Write with Server-Side Recompute

**Files:**
- Create: `src/app/api/matrix-rows/[id]/metrics/[dimensionKey]/route.ts`
- Create: `src/lib/matrix/recompute.ts`

This is the heart of the optimistic+authoritative strategy.

- [ ] **Step 1: Implement `recomputeAffected` helper**

Create `src/lib/matrix/recompute.ts` exporting:

```ts
export interface RecomputeInput {
  client: any;
  assemblyId: string;
  schemaVersionId: string;
  triggeredRowId: string;
  triggeredDimensionKey: string;
  traceId: string;
}

export interface RecomputeResult {
  runId: string;
  status: 'succeeded' | 'failed' | 'partial';
  updated: Array<{ rowId: string; metricKey: string; value?: number; errorCode?: string }>;
  inputVersionHash: string;
  formulaVersionHash: string;
}

export async function recomputeAffected(input: RecomputeInput): Promise<RecomputeResult>;
```

Logic:
1. Load all `matrix_formula_definitions` for the schema version; build reverse map `dependency → [output formulas]`.
2. Load all `metric_evaluations` for the assembly's rows where `metric_key` is in the affected dependency closure (transitive).
3. Compute `inputVersionHash = sha256(sorted((rowId, metricKey, numeric_value|duration_ms|text_value, version).join())`.
4. Compute `formulaVersionHash = sha256(sorted(formulas.map(f => `${f.output_dimension_key}@${f.formula_version}`)))`.
5. Insert a `matrix_calculation_runs` row (status=`succeeded` placeholder, trigger_type=`api_save`).
6. For each affected (row, output formula): build an `EvalContext` where `self(k)` reads that row's `metric_evaluations`, `refSameGroup`/`groupAggregate` read sibling rows in the same `parent_id`. Call `evaluate(compiled, ctx)`.
7. On success, upsert `metric_evaluations` (cell_id=rowId, metric_key=output, calculation_mode='calculated', numeric_value, source_run_id=runId, formula_definition_id, version=prev+1, input_state='valid', error_code=null). On failure, upsert with `input_state='calculation_failed'`, `error_code`.
8. Update the run row with final status. Return the result.

- [ ] **Step 2: Implement PATCH metric endpoint**

`src/app/api/matrix-rows/[id]/metrics/[dimensionKey]/route.ts`:

```ts
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string; dimensionKey: string }> }) {
  const { id: rowId, dimensionKey } = await params;
  const client = getSupabaseClient();
  const user = await requireUser(request, client);
  if (isAuthResponse(user)) return user;
  // resolve assembly + canAccessAssembly
  const body = await request.json();
  // 1. Validate the dimension is observed + editable in the bound schema version.
  // 2. Optimistic-lock: read current metric_evaluations version.
  // 3. Upsert metric_evaluations (cell_id=rowId, metric_key=dimensionKey, calculation_mode='manual',
  //    numeric_value|duration_ms|text_value per valueKind, unit_code, input_state, version=prev+1).
  // 4. traceId from request header 'x-trace-id' or generated.
  // 5. const result = await recomputeAffected({ client, assemblyId, schemaVersionId, triggeredRowId: rowId, triggeredDimensionKey: dimensionKey, traceId });
  // 6. Audit matrix_metric.updated.
  // 7. Return { code:0, data: { metricEvaluationId, version: newVersion, authoritativeCalculations: result.updated, calculationRunId: result.runId } }.
}
```

Idempotency: honor `Idempotency-Key` header — before writing, check `matrix_calculation_runs` or a lightweight idempotency check; for first version, document that the optimistic-lock version prevents double-apply.

- [ ] **Step 3: Write the integration test**

Create `src/lib/matrix/recompute.test.ts` that uses a stub client (similar to Task 5's pattern) seeded with juice_weight=558.7 / ingredient_weight=1193.1, calls `recomputeAffected`, and asserts the produced `updated` list contains `juice_yield ≈ 0.4683` and that a `matrix_calculation_runs` insert was attempted.

- [ ] **Step 4: Run tests**

Run: `pnpm tsx src/lib/matrix/recompute.test.ts`
Expected: PASS.

- [ ] **Step 5: Type check**

Run: `pnpm ts-check`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/matrix/recompute.ts src/lib/matrix/recompute.test.ts src/app/api/matrix-rows/[id]/metrics
git commit -m "feat(matrix): add metric write with server-side recompute"
```

---

### Task 9: Frontend Tab Wiring

**Files:**
- Modify: `src/app/(main)/tasks/[id]/components/report-authoring-shell.tsx`
- Modify: `src/app/(main)/tasks/[id]/page.tsx`

- [ ] **Step 1: Extend `TaskTabKey`**

In `report-authoring-shell.tsx` line 19, change:
```ts
type TaskTabKey = 'agent' | 'info' | 'materials' | 'senses' | 'functions' | 'comparison';
```
to add `| 'matrix'`.

- [ ] **Step 2: Splice the matrix nav item**

Following the existing `comparison` splice pattern (lines 50-56), add a matrix entry. The matrix nav item should only appear when the task has a data-matrix instance. Expose a prop `hasMatrixInstance: boolean` on `ReportAuthoringShell` (default false); when true, splice `{ key: 'matrix', label: '数据矩阵', icon: Table }` (import `Table` from `lucide-react`) after the comparison entry.

- [ ] **Step 3: Extend `page.tsx` state + URL guard**

In `page.tsx`:
- Line 166: extend the `useState` union to include `'matrix'`.
- Line 227 (searchParams guard): add `'matrix'` to the allowed literal list.
- After loading the task, fetch `GET /api/tasks/${id}/matrices` and set a `hasMatrixInstance` state. Pass it to `<ReportAuthoringShell hasMatrixInstance={...} />`.
- Add the render branch near line 445:
```tsx
{activeTab === 'matrix' && (
  <MatrixInputView taskId={id} taskName={task.task_name} />
)}
```
- Extend the `materialRail` conditional (line 417) to include `activeTab === 'matrix'`.

- [ ] **Step 4: Type check**

Run: `pnpm ts-check`
Expected: PASS (the `MatrixInputView` import will fail until Task 10; create a minimal stub component now in `src/app/(main)/tasks/[id]/components/matrix-input-view.tsx` exporting `export function MatrixInputView({ taskId, taskName }: { taskId: string; taskName: string }) { return <div className="p-4">Matrix (TODO)</div>; }` to unblock the type check, then replace it fully in Task 10).

- [ ] **Step 5: Commit**

```bash
git add src/app/(main)/tasks/[id]/components/report-authoring-shell.tsx src/app/(main)/tasks/[id]/page.tsx src/app/(main)/tasks/[id]/components/matrix-input-view.tsx
git commit -m "feat(matrix): wire matrix tab into task workbench"
```

---

### Task 10: Matrix Input View — Desktop Grid

**Files:**
- Create: `src/app/(main)/tasks/[id]/components/matrix-input-view.tsx` (replace stub)
- Create: `src/app/(main)/tasks/[id]/components/matrix-virtual-grid.tsx`
- Create: `src/app/(main)/tasks/[id]/components/matrix-cell.tsx`
- Create: `src/app/(main)/tasks/[id]/components/matrix-toolbar.tsx`
- Create: `src/app/(main)/tasks/[id]/components/record-context-bar.tsx`

This task delivers the desktop three-slot grid. Mobile is Task 12.

- [ ] **Step 1: Implement `MatrixInputView` root**

Replaces the stub. Responsibilities:
- On mount, `GET /api/tasks/${taskId}/matrices`. If empty, render an "初始化数据矩阵" empty-state card that lets the user pick from available schemas (`GET /api/matrix-schemas`) and POST apply.
- Else take the first instance id and `GET /api/task-matrices/${id}` → store projection in `useState`.
- Render `<RecordContextBar>`, `<MatrixToolbar>`, then `<MatrixVirtualGrid>` (desktop) or `<MatrixMobileCards>` (mobile, detected via a `useIsMobile` hook — check if one exists in `src/lib/utils.ts` or `src/hooks/`; if not, use a `useMediaQuery`).
- Compute optimistic calculations client-side using `compileFormula` + `evaluate` from `src/lib/matrix/formula-engine` whenever the user edits a raw cell, showing the乐观 value with a small "乐观"角标; clear it when the server response arrives.

- [ ] **Step 2: Implement `RecordContextBar`**

Single/double-row sticky bar under the global header. Shows current object/食材/条件/类目 derived from the currently focused row + group. No material panel — per spec §27.3 UI-04. Use `text-sm text-muted-foreground` and `·` separators.

- [ ] **Step 3: Implement `MatrixToolbar`**

Sticky-left "新增大类" button (per UI-02 — must remain visible during horizontal scroll, so place it in a left sticky rail, not the scrollable header), filter bar, calculation status badge, column chooser (checkbox list of dimensions to show/hide).

- [ ] **Step 4: Implement `MatrixVirtualGrid`**

Render an HTML `<Table table-fixed>` (mirror the structure used by `comparison-workspace.tsx` for consistency). Columns in order: [sticky left action rail] [sticky hierarchy columns: 一级分组 / 二级规格 / 三级细项] [observed dimension columns] [calculated dimension columns] [效果/证据 columns]. Use `position: sticky; left: 0` on the hierarchy columns. Rows iterate `projection.groups[].rows[]`. Group bands via the section node. No row virtualization library for first version (the spec targets 50 groups × 10 rows = 500 rows; if rendering is slow, virtualize in a follow-up — document this in a comment).

- [ ] **Step 5: Implement `MatrixCell`**

Three sub-cells per row + metric cells:
- `ResultSlotCell`: a `<Select>` for status (达标/待观察/不达标/不适用) + a `<Textarea>` for summary. Saves via `PATCH /api/matrix-rows/[id]/slots` (800ms debounce).
- `ProcessSlotCell`: a `<Textarea>` for process note (controlled Markdown — plain textarea for first version).
- `IssueSlotCell`: shows count + severity color dot; clicking opens an issue-create dialog that prefills task/record/dimension.
- `ObservedMetricCell`: number/duration/text input per `valueKind`. On change, compute optimistic calculations locally, debounce 800ms, PATCH metric endpoint, then replace optimistic with authoritative.
- `CalculatedMetricCell`: read-only display with optional "乐观"角标 while pending; on error shows the `errorCode` mapped to Chinese text.
- `EvidenceStrip`: reuse `<MaterialPicker comparisonCellId={rowId} ... />` (it already supports `comparisonCellId` per Task 8 of the exploration). Show 0-3 thumbnails.

- [ ] **Step 6: Verify in browser**

Run: `pnpm dev`. Open a task with a seeded matrix instance. Confirm: groups render, editing an observed cell shows乐观 calculation, after save the authoritative value replaces it, three slots save, the sticky left "新增大类" stays visible during horizontal scroll.

- [ ] **Step 7: Type check + lint**

Run: `pnpm ts-check && pnpm lint`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/app/(main)/tasks/[id]/components/matrix-input-view.tsx src/app/(main)/tasks/[id]/components/matrix-virtual-grid.tsx src/app/(main)/tasks/[id]/components/matrix-cell.tsx src/app/(main)/tasks/[id]/components/matrix-toolbar.tsx src/app/(main)/tasks/[id]/components/record-context-bar.tsx
git commit -m "feat(matrix): add desktop three-slot input grid"
```

---

### Task 11: Mobile Card View (First-Class Delivery)

**Files:**
- Create: `src/app/(main)/tasks/[id]/components/matrix-mobile-cards.tsx`
- Modify: `src/app/(main)/tasks/[id]/components/matrix-input-view.tsx` (wire mobile branch)

Per spec §8.3, mobile uses group cards + dimension drawer rather than a horizontal table. This is in the first version per the user's confirmed scope.

- [ ] **Step 1: Implement `MatrixMobileCards`**

Vertical scrolling list of group cards. Each group card shows its label + condition summary, then one sub-card per row showing: subject label, the three slots (效果结论/过程记录/关联问题) at top, then a collapsible "原始 | 计算" toggle for metrics, a camera button (reuses `<MediaCaptureDialog mode="image">`), and an "展开全部维度" link that opens a `<Sheet>` (right-side drawer from the bottom on mobile) listing all dimensions.

Same DTO, same write APIs, same debounce, same optimistic calc as desktop. Reuse `MatrixCell`'s sub-cells where possible (extract `ResultSlotCell`/`ProcessSlotCell`/`ObservedMetricCell` into shared imports if not already).

- [ ] **Step 2: Wire the mobile branch in `MatrixInputView`**

Use the existing mobile detection (find the `useIsMobile` hook or replicate the pattern from `navigation.tsx` which has desktop sidebar + mobile bottom tabs). Render `<MatrixMobileCards>` when mobile, `<MatrixVirtualGrid>` otherwise.

- [ ] **Step 3: Verify in mobile viewport**

Run: `pnpm dev`. Use browser DevTools mobile emulation (e.g. iPhone 13). Confirm: cards stack vertically, three slots are reachable above the fold, camera button opens native capture dialog (`<input capture="environment">` path in `MediaCaptureDialog`), no horizontal scroll.

- [ ] **Step 4: Commit**

```bash
git add src/app/(main)/tasks/[id]/components/matrix-mobile-cards.tsx src/app/(main)/tasks/[id]/components/matrix-input-view.tsx
git commit -m "feat(matrix): add mobile card view with dimension drawer"
```

---

### Task 12: Report Projection & Snapshot

**Files:**
- Modify: `src/lib/server/report-detail.ts`
- Modify: `src/lib/server/report-print-renderer.ts` (if matrix block needs print treatment)

- [ ] **Step 1: Include matrix projection in report detail**

In `src/lib/server/report-detail.ts`, when assembling the report detail for a task that has a `data_matrix` assembly, call `buildMatrixReadProjection(client, assemblyId)` and attach it as a `matrix` block in the section list. The report detail already has section blocks (see `ReportDetailSectionBlockType`); add a `matrix` variant if not present, mapping the projection into read-only display data (groups → rows → metrics + conclusion + issue count + evidence thumbnail refs).

- [ ] **Step 2: Snapshot freeze**

In the report publish path (wherever `report_snapshots.snapshot_json` is built — search for `snapshot_json` writes), when the source task has a data matrix, freeze the full `MatrixReadProjection` (including `schema.key/version`, row labels, sort order, metric values, formula versions, evidence refs, comparability status) into `snapshot_json.matrix_projection`. **Do not** store only `matrix_instance_id` — historical reports must not漂移 (spec §11.3).

- [ ] **Step 3: Render matrix block read-only**

In the report section block renderer (`src/components/reports/report-section-block-renderer.tsx`), add a case for the `matrix` block: render groups → rows → subject + metrics table + conclusion + issue count. Read-only. Reuse the read-only cell rendering from `report-matrix-tab.tsx` patterns where applicable.

- [ ] **Step 4: Verify**

Run: `pnpm ts-check && pnpm check:golden` (the golden contract script may need extending to recognize the matrix block — if it fails, extend `scripts/check-golden-test-contract.ts` to allow but not require a `matrix` block).
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/report-detail.ts src/lib/server/report-print-renderer.ts src/components/reports/report-section-block-renderer.ts scripts/check-golden-test-contract.ts
git commit -m "feat(matrix): project matrix into report detail and freeze snapshot"
```

---

### Task 13: Admin Schema Management (Minimal)

**Files:**
- Create: `src/app/api/matrix-schemas/route.ts`
- Create: `src/app/api/matrix-schemas/[id]/versions/route.ts`
- Create: `src/app/api/matrix-schema-versions/[id]/publish/route.ts`

Admin-only endpoints to list/create/publish schemas. The first schema is seeded by Task 4's script; these endpoints let admins add more later. No fancy UI in this task — the juicer schema ships seeded; a future task can add a管理 dialog.

- [ ] **Step 1: Implement `GET /api/matrix-schemas`**

`requireUser`. Return all `matrix_schemas` with their latest published version summary. No admin gate on read (any logged-in user can browse the schema library); gate only writes.

- [ ] **Step 2: Implement `POST /api/matrix-schemas`**

`requireAdmin`. Body: `{ schemaKey, name, productCategory }`. Insert a draft schema + a draft version 1 with empty `schema_json`. Return `{ schemaId, versionId }`.

- [ ] **Step 3: Implement `POST /api/matrix-schemas/[id]/versions`**

`requireAdmin`. Body: `{ schemaJson }`. Insert a new draft version (max version_no + 1).

- [ ] **Step 4: Implement `POST /api/matrix-schema-versions/[id]/publish`**

`requireAdmin`. Steps:
1. Load the version + its `matrix_dimension_bindings` + `matrix_formula_definitions` (drafts).
2. For each formula: `compileFormula` + `buildDependencyGraph`. On any `MATRIX_FORMULA_*` error, return 422 with the offending formula id + code. Refuse if output dimension is `editable=true` (`MATRIX_FORMULA_OUTPUT_EDITABLE`). Detect cycles (`MATRIX_FORMULA_CYCLE`). Unit check (`MATRIX_FORMULA_UNIT_MISMATCH`).
3. Compute checksum, set `status='published'`, `published_at`, `published_by`, write compiled_ast/dependency_json onto each formula definition.
4. Update `matrix_schemas.latest_published_version_id` + `status='active'`.
5. Audit `matrix_schema_version.published`.

- [ ] **Step 5: Type check**

Run: `pnpm ts-check`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/matrix-schemas src/app/api/matrix-schema-versions
git commit -m "feat(matrix): add admin schema list/create/publish APIs"
```

---

### Task 14: Acceptance Test — Juicer End-to-End (Playwright Smoke)

**Files:**
- Modify: an existing Playwright spec (find via `find tests -name "*.spec.ts"` or check `playwright.config`) or create `tests/matrix-juicer.spec.ts`

Implements AT-11 through AT-13 from the spec.

- [ ] **Step 1: Locate the Playwright spec convention**

Run: `find . -path ./node_modules -prune -o -name "*.spec.ts" -print` and read `playwright.config.*` to find the test directory + base URL env var (`E2E_BASE_URL`).

- [ ] **Step 2: Write the smoke spec**

Cover:
1. Login as admin (use `dockeradmin`/`DockerLocal2026` if E2E runs against docker-compose.local, or env-driven creds otherwise — match the existing `pnpm smoke:e2e` convention).
2. Open a task with a seeded matrix instance.
3. Click the 数据矩阵 tab.
4. In the胡萝卜 group, find the 160mm row, enter `ingredient_weight=1193.1`, `juice_weight=558.7`.
5. Assert the `juice_yield` cell shows ≈ `0.4683` (or `46.83%` formatted) after the debounce + server recompute.
6. Set result status to "不达标"; confirm the issue-create dialog opens prefilled.
7. Try to edit the calculated cell directly; confirm it's read-only.

- [ ] **Step 3: Run the smoke**

Run: `pnpm smoke:e2e` (against a running local server — start `docker compose -f docker-compose.local.yml up -d` first, or `pnpm build && pnpm start` against a local Postgres with the migration + seed applied).
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add tests/matrix-juicer.spec.ts
git commit -m "test(matrix): add juicer aperture end-to-end smoke"
```

---

### Task 15: Feature Flag & Documentation

**Files:**
- Modify: `src/middleware.ts` (if needed to gate the route — likely not, since the tab only renders when an instance exists)
- Modify: `AGENTS.md`
- Modify: `README.md` (only if it lists features)

- [ ] **Step 1: Document in AGENTS.md**

Add a section under "关键设计决策" describing:
- 数据矩阵录入视图 as a task workbench component (not a report template).
- Three-slot rule (效果结论/过程记录/关联问题) — no manual score box.
- Semantic DSL formulas (no A1 coordinates); list whitelist functions.
- Optimistic+authoritative compute strategy; shared `src/lib/matrix/formula-engine.ts`.
- Reuse of `comparison_assemblies` (matrix_role='data_matrix') and `metric_evaluations` (typed value columns).
- Wave mapping: Wave 0 = schema/formula/migration; Wave 1 = instance/CRUD/projection/mobile; Wave 2 = formula builder + paste enhancements (RESERVED: A1 formulas, macros, free cell styling).

- [ ] **Step 2: Add the seed + check scripts to the runbook**

In AGENTS.md "开发命令" section, document:
- `pnpm seed:matrix-schema` — seeds the juicer aperture schema (run after `0002_matrix_input_tables.sql`).
- `pnpm check:matrix-formula` — runs the formula engine contract.

- [ ] **Step 3: Commit**

```bash
git add AGENTS.md
git commit -m "docs(matrix): document data matrix input view design and runbook"
```

---

## Self-Review Notes (post-write)

- **Spec coverage check:** §1 goals → Tasks 1-12. §2 红线 (no A1, no free styling) → enforced by Task 1 parser whitelist + Task 13 publish validation + Task 10 read-only calculated cells. §5 data model → Task 3. §6 DSL → Tasks 1-2. §7 compute strategy → Tasks 8. §8 input IA (incl. mobile §8.3) → Tasks 9-11. §9 API → Tasks 6-8, 13. §10 component tree → Task 10. §11 report projection → Task 12. §12 validation → Task 7 validate endpoint + Task 13 publish checks. §13 audit → each API task writes audit logs (action names match spec table). §14 perf → noted in Task 10 (no virtualization lib first version; document). §15 Wave mapping → Task 15 docs. §16 AT-11/12/13 → Task 14; AT-14 (concurrency) covered by optimistic-lock in Task 8; AT-15 (snapshot) in Task 12; AT-16/17 covered by Task 14 + 11. Gaps: AT-18 (front/back DSL consistency) is structurally guaranteed by sharing the same module — add a one-line CI assertion if desired.
- **Type consistency:** `DimensionBinding`, `FormulaDefinition`, `MatrixSchemaJson` defined once in Task 4 `types.ts` and reused. `MatrixReadProjection` defined in Task 5 and reused in Tasks 6-12. `MetricValue`/`EvalResult`/`CompiledFormula` defined in Task 2 `formula-engine.ts`.
- **Known unknowns flagged for implementer:** (a) exact column names on `check_records` for result status/summary (Task 7 Step 5 — read schema first); (b) how `comparison_assemblies` links to a task (Task 6 Step 1 — read `tasks/[id]/comparison/init/route.ts` first); (c) whether a `useIsMobile` hook already exists (Task 11 Step 2 — check `src/hooks/` and `navigation.tsx`); (d) whether `material_role` filtering works for matrix cell binding (Task 10 Step 5 — `MaterialPicker` already accepts `comparisonCellId`).

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-03-data-matrix-input-view-implementation.md`.

Two execution options:

1. **Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
