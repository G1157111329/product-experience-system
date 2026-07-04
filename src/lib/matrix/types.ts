/**
 * Canonical type definitions for the data-matrix schema layer.
 *
 * A {@link MatrixSchemaJson} is the in-memory shape that gets persisted as the
 * `schema_json` blob on a `matrix_schema_versions` row; its `dimensions` and
 * `formulas` arrays are also projected into the normalized
 * `matrix_dimension_bindings` / `matrix_formula_definitions` tables for query
 * and validation. These types are shared by the schema bootstrap, the seed
 * script, and the runtime matrix services.
 */

/**
 * Minimal type for the Supabase-compatible client used across matrix services.
 * The client supports the chainable builder API: `.from(table).select(...).eq(...)...`.
 * Typed as a Record-based structural type to avoid pulling in the full Supabase SDK.
 */
export type MatrixClient = {
  from(table: string): Record<string, unknown>;
};

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
  displayFormat?: { decimals?: number; durationFormat?: 'mmss' };
  validation?: { min?: number; max?: number; enumValues?: string[] };
}

export interface FormulaDefinition {
  outputDimensionKey: string;
  formulaDsl: string;
  scope: 'row' | 'group';
  formulaVersion: string;
}

export interface MatrixSchemaAxisLevel {
  levelNo: number;
  label: string;
  required?: boolean;
}

export interface MatrixSchemaAxis {
  axisCode: string;
  axisRole: 'group' | 'row';
  levels: MatrixSchemaAxisLevel[];
}

export interface ResultStatusOption {
  value: string;
  label: string;
}

export interface MatrixSchemaJson {
  schemaKey: string;
  version: number;
  title: string;
  axes: MatrixSchemaAxis[];
  dimensions: DimensionBinding[];
  formulas: FormulaDefinition[];
  /**
   * Optional override for the result-status (效果结论) select options.
   *
   * Result status is a platform-level concept (the 效果结论 slot exists on every
   * data matrix regardless of schema), so a fixed platform default applies when
   * this field is absent (see DEFAULT_RESULT_STATUS_OPTIONS in matrix-cell.tsx).
   * A schema MAY declare its own status values here — e.g. a schema whose
   * business domain uses 不同结论语义 (合格/不合格, pass/fail, A/B/C, …). When
   * present, these options fully replace the platform default; they are not
   * merged. Note this is intentionally NOT a dimension: dimensions describe
   * measured/calculated metrics, whereas result status is a slot on the row.
   *
   * Do NOT hardcode business-specific status values in the UI — read them from
   * the schema (with the platform default as fallback).
   */
  resultStatusOptions?: ResultStatusOption[];
}
