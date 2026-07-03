import assert from 'node:assert/strict';
import {
  isCalculatedDimension,
  emptyMetricBody,
  versionConflict,
  type DimensionBindingLike,
} from './route';

/**
 * Route-level validation tests for the metric PATCH endpoint.
 *
 * Task 8 review item I3: cover the two 409 paths:
 *   1. PATCHing a *calculated* column → 409 MATRIX_CALCULATED_VALUE_READONLY.
 *   2. expectedVersion not matching the current row version → 409
 *      MATRIX_VERSION_CONFLICT.
 *
 * The endpoint's body-validation + dimension/version checks were extracted into
 * pure helpers (isCalculatedDimension / versionConflict / emptyMetricBody) so
 * they can be exercised without standing up the full Next.js Request/params
 * runtime. These tests assert the helper outcomes that drive the 409 responses
 * (and a couple of related 400 / happy-path cases for completeness), mirroring
 * exactly what the route handler branches on.
 */

async function main() {
  // --- I3 (1): calculated column is read-only → 409 -------------------------
  // The route calls isCalculatedDimension(binding); when true it returns
  // 409 { code: 'MATRIX_CALCULATED_VALUE_READONLY' }.
  {
    const calcBinding: DimensionBindingLike = {
      column_group: 'calculated',
      editable: false,
    };
    assert.equal(
      isCalculatedDimension(calcBinding),
      true,
      'a calculated column_group must be detected as calculated',
    );

    // An observed column is writable.
    assert.equal(
      isCalculatedDimension({ column_group: 'observed', editable: true }),
      false,
      'an observed column is not calculated',
    );

    // null / undefined binding is not calculated (the route returns 404 for a
    // missing binding before reaching this check, but the helper is defensive).
    assert.equal(isCalculatedDimension(null), false);
    assert.equal(isCalculatedDimension(undefined), false);
  }

  // --- I3 (2): expectedVersion mismatch → 409 MATRIX_VERSION_CONFLICT -------
  // The route reads the current row version and calls versionConflict(...);
  // when true it returns 409 { code: 'MATRIX_VERSION_CONFLICT',
  // latestVersion: currentVersion }.
  {
    // Stale expectedVersion → conflict.
    assert.equal(
      versionConflict(3, 5),
      true,
      'expectedVersion=3 vs current=5 must be a conflict',
    );
    // Matching expectedVersion → no conflict.
    assert.equal(
      versionConflict(5, 5),
      false,
      'expectedVersion=5 vs current=5 must NOT be a conflict',
    );
    // No expectedVersion supplied → optimistic-lock check is skipped (no
    // conflict), so a first-time write (currentVersion 0) succeeds.
    assert.equal(
      versionConflict(undefined, 0),
      false,
      'absent expectedVersion must not conflict',
    );
    assert.equal(
      versionConflict(undefined, 5),
      false,
      'absent expectedVersion must not conflict even with an existing row',
    );
  }

  // --- I2: empty body → 400 (regression guard for the same route) -----------
  // The route rejects an all-null body unless the caller explicitly marks the
  // cell N/A / missing. emptyMetricBody drives that branch.
  {
    const empty = emptyMetricBody({});
    assert.equal(empty.isLiteralAllNull, true);
    assert.equal(empty.isExplicitStateMarker, false);

    const withValue = emptyMetricBody({ value: 558.7 });
    assert.equal(withValue.isLiteralAllNull, false);

    const withDuration = emptyMetricBody({ durationMs: 1200 });
    assert.equal(withDuration.isLiteralAllNull, false);

    const withText = emptyMetricBody({ text: '备注' });
    assert.equal(withText.isLiteralAllNull, false);

    // Explicit N/A marker with no value → allowed (not a 400).
    const naMarker = emptyMetricBody({ inputState: 'not_applicable' });
    assert.equal(naMarker.isLiteralAllNull, true);
    assert.equal(naMarker.isExplicitStateMarker, true);

    // Explicit missing marker with no value → allowed.
    const missingMarker = emptyMetricBody({ inputState: 'missing' });
    assert.equal(missingMarker.isLiteralAllNull, true);
    assert.equal(missingMarker.isExplicitStateMarker, true);

    // inputState 'valid' (the default) is NOT an explicit marker, so an empty
    // body with valid state must still be rejected.
    const validEmpty = emptyMetricBody({ inputState: 'valid' });
    assert.equal(validEmpty.isLiteralAllNull, true);
    assert.equal(validEmpty.isExplicitStateMarker, false);
  }

  console.log('matrix metric route validation tests passed');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
