import type { ColumnDataType, ColumnZone } from './v3-types';

type MatrixMobileColumn = {
  id: string;
  columnZone: ColumnZone;
  dataType: ColumnDataType;
  isRequired: boolean;
  columnLabel: string;
};

type MatrixMobileCell = {
  valueState: string;
  valueText: string | null;
  valueNumber?: string | null;
  displayText?: string | null;
};

export type MatrixMobileGroupId = 'input' | 'calculation' | 'media' | 'evaluation' | 'issue';

export type MatrixMobileGroup<TColumn extends MatrixMobileColumn = MatrixMobileColumn> = {
  id: MatrixMobileGroupId;
  label: string;
  columns: TColumn[];
  defaultExpanded: boolean;
};

const GROUPS: Array<{ id: MatrixMobileGroupId; label: string }> = [
  { id: 'input', label: '输入' },
  { id: 'calculation', label: '计算' },
  { id: 'media', label: '素材' },
  { id: 'evaluation', label: '评价' },
  { id: 'issue', label: '问题' },
];

function getGroupId(column: MatrixMobileColumn): MatrixMobileGroupId | null {
  if (column.columnZone === 'hierarchy') return null;
  if (column.columnZone === 'calculation_dimension') return 'calculation';
  if (column.columnZone === 'primary_media' || column.columnZone === 'effect_media') return 'media';
  if (column.columnZone === 'evaluation') return 'evaluation';
  if (column.columnZone === 'issue_point') return 'issue';
  return 'input';
}

function hasCellContent(cell: MatrixMobileCell | undefined): boolean {
  if (!cell) return false;
  return cell.valueState !== 'empty' && (
    Boolean(cell.valueText?.trim()) ||
    Boolean(cell.valueNumber?.trim()) ||
    Boolean(cell.displayText?.trim()) ||
    cell.valueState === 'calculation_failed' ||
    cell.valueState === 'invalid'
  );
}

export function buildMatrixMobileGroups<TColumn extends MatrixMobileColumn>({
  columns,
  cells,
  cellMedia,
  issuePoints,
  leafRowId,
}: {
  columns: readonly TColumn[];
  cells: Record<string, MatrixMobileCell>;
  cellMedia: Record<string, Array<{ materialId: string }>>;
  issuePoints: Array<{ leafRowId: string; columnId: string; issueText: string }>;
  leafRowId: string;
}): MatrixMobileGroup<TColumn>[] {
  return GROUPS.flatMap(({ id, label }) => {
    const groupColumns = columns.filter((column) => getGroupId(column) === id);
    if (groupColumns.length === 0) return [];

    const hasRequired = groupColumns.some((column) => column.isRequired);
    const hasContent = groupColumns.some((column) => {
      const key = `${leafRowId}:${column.id}`;
      return hasCellContent(cells[key]) || (cellMedia[key]?.length ?? 0) > 0;
    });
    const hasIssue = id === 'issue' && issuePoints.some(
      (issue) => issue.leafRowId === leafRowId && Boolean(issue.issueText.trim()),
    );

    return [{
      id,
      label,
      columns: [...groupColumns],
      defaultExpanded: hasRequired || hasContent || hasIssue,
    }];
  });
}

export function getAdjacentMatrixRowIndex(
  currentIndex: number,
  direction: -1 | 1,
  rowCount: number,
): number {
  if (rowCount <= 0) return 0;
  return Math.min(Math.max(currentIndex + direction, 0), rowCount - 1);
}
