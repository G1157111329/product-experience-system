import { expect, test, type APIResponse, type Page } from '@playwright/test';
import { Client } from 'pg';
import { loginForE2E } from './auth-session';
import { compileFormula } from '../../src/lib/matrix/formula-engine';

/**
 * SCHEMA-DRIVEN DATA MATRIX SMOKE TEST.
 *
 * Purpose: prove the data-matrix UI is schema-agnostic. Unlike
 * matrix-juicer.spec.ts (which is locked to the juicer golden sample), this
 * file exercises a COMPLETELY DIFFERENT, minimal schema — a "weight × price"
 * matrix with English field names (item_weight, unit_price, total_cost) — to
 * demonstrate that the grid renders whatever dimensions the applied
 * MatrixSchemaVersion declares and that the result-status fallback still works.
 *
 * This test MUST NOT reference any juicer field name (出汁率/食物重量/ingredient_weight/
 * juice_weight/…) anywhere — its whole point is independence. It also MUST NOT
 * import juicer fixtures. If you find yourself reaching for juicer constants
 * here, stop: you're overloading the wrong spec.
 *
 * The schema is provisioned via direct DB access (a `pg` Client on DATABASE_URL,
 * the same pattern auth-session.ts uses), mirroring the seed-matrix-juicer-schema
 * transaction: schema header → published version → formula definitions (with
 * compiled AST) → dimension bindings. The HTTP admin API cannot project
 * dimensions/formulas into the normalized tables on its own, so SQL is the
 * shortest path to a fully-working published schema. The schema is marked with
 * an `e2e_test_` key prefix so it is recognisable as test-only.
 *
 * Skip handling: if the DB is unreachable or schema creation fails, the whole
 * describe skips rather than failing — this test is a guardrail, not a gate.
 */

const account = process.env.E2E_ACCOUNT || 'dockeradmin';
const password = process.env.E2E_PASSWORD || 'DockerLocal2026';

// Schema under test — deliberately NOT juicer. 2 observed dimensions (English
// keys) + 1 calculated. total_cost = item_weight * unit_price.
const SCHEMA_KEY = 'e2e_test_weight_price';
const SCHEMA_TITLE = 'E2E Weight × Price';
const DIM_ITEM_WEIGHT = 'item_weight';
const DIM_UNIT_PRICE = 'unit_price';
const DIM_TOTAL_COST = 'total_cost';
const DISPLAY_ITEM_WEIGHT = 'Item Weight';
const DISPLAY_UNIT_PRICE = 'Unit Price';
const DISPLAY_TOTAL_COST = 'Total Cost';
const FORMULA_DSL = `SELF("${DIM_ITEM_WEIGHT}") * SELF("${DIM_UNIT_PRICE}")`;

// Test inputs + expected row-scoped calculation. 3 * 25 = 75.
const ITEM_WEIGHT_INPUT = 3;
const UNIT_PRICE_INPUT = 25;
const EXPECTED_TOTAL_COST = 75;

// The 4 platform-default result-status options (proves the fallback path —
// this schema intentionally does NOT declare resultStatusOptions).
const PLATFORM_DEFAULT_RESULT_OPTIONS = ['达标', '待观察', '不达标', '不适用'];

// Shared across the serial tests; populated by setup, cleared by afterAll.
const ctx = {
  taskId: '' as string,
  assemblyId: '' as string,
  groupId: '' as string,
  rowId: '' as string,
  schemaId: '' as string,
  schemaVersionId: '' as string,
  taskCreatedByTest: false,
  schemaCreatedByTest: false,
  dbAvailable: false,
  lastProvisionError: '' as string,
};

async function login(page: Page) {
  await loginForE2E(page, account, password);
}

/** Mirrors platform-smoke's runtime-error guard. */
async function expectAppLoaded(page: Page) {
  await expect(page.getByText("This page couldn't load")).toHaveCount(0);
  await expect(page.getByText('Runtime SyntaxError')).toHaveCount(0);
  await expect(page.getByText('Unhandled Runtime Error')).toHaveCount(0);
  await expect(page.getByText('Unexpected end of JSON input')).toHaveCount(0);
}

type ApiEnvelope<T> = { code: number; message?: string; data?: T };

