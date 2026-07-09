'use client';

/**
 * Read-only V3 matrix projection for report detail / print / share.
 * Consumes frozen ReportV3MatrixProjection — no live DB.
 */
import { Badge } from '@/components/ui/badge';
import type { ReportV3MatrixProjection } from '@/lib/matrix/report-projection-v3-adapter';
import { ReportMediaPreview } from './report-media-preview';

export function ReportV3MatrixView({ projection }: { projection: ReportV3MatrixProjection }) {
  const columns = [...projection.columns].sort((a, b) => a.displayOrder - b.displayOrder);
  const rows = [...projection.rows].sort((a, b) => a.visibleRowIndex - b.visibleRowIndex);

  return (
    <div className="space-y-3 p-4">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Badge variant="secondary">{projection.matrixName || '数据矩阵'}</Badge>
        <span className="text-muted-foreground">
          {projection.summary.totalRows} 行 / {projection.summary.totalColumns} 列
          {projection.summary.filledCells > 0 ? ` · ${projection.summary.filledCells} 已填` : ''}
        </span>
        {projection.frozenAt && (
          <span className="text-xs text-muted-foreground">冻结于 {projection.frozenAt.slice(0, 19).replace('T', ' ')}</span>
        )}
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full min-w-[640px] border-collapse text-xs">
          <thead>
            <tr className="bg-muted">
              <th className="border-b border-r p-2 text-left">一级</th>
              <th className="border-b border-r p-2 text-left">二级</th>
              <th className="border-b border-r p-2 text-left">三级</th>
              {columns.map((col) => (
                <th key={col.id} className="border-b border-r p-2 text-left whitespace-nowrap">
                  {col.label}
                  {col.unitText ? ` (${col.unitText})` : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="align-top">
                <td className="border-b border-r p-2">{row.level1Label || '-'}</td>
                <td className="border-b border-r p-2">{row.level2Label || '-'}</td>
                <td className="border-b border-r p-2">{row.level3Label || '-'}</td>
                {columns.map((col) => {
                  const mediaKey = `${row.id}:${col.id}`;
                  const media = projection.cellMedia?.[mediaKey] ?? [];
                  return (
                    <td key={col.id} className="border-b border-r p-2">
                      {row.cells[col.id] || ''}
                      {media.length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {media.map((m) => m.fileUrl ? (
                            <ReportMediaPreview
                              key={m.materialId}
                              filePath={m.fileUrl}
                              type={m.materialType}
                              name={m.fileName || ''}
                              size="sm"
                            />
                          ) : null)}
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {projection.narratives.length > 0 && (
        <div className="space-y-2 text-sm">
          {projection.narratives.map((n, i) => (
            <div key={`${n.blockType}-${i}`} className="rounded-md border p-3">
              <div className="mb-1 text-xs text-muted-foreground">
                {n.blockType === 'summary' ? '小结' : '备注'}
              </div>
              <p className="whitespace-pre-wrap">{n.content}</p>
            </div>
          ))}
        </div>
      )}

      {projection.issuePoints.length > 0 && (
        <div className="space-y-1 text-sm">
          <div className="text-xs font-medium text-muted-foreground">问题点</div>
          <ul className="list-disc space-y-1 pl-5">
            {projection.issuePoints.map((ip, i) => (
              <li key={i}>
                行 {ip.leafRowIndex + 1}：{ip.issueText}
                {ip.status ? `（${ip.status}）` : ''}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
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
