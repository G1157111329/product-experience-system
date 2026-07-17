/** Presentation-only numeric formatting shared by matrix entry and readers. */
export function formatMatrixNumber(value: unknown, decimalPlaces: number | null | undefined): string {
  if (value === null || value === undefined || value === '') return '';
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) return String(value);
  const precision = Number.isInteger(decimalPlaces)
    ? Math.max(0, Math.min(10, decimalPlaces as number))
    : null;
  return precision === null ? String(numeric) : numeric.toFixed(precision);
}