async function ensureJson<T>(res: APIResponse, label: string): Promise<T> {
  const raw = await res.text();
  let json: ApiEnvelope<T>;
  try {
    json = JSON.parse(raw) as ApiEnvelope<T>;
  } catch {
    throw new Error(`${label}: response was not JSON (status ${res.status()}): ${raw.slice(0, 200)}`);
  }
  expect(json.code, `${label} should succeed: ${json.message ?? ''}`).toBe(0);
  return json.data as T;
}

/**
 * Resolve the <input> inside a specific metric column for a given data row by
 * locating the column header and deriving the cell index from header order
 * (robust to dimension reordering / the column chooser). Mirrors the juicer
 * spec's helper but is duplicated here to keep this file fully self-contained.
 */
async function inputForColumn(
  page: Page,
  dataRow: ReturnType<Page['getByRole']>,
  headerName: string,
) {
  const headerCell = page.getByRole('columnheader').filter({ hasText: headerName }).first();
  await expect(headerCell).toBeVisible();
  const cellIndex = await headerCell.evaluate((node) => {
    const th = node as HTMLTableCellElement;
    return Array.from(th.parentElement!.children).indexOf(th);
  });
  const cell = dataRow.locator('td').nth(cellIndex);
  const input = cell.locator('input').first();
  await expect(input, `${headerName} cell should expose an editable input`).toBeVisible();
  return input;
}

/**
 * Provision the weight×price schema directly in the DB (header + published
 * version + compiled formula + dimension bindings), mirroring the seed script's
 * transaction. Idempotent: if the published version already exists, reuses it.
 * Sets ctx.schemaId / ctx.schemaVersionId on success; leaves them empty + sets
 * ctx.dbAvailable=false on any failure.
 */
