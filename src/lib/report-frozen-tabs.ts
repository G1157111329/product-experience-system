import {
  hasMeaningfulComparisonCell,
  hasMeaningfulV2Projection,
  hasMeaningfulV3Projection,
} from './matrix/meaningful-content';

type UnknownRecord = Record<string, unknown>;

export type ReportFrozenTabKey =
  | 'summary'
  | 'issues'
  | 'data_matrix'
  | 'comparison_matrix'
  | 'function_effect';

export interface FrozenTabInput {
  reportType?: unknown;
  dataMatrixProjection?: unknown;
  comparisonSnapshot?: unknown;
  recipes?: unknown;
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasCellMedia(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return ['inline_media', 'appendix_media', 'media'].some((key) => (
    Array.isArray(value[key]) && value[key].length > 0
  ));
}

function hasMeaningfulComparison(snapshot: unknown): boolean {
  if (!isRecord(snapshot)) return false;
  if (!Array.isArray(snapshot.objects) || snapshot.objects.length === 0) return false;
  if (!Array.isArray(snapshot.item_nodes) || snapshot.item_nodes.length === 0) return false;
  const cells = snapshot.cells ?? snapshot.matrix_cells;
  const values = Array.isArray(cells)
    ? cells
    : isRecord(cells)
      ? Object.values(cells)
      : [];
  return values.some((cell) => hasMeaningfulComparisonCell(cell) || hasCellMedia(cell));
}

function hasMeaningfulDataMatrix(projection: unknown): boolean {
  if (!isRecord(projection)) return false;
  const isV3 = projection.projectionVersion === 'v3' || projection.matrixProjectionVersion === 'v3';
  return isV3
    ? hasMeaningfulV3Projection(projection)
    : hasMeaningfulV2Projection(projection);
}

export function buildReportFrozenTabs(input: FrozenTabInput): ReportFrozenTabKey[] {
  const tabs: ReportFrozenTabKey[] = ['summary', 'issues'];
  if (hasMeaningfulDataMatrix(input.dataMatrixProjection)) tabs.push('data_matrix');
  if (input.reportType === 'comparison_report' && hasMeaningfulComparison(input.comparisonSnapshot)) {
    tabs.push('comparison_matrix');
  }
  if (Array.isArray(input.recipes) && input.recipes.length > 0) tabs.push('function_effect');
  return tabs;
}
