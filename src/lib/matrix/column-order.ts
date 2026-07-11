export const MATRIX_COLUMN_ZONE_ORDER = [
  'hierarchy',
  'primary_media',
  'comparison_category',
  'detail_dimension',
  'calculation_dimension',
  'effect_media',
  'evaluation',
  'issue_point',
] as const;

type OrderedColumn = { id: string; columnZone: string; displayOrder: number };

function zoneRank(zone: string) {
  const index = MATRIX_COLUMN_ZONE_ORDER.indexOf(zone as (typeof MATRIX_COLUMN_ZONE_ORDER)[number]);
  return index === -1 ? MATRIX_COLUMN_ZONE_ORDER.length : index;
}

/** Places a new column at the end of its semantic zone and renumbers all zones. */
export function planMatrixColumnOrder(existing: OrderedColumn[], newColumnId: string, newColumnZone: string) {
  const combined = [...existing, { id: newColumnId, columnZone: newColumnZone, displayOrder: Number.MAX_SAFE_INTEGER }];
  return combined
    .sort((left, right) => zoneRank(left.columnZone) - zoneRank(right.columnZone) || left.displayOrder - right.displayOrder)
    .map((column, index) => ({ ...column, displayOrder: (index + 1) * 10 }));
}
