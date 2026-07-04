import { expect, test, type APIResponse, type Page } from '@playwright/test';
import { loginForE2E } from './auth-session';

/**
 * JUICER SCHEMA GOLDEN-SAMPLE ACCEPTANCE TEST (AT-11/12/13).
 *
 * The hardcoded field names below (ingredient_weight, juice_weight, juice_yield,
 * 食物重量, 出汁重量, 出汁率含渣, 160mm, etc.) and the expected value 0.4683 are
 * NOT platform defaults. They come from the juicer aperture schema seeded by
 * `pnpm seed:matrix-schema` (see src/lib/matrix/schema-bootstrap.ts).
 *
 * The data-matrix UI itself is schema-driven and renders whatever dimensions
 * the applied MatrixSchemaVersion declares — see matrix-schema-driven.spec.ts
 * for a test that exercises a completely different schema. This file is locked
 * to the juicer sample because AT-11/12/13 verify the juicer business case
 * end-to-end. If you change the juicer schema, update these constants; if you
 * add a new business schema, write a new spec file rather than overloading
 * this one.
 */

/**
 * Data Matrix Input View — juicer end-to-end smoke (Task 14).
 *
 * Covers the three acceptance scenarios that depend on a running app + DB:
 *   AT-11  juicer end-to-end recompute (observed → calculated juice_yield)
 *   AT-12  three-slots save + evidence picker opens
 *   AT-13  formula safety (calculated cells are read-only)
 *
 * Auth + provisioning model mirrors platform-smoke.spec.ts: credentials come
 * from env vars (E2E_ACCOUNT / E2E_PASSWORD) with the documented Docker local
 * defaults as the fallback, and loginForE2E handles session injection. The
 * juicer schema must be seeded (`pnpm seed:matrix-schema`); if it is missing
 * the whole describe block skips rather than failing.
 *
 * The describe is serial so the task + matrix instance created in test 1 are
 * reused by tests 2–4 and torn down once in afterAll.
 */

const account = process.env.E2E_ACCOUNT || 'dockeradmin';
const password = process.env.E2E_PASSWORD || 'DockerLocal2026';

// ---------------------------------------------------------------------------
// Juicer golden-sample constants.
//
// Every value below is tied to the juicer aperture schema
// (JUICER_APERTURE_SCHEMA in src/lib/matrix/schema-bootstrap.ts, seeded by
// `pnpm seed:matrix-schema`). None of these are platform defaults. They are
// extracted here as named constants so the single source of truth is obvious
// and so a schema change can be updated in one place. See the file-level
// guardrail comment above for why these are NOT to be generalised.
// ---------------------------------------------------------------------------

/** schemaKey of the seeded juicer schema (schema-bootstrap.ts). */
const JUICER_SCHEMA_KEY = 'juicer_aperture_comparison';

// --- Dimension keys (schema-bootstrap.ts → dimensions[].dimensionKey) ---
/** Observed input: weight of the food ingredient fed into the juicer (g). */
const DIM_INGREDIENT_WEIGHT = 'ingredient_weight';
/** Observed input: weight of the extracted juice including pulp (g). */
const DIM_JUICE_WEIGHT = 'juice_weight';
/** Calculated output: juice_yield = ROUND(juice_weight / ingredient_weight, 4). */
const DIM_JUICE_YIELD = 'juice_yield';

// --- Display names (schema-bootstrap.ts → dimensions[].displayName) ---
/** Column header for ingredient_weight (食物重量). */
const DISPLAY_INGREDIENT_WEIGHT = '食物重量';
/** Column header for juice_weight (出汁重量). */
const DISPLAY_JUICE_WEIGHT = '出汁重量';
/** Column header for the calculated juice_yield (出汁率含渣). */
const DISPLAY_JUICE_YIELD = '出汁率含渣';

// --- Result-status option exercised by AT-12 (platform default, not juicer) ---
/** A platform-default result-status value picked in the result slot (AT-12). */
const RESULT_STATUS_FAIL = '不达标';

// --- Row subject under test (test-created, arbitrary aperture label) ---
/**
 * Subject key/label for the test row. "160mm" is the aperture scenario label
 * created by the test setup (NOT a schema value) — it identifies the row in
 * the grid. Any unique label would do; this one mirrors a real aperture spec.
 */
const ROW_SUBJECT = '160mm';

// --- Juicer observed inputs + the expected row-scoped calculation ---
// juice_yield = ROUND(juice_weight / ingredient_weight, 4)
//             = ROUND(558.7 / 1193.1, 4) = 0.4683.
// See schema-bootstrap.ts formula for `juice_yield`.
const INGREDIENT_WEIGHT = 1193.1;
const JUICE_WEIGHT = 558.7;
const EXPECTED_JUICE_YIELD = 0.4683;

