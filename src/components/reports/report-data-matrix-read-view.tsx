'use client';

import { useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import { ReportMediaGrid } from '@/components/reports/report-media-grid';
import {
  isFrozenV3MatrixProjection,
  type ReportV3Column,
  type ReportV3MatrixProjection,
} from '@/lib/matrix/report-projection-v3-adapter';
import {
  dataMatrixReadLayout,
  type ReportDataMatrixReadField,
  type ReportDataMatrixReadMedia,
} from '@/lib/report-data-matrix-layout';
import { buildDesktopDataMatrixRows, buildMobileDataMatrixRows } from '@/lib/report-mobile-matrix-layout';

const GROUP_LABELS = {
  inputs: '输入',
  calculated: '计算',
  evaluation: '效果评价',
} as const;

function displayValue(field: ReportDataMatrixReadField) {
  const value = String(field.value);
  if (!field.unit || value.includes(field.unit)) return value;
  return `${value} ${field.unit}`;
}

function MatrixMedia({ items }: { items: ReportDataMatrixReadMedia[] }) {
  if (items.length === 0) return null;
  return <ReportMediaGrid items={items} role="matrix" label="矩阵素材" />;
}

type FrozenColumnGroup = 'input' | 'calculated' | 'effect_media' | 'evaluation' | 'issues';

function frozenColumnGroup(column: ReportV3Column): FrozenColumnGroup {
  const zone = column.zone.toLowerCase();
  if (zone === 'calculated' || zone === 'calculation') return 'calculated';
  if (zone === 'primary_media' || zone === 'effect_media') return 'effect_media';
  if (zone === 'evaluation') return 'evaluation';
  if (zone === 'issue_point') return 'issues';
  return 'input';
}

function frozenColumns(columns: ReportV3Column[]) {
  return [...columns]
    .sort((left, right) => left.displayOrder - right.displayOrder)
    .filter((column) => column.zone !== 'hierarchy');
}

function frozenMedia(projection: ReportV3MatrixProjection, rowId: string, columnId: string) {
  return (projection.cellMedia[`${rowId}:${columnId}`] || []).flatMap((item, index) => {
    const url = item.filePath || item.fileUrl;
    if (!url) return [];
    return [{
      id: item.materialId || `${rowId}:${columnId}:${index}`,
      name: item.fileName || '素材',
      type: item.materialType || 'image',
      url,
    }];
  });
}

function issueStatusClass(status: string) {
  if (status === 'verified_closed') return 'border-emerald-200 bg-emerald-50 text-emerald-800';
  if (status === 'rectifying') return 'border-amber-200 bg-amber-50 text-amber-900';
  return 'border-red-200 bg-red-50 text-red-800';
}

function FrozenV3MatrixTable({ projection }: { projection: ReportV3MatrixProjection }) {
  const columns = frozenColumns(projection.columns);
  const groups = projection.rows.reduce<Array<{ label: string; rows: ReportV3MatrixProjection['rows'] }>>((items, row) => {
    const label = row.level1Label || '未分类';
    const current = items[items.length - 1];
    if (current?.label === label) current.rows.push(row);
    else items.push({ label, rows: [row] });
    return items;
  }, []);
  const totalColumns = columns.length + 2;
  const hierarchyWidths = [11, 14] as const;
  const columnWeights: Record<FrozenColumnGroup, number> = {
    input: 10,
    calculated: 10,
    effect_media: 28,
    evaluation: 12,
    issues: 12,
  };
  const weightedColumns = columns.map((column) => {
    const group = frozenColumnGroup(column);
    return columnWeights[group];
  });
  const weightedTotal = weightedColumns.reduce((sum, width) => sum + width, 0);
  const dataBudget = 100 - hierarchyWidths[0] - hierarchyWidths[1];
  const widthScale = dataBudget / Math.max(weightedTotal, 1);
  const mobileRows = buildMobileDataMatrixRows(projection);
  const desktopRows = buildDesktopDataMatrixRows(projection);
  const desktopFields = new Map(desktopRows.map((row) => [
    row.id,
    new Map(row.groups.flatMap((group) => group.fields).map((field) => [field.id, field])),
  ]));

  return (
    <div data-testid="frozen-v3-matrix-table" className="min-w-0 space-y-2 [container-type:inline-size]">
      <p className="px-1 text-xs text-muted-foreground">{projection.summary.totalRows} 行 / {totalColumns} 列</p>
      <div className="space-y-3 md:hidden" data-testid="frozen-v3-matrix-mobile-reader">
        {mobileRows.map((row, rowIndex) => (
          <article key={row.id} className="space-y-3 rounded-lg border border-slate-300 bg-background p-3 shadow-sm">
            <div>
              <p className="text-xs font-medium text-muted-foreground">第 {rowIndex + 1} 行</p>
              <p className="mt-1 break-words text-sm font-semibold">{row.path.join(' / ') || '未命名行'}</p>
            </div>
            {row.groups.map((group) => (
              <section key={group.id} className="space-y-2">
                <h4 className="text-xs font-medium text-muted-foreground">{group.label}</h4>
                {group.fields.map((field) => (
                  <div key={field.id} className="space-y-2 rounded-md bg-muted/25 p-2.5 text-sm">
                    <p className="break-words text-xs text-muted-foreground">{field.label}{field.unit ? ` (${field.unit})` : ''}</p>
                    <p className="whitespace-pre-wrap break-words font-medium">{field.value === '' || field.value === null || field.value === undefined ? '—' : String(field.value)}</p>
                    {field.media.length > 0 && <ReportMediaGrid items={field.media} role="matrix" adaptiveThumbnail carrierKey={`${row.id}:${field.id}:mobile`} />}
                    {field.issues.length > 0 && <div className="space-y-1.5">{field.issues.map((issue) => (
                      <div key={issue.id} className={`whitespace-pre-wrap break-words rounded border px-2 py-1.5 ${issueStatusClass(issue.status)}`}>{issue.text}</div>
                    ))}</div>}
                  </div>
                ))}
              </section>
            ))}
          </article>
        ))}
      </div>
      <div className="hidden w-full rounded-lg border border-slate-300 bg-background shadow-sm md:block" data-testid="frozen-v3-matrix-desktop-table">
        <table className="w-full table-fixed border-collapse text-xs leading-5 [@container(max-width:520px)]:leading-4">
          <colgroup>
            <col style={{ width: `${hierarchyWidths[0]}%` }} />
            <col style={{ width: `${hierarchyWidths[1]}%` }} />
            {columns.map((column, index) => <col key={column.id} style={{ width: `${weightedColumns[index] * widthScale}%` }} />)}
          </colgroup>
          <thead className="text-slate-700">
            <tr className="bg-slate-100">
              <th className="border-b border-r border-slate-300 px-2 py-2 text-left font-semibold break-words [@container(max-width:720px)]:px-1 [@container(max-width:720px)]:py-1.5">一级大类</th>
              <th className="border-b border-r border-slate-300 px-2 py-2 text-left font-semibold break-words [@container(max-width:720px)]:px-1 [@container(max-width:720px)]:py-1.5">二级细项</th>
              {columns.map((column) => (
                <th key={column.id} className="border-b border-r border-slate-300 px-2 py-2 text-center font-medium break-words [@container(max-width:720px)]:px-1 [@container(max-width:720px)]:py-1.5">
                  {column.label}{column.unitText ? <span className="ml-1 text-[inherit] font-normal text-muted-foreground">({column.unitText})</span> : null}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groups.flatMap((group, groupIndex) => group.rows.map((row, rowIndex) => (
                  <tr key={row.id} className={groupIndex % 2 === 0 ? 'bg-sky-50/40' : 'bg-amber-50/40'}>
                    {rowIndex === 0 && (
                      <th rowSpan={group.rows.length} scope="rowgroup" className="border-b border-r border-slate-300 px-2 py-2 text-center align-middle font-semibold break-words [@container(max-width:720px)]:px-1 [@container(max-width:720px)]:py-1.5">
                        {group.label}
                      </th>
                    )}
                    <td className="border-b border-r border-slate-300 px-2 py-2 align-top break-words [@container(max-width:720px)]:px-1 [@container(max-width:720px)]:py-1.5">{row.level2Label || '—'}</td>
                    {columns.map((column) => {
                      const issues = projection.issuePoints.filter((issue) => issue.leafRowId === row.id && issue.columnId === column.id);
                      const media = frozenMedia(projection, row.id, column.id);
                      const isMediaColumn = frozenColumnGroup(column) === 'effect_media';
                      const isIssueColumn = frozenColumnGroup(column) === 'issues';
                      const rawValue = desktopFields.get(row.id)?.get(column.id)?.value;
                      const hasRawValue = rawValue !== '' && rawValue !== null && rawValue !== undefined;
                      const hasSupplement = (isMediaColumn && media.length > 0) || (isIssueColumn && issues.length > 0);
                      return (
                        <td key={column.id} className="border-b border-r border-slate-300 px-2 py-2 align-top break-words [@container(max-width:720px)]:px-1 [@container(max-width:720px)]:py-1.5">
                          <div className="space-y-1.5">
                            {hasRawValue && (
                              <span className={frozenColumnGroup(column) === 'calculated' ? 'block text-right tabular-nums' : 'block whitespace-pre-wrap break-words'}>{String(rawValue)}</span>
                            )}
                            {isMediaColumn && media.length > 0 && <ReportMediaGrid items={media} role="matrix" adaptiveThumbnail carrierKey={`${row.id}:${column.id}`} />}
                            {isIssueColumn && issues.length > 0 && <div className="space-y-1.5">{issues.map((issue) => <div key={issue.id} className={`whitespace-pre-wrap break-words rounded border px-2 py-1.5 text-[inherit] leading-[inherit] [@container(max-width:720px)]:px-1 ${issueStatusClass(issue.status)}`}>{issue.issueText}</div>)}</div>}
                            {!hasRawValue && !hasSupplement && <span className="text-muted-foreground">—</span>}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                )))}
          </tbody>
          {projection.narratives.length > 0 && (
            <tfoot>
              {projection.narratives.filter((item) => item.showInReport && item.content).map((item, index) => (
                <tr key={`${item.blockType}:${index}`}>
                  <th colSpan={2} className="border-r border-slate-300 bg-amber-50 px-2 py-2 text-left [@container(max-width:720px)]:px-1">{item.blockType === 'summary' ? '冻结矩阵小结' : '备注'}</th>
                  <td colSpan={Math.max(totalColumns - 2, 1)} className="border-t border-slate-300 bg-amber-50/40 px-3 py-2 whitespace-pre-wrap [@container(max-width:720px)]:px-1">{item.content}</td>
                </tr>
              ))}
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

export function ReportDataMatrixReadView({ projection }: { projection: unknown }) {
  // Keep Hook order stable when a report switches between legacy and V3 projections.
  const layout = useMemo(() => dataMatrixReadLayout(projection), [projection]);
  if (isFrozenV3MatrixProjection(projection)) {
    return <div data-testid="report-data-matrix-read-view" className="min-w-0 max-w-full"><FrozenV3MatrixTable projection={projection} /></div>;
  }

  return (
    <div data-testid="report-data-matrix-read-view" className="min-w-0 max-w-full space-y-4 p-4">
      <div className="flex min-w-0 flex-wrap items-center gap-2 text-sm">
        <Badge variant="secondary" className="max-w-full break-words">{layout.title}</Badge>
        {layout.summary && <span className="break-words text-muted-foreground">{layout.summary}</span>}
      </div>

      <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {layout.cards.map((card, cardIndex) => (
          <article key={card.id} data-testid="report-data-matrix-row-card" className="min-w-0 space-y-3 rounded-lg border bg-background p-3">
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">层级路径</p>
              <p className="mt-1 break-words text-sm font-semibold">
                {card.path.length > 0 ? card.path.join(' / ') : `第 ${cardIndex + 1} 行`}
              </p>
            </div>

            {(['inputs', 'calculated', 'evaluation'] as const).map((group) => {
              const fields = card.fields.filter((field) => field.group === group);
              if (fields.length === 0) return null;
              return (
                <section key={group} className="min-w-0 space-y-1.5">
                  <h4 className="text-xs font-medium text-muted-foreground">{GROUP_LABELS[group]}</h4>
                  <dl className="grid min-w-0 grid-cols-1 gap-1.5">
                    {fields.map((field) => (
                      <div key={field.id} className="min-w-0 rounded-md bg-muted/30 px-2.5 py-2 text-xs">
                        <dt className="break-words text-muted-foreground">{field.label}</dt>
                        <dd className="mt-0.5 break-words font-medium text-foreground">{displayValue(field)}</dd>
                      </div>
                    ))}
                  </dl>
                </section>
              );
            })}

            {card.narratives.length > 0 && (
              <div className="min-w-0 space-y-1.5">
                {card.narratives.map((narrative) => (
                  <div key={narrative.id} className="min-w-0 rounded-md border border-dashed px-2.5 py-2 text-xs">
                    <p className="text-muted-foreground">{narrative.label}</p>
                    <p className="mt-0.5 whitespace-pre-wrap break-words">{narrative.text}</p>
                  </div>
                ))}
              </div>
            )}

            {(card.issueSummary || card.issues.length > 0) && (
              <div className="min-w-0 rounded-md border border-red-200 bg-red-50 px-2.5 py-2 text-xs text-red-800">
                {card.issueSummary && (
                  <div className="space-y-1">
                    <p className="font-medium">问题 {card.issueSummary.count} 个</p>
                    {card.issueSummary.levels.length > 0 && (
                      <p className="break-words">等级：{card.issueSummary.levels.join('、')}</p>
                    )}
                  </div>
                )}
                {card.issues.length > 0 && (
                  <>
                    <p className={card.issueSummary ? 'mt-2 font-medium' : 'font-medium'}>问题点</p>
                    <ul className="mt-1 list-disc space-y-1 pl-4">
                      {card.issues.map((issue) => (
                        <li key={issue.id} className="break-words">
                          {issue.text}{issue.status ? `（${issue.status}）` : ''}
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            )}

            <MatrixMedia items={card.media} />
          </article>
        ))}
      </div>

      {layout.cards.length === 0 && (
        <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">暂无数据矩阵内容</p>
      )}

      {layout.narratives.length > 0 && (
        <section className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {layout.narratives.map((narrative) => (
            <div key={narrative.id} className="min-w-0 rounded-md border bg-muted/20 p-3 text-sm">
              <p className="text-xs font-medium text-muted-foreground">{narrative.label}</p>
              <p className="mt-1 whitespace-pre-wrap break-words">{narrative.text}</p>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
