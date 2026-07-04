import { expect, test, request as playwrightRequest, type APIRequestContext, type APIResponse, type Browser, type Cookie } from '@playwright/test';
import { loginForE2E } from './auth-session';

/**
 * MATRIX FORMULA BUILDER END-TO-END SMOKE (Task 7 / FB-01~04).
 *
 * Verifies the formula-builder backend contract by driving the schema lifecycle
 * endpoints directly (`POST /api/matrix-schemas` → `PUT .../draft` →
 * `POST .../publish` → `GET .../version`). The FormulaBuilder UI itself
 * (token composer, clipboard, dialog) is covered by the Task 6 manual smoke;
 * the point of these scenarios is the *backend contract* that the UI leans on:
 * the whitelist is closed, cycles are rejected, drafts round-trip, and a
 * calculated-column formula publishes cleanly.
 *
 * Auth + provisioning mirror matrix-batch-paste.spec.ts: credentials come from
 * env vars (E2E_ACCOUNT / E2E_PASSWORD) with the documented Docker local
 * defaults as the fallback, loginForE2E handles session injection, and ONE
 * shared authenticated APIRequestContext is built in beforeAll (Playwright's
 * built-in `{ request }` fixture is isolated and per-hook, so a request from
 * beforeAll cannot be reused in tests). No live DB ⇒ skip, never fail.
 *
 * SCHEMA LIFECYCLE (important): there is no DELETE endpoint for matrix-schemas
 * or matrix-schema-versions, so created test schemas cannot be torn down. Each
 * test therefore creates its own schema (rather than sharing one) with a
 * unique `e2e_test_fb_*` key derived from a timestamp. Isolating per-test
 * means FB-02/FB-03 (which exercise *rejection* paths) can never contaminate
 * FB-01's successfully published version, and a failure in one test cannot
 * poison the shared state used by another. Orphan rows are harmless and
 * identifiable by the `e2e_test_` prefix.
 */

const account = process.env.E2E_ACCOUNT || 'dockeradmin';
const password = process.env.E2E_PASSWORD || 'DockerLocal2026';

// The cookie name loginForE2E injects (see auth-session.ts). Replayed as a
// Cookie header on the shared APIRequestContext so every API call is auth'd.
const SESSION_COOKIE_NAME = 'xp_session';

/**
 * The single authenticated APIRequestContext reused by every test + afterAll.
 * Created in beforeAll (carrying the login cookie) and disposed in afterAll.
 */
let sharedRequest: APIRequestContext | null = null;

type ApiEnvelope<T> = { code: number; message?: string; data?: T };

/** Parse + envelope-check a JSON response, returning the inner `data`. Throws
 *  if the response isn't JSON or its envelope `code` isn't 0. */
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
 * Create a fresh draft schema + v1 draft version owned by the admin.
 * Returns `{ schemaId, versionId }`. Used per-test so scenarios are isolated.
 * Each schema gets a unique `e2e_test_fb_*` key (suffix avoids collisions with
 * earlier runs — there is no DELETE endpoint to clean up with).
 */
async function createTestSchema(label: string): Promise<{ schemaId: string; versionId: string }> {
  const request = sharedRequest!;
  const schemaKey = `e2e_test_fb_${label}_${Date.now()}`;
  const data = await ensureJson<{ schemaId: string; versionId: string }>(
    await request.post('/api/matrix-schemas', {
      data: { schemaKey, name: `E2E Formula Builder ${label}` },
    }),
    `create test schema (${label})`,
  );
  return { schemaId: data.schemaId, versionId: data.versionId };
}

// --- Dimension shapes shared across the scenarios ---------------------------
//
// The PUT draft route requires calculated (formula-driven) dimensions to have
// `columnGroup: 'calculated'` + `editable: false` (publish route enforces
// both). Observed dimensions are user-typed inputs and stay `editable: true`.

interface DraftDimension {
  dimensionKey: string;
  displayName: string;
  columnGroup: 'observed' | 'calculated';
  valueKind: string;
  unitCode?: string;
  required?: boolean;
  editable?: boolean;
  sortOrder: number;
  displayFormat?: { decimals?: number };
}

