'use client';

/**
 * Read-only V3 matrix projection for report detail / print / share.
 * Consumes frozen ReportV3MatrixProjection — no live DB.
 */
import { ReportDataMatrixReadView } from '@/components/reports/report-data-matrix-read-view';
import type { ReportV3MatrixProjection } from '@/lib/matrix/report-projection-v3-adapter';

export function ReportV3MatrixView({ projection }: { projection: ReportV3MatrixProjection }) {
  return <ReportDataMatrixReadView projection={projection} />;
}

/** Type guard for frozen V3 snapshot shape. */
export function isReportV3MatrixProjection(value: unknown): value is ReportV3MatrixProjection {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  if (v.matrixProjectionVersion === 'v3' || v.projectionVersion === 'v3') {
    return typeof v.matrixId === 'string' && Array.isArray(v.columns) && Array.isArray(v.rows);
  }
  return (
    typeof v.matrixId === 'string' &&
    Array.isArray(v.columns) &&
    Array.isArray(v.rows) &&
    !Array.isArray(v.groups)
  );
}
