import { expect, test, request as playwrightRequest, type APIRequestContext, type APIResponse, type Browser, type Cookie } from '@playwright/test';
import { loginForE2E } from './auth-session';

/**
 * MATRIX BATCH PASTE END-TO-END SMOKE (Task 6 / AT-19~22).
 *
 * Verifies the backend batch-commands path (`POST /api/task-matrices/[id]/batch-commands`
 * → `executeBatchPaste`) produces the correct authoritative values, status,
 * and HTTP mappings. The tests drive the endpoint directly via an
 * APIRequestContext rather than simulating clipboard paste through the DOM —
 * the clipboard→DOM flow is flaky in headless browsers and is covered by
 * Task 5's manual smoke. The point of these scenarios is the *batch
 * orchestrator contract*, not the paste-event plumbing.
 *
 * Auth + provisioning mirror matrix-juicer.spec.ts: credentials come from env
 * vars (E2E_ACCOUNT / E2E_PASSWORD) with the documented Docker local defaults
 * as the fallback, and loginForE2E handles session injection. The juicer
 * schema must be seeded (`pnpm seed:matrix-schema`); if it is missing (or the
 * backend is unreachable) the whole describe block skips rather than failing.
 * No live DB ⇒ skip, never fail.
 *
 * AUTH STATE SHARING (important): Playwright's built-in `{ request }` fixture
 * is an ISOLATED APIRequestContext (it calls playwright.request.newContext())
 * and does NOT share cookies with the `{ page }`/`{ context }` fixtures, so
 * logging in via a page does not authenticate the `request` fixture. It is
 * also disposed at the end of the hook it was created in, so a `request` from
 * beforeAll cannot be reused in tests. To authenticate every API call across
 * the serial suite we therefore log in once on a throwaway page, harvest the
 * xp_session cookie from that page's context, and build ONE shared
 * APIRequestContext (stored in `sharedRequest`) carrying that cookie via
 * `extraHTTPHeaders`. Every test + afterAll uses `sharedRequest`. This is the
 * documented Playwright pattern for "send authenticated API requests with a
 * session obtained from a browser login".
 *
 * NOTE on AT-22: true concurrent version-conflict (two simultaneous writers
 * racing on one cell) is impractical to reproduce deterministically in E2E.
 * That path is covered by the unit test (batch-paste.test.ts, "Partial
 * success: second command hits a version conflict" via the bumpOnUpdateIds
 * stub knob). AT-22 here covers the IDEMPOTENCY path instead (same
 * clientOperationId retried → no duplicate writes), which is the realistic
 * retry scenario for a batch paste.
 */

const account = process.env.E2E_ACCOUNT || 'dockeradmin';
const password = process.env.E2E_PASSWORD || 'DockerLocal2026';

// The cookie name loginForE2E injects (see auth-session.ts). We rebuild it as
// a Cookie header on the shared APIRequestContext so API calls are authenticated.
const SESSION_COOKIE_NAME = 'xp_session';

// ---------------------------------------------------------------------------
// Juicer golden-sample constants (single source of truth = schema-bootstrap.ts).
// Identical to matrix-juicer.spec.ts; kept inline so this spec is self-contained.
// ---------------------------------------------------------------------------

/** schemaKey of the seeded juicer schema (schema-bootstrap.ts). */
const JUICER_SCHEMA_KEY = 'juicer_aperture_comparison';

// --- Dimension keys ---
const DIM_INGREDIENT_WEIGHT = 'ingredient_weight';
const DIM_JUICE_WEIGHT = 'juice_weight';
/** Calculated output: juice_yield = ROUND(juice_weight / ingredient_weight, 4). */
const DIM_JUICE_YIELD = 'juice_yield';

// --- Row subjects (test-created, arbitrary aperture labels) ---
const ROW_SUBJECT_160 = '160mm';
const ROW_SUBJECT_120 = '120mm';

// --- AT-19 observed inputs + expected row-scoped calculation ---
// juice_yield = ROUND(juice_weight / ingredient_weight, 4) = ROUND(558.7 / 1193.1, 4) = 0.4683.
const INGREDIENT_WEIGHT = 1193.1;
const JUICE_WEIGHT = 558.7;
const EXPECTED_JUICE_YIELD = 0.4683;

/** Per src/lib/matrix/batch-paste.ts. Asserted by AT-21 (501 > 500). */
const BATCH_LIMIT = 500;

