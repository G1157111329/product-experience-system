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

function hasMeaningfulFunctionEffect(recipes: unknown): boolean {
  if (!Array.isArray(recipes)) return false;
  return recipes.some((recipe) => {
    if (!isRecord(recipe)) return false;
    const hasEvaluation = ['effect_description', 'effect_evaluation', 'effect_score', 'effect_ai_result']
      .some((key) => {
        const value = recipe[key];
        if (typeof value === 'string') return value.trim().length > 0;
        if (typeof value === 'number') return Number.isFinite(value);
        return isRecord(value);
      });
    const hasMedia = ['effect_materials', 'effect_material_ids', 'materials']
      .some((key) => Array.isArray(recipe[key]) && recipe[key].length > 0);
    return hasEvaluation || hasMedia;
  });
}

export function buildReportFrozenTabs(input: FrozenTabInput): ReportFrozenTabKey[] {
  const tabs: ReportFrozenTabKey[] = ['summary', 'issues'];
  if (input.reportType === 'comparison_report' && hasMeaningfulComparison(input.comparisonSnapshot)) {
    tabs.push('comparison_matrix');
  }
  if (hasMeaningfulDataMatrix(input.dataMatrixProjection)) tabs.push('data_matrix');
  if (hasMeaningfulFunctionEffect(input.recipes)) tabs.push('function_effect');
  return tabs;
}