// Shared across the serial tests; populated by the setup test, cleared by afterAll.
const ctx = {
  taskId: '' as string,
  assemblyId: '' as string,
  groupId: '' as string,
  rowId: '' as string,
  schemaVersionId: '' as string,
  taskCreatedByTest: false,
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
 * Resolve the <input> inside a specific metric column for a given data row.
 *
 * The grid renders one <td> per column in header order, and observed-metric
 * cells each contain exactly one input. We can't just use nth(N) because the
 * observed columns include 耗时 (also a number input) and the column chooser
 * can hide dimensions. Instead we find the column header whose truncated span
 * matches `headerName`, derive its cell index from the header row, and return
 * the <td> at that same index within `dataRow`.
 */
async function inputForColumn(page: Page, dataRow: ReturnType<Page['getByRole']>, headerName: string) {
  const headerCell = page.getByRole('columnheader').filter({ hasText: headerName }).first();
  await expect(headerCell).toBeVisible();
  // All column headers share the same <tr>; the cell index we want is the
  // position of this header among its siblings.
  const cellIndex = await headerCell.evaluate((node) => {
    const th = node as HTMLTableCellElement;
    return Array.from(th.parentElement!.children).indexOf(th);
  });
  const cell = dataRow.locator('td').nth(cellIndex);
  const input = cell.locator('input').first();
  await expect(input, `${headerName} cell should expose an editable input`).toBeVisible();
  return input;
}

test.describe.serial('Data Matrix juicer end-to-end (AT-11/12/13)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  // -------------------------------------------------------------------------
  // Test 1 — setup: resolve the juicer schema, create a task, apply the
  // matrix, and seed one group + one row for the subsequent UI tests.
  // Skips the whole suite if the juicer schema is not seeded.
  // -------------------------------------------------------------------------
  test('setup: apply juicer schema to a fresh task with a group + row', async ({ request, page }) => {
    // 1. Locate the published juicer schema version.
    const schemas = await ensureJson<
      Array<{
        schemaKey: string;
        id: string;
        latestPublishedVersion: { id: string; versionNo: number; status: string } | null;
      }>
    >(await request.get('/api/matrix-schemas'), 'list matrix schemas');

    const juicer = schemas.find((s) => s.schemaKey === JUICER_SCHEMA_KEY);
    const publishedVersion = juicer?.latestPublishedVersion;
    const versionIsPublished = publishedVersion?.status === 'published';
    if (!juicer || !publishedVersion || !versionIsPublished) {
      test.skip(
        true,
        `juicer schema "${JUICER_SCHEMA_KEY}" is not seeded or has no published version — run pnpm seed:matrix-schema`,
      );
      return;
    }
    ctx.schemaVersionId = publishedVersion.id;

    // 2. Create a throwaway task owned by the admin (cleaned up in afterAll).
    const marker = `E2E-MATRIX-${Date.now()}`;
    const task = await ensureJson<{ id: string }>(
      await request.post('/api/tasks', {
        data: {
          task_name: marker,
          product_category: '原汁机',
          product: 'E2E Juicer',
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
      'apply juicer schema to task',
    );
    ctx.assemblyId = applied.assemblyId;

    // 4. Create one group (section) and one record row inside it.
    const group = await ensureJson<{ groupId: string }>(
      await request.post(`/api/task-matrices/${ctx.assemblyId}/groups`, {
        data: { label: '苹果-慢速', conditionSummary: '口径 80mm' },
      }),
      'create matrix group',
    );
    ctx.groupId = group.groupId;

    const row = await ensureJson<{ rowId: string }>(
      await request.post(`/api/task-matrices/${ctx.assemblyId}/rows`, {
        data: { groupId: ctx.groupId, subjectKey: ROW_SUBJECT, subjectLabel: ROW_SUBJECT },
      }),
      'create matrix row',
    );
    ctx.rowId = row.rowId;

    // Sanity: the read projection loads and exposes the juicer dimensions.
    const projection = await ensureJson<{
      schema: { dimensions: Array<{ dimensionKey: string; displayName: string }> };
      groups: Array<{ rows: Array<{ id: string }> }>;
    }>(await request.get(`/api/task-matrices/${ctx.assemblyId}`), 'read matrix projection');
    const dimensionKeys = projection.schema.dimensions.map((d) => d.dimensionKey);
    expect(dimensionKeys, 'juicer schema should bind ingredient_weight').toContain(DIM_INGREDIENT_WEIGHT);
    expect(dimensionKeys, 'juicer schema should bind juice_weight').toContain(DIM_JUICE_WEIGHT);
    expect(dimensionKeys, 'juicer schema should bind the calculated juice_yield').toContain(DIM_JUICE_YIELD);

    // Touch the task page once so the serverless function is warm for the UI tests.
    await page.goto(`/tasks/${ctx.taskId}?tab=matrix`);
    await expectAppLoaded(page);
  });

  // -------------------------------------------------------------------------
  // Test 2 — AT-11: enter observed weights, assert the calculated juice_yield
  // cell recompute (~0.4683) after debounce + server recompute.
  // -------------------------------------------------------------------------
  test('AT-11 juicer observed inputs recompute juice_yield (≈0.4683)', async ({ page, request }) => {
    test.skip(!ctx.rowId, 'setup test did not provision a row');
    const { taskId, rowId } = ctx;

    await page.goto(`/tasks/${taskId}?tab=matrix`);
    await expectAppLoaded(page);

    // The matrix grid is lazy-fetched; wait for the row's subject label to show.
    await expect(page.getByText('数据矩阵').first()).toBeVisible();
    await expect(page.getByRole('cell', { name: ROW_SUBJECT })).toBeVisible({ timeout: 20_000 });

    // The test row is the only row in the group.
    const dataRow = page.getByRole('row').filter({ hasText: ROW_SUBJECT }).first();

    // The observed columns render in schema sortOrder: 耗时(0) 食物重量(1) 出汁重量(2)
    // …. 耗时 is ALSO an <input type="number">, so nth(0)/nth(1) would be wrong.
    // Instead, resolve each input by the position of its column header, which
    // stays correct if dimensions are reordered or hidden via the column chooser.
    // (DISPLAY_* names come from the juicer schema — see constants above.)
    const ingredientInput = await inputForColumn(page, dataRow, DISPLAY_INGREDIENT_WEIGHT);
    const juiceInput = await inputForColumn(page, dataRow, DISPLAY_JUICE_WEIGHT);
    await ingredientInput.fill(String(INGREDIENT_WEIGHT));
    await juiceInput.fill(String(JUICE_WEIGHT));

    // Trigger an immediate commit (the cell also debounces 800ms, but blur
    // flushes — see ObservedMetricCell.useDebouncedSave).
    await ingredientInput.blur();
    await juiceInput.blur();

    // Authoritative assertion: the server recompute must have written the
    // calculated juice_yield. Poll the read projection rather than the DOM so
    // the check is robust to debounce timing + optimistic-vs-authoritative flips.
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
          }>(await request.get(`/api/task-matrices/${ctx.assemblyId}`), 'poll juice_yield recompute');
          const cell = projection.groups
            .flatMap((g) => g.rows)
            .find((r) => r.id === rowId)
            ?.metrics?.[DIM_JUICE_YIELD];
          return cell?.value;
        },
        { message: 'juice_yield should recompute to ≈0.4683', timeout: 30_000, intervals: [1_000, 2_000, 5_000] },
      )
      // 1e-4 matches the ROUND(...,4) precision; tolerance absorbs float noise.
      .toBeCloseTo(EXPECTED_JUICE_YIELD, 4);

    // DOM assertion: the calculated 出汁率含渣 cell (read-only <span>) renders
    // the recomputed value formatted to 4 decimals (displayFormat.decimals=4).
    const yieldCell = dataRow.getByTitle(DISPLAY_JUICE_YIELD);
    await expect(yieldCell).toContainText(String(EXPECTED_JUICE_YIELD), { timeout: 15_000 });
  });

  // -------------------------------------------------------------------------
  // Test 3 — AT-12: set the result slot status to 不达标, confirm it persists,
  // and smoke-check that the evidence MaterialPicker opens.
  // -------------------------------------------------------------------------
  test('AT-12 result slot save + evidence picker opens', async ({ page, request }) => {
    test.skip(!ctx.rowId, 'setup test did not provision a row');
    const { taskId, rowId, assemblyId } = ctx;

    await page.goto(`/tasks/${taskId}?tab=matrix`);
    await expectAppLoaded(page);
    await expect(page.getByRole('cell', { name: ROW_SUBJECT })).toBeVisible({ timeout: 20_000 });

    const dataRow = page.getByRole('row').filter({ hasText: ROW_SUBJECT }).first();

    // The 效果结论 column renders a shadcn Select; open it and pick 不达标
    // (RESULT_STATUS_FAIL — one of the platform-default result-status options;
    // see DEFAULT_RESULT_STATUS_OPTIONS in matrix-cell.tsx). The trigger is the
    // first combobox-like button inside the row's result cell.
    const resultTrigger = dataRow.getByRole('combobox').first();
    await expect(resultTrigger).toBeVisible();
    await resultTrigger.click();
    await page.getByRole('option', { name: RESULT_STATUS_FAIL }).click();

    // Confirm via the API that the result_status slot persisted (last-write-wins).
    await expect
      .poll(
        async () => {
          const projection = await ensureJson<{
            groups: Array<{
              rows: Array<{
                id: string;
                slots: { result: { status: string | null } };
              }>;
            }>;
          }>(await request.get(`/api/task-matrices/${assemblyId}`), 'poll result_status save');
          const row = projection.groups.flatMap((g) => g.rows).find((r) => r.id === rowId);
          return row?.slots.result.status ?? null;
        },
        { message: `result_status should persist as ${RESULT_STATUS_FAIL}`, timeout: 15_000 },
      )
      .toBe(RESULT_STATUS_FAIL);

    // Evidence picker smoke: the 证据 column's cell opens the 选择素材 dialog.
    const evidenceButton = dataRow.getByRole('button', { name: /证据/ }).first();
    await expect(evidenceButton).toBeVisible();
    await evidenceButton.click();
    const picker = page.getByRole('dialog', { name: /选择素材/ });
    await expect(picker, 'evidence MaterialPicker dialog should open').toBeVisible();
    // Close it to leave a clean state for the next test.
    await page.keyboard.press('Escape');
    await expect(picker).toHaveCount(0);
  });

  // -------------------------------------------------------------------------
  // Test 4 — AT-13: formula safety. A calculated cell must not be directly
  // editable: (a) the DOM exposes no input for it, and (b) the server rejects
  // a direct PATCH on a calculated metric with 409 MATRIX_CALCULATED_VALUE_READONLY.
  // -------------------------------------------------------------------------
  test('AT-13 calculated juice_yield is read-only (DOM + API)', async ({ page, request }) => {
    test.skip(!ctx.rowId, 'setup test did not provision a row');
    const { taskId, rowId } = ctx;

    await page.goto(`/tasks/${taskId}?tab=matrix`);
    await expectAppLoaded(page);
    await expect(page.getByRole('cell', { name: ROW_SUBJECT })).toBeVisible({ timeout: 20_000 });

    const dataRow = page.getByRole('row').filter({ hasText: ROW_SUBJECT }).first();

    // (a) DOM: the 出汁率含渣 calculated cell renders a read-only <span> and
    // contains no <input>/<textarea>/<select> — there is nothing to type into.
    await expect(page.getByRole('columnheader', { name: new RegExp(DISPLAY_JUICE_YIELD) })).toBeVisible();
    const yieldCell = dataRow.getByTitle(DISPLAY_JUICE_YIELD);
    await expect(yieldCell).toBeVisible();
    await expect(
      yieldCell.locator('input, textarea, select'),
      'calculated cell must not expose an editable control',
    ).toHaveCount(0);

    // (b) API: a direct write to a calculated metric is rejected with the
    // MATRIX_CALCULATED_VALUE_READONLY sentinel — the authoritative guard that
    // makes the read-only DOM trustworthy (a determined client could otherwise
    // craft a PATCH). 409 is the documented contract (route.ts).
    // DIM_JUICE_YIELD is the juicer schema's calculated dimension.
    const writeAttempt = await request.patch(`/api/matrix-rows/${rowId}/metrics/${DIM_JUICE_YIELD}`, {
      data: { value: 0.9999 },
    });
    expect(writeAttempt.status(), 'direct calculated-cell PATCH must be rejected').toBe(409);
    const body = (await writeAttempt.json()) as ApiEnvelope<{ code?: string }>;
    expect(
      body.data?.code,
      'calculated-cell rejection must carry MATRIX_CALCULATED_VALUE_READONLY',
    ).toBe('MATRIX_CALCULATED_VALUE_READONLY');
  });

  // -------------------------------------------------------------------------
  // Cleanup: delete the task (and its matrix instance, cascaded by the DB) that
  // this spec created. Leaves pre-existing tasks untouched.
  // -------------------------------------------------------------------------
  test.afterAll(async ({ request }) => {
    if (ctx.taskCreatedByTest && ctx.taskId) {
      // Best-effort; a failure here must not fail the run.
      await request.delete(`/api/tasks/${ctx.taskId}`).catch(() => undefined);
    }
    ctx.taskId = '';
    ctx.assemblyId = '';
    ctx.groupId = '';
    ctx.rowId = '';
    ctx.schemaVersionId = '';
    ctx.taskCreatedByTest = false;
  });
});