// Shared across the serial tests; populated by beforeAll, cleared by afterAll.
const ctx = {
  taskId: '' as string,
  assemblyId: '' as string,
  groupId: '' as string,
  row1Id: '' as string,
  row2Id: '' as string,
  schemaVersionId: '' as string,
  taskCreatedByTest: false,
};

/**
 * The single authenticated APIRequestContext reused by every test + afterAll.
 * Created in beforeAll (carrying the login cookie) and disposed in afterAll.
 */
let sharedRequest: APIRequestContext | null = null;

type ApiEnvelope<T> = { code: number; message?: string; data?: T };

/** Parse + envelope-check a JSON response, returning the inner `data`. */
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

test.describe.serial('Matrix batch paste (AT-19~22)', () => {
  test.beforeAll(async ({ browser }: { browser: Browser }) => {
    // 1. Login on a throwaway page, then harvest the session cookie. The page
    //    is closed immediately after — only the cookie is needed. If login
    //    can't proceed (no live DB to sign a cookie from AND the login API is
    //    unreachable), skip the suite gracefully rather than erroring.
    const page = await browser.newPage();
    let cookies: Cookie[];
    try {
      await loginForE2E(page, account, password);
      cookies = await page.context().cookies();
    } catch (err) {
      test.skip(
        true,
        `login not reachable (${err instanceof Error ? err.message : 'unknown'}) — no live backend; run the app on E2E_BASE_URL`,
      );
      return;
    } finally {
      await page.close();
    }

    const sessionCookie = cookies.find((c) => c.name === SESSION_COOKIE_NAME);
    if (!sessionCookie) {
      // loginForE2E fell back to the login API but the cookie wasn't captured,
      // or auth is misconfigured — skip rather than chase 401s.
      test.skip(
        true,
        `no ${SESSION_COOKIE_NAME} cookie after login — auth backend not reachable or misconfigured`,
      );
      return;
    }

    // 2. Build the ONE shared authenticated APIRequestContext. Playwright's
    //    built-in { request } fixture is isolated and per-hook, so we manage
    //    our own context that carries the session cookie as a Cookie header.
    sharedRequest = await playwrightRequest.newContext({
      baseURL: process.env.E2E_BASE_URL || 'http://127.0.0.1:5000',
      extraHTTPHeaders: { Cookie: `${SESSION_COOKIE_NAME}=${sessionCookie.value}` },
    });
    const request = sharedRequest;

    // 3. Locate the published juicer schema version; skip the whole suite if
    //    the backend is unreachable OR the juicer schema isn't seeded. Mirrors
    //    matrix-juicer.spec.ts.
    const schemasRes = await request.get('/api/matrix-schemas');
    if (!schemasRes.ok()) {
      test.skip(
        true,
        `matrix-schemas endpoint not reachable (status ${schemasRes.status()}) — no live backend; run the app on E2E_BASE_URL`,
      );
      return;
    }
    const schemas = await ensureJson<
      Array<{
        schemaKey: string;
        latestPublishedVersion: { id: string; versionNo: number; status: string } | null;
      }>
    >(schemasRes, 'list matrix schemas');

    const juicer = schemas.find((s) => s.schemaKey === JUICER_SCHEMA_KEY);
    const publishedVersion = juicer?.latestPublishedVersion;
    const versionIsPublished = publishedVersion?.status === 'published';
    if (!juicer || !publishedVersion || !versionIsPublished) {
      // test.skip inside beforeAll skips every test in the describe.
      test.skip(
        true,
        `juicer schema "${JUICER_SCHEMA_KEY}" is not seeded or has no published version — run pnpm seed:matrix-schema`,
      );
      return;
    }
    ctx.schemaVersionId = publishedVersion.id;

    // 4. Create a throwaway task owned by the admin (cleaned up in afterAll).
    const marker = `E2E-BATCH-${Date.now()}`;
    const task = await ensureJson<{ id: string }>(
      await request.post('/api/tasks', {
        data: {
          task_name: marker,
          product_category: '原汁机',
          product: 'E2E Batch Paste',
          task_mode: 'single',
        },
      }),
      'create test task',
    );
    ctx.taskId = task.id;
    ctx.taskCreatedByTest = true;

    // 5. Apply the published schema version → creates a data_matrix instance.
    const applied = await ensureJson<{ assemblyId: string }>(
      await request.post(`/api/tasks/${ctx.taskId}/matrices`, {
        data: { schemaVersionId: ctx.schemaVersionId },
      }),
      'apply juicer schema to task',
    );
    ctx.assemblyId = applied.assemblyId;

    // 6. Create one group + two item rows (160mm, 120mm aperture scenarios).
    const group = await ensureJson<{ groupId: string }>(
      await request.post(`/api/task-matrices/${ctx.assemblyId}/groups`, {
        data: { label: '苹果-慢速', conditionSummary: '口径对比' },
      }),
      'create matrix group',
    );
    ctx.groupId = group.groupId;

    const row1 = await ensureJson<{ rowId: string }>(
      await request.post(`/api/task-matrices/${ctx.assemblyId}/rows`, {
        data: { groupId: ctx.groupId, subjectKey: ROW_SUBJECT_160, subjectLabel: ROW_SUBJECT_160 },
      }),
      'create matrix row 1',
    );
    ctx.row1Id = row1.rowId;

    const row2 = await ensureJson<{ rowId: string }>(
      await request.post(`/api/task-matrices/${ctx.assemblyId}/rows`, {
        data: { groupId: ctx.groupId, subjectKey: ROW_SUBJECT_120, subjectLabel: ROW_SUBJECT_120 },
      }),
      'create matrix row 2',
    );
    ctx.row2Id = row2.rowId;
  });

  test.afterAll(async () => {
    if (ctx.taskCreatedByTest && ctx.taskId && sharedRequest) {
      // Best-effort cleanup; a failure here must not fail the run (the task is
      // throwaway). Deleting the task cascades its matrix instance + rows.
      await sharedRequest.delete(`/api/tasks/${ctx.taskId}`).catch(() => undefined);
    }
    ctx.taskId = '';
    ctx.assemblyId = '';
    ctx.groupId = '';
    ctx.row1Id = '';
    ctx.row2Id = '';
    ctx.schemaVersionId = '';
    ctx.taskCreatedByTest = false;

    await sharedRequest?.dispose().catch(() => undefined);
    sharedRequest = null;
  });

  // -------------------------------------------------------------------------
  // AT-19 — happy path: paste a 2×2 observed region (ingredient_weight +
  // juice_weight on 2 rows) → all 4 commands succeed → juice_yield recomputes
  // on row 1 to ≈0.4683.
  // -------------------------------------------------------------------------
  test('AT-19 batch paste 2x2 observed region recomputes juice_yield', async () => {
    test.skip(!sharedRequest || !ctx.row1Id, 'beforeAll did not provision an authenticated session + rows');
    const request = sharedRequest!;
    const { assemblyId, row1Id, row2Id } = ctx;

    const res = await request.post(`/api/task-matrices/${assemblyId}/batch-commands`, {
      data: {
        clientOperationId: 'op_at19_' + Date.now(),
        baseVersion: 1,
        anchor: { rowId: row1Id, dimensionKey: DIM_INGREDIENT_WEIGHT },
        commands: [
          { type: 'setMetric', rowId: row1Id, dimensionKey: DIM_INGREDIENT_WEIGHT, value: INGREDIENT_WEIGHT, unitCode: 'g' },
          { type: 'setMetric', rowId: row1Id, dimensionKey: DIM_JUICE_WEIGHT, value: JUICE_WEIGHT, unitCode: 'g' },
          { type: 'setMetric', rowId: row2Id, dimensionKey: DIM_INGREDIENT_WEIGHT, value: INGREDIENT_WEIGHT, unitCode: 'g' },
          { type: 'setMetric', rowId: row2Id, dimensionKey: DIM_JUICE_WEIGHT, value: JUICE_WEIGHT, unitCode: 'g' },
        ],
      },
    });
    const data = await ensureJson<{
      status: string;
      results: Array<{ status: string }>;
    }>(res, 'AT-19 batch-commands');
    expect(data.status, 'AT-19 batch should fully succeed').toBe('succeeded');
    expect(data.results, 'AT-19 should have 4 command results').toHaveLength(4);
    expect(
      data.results.every((r) => r.status === 'succeeded'),
      'AT-19 every command should succeed',
    ).toBeTruthy();

    // Authoritative assertion: poll the read projection until row 1's
    // juice_yield reflects the recompute. Robust to async recompute timing.
    await expect
      .poll(
        async () => {
          const projection = await ensureJson<{
            groups: Array<{
              rows: Array<{
                id: string;
                metrics: Record<string, { value?: number } | undefined>;
              }>;
            }>;
          }>(await request.get(`/api/task-matrices/${assemblyId}`), 'AT-19 poll juice_yield recompute');
          const cell = projection.groups
            .flatMap((g) => g.rows)
            .find((r) => r.id === row1Id)
            ?.metrics?.[DIM_JUICE_YIELD];
          return cell?.value;
        },
        { message: 'AT-19 juice_yield should recompute to ≈0.4683', timeout: 30_000, intervals: [1_000, 2_000, 5_000] },
      )
      // 1e-4 matches the ROUND(...,4) precision; tolerance absorbs float noise.
      .toBeCloseTo(EXPECTED_JUICE_YIELD, 4);
  });

  // -------------------------------------------------------------------------
  // AT-20 — paste including a calculated column → partial success.
  //
  // A batch with one observed command (ingredient_weight) and one calculated
  // command (juice_yield) no longer fails the WHOLE batch: the geometry
  // validation is per-command partial-success. The observed command succeeds,
  // the calculated command fails MATRIX_CALCULATED_VALUE_READONLY (it is a
  // known schema dimension but not an observed/editable column), and the
  // batch returns partially_succeeded with HTTP 200.
  //
  // (Previously the geometry pre-check rejected the whole batch at 422 with
  // MATRIX_BATCH_COMMAND_OUT_OF_RANGE for every command — the specced
  // partially_succeeded path was unreachable dead code. That is fixed by the
  // split of validateBatchRequest into validateBatchLevel + validateCommandGeometry.)
  // -------------------------------------------------------------------------
  test('AT-20 batch with calculated column partially succeeds (observed ok, calculated readonly)', async () => {
    test.skip(!sharedRequest || !ctx.row1Id, 'beforeAll did not provision an authenticated session + rows');
    const request = sharedRequest!;
    const { assemblyId, row1Id } = ctx;

    const res = await request.post(`/api/task-matrices/${assemblyId}/batch-commands`, {
      data: {
        clientOperationId: 'op_at20_' + Date.now(),
        baseVersion: 1,
        anchor: { rowId: row1Id, dimensionKey: DIM_INGREDIENT_WEIGHT },
        commands: [
          { type: 'setMetric', rowId: row1Id, dimensionKey: DIM_INGREDIENT_WEIGHT, value: 1000, unitCode: 'g' },
          { type: 'setMetric', rowId: row1Id, dimensionKey: DIM_JUICE_YIELD, value: 0.5 }, // calculated column
        ],
      },
    });

    // Partial success → HTTP 200 (the route only maps batch-LEVEL pre-check
    // failures to 4xx; per-command failures are surfaced in result.results).
    expect(res.status(), 'AT-20 partial-success batch should return 200').toBe(200);
    const data = await ensureJson<{
      status: string;
      results: Array<{ status: string; dimensionKey: string; error?: { code: string } }>;
    }>(res, 'AT-20 batch-commands');
    expect(data.status, 'AT-20 batch should be partially_succeeded').toBe('partially_succeeded');
    expect(data.results, 'AT-20 should have 2 command results').toHaveLength(2);

    // The observed command succeeded.
    const observed = data.results.find((r) => r.dimensionKey === DIM_INGREDIENT_WEIGHT);
    expect(observed, 'AT-20 should have an ingredient_weight result').toBeTruthy();
    expect(observed!.status, 'AT-20 observed command should succeed').toBe('succeeded');

    // The calculated command failed at geometry validation (read-only).
    const calculated = data.results.find((r) => r.dimensionKey === DIM_JUICE_YIELD);
    expect(calculated, 'AT-20 should have a juice_yield result').toBeTruthy();
    expect(calculated!.status, 'AT-20 calculated command should fail validation').toBe('validation_failed');
    expect(
      calculated!.error?.code,
      'AT-20 calculated command should carry MATRIX_CALCULATED_VALUE_READONLY',
    ).toBe('MATRIX_CALCULATED_VALUE_READONLY');
  });

  // -------------------------------------------------------------------------
  // AT-21 — limit exceeded: POST with BATCH_LIMIT+1 (501) commands → HTTP 429
  // with body.code===1 and body.data.code==='MATRIX_BATCH_LIMIT_EXCEEDED'.
  // Build 501 trivial commands targeting the anchor cell (the orchestrator
  // never writes them — the limit pre-check trips first).
  // -------------------------------------------------------------------------
  test('AT-21 batch over 500 limit returns 429 MATRIX_BATCH_LIMIT_EXCEEDED', async () => {
    test.skip(!sharedRequest || !ctx.row1Id, 'beforeAll did not provision an authenticated session + rows');
    const request = sharedRequest!;
    const { assemblyId, row1Id } = ctx;

    const overLimitCommands = Array.from({ length: BATCH_LIMIT + 1 }, (_, i) => ({
      type: 'setMetric' as const,
      rowId: row1Id,
      dimensionKey: DIM_INGREDIENT_WEIGHT,
      value: i,
      unitCode: 'g',
    }));

    const res = await request.post(`/api/task-matrices/${assemblyId}/batch-commands`, {
      data: {
        clientOperationId: 'op_at21_' + Date.now(),
        baseVersion: 1,
        anchor: { rowId: row1Id, dimensionKey: DIM_INGREDIENT_WEIGHT },
        commands: overLimitCommands,
      },
    });

    expect(res.status(), 'AT-21 over-limit batch should return 429').toBe(429);
    const body = (await res.json()) as ApiEnvelope<{ code: string }>;
    expect(body.code, 'AT-21 envelope code should be 1').toBe(1);
    expect(body.data?.code, 'AT-21 should carry MATRIX_BATCH_LIMIT_EXCEEDED').toBe('MATRIX_BATCH_LIMIT_EXCEEDED');
  });

  // -------------------------------------------------------------------------
  // AT-22 — idempotent retry: POST a batch, then POST again with the SAME
  // clientOperationId. The second call must return the same operationId, no
  // duplicate calculation run, and carry the v1 idempotency warning. This is
  // the realistic retry scenario for a batch paste (e.g. transient network
  // error → client retries with the same id). True concurrent version-conflict
  // needs two simultaneous writers and is covered by batch-paste.test.ts.
  // -------------------------------------------------------------------------
  test('AT-22 idempotent retry returns same operationId without duplicate writes', async () => {
    test.skip(!sharedRequest || !ctx.row1Id, 'beforeAll did not provision an authenticated session + rows');
    const request = sharedRequest!;
    const { assemblyId, row1Id } = ctx;

    const clientOperationId = 'op_at22_idem_' + Date.now();
    const body = {
      clientOperationId,
      baseVersion: 1,
      anchor: { rowId: row1Id, dimensionKey: DIM_INGREDIENT_WEIGHT },
      commands: [
        { type: 'setMetric', rowId: row1Id, dimensionKey: DIM_INGREDIENT_WEIGHT, value: 2000, unitCode: 'g' },
        { type: 'setMetric', rowId: row1Id, dimensionKey: DIM_JUICE_WEIGHT, value: 900, unitCode: 'g' },
      ],
    } as const;

    // First call: normal result with authoritative calculations.
    const firstData = await ensureJson<{
      operationId: string;
      authoritativeCalculations: unknown[];
    }>(await request.post(`/api/task-matrices/${assemblyId}/batch-commands`, { data: body }), 'AT-22 first batch');
    expect(firstData.operationId, 'AT-22 first operationId').toBe(clientOperationId);
    expect(
      firstData.authoritativeCalculations.length,
      'AT-22 first call should produce authoritative calculations (proves it actually wrote)',
    ).toBeGreaterThan(0);

    // Second call with the SAME clientOperationId: minimal idempotency reply.
    const secondData = await ensureJson<{
      operationId: string;
      results: unknown[];
      warnings: string[];
      authoritativeCalculations: unknown[];
    }>(await request.post(`/api/task-matrices/${assemblyId}/batch-commands`, { data: body }), 'AT-22 idempotent retry');
    expect(secondData.operationId, 'AT-22 retry should echo the same operationId').toBe(clientOperationId);
    expect(
      secondData.warnings.length,
      'AT-22 retry should carry the v1 idempotency warning',
    ).toBeGreaterThan(0);
    // v1 idempotency reply does NOT replay per-command results or calcs.
    expect(
      secondData.results,
      'AT-22 retry should not replay per-command results',
    ).toHaveLength(0);
    expect(
      secondData.authoritativeCalculations,
      'AT-22 retry should not replay authoritative calculations',
    ).toHaveLength(0);
  });
});
