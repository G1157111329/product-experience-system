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

export interface MatrixSchemaJson {
  schemaKey: string;
  version: number;
  title: string;
  axes: MatrixSchemaAxis[];
  dimensions: DimensionBinding[];
  formulas: FormulaDefinition[];
}