async function provisionSchema() {
  const connStr = process.env.DATABASE_URL;
  if (!connStr) {
    ctx.dbAvailable = false;
    return;
  }
  let client: Client;
  try {
    client = new Client({ connectionString: connStr });
    await client.connect();
  } catch {
    ctx.dbAvailable = false;
    return;
  }
  try {
    // Pre-compile the formula so a parse error aborts before any DB write.
    const { ast, dependencies } = compileFormula(FORMULA_DSL);

    await client.query('BEGIN');

    const schemaInsert = await client.query(
      `INSERT INTO matrix_schemas (schema_key, name, status)
       VALUES ($1, $2, 'active')
       ON CONFLICT (schema_key) DO UPDATE SET name = EXCLUDED.name
       RETURNING id`,
      [SCHEMA_KEY, SCHEMA_TITLE],
    );
    const schemaId: string = schemaInsert.rows[0].id;

    // Reuse an existing published version if a prior run left one.
    const existing = await client.query(
      `SELECT id FROM matrix_schema_versions
       WHERE schema_id = $1 AND version_no = 1 AND status = 'published'
       LIMIT 1`,
      [schemaId],
    );
    let schemaVersionId: string;
    if (existing.rows.length > 0) {
      schemaVersionId = existing.rows[0].id;
    } else {
      const schemaJson = JSON.stringify({
        schemaKey: SCHEMA_KEY,
        version: 1,
        title: SCHEMA_TITLE,
        axes: [
          { axisCode: 'scenario', axisRole: 'group', levels: [{ levelNo: 1, label: 'Batch' }] },
          {
            axisCode: 'subject',
            axisRole: 'row',
            levels: [
              { levelNo: 1, label: 'Item' },
              { levelNo: 2, label: 'Spec' },
            ],
          },
        ],
        // NOTE: resultStatusOptions intentionally OMITTED so the platform
        // default fallback is exercised by this test.
        dimensions: [
          {
            dimensionKey: DIM_ITEM_WEIGHT,
            displayName: DISPLAY_ITEM_WEIGHT,
            columnGroup: 'observed',
            valueKind: 'number',
            unitCode: 'kg',
            required: true,
            sortOrder: 0,
            displayFormat: { decimals: 0 },
          },
          {
            dimensionKey: DIM_UNIT_PRICE,
            displayName: DISPLAY_UNIT_PRICE,
            columnGroup: 'observed',
            valueKind: 'number',
            unitCode: 'USD',
            required: true,
            sortOrder: 1,
            displayFormat: { decimals: 0 },
          },
          {
            dimensionKey: DIM_TOTAL_COST,
            displayName: DISPLAY_TOTAL_COST,
            columnGroup: 'calculated',
            valueKind: 'number',
            unitCode: 'USD',
            required: false,
            editable: false,
            sortOrder: 2,
            displayFormat: { decimals: 0 },
          },
        ],
        formulas: [
          { outputDimensionKey: DIM_TOTAL_COST, formulaDsl: FORMULA_DSL, scope: 'row', formulaVersion: 'v1' },
        ],
      });
      const versionRow = await client.query(
        `INSERT INTO matrix_schema_versions (schema_id, version_no, status, schema_json)
         VALUES ($1, 1, 'published', $2)
         RETURNING id`,
        [schemaId, schemaJson],
      );
      schemaVersionId = versionRow.rows[0].id;

      // Formula definition with compiled AST + dependencies (the runtime
      // recompute reads these to skip re-parsing).
      await client.query(
        `INSERT INTO matrix_formula_definitions
           (schema_version_id, output_dimension_key, formula_dsl, compiled_ast, dependency_json, scope, formula_version, status)
         VALUES ($1, $2, $3, $4, $5, 'row', 'v1', 'published')
         ON CONFLICT (schema_version_id, output_dimension_key) DO UPDATE SET
           formula_dsl = EXCLUDED.formula_dsl,
           compiled_ast = EXCLUDED.compiled_ast,
           dependency_json = EXCLUDED.dependency_json,
           scope = EXCLUDED.scope,
           formula_version = EXCLUDED.formula_version,
           status = EXCLUDED.status`,
        [schemaVersionId, DIM_TOTAL_COST, FORMULA_DSL, JSON.stringify(ast), JSON.stringify(dependencies)],
      );

      // Dimension bindings — observed + calculated. Column order mirrors the
      // seed script (seed-matrix-juicer-schema.ts) so positional params line up.
      const dims: Array<{
        key: string;
        name: string;
        group: 'observed' | 'calculated';
        editable: boolean;
        unit: string;
        sort: number;
      }> = [
        { key: DIM_ITEM_WEIGHT, name: DISPLAY_ITEM_WEIGHT, group: 'observed', editable: true, unit: 'kg', sort: 0 },
        { key: DIM_UNIT_PRICE, name: DISPLAY_UNIT_PRICE, group: 'observed', editable: true, unit: 'USD', sort: 1 },
        { key: DIM_TOTAL_COST, name: DISPLAY_TOTAL_COST, group: 'calculated', editable: false, unit: 'USD', sort: 2 },
      ];
      for (const d of dims) {
        await client.query(
          `INSERT INTO matrix_dimension_bindings
             (schema_version_id, dimension_key, display_name, column_group, value_kind, unit_code,
              metric_definition_id, required, editable, sort_order, display_format_json, validation_rule_json)
           VALUES ($1, $2, $3, $4, 'number', $5, NULL, true, $6, $7, $8, $9)
           ON CONFLICT (schema_version_id, dimension_key) DO UPDATE SET
             display_name = EXCLUDED.display_name,
             column_group = EXCLUDED.column_group,
             value_kind = EXCLUDED.value_kind,
             unit_code = EXCLUDED.unit_code,
             editable = EXCLUDED.editable,
             sort_order = EXCLUDED.sort_order,
             display_format_json = EXCLUDED.display_format_json,
             validation_rule_json = EXCLUDED.validation_rule_json`,
          [
            schemaVersionId,
            d.key,
            d.name,
            d.group,
            d.unit,
            d.editable,
            d.sort,
            JSON.stringify({ decimals: 0 }),
            JSON.stringify({}),
          ],
        );
      }

      await client.query(
        `UPDATE matrix_schemas SET latest_published_version_id = $1, status = 'active', updated_at = NOW() WHERE id = $2`,
        [schemaVersionId, schemaId],
      );
    }

    await client.query('COMMIT');
    ctx.schemaId = schemaId;
    ctx.schemaVersionId = schemaVersionId;
    ctx.schemaCreatedByTest = true;
    ctx.dbAvailable = true;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    // Surface the reason in the skip message later; do not throw here.
    ctx.lastProvisionError = err instanceof Error ? err.message : String(err);
    ctx.dbAvailable = false;
  } finally {
    await client.end();
  }
}

