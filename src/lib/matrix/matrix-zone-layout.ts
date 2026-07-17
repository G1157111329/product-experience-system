import type { ColumnZone, V3Column } from './v3-types';

type MatrixLayoutColumn = Pick<
  V3Column,
  'id' | 'columnZone' | 'zoneRole' | 'displayOrder' | 'desktopWidthPx'
>;

export type MatrixZoneAnchor = {
  zone:
    | 'hierarchy'
    | 'primary_media'
    | 'comparison_input'
    | 'calculation_dimension'
    | 'effect_media'
    | 'evaluation'
    | 'issue_point';
  label: string;
  columnId: string;
  scrollLeft: number;
};

const ZONE_LABELS: Record<MatrixZoneAnchor['zone'], string> = {
  hierarchy: '层级',
  primary_media: '主素材',
  comparison_input: '对比/输入',
  calculation_dimension: '计算',
  effect_media: '效果素材',
  evaluation: '效果评价',
  issue_point: '问题点',
};

const ZONE_ORDER: MatrixZoneAnchor['zone'][] = [
  'hierarchy',
  'primary_media',
  'comparison_input',
  'calculation_dimension',
  'effect_media',
  'evaluation',
  'issue_point',
];

function getAnchorZone(columnZone: ColumnZone): MatrixZoneAnchor['zone'] {
  return columnZone === 'comparison_category' || columnZone === 'detail_dimension'
    ? 'comparison_input'
    : columnZone;
}

export function getMatrixColumnDisplayWidth(column: MatrixLayoutColumn): number {
  return column.zoneRole === 'B'
    ? Math.max(220, column.desktopWidthPx)
    : column.desktopWidthPx;
}

function ordered(columns: readonly MatrixLayoutColumn[]): MatrixLayoutColumn[] {
  return [...columns].sort((left, right) => left.displayOrder - right.displayOrder);
}

export function getMatrixZoneAnchors(
  columns: readonly MatrixLayoutColumn[],
): MatrixZoneAnchor[] {
  const sortedColumns = ordered(columns);
  let scrollLeft = 0;
  const pinnedHierarchyWidth = sortedColumns
    .filter((column) => column.columnZone === 'hierarchy')
    .reduce((total, column) => total + getMatrixColumnDisplayWidth(column), 0);
  const firstColumnByZone = new Map<MatrixZoneAnchor['zone'], { columnId: string; scrollLeft: number }>();

  for (const column of sortedColumns) {
    const zone = getAnchorZone(column.columnZone);
    if (!firstColumnByZone.has(zone)) {
      firstColumnByZone.set(zone, {
        columnId: column.id,
        scrollLeft: Math.max(0, scrollLeft - pinnedHierarchyWidth),
      });
    }
    scrollLeft += getMatrixColumnDisplayWidth(column);
  }

  return ZONE_ORDER.flatMap((zone) => {
    const anchor = firstColumnByZone.get(zone);
    return anchor
      ? [{ zone, label: ZONE_LABELS[zone], columnId: anchor.columnId, scrollLeft: anchor.scrollLeft }]
      : [];
  });
}

export function getPinnedHierarchyOffsets(
  columns: readonly MatrixLayoutColumn[],
): Record<string, number> {
  let left = 0;
  const offsets: Record<string, number> = {};

  for (const column of ordered(columns)) {
    if (column.columnZone !== 'hierarchy') continue;
    offsets[column.id] = left;
    left += getMatrixColumnDisplayWidth(column);
  }

  return offsets;
}

export function getPinnedHierarchyBoundaryId(
  columns: readonly MatrixLayoutColumn[],
): string | null {
  const hierarchyColumns = ordered(columns).filter(
    (column) => column.columnZone === 'hierarchy',
  );

  return hierarchyColumns.at(-1)?.id ?? null;
}
