/** Body shape for PATCH /api/matrix-rows/[id]/metrics/[dimensionKey]. */
export interface PatchMetricBody {
  value?: number | string;
  durationMs?: number;
  text?: string;
  unitCode?: string;
  valueKind?: string;
  inputState?: 'valid' | 'missing' | 'not_applicable';
  expectedVersion?: number;
  optimisticCalculations?: Record<string, number>;
}

/**
 * A dimension binding as read from matrix_dimension_bindings, narrowed to the
 * fields the validation helpers care about. column_group === 'calculated'
 * marks a computed column that must only be written by recompute, never by a
 * direct PATCH.
 */
export interface DimensionBindingLike {
  column_group?: string | null;
  editable?: boolean | null;
}

/**
 * True when the dimension is a calculated column. Such columns are read-only
 * via this endpoint; only recompute may produce their values. (Fix I3.)
 */
export function isCalculatedDimension(binding: DimensionBindingLike | null | undefined): boolean {
  return !!binding && binding.column_group === 'calculated';
}

/** Result of {@link emptyMetricBody}. */
export interface EmptyBodyCheck {
  /** No value/durationMs/text was passed at all. */
  isLiteralAllNull: boolean;
  /** Caller explicitly set inputState to not_applicable/missing (a marker). */
  isExplicitStateMarker: boolean;
}

/**
 * Determine whether a PATCH body carries an actual value vs. being empty. An
 * empty body (all three of value/durationMs/text undefined) would otherwise
 * write null to every value column — silently wiping a real value. It's only
 * acceptable when the caller explicitly passes inputState 'not_applicable' or
 * 'missing', which is the intentional "mark N/A / missing" flow. (Fix I2.)
 */
export function emptyMetricBody(body: PatchMetricBody): EmptyBodyCheck {
  const isLiteralAllNull =
    body.value === undefined && body.durationMs === undefined && body.text === undefined;
  const isExplicitStateMarker =
    body.inputState === 'not_applicable' || body.inputState === 'missing';
  return { isLiteralAllNull, isExplicitStateMarker };
}

/**
 * True if an optimistic-version check should fail: expectedVersion was supplied
 * and does not equal the row's current version. (Fix I3 — extracted from the
 * inline check so the 409 path is unit-testable.)
 */
export function versionConflict(
  expectedVersion: number | undefined,
  currentVersion: number,
): boolean {
  return expectedVersion !== undefined && expectedVersion !== currentVersion;
}