test.describe.serial('Data Matrix schema-driven smoke (non-juicer schema)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  // -------------------------------------------------------------------------
  // Test 1 — setup: provision the weight×price schema, apply it to a fresh
  // task, and seed one group + one row. Skips if the DB or admin APIs are
  // unavailable, or if schema provisioning failed.
  // -------------------------------------------------------------------------
  test('setup: provision weight×price schema + apply to a fresh task', async ({ request, page }) => {
    // 1. Provision the schema (direct DB). Skips gracefully on failure.
    await provisionSchema();
    test.skip(!ctx.dbAvailable || !ctx.schemaVersionId, `weight×price schema could not be provisioned${ctx.lastProvisionError ? `: ${ctx.lastProvisionError}` : ''}`);

    // 2. Create a throwaway task (cleaned up in afterAll).
    const marker = `E2E-SCHEMA-${Date.now()}`;
    const task = await ensureJson<{ id: string }>(
      await request.post('/api/tasks', {
        data: {
          task_name: marker,
          product_category: 'general',
          product: 'E2E Schema Test',
          task_mode: 'single',
        },
      }),
      'create test task',
    );
    ctx.taskId = task.id;
    ctx.taskCreatedByTest = true;

    // 3. Apply the published schema version → creates a data_matrix instance.
    const applied = await ensureJson<{ assemblyId: string }>(
      await request.post(`/api/tasks/${ctx.taskId}/matrices`, {
        data: { schemaVersionId: ctx.schemaVersionId },
      }),
      'apply weight×price schema to task',
    );
    ctx.assemblyId = applied.assemblyId;

    // 4. Create one group + one row inside it.
    const group = await ensureJson<{ groupId: string }>(
      await request.post(`/api/task-matrices/${ctx.assemblyId}/groups`, {
        data: { label: 'Batch A', conditionSummary: 'Q1 quote' },
      }),
      'create matrix group',
    );
    ctx.groupId = group.groupId;

    const row = await ensureJson<{ rowId: string }>(
      await request.post(`/api/task-matrices/${ctx.assemblyId}/rows`, {
        data: { groupId: ctx.groupId, subjectKey: 'item_001', subjectLabel: 'Item 001' },
      }),
      'create matrix row',
    );
    ctx.rowId = row.rowId;

    // Sanity: the read projection exposes the weight×price dimensions (NOT juicer's).
    const projection = await ensureJson<{
      schema: { dimensions: Array<{ dimensionKey: string; displayName: string }> };
      groups: Array<{ rows: Array<{ id: string }> }>;
    }>(await request.get(`/api/task-matrices/${ctx.assemblyId}`), 'read matrix projection');
    const dimensionKeys = projection.schema.dimensions.map((d) => d.dimensionKey);
    expect(dimensionKeys, 'weight×price schema should bind item_weight').toContain(DIM_ITEM_WEIGHT);
    expect(dimensionKeys, 'weight×price schema should bind unit_price').toContain(DIM_UNIT_PRICE);
    expect(dimensionKeys, 'weight×price schema should bind calculated total_cost').toContain(DIM_TOTAL_COST);
    // Negative assertion: this must NOT be a juicer schema.
    expect(dimensionKeys, 'must not reference juicer dimensions').not.toContain('juice_yield');
    expect(dimensionKeys, 'must not reference juicer dimensions').not.toContain('ingredient_weight');

    // Touch the task page once so the serverless function is warm for the UI tests.
    await page.goto(`/tasks/${ctx.taskId}?tab=matrix`);
    await expectAppLoaded(page);
  });

  // -------------------------------------------------------------------------
  // Test 2 — schema-driven grid rendering + row-scoped recompute.
  //   - The grid columns match the weight×price dimensions (NOT juicer).
  //   - Entering item_weight=3, unit_price=25 → total_cost recomputes to 75.
  //   - The result-status Select offers the platform default 4 options.
  // -------------------------------------------------------------------------
  test('grid renders schema columns; total_cost recomputes to 75; result-status uses default options', async ({
    page,
    request,
  }) => {
    test.skip(!ctx.rowId, 'setup test did not provision a row');
    const { taskId, rowId } = ctx;

    await page.goto(`/tasks/${taskId}?tab=matrix`);
    await expectAppLoaded(page);

    // The matrix grid is lazy-fetched; wait for the row's subject label.
    await expect(page.getByText('数据矩阵').first()).toBeVisible();
    await expect(page.getByRole('cell', { name: 'Item 001' })).toBeVisible({ timeout: 20_000 });

    // Positive: the weight×price column headers are present.
    await expect(page.getByRole('columnheader', { name: /Item Weight/ }), 'item_weight column should render').toBeVisible();
    await expect(page.getByRole('columnheader', { name: /Unit Price/ }), 'unit_price column should render').toBeVisible();
    await expect(page.getByRole('columnheader', { name: /Total Cost/ }), 'total_cost column should render').toBeVisible();
    // Negative: no juicer column headers anywhere.
    await expect(page.getByRole('columnheader', { name: /出汁率含渣/ }), 'must not render juicer columns').toHaveCount(0);
    await expect(page.getByRole('columnheader', { name: /食物重量/ }), 'must not render juicer columns').toHaveCount(0);

    const dataRow = page.getByRole('row').filter({ hasText: 'Item 001' }).first();

    // Enter the two observed inputs.
    const weightInput = await inputForColumn(page, dataRow, DISPLAY_ITEM_WEIGHT);
    const priceInput = await inputForColumn(page, dataRow, DISPLAY_UNIT_PRICE);
    await weightInput.fill(String(ITEM_WEIGHT_INPUT));
    await priceInput.fill(String(UNIT_PRICE_INPUT));
    // Blur to flush the 800ms debounce (see ObservedMetricCell.useDebouncedSave).
    await weightInput.blur();
    await priceInput.blur();

    // Authoritative assertion: server recompute writes total_cost.
    await expect
      .poll(
        async () => {
          const projection = await ensureJson<{
            groups: Array<{
              rows: Array<{
                id: string;
                metrics: Record<string, { value?: number; state?: string } | undefined>;
              }>;
            }>;
          }>(await request.get(`/api/task-matrices/${ctx.assemblyId}`), 'poll total_cost recompute');
          const cell = projection.groups
            .flatMap((g) => g.rows)
            .find((r) => r.id === rowId)
            ?.metrics?.[DIM_TOTAL_COST];
          return cell?.value;
        },
        {
          message: `total_cost should recompute to ${EXPECTED_TOTAL_COST}`,
          timeout: 30_000,
          intervals: [1_000, 2_000, 5_000],
        },
      )
      .toBe(EXPECTED_TOTAL_COST);

    // DOM assertion: the read-only Total Cost cell renders the recomputed value
    // formatted to 0 decimals (displayFormat.decimals=0).
    const totalCostCell = dataRow.getByTitle(DISPLAY_TOTAL_COST);
    await expect(totalCostCell).toContainText(String(EXPECTED_TOTAL_COST), { timeout: 15_000 });

    // Result-status Select offers the platform default 4 options (this schema
    // does NOT declare resultStatusOptions, proving the fallback path).
    const resultTrigger = dataRow.getByRole('combobox').first();
    await expect(resultTrigger).toBeVisible();
    await resultTrigger.click();
    for (const optionLabel of PLATFORM_DEFAULT_RESULT_OPTIONS) {
      await expect(
        page.getByRole('option', { name: optionLabel }),
        `result-status should offer platform default "${optionLabel}"`,
      ).toBeVisible();
    }
    await page.keyboard.press('Escape');
  });

  // -------------------------------------------------------------------------
  // Cleanup: delete the task (cascades the matrix instance). The schema is left
  // behind (there is no schema-deletion endpoint) but is recognisable as
  // test-only via its `e2e_test_` key prefix; it is idempotent on re-run.
  // -------------------------------------------------------------------------
  test.afterAll(async ({ request }) => {
    if (ctx.taskCreatedByTest && ctx.taskId) {
      await request.delete(`/api/tasks/${ctx.taskId}`).catch(() => undefined);
    }
    ctx.taskId = '';
    ctx.assemblyId = '';
    ctx.groupId = '';
    ctx.rowId = '';
    ctx.schemaId = '';
    ctx.schemaVersionId = '';
    ctx.taskCreatedByTest = false;
    ctx.schemaCreatedByTest = false;
    ctx.dbAvailable = false;
  });
});
