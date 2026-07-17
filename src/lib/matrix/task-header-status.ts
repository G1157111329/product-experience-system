import { hasMeaningfulComparisonCell } from './meaningful-content';

export function hasMeaningfulActiveMatrix(
  matrices: Array<{ status: string; meaningful: boolean }>,
): boolean {
  return matrices.some((matrix) => matrix.status !== 'archived' && matrix.meaningful);
}

export function hasMeaningfulActiveComparison(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const record = value as { status?: unknown; cells?: unknown };
  if (record.status === 'archived') return false;
  return Array.isArray(record.cells) && record.cells.some(hasMeaningfulComparisonCell);
}