interface DraftFormula {
  outputDimensionKey: string;
  formulaDsl: string;
  scope: 'row' | 'group';
  formulaVersion: string;
}

/** Two observed inputs + the calculated output for the juice-yield scenario. */
function juicerDimensions(): DraftDimension[] {
  return [
    { dimensionKey: 'ingredient_weight', displayName: 'Ingredient Weight', columnGroup: 'observed', valueKind: 'number', unitCode: 'g', editable: true, sortOrder: 0, displayFormat: { decimals: 1 } },
    { dimensionKey: 'juice_weight', displayName: 'Juice Weight', columnGroup: 'observed', valueKind: 'number', unitCode: 'g', editable: true, sortOrder: 1, displayFormat: { decimals: 1 } },
    { dimensionKey: 'juice_yield', displayName: 'Juice Yield', columnGroup: 'calculated', valueKind: 'number', editable: false, sortOrder: 2, displayFormat: { decimals: 4 } },
  ];
}

test.describe.serial('Matrix formula builder (FB-01~04)', () => {
  test.beforeAll(async ({ browser }: { browser: Browser }) => {
    // 1. Login on a throwaway page, then harvest the session cookie. If login
    //    can't proceed (no live DB to sign a cookie from AND the login API is
    //    unreachable), skip the whole suite gracefully rather than erroring.
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
      test.skip(
        true,
        `no ${SESSION_COOKIE_NAME} cookie after login — auth backend not reachable or misconfigured`,
      );
      return;
    }

    // 2. Build the ONE shared authenticated APIRequestContext. The built-in
    //    { request } fixture is isolated and per-hook; this shared context
    //    carries the session cookie so every API call across the suite is auth'd.
    sharedRequest = await playwrightRequest.newContext({
      baseURL: process.env.E2E_BASE_URL || 'http://127.0.0.1:5000',
      extraHTTPHeaders: { Cookie: `${SESSION_COOKIE_NAME}=${sessionCookie.value}` },
    });
    const request = sharedRequest;

    // 3. Reachability gate: if matrix-schemas isn't reachable, there's no live
    //    backend — skip rather than chase 401/500s through every test.
    const schemasRes = await request.get('/api/matrix-schemas');
    if (!schemasRes.ok()) {
      test.skip(
        true,
        `matrix-schemas endpoint not reachable (status ${schemasRes.status()}) — no live backend; run the app on E2E_BASE_URL`,
      );
      return;
    }
  });

  test.afterAll(async () => {
    // No DELETE endpoint exists for schemas/versions, so there is nothing to
    // tear down — orphan rows are prefixed e2e_test_ and harmless. Just release
    // the shared request context.
    await sharedRequest?.dispose().catch(() => undefined);
    sharedRequest = null;
  });

  // -------------------------------------------------------------------------
  // FB-01 — happy path: save a draft with two observed columns + one
  // calculated column driven by `ROUND(SELF("juice_weight")/SELF("ingredient_weight"),4)`,
  // publish it (compile + cycle-check pass), then GET the version back and
  // confirm both dimensions and formulas persisted.
  // -------------------------------------------------------------------------
  test('FB-01 create calculated column + formula + publish', async () => {
    test.skip(!sharedRequest, 'beforeAll did not provision an authenticated session');
    const request = sharedRequest!;
    const { versionId } = await createTestSchema('fb01');

    // 1. PUT draft: two observed + one calculated dimension, one formula.
    const formulas: DraftFormula[] = [
      {
        outputDimensionKey: 'juice_yield',
        formulaDsl: 'ROUND(SELF("juice_weight")/SELF("ingredient_weight"),4)',
        scope: 'row',
        formulaVersion: 'v1',
      },
    ];
    const saved = await ensureJson<{ dimensions: number; formulas: number }>(
      await request.put(`/api/matrix-schema-versions/${versionId}/draft`, {
        data: { dimensions: juicerDimensions(), formulas },
      }),
      'FB-01 save draft',
    );
    expect(saved.formulas, 'FB-01 draft should record 1 formula').toBe(1);
    expect(saved.dimensions, 'FB-01 draft should record 3 dimensions').toBe(3);

    // 2. Publish: compile + cycle-check + binding-check all pass.
    await ensureJson(
      await request.post(`/api/matrix-schema-versions/${versionId}/publish`),
      'FB-01 publish',
    );

    // 3. GET version: dimensions + formulas survived the publish round-trip.
    const version = await ensureJson<{
      version: { status: string };
      dimensions: Array<{ dimension_key: string; column_group: string; editable: boolean }>;
      formulas: Array<{ output_dimension_key: string; formula_dsl: string; status: string }>;
    }>(await request.get(`/api/matrix-schema-versions/${versionId}`), 'FB-01 read version');

    expect(version.version.status, 'FB-01 version should be published').toBe('published');
    const yieldDim = version.dimensions.find((d) => d.dimension_key === 'juice_yield');
    expect(yieldDim, 'FB-01 published version should bind juice_yield').toBeDefined();
    expect(yieldDim?.column_group, 'FB-01 juice_yield should be calculated').toBe('calculated');
    expect(yieldDim?.editable, 'FB-01 juice_yield should be non-editable').toBe(false);

    const yieldFormula = version.formulas.find((f) => f.output_dimension_key === 'juice_yield');
    expect(yieldFormula, 'FB-01 published version should carry the juice_yield formula').toBeDefined();
    expect(yieldFormula?.formula_dsl, 'FB-01 formula DSL should round-trip verbatim').toBe(formulas[0]!.formulaDsl);
    expect(yieldFormula?.status, 'FB-01 formula should be published').toBe('published');
  });

  // -------------------------------------------------------------------------
  // FB-02 — cycle detection: two calculated columns that reference each other
  // (a→b, b→a) must compile individually but be rejected at publish with 422
  // MATRIX_FORMULA_CYCLE. Uses its own schema so the rejection can't leave a
  // half-published state on FB-01's version.
  // -------------------------------------------------------------------------
  test('FB-02 cycle detection rejects publish', async () => {
    test.skip(!sharedRequest, 'beforeAll did not provision an authenticated session');
    const request = sharedRequest!;
    const { versionId } = await createTestSchema('fb02');

    const dimensions: DraftDimension[] = [
      { dimensionKey: 'a', displayName: 'A', columnGroup: 'calculated', valueKind: 'number', editable: false, sortOrder: 0 },
      { dimensionKey: 'b', displayName: 'B', columnGroup: 'calculated', valueKind: 'number', editable: false, sortOrder: 1 },
    ];
    const formulas: DraftFormula[] = [
      { outputDimensionKey: 'a', formulaDsl: 'SELF("b")', scope: 'row', formulaVersion: 'v1' },
      { outputDimensionKey: 'b', formulaDsl: 'SELF("a")', scope: 'row', formulaVersion: 'v1' },
    ];

    // Draft saves fine — each formula parses and its deps resolve.
    await ensureJson(
      await request.put(`/api/matrix-schema-versions/${versionId}/draft`, { data: { dimensions, formulas } }),
      'FB-02 save cyclic draft',
    );

    // Publish must reject with 422 + the cycle sentinel.
    const publishRes = await request.post(`/api/matrix-schema-versions/${versionId}/publish`);
    expect(publishRes.status(), 'FB-02 cyclic publish must be rejected').toBe(422);
    const body = (await publishRes.json()) as ApiEnvelope<{ code?: string }> & { code?: string | number };
    const code = typeof body.code === 'string' ? body.code : body.data?.code;
    expect(code, 'FB-02 rejection must carry the cycle sentinel').toBe('MATRIX_FORMULA_CYCLE');
  });

  // -------------------------------------------------------------------------
  // FB-03 — whitelist closure: a formula using `INDIRECT("H1")` (an Excel-ism
  // outside the SELF/REF/GROUP_* + scalar-function whitelist) must be rejected
  // at the draft-save layer with 422 PARSE_ERROR. This proves the whitelist is
  // closed even at the API layer — a client bypassing FormulaBuilder can't
  // smuggle in arbitrary constructs.
  // -------------------------------------------------------------------------
  test('FB-03 whitelist rejects INDIRECT', async () => {
    test.skip(!sharedRequest, 'beforeAll did not provision an authenticated session');
    const request = sharedRequest!;
    const { versionId } = await createTestSchema('fb03');

    const dimensions: DraftDimension[] = [
      { dimensionKey: 'x', displayName: 'X', columnGroup: 'calculated', valueKind: 'number', editable: false, sortOrder: 0 },
    ];
    const formulas: DraftFormula[] = [
      { outputDimensionKey: 'x', formulaDsl: 'INDIRECT("H1")', scope: 'row', formulaVersion: 'v1' },
    ];

    // PUT draft must reject: INDIRECT isn't in the whitelist, so compile fails.
    const draftRes = await request.put(`/api/matrix-schema-versions/${versionId}/draft`, {
      data: { dimensions, formulas },
    });
    expect(draftRes.status(), 'FB-03 INDIRECT draft must be rejected').toBe(422);
    const body = (await draftRes.json()) as ApiEnvelope<{ code?: string }> & { code?: string | number };
    const code = typeof body.code === 'string' ? body.code : body.data?.code;
    expect(code, 'FB-03 rejection must carry the parse-error sentinel').toBe('MATRIX_FORMULA_PARSE_ERROR');
  });

  // -------------------------------------------------------------------------
  // FB-04 — draft round-trip: PUT a known set of dimensions + formulas, then
  // GET the version and confirm they persisted verbatim (keys, columnGroup,
  // formula DSL). Proves the draft survives a write→read cycle independent of
  // the publish path.
  // -------------------------------------------------------------------------
  test('FB-04 draft persists across round-trip', async () => {
    test.skip(!sharedRequest, 'beforeAll did not provision an authenticated session');
    const request = sharedRequest!;
    const { versionId } = await createTestSchema('fb04');

    const dimensions = juicerDimensions();
    const formulas: DraftFormula[] = [
      {
        outputDimensionKey: 'juice_yield',
        formulaDsl: 'ROUND(SELF("juice_weight")/SELF("ingredient_weight"),4)',
        scope: 'row',
        formulaVersion: 'v1',
      },
    ];

    await ensureJson(
      await request.put(`/api/matrix-schema-versions/${versionId}/draft`, { data: { dimensions, formulas } }),
      'FB-04 save draft',
    );

    const version = await ensureJson<{
      version: { status: string };
      dimensions: Array<{ dimension_key: string; column_group: string; editable: boolean; sort_order: number }>;
      formulas: Array<{ output_dimension_key: string; formula_dsl: string; scope: string; formula_version: string }>;
    }>(await request.get(`/api/matrix-schema-versions/${versionId}`), 'FB-04 read draft back');

    // Draft state, not yet published.
    expect(version.version.status, 'FB-04 version should still be a draft').toBe('draft');

    // All three dimensions persisted with their declared shape.
    const dimKeys = version.dimensions.map((d) => d.dimension_key);
    expect(dimKeys, 'FB-04 should persist all 3 dimensions').toEqual(
      expect.arrayContaining(['ingredient_weight', 'juice_weight', 'juice_yield']),
    );
    const yieldDim = version.dimensions.find((d) => d.dimension_key === 'juice_yield');
    expect(yieldDim?.column_group, 'FB-04 juice_yield columnGroup round-trips').toBe('calculated');
    expect(yieldDim?.editable, 'FB-04 juice_yield editable flag round-trips').toBe(false);

    // The formula persisted with its DSL + scope + version verbatim.
    expect(version.formulas, 'FB-04 should persist 1 formula').toHaveLength(1);
    const f = version.formulas[0]!;
    expect(f.output_dimension_key, 'FB-04 formula output key round-trips').toBe('juice_yield');
    expect(f.formula_dsl, 'FB-04 formula DSL round-trips verbatim').toBe(formulas[0]!.formulaDsl);
    expect(f.scope, 'FB-04 formula scope round-trips').toBe('row');
    expect(f.formula_version, 'FB-04 formula version round-trips').toBe('v1');
  });
});
