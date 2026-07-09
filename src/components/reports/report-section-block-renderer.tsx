'use client';

import { Fragment, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { isPendingMediaUrl, pendingMediaDataUrl, usePresignedUrls } from '@/lib/use-presigned-url';
import { cn } from '@/lib/utils';
import type { ReportDetailMediaItem, ReportDetailModel, ReportDetailSection, ReportDetailSectionBlock } from '@/lib/server/report-detail';

function blockItemClass(status: string | undefined) {
  if (status === 'risk') return 'border-red-200 bg-red-50 text-red-800';
  if (status === 'warning') return 'border-amber-200 bg-amber-50 text-amber-900';
  if (status === 'positive') return 'border-emerald-200 bg-emerald-50 text-emerald-800';
  return 'bg-muted/20';
}

function isImageType(type: string) {
  return type.toLowerCase().includes('image');
}

function isVideoType(type: string) {
  return type.toLowerCase().includes('video');
}

function blockTypeLabel(type: string) {
  const labels: Record<string, string> = {
    summary: '摘要',
    facts: '信息',
    list: '清单',
    table: '表格',
    media: '素材',
    matrix: '矩阵',
  };
  return labels[type] || type;
}

function sectionStatusLabel(status: string) {
  const labels: Record<string, string> = {
    ready: '已完成',
    empty: '暂无内容',
    warning: '待完善',
    blocked: '需处理',
  };
  return labels[status] || status;
}

function mediaTypeLabel(type: string) {
  if (isImageType(type)) return '图片';
  if (isVideoType(type)) return '视频';
  return type ? '文件' : '素材';
}

function mediaRoleLabel(role: string | undefined) {
  if (!role) return '';
  if (role.includes('cell')) return '矩阵单元格';
  if (role.includes('effect')) return '效果评价';
  if (role.includes('step')) return '步骤';
  if (role.includes('issue')) return '问题点';
  if (role.includes('archive')) return '归档素材';
  if (role.includes('material')) return '素材';
  return role;
}

function objectTypeLabel(type: string | undefined) {
  if (!type) return '';
  if (type === 'product_model') return '测试对象';
  if (type === 'object') return '对象';
  if (type === 'competitor') return '竞品对象';
  return type;
}

function aiStatusLabel(status: string) {
  if (status === 'confirmed') return '已确认';
  if (status === 'rejected') return '已驳回';
  if (status === 'generated') return '已生成待确认';
  if (status === 'pending') return '待确认';
  return status;
}

function toRenderableMediaUrl(url: string) {
  if (
    url.startsWith('http')
    || url.startsWith('/')
    || url.startsWith('data:')
  ) {
    return url;
  }
  return pendingMediaDataUrl;
}

function usableResolvedMediaUrl(originalUrl: string, resolvedUrl: string | undefined) {
  if (resolvedUrl) return resolvedUrl;
  return toRenderableMediaUrl(originalUrl);
}

function useResolvedReportMedia(media: ReportDetailMediaItem[] | undefined): ReportDetailMediaItem[] {
  const mediaItems = media || [];
  const presignedMap = usePresignedUrls(
    mediaItems.map((item, index) => ({
      id: `${item.id || 'media'}:${index}:${item.url}`,
      file_url: item.url,
      file_path: item.url,
    })),
  );

  return mediaItems.map((item, index) => ({
    ...item,
    url: usableResolvedMediaUrl(
      item.url,
      presignedMap.get(`${item.id || 'media'}:${index}:${item.url}`),
    ),
  }));
}

function useResolvedReportMediaMap(mediaItems: ReportDetailMediaItem[]): Map<string, ReportDetailMediaItem> {
  const presignedMap = usePresignedUrls(
    mediaItems.map((item, index) => ({
      id: `${item.id || 'media'}:${index}:${item.url}`,
      file_url: item.url,
      file_path: item.url,
    })),
  );

  return new Map(mediaItems.map((item, index) => [
    `${item.id || 'media'}:${index}:${item.url}`,
    {
      ...item,
      url: usableResolvedMediaUrl(
        item.url,
        presignedMap.get(`${item.id || 'media'}:${index}:${item.url}`),
      ),
    },
  ]));
}

function MediaPreviewDialog({
  item,
  context,
  onOpenChange,
}: {
  item: ReportDetailMediaItem | null;
  context?: string;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={Boolean(item)} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl overflow-hidden p-0">
        <DialogHeader className="border-b px-4 py-3">
          <DialogTitle className="truncate text-base">{item?.name || '素材预览'}</DialogTitle>
          {context && <p className="truncate text-xs text-muted-foreground">{context}</p>}
        </DialogHeader>
        <div className="bg-muted/30 p-3">
          {item && isVideoType(item.type) ? (
            <video src={item.url} className="max-h-[72vh] w-full rounded-md bg-black object-contain" controls autoPlay preload="metadata" />
          ) : item ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={item.url} alt={item.name} className="mx-auto max-h-[72vh] max-w-full rounded-md object-contain" />
          ) : null}
          {item && (
            <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
              <span>{mediaTypeLabel(item.type)}</span>
              {item.role && <span>{mediaRoleLabel(item.role)}</span>}
              {item.owner && <span>{item.owner}</span>}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function InteractiveMediaStrip({
  media,
  limit,
  compact = false,
  featured = false,
  context,
  testId = 'report-inline-media-item',
}: {
  media?: ReportDetailSectionBlock['media'];
  limit?: number;
  compact?: boolean;
  featured?: boolean;
  context?: string;
  testId?: string;
}) {
  const [selected, setSelected] = useState<ReportDetailMediaItem | null>(null);
  const resolvedMedia = useResolvedReportMedia(media);
  if (!resolvedMedia.length) return null;
  return (
    <>
      {/* Golden contract token: data-testid="report-inline-media-item" */}
      <div data-testid="report-inline-media-strip" className="mt-2 flex flex-wrap gap-2 pb-1">
      {resolvedMedia.slice(0, limit ?? resolvedMedia.length).map((item, index) => (
        <button
          type="button"
          key={`${item.id}-${item.url}`}
          data-testid={testId}
          onClick={() => setSelected(item)}
          className={cn(
            'group relative shrink-0 overflow-hidden rounded-md border bg-muted/30 text-left',
            featured && index === 0 ? 'h-28 w-36' : featured ? 'h-16 w-16' : compact ? 'h-12 w-12' : 'h-16 w-16',
          )}
          title={item.name}
        >
          {isPendingMediaUrl(item.url) ? (
            <div className="flex h-full w-full items-center justify-center bg-muted text-[10px] text-muted-foreground">
              加载中
            </div>
          ) : isImageType(item.type) ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={item.url} alt={item.name} className="h-full w-full object-cover transition-transform group-hover:scale-105" />
          ) : isVideoType(item.type) ? (
            <video src={item.url} className="h-full w-full object-cover transition-transform group-hover:scale-105" muted preload="metadata" />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-muted text-[10px] font-medium uppercase text-muted-foreground">
              {mediaTypeLabel(item.type)}
            </div>
          )}
          {!isImageType(item.type) && (
            <span className="absolute inset-x-1 bottom-1 rounded bg-background/90 px-1 py-0.5 text-center text-[9px] text-foreground">
              {isVideoType(item.type) ? '播放' : '素材'}
            </span>
          )}
        </button>
      ))}
      {typeof limit === 'number' && resolvedMedia.length > limit && (
        <div className={cn('flex shrink-0 items-center justify-center rounded-md border bg-muted/20 text-[10px] text-muted-foreground', featured ? 'h-16 w-16' : compact ? 'h-12 w-12' : 'h-16 w-16')}>
          +{resolvedMedia.length - limit}
        </div>
      )}
      </div>
      <MediaPreviewDialog item={selected} context={context} onOpenChange={(open) => !open && setSelected(null)} />
    </>
  );
}

function InlineMediaStrip({ media }: { media?: ReportDetailSectionBlock['media'] }) {
  return <InteractiveMediaStrip media={media} />;
}

function dataMatrixDimensionKey(dimension: Record<string, unknown>) {
  return String(dimension.dimensionKey || dimension.key || '');
}

function dataMatrixDimensionLabel(dimension: Record<string, unknown>) {
  return String(dimension.displayName || dimension.dimensionKey || dimension.key || '');
}

function dataMatrixMetricDisplay(metric: Record<string, unknown> | undefined) {
  if (!metric) return '-';
  if (metric.display) return String(metric.display);
  if (metric.value !== undefined && metric.value !== null && metric.value !== '') return String(metric.value);
  if (metric.text) return String(metric.text);
  const state = String(metric.state || '');
  if (state === 'missing') return '缺失';
  if (state === 'not_applicable') return '不适用';
  if (state === 'calculation_failed') return '计算失败';
  if (state === 'pending') return '待计算';
  return '-';
}

function isBlankMatrixText(value: string | undefined) {
  const normalized = (value || '').trim();
  return normalized === '' || normalized === '-' || normalized === '—' || normalized === '暂无' || normalized === '无';
}

function isMatrixCellEmpty(cell: NonNullable<NonNullable<ReportDetailSectionBlock['matrix']>['rows'][number]['cells'][string]> | undefined) {
  if (!cell) return true;
  return isBlankMatrixText(cell.value)
    && isBlankMatrixText(cell.conclusion)
    && isBlankMatrixText(cell.score)
    && isBlankMatrixText(cell.anomaly)
    && isBlankMatrixText(cell.conclusionTag)
    && cell.problems.length === 0
    && cell.media.length === 0;
}

function InteractiveMediaCards({ media }: { media?: ReportDetailSectionBlock['media'] }) {
  const [selected, setSelected] = useState<ReportDetailMediaItem | null>(null);
  const resolvedMedia = useResolvedReportMedia(media);
  if (!resolvedMedia.length) return null;
  return (
    <>
      {resolvedMedia.map((item) => (
        <button
          type="button"
          key={`${item.id}-${item.url}`}
          data-testid="report-section-media-item"
          onClick={() => setSelected(item)}
          className="min-w-0 overflow-hidden rounded-md border bg-muted/20 text-left text-xs transition-colors hover:bg-muted/40"
        >
          {isPendingMediaUrl(item.url) ? (
            <div className="flex h-28 w-full items-center justify-center bg-muted text-xs text-muted-foreground">
              加载中
            </div>
          ) : isImageType(item.type) ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={item.url} alt={item.name} className="h-28 w-full object-cover" />
          ) : isVideoType(item.type) ? (
            <div className="relative h-28 w-full bg-muted">
              <video src={item.url} className="h-full w-full object-cover" muted preload="metadata" />
              <span className="absolute inset-x-3 bottom-2 rounded bg-background/90 px-2 py-1 text-center text-[10px] text-foreground">播放</span>
            </div>
          ) : (
            <div className="flex h-28 w-full items-center justify-center bg-muted text-xs font-medium uppercase text-muted-foreground">
              {mediaTypeLabel(item.type)}
            </div>
          )}
          <div className="px-3 py-2">
            <div className="flex items-center justify-between gap-2">
              <span className="min-w-0 truncate font-medium">{item.name}</span>
              <Badge variant="outline" className="shrink-0 text-[10px]">{mediaTypeLabel(item.type)}</Badge>
            </div>
            {(item.role || item.owner) && (
              <p className="mt-1 truncate text-[11px] text-muted-foreground">
                {[mediaRoleLabel(item.role), item.owner].filter(Boolean).join(' / ')}
              </p>
            )}
          </div>
        </button>
      ))}
      <MediaPreviewDialog item={selected} onOpenChange={(open) => !open && setSelected(null)} />
    </>
  );
}

export function hasReadableSectionBlocks(model: ReportDetailModel | null | undefined) {
  return Boolean(model?.sections.some((section) =>
    section.blocks.some((block) =>
      Boolean(block.description)
      || (block.items?.length ?? 0) > 0
      || (block.rows?.length ?? 0) > 0
      || (block.media?.length ?? 0) > 0
      || (block.matrix?.rows.length ?? 0) > 0,
    ),
  ));
}

export function ReportSectionBlockView({ block, compact = false }: { block: ReportDetailSectionBlock; compact?: boolean }) {
  const hasRows = (block.rows?.length ?? 0) > 0;
  const hasItems = (block.items?.length ?? 0) > 0;

  return (
    <div data-testid="report-section-block" className={cn('min-w-0 overflow-hidden rounded-md border bg-background', compact ? 'p-2.5' : 'p-3')}>
      <div className="mb-2 flex min-w-0 items-start justify-between gap-2">
        <p className="min-w-0 break-words text-xs font-medium">{block.title}</p>
        <Badge variant="outline" className="shrink-0 text-[10px]">{blockTypeLabel(block.type)}</Badge>
      </div>

      {block.description && (
        <p className="break-words text-sm leading-6 text-muted-foreground">{block.description}</p>
      )}

      {block.type === 'facts' && hasItems && (
        <div className="grid gap-2 sm:grid-cols-2">
          {block.items?.map((item, index) => (
            <div key={`${item.label}-${index}`} data-testid="report-section-block-row" className={cn('min-w-0 rounded-md border px-3 py-2 text-xs', blockItemClass(item.status))}>
              <p className="break-words font-medium text-muted-foreground">{item.label}</p>
              <p className="mt-1 break-words text-sm text-foreground">{item.value}</p>
              {item.note && <p className="mt-1 text-[11px] text-muted-foreground">{item.note}</p>}
              <InlineMediaStrip media={item.media} />
            </div>
          ))}
        </div>
      )}

      {block.type === 'list' && hasItems && (
        <div className="space-y-2">
          {block.items?.map((item, index) => (
            <div key={`${item.label}-${index}`} data-testid="report-section-block-row" className={cn('min-w-0 rounded-md border px-3 py-2 text-xs leading-5', blockItemClass(item.status))}>
              <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                <p className="min-w-0 break-words font-medium">{item.label}</p>
                {item.note && <span className="break-words text-[11px] text-muted-foreground">{item.note}</span>}
              </div>
              <p className="mt-1 break-words text-muted-foreground">{item.value}</p>
              <InlineMediaStrip media={item.media} />
            </div>
          ))}
        </div>
      )}

      {block.type === 'table' && hasRows && (
        block.defaultCollapsed ? (
          <details className="rounded-md border bg-muted/10 p-2">
            <summary className="cursor-pointer text-xs font-medium text-muted-foreground">
              {block.collapsedLabel || '展开明细'}
            </summary>
            <div className="mt-2 max-w-full overflow-x-auto">
              <table className="w-full min-w-[36rem] border-collapse text-xs">
                <thead>
                  <tr className="border-b bg-muted/30 text-left text-muted-foreground">
                    {block.columns?.map((column) => (
                      <th key={column} className="px-2 py-2 font-medium">{column}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {block.rows?.map((row, rowIndex) => (
                    <tr key={rowIndex} data-testid="report-section-block-row" className="border-b last:border-0">
                      {block.columns?.map((column) => (
                        <td key={column} className="max-w-64 break-words px-2 py-2 align-top text-muted-foreground">
                          {row[column] || '-'}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        ) : (
          <div className="max-w-full overflow-x-auto">
            <table className="w-full min-w-[36rem] border-collapse text-xs">
              <thead>
                <tr className="border-b bg-muted/30 text-left text-muted-foreground">
                  {block.columns?.map((column) => (
                    <th key={column} className="px-2 py-2 font-medium">{column}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {block.rows?.map((row, rowIndex) => (
                  <tr key={rowIndex} data-testid="report-section-block-row" className="border-b last:border-0">
                    {block.columns?.map((column) => (
                      <td key={column} className="max-w-64 break-words px-2 py-2 align-top text-muted-foreground">
                        {row[column] || '-'}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {block.type === 'matrix' && block.matrix && block.matrix.rows.length > 0 && (
        <div className="max-w-full overflow-x-auto">
          <table data-testid="report-matrix-block" className="w-full min-w-full border-collapse text-xs">
            <thead>
              <tr className="border-b bg-muted/30 text-left text-muted-foreground">
                <th className="sticky left-0 z-10 w-40 bg-muted px-2 py-2 font-medium">维度/项目</th>
                {block.matrix.objects.map((object) => (
                  <th key={object.id} className="min-w-48 px-2 py-2 font-medium">
                    <div className="flex flex-col gap-1">
                      <span className="text-foreground">{object.label}</span>
                      <span className="font-normal text-muted-foreground">{[object.subtitle, objectTypeLabel(object.objectType)].filter(Boolean).join(' / ')}</span>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.matrix.rows.map((row, rowIndex) => {
                const showGroup = Boolean(row.group && block.matrix && block.matrix.rows[rowIndex - 1]?.group !== row.group);
                if (row.rowKind === 'summary') {
                  const summary = row.summaryText || row.rowConclusion;
                  return (
                    <Fragment key={row.id}>
                      {showGroup && (
                        <tr data-testid="report-matrix-group-row" className="border-b bg-muted/20">
                          <td colSpan={(block.matrix?.objects.length || 0) + 1} className="px-2 py-2 text-xs font-semibold text-foreground">
                            {row.group}
                          </td>
                        </tr>
                      )}
                      <tr data-testid="report-matrix-summary-row" className="border-b bg-amber-50/70">
                        <td className="sticky left-0 z-10 bg-amber-50 px-2 py-3 align-top">
                          <p className="font-medium text-amber-950">{row.label || '本大类小结'}</p>
                        </td>
                        <td colSpan={block.matrix?.objects.length || 1} className="px-2 py-3 align-top">
                          <div className="rounded-md border border-amber-200 bg-background px-3 py-2 text-sm leading-6 text-amber-950">
                            {summary || '本大类暂无小结。'}
                          </div>
                        </td>
                      </tr>
                    </Fragment>
                  );
                }
                return (
                <Fragment key={row.id}>
                  {showGroup && (
                    <tr data-testid="report-matrix-group-row" className="border-b bg-muted/20">
                      <td colSpan={(block.matrix?.objects.length || 0) + 1} className="px-2 py-2 text-xs font-semibold text-foreground">
                        {row.group}
                      </td>
                    </tr>
                  )}
                <tr data-testid="report-section-block-row" className="border-b last:border-0">
                  <td className="sticky left-0 z-10 bg-background px-2 py-2 align-top">
                    <p className="font-medium text-foreground">{row.label}</p>
                  </td>
                  {block.matrix?.objects.map((object) => {
                    const cell = row.cells[object.id];
                    const isEmpty = isMatrixCellEmpty(cell);
                    const context = `${object.label} / ${row.label}`;
                    return (
                      <td key={object.id} className="h-px max-w-72 px-2 py-2 align-top text-muted-foreground">
                        {isEmpty ? (
                          <div data-testid="report-matrix-empty-cell" className="flex h-full min-h-20 items-center justify-center rounded-md border border-dashed bg-muted/10 px-2 py-2 text-[11px] text-muted-foreground/60">
                            -
                          </div>
                        ) : cell ? (
                          <div data-testid="report-matrix-filled-cell" className={cn('flex h-full min-h-28 flex-col rounded-md border px-2 py-2', blockItemClass(cell.conclusionTag === 'risk' || cell.problems.length > 0 ? 'risk' : undefined))}>
                            <div className="flex items-start justify-between gap-2">
                              <p className="break-words text-foreground">{isBlankMatrixText(cell.conclusion) ? cell.value : cell.conclusion}</p>
                              {cell.score && !isBlankMatrixText(cell.score) && <Badge variant="outline" className="shrink-0 text-[10px]">{cell.score}</Badge>}
                            </div>
                            {cell.value && cell.value !== cell.conclusion && !isBlankMatrixText(cell.value) && <p className="mt-1 break-words">{cell.value}</p>}
                            {cell.problems.length > 0 && <p className="mt-1 break-words text-red-700">{cell.problems.join('；')}</p>}
                            {cell.anomaly && !isBlankMatrixText(cell.anomaly) && <p className="mt-1 break-words text-amber-700">{cell.anomaly}</p>}
                            {cell.aiStatus && <p className="mt-1 text-[11px] text-muted-foreground">结论状态：{aiStatusLabel(cell.aiStatus)}</p>}
                            <InteractiveMediaStrip media={cell.media} context={context} testId="report-matrix-media-item" />
                          </div>
                        ) : null}
                      </td>
                    );
                  })}
                </tr>
                </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {block.type === 'data_matrix' && block.dataMatrix && block.dataMatrix.groups.length > 0 && (
        <div className="max-w-full overflow-x-auto">
          <table data-testid="report-data-matrix-block" className="w-full min-w-[56rem] border-collapse text-xs">
            <thead>
              <tr className="border-b bg-muted/30 text-left text-muted-foreground">
                <th className="sticky left-0 z-10 w-36 bg-muted px-2 py-2 font-medium">分组</th>
                <th className="w-36 px-2 py-2 font-medium">行项目</th>
                {(block.dataMatrix.schema.dimensions || []).map((dimension) => (
                  <th key={dataMatrixDimensionKey(dimension)} className="min-w-32 px-2 py-2 font-medium">
                    {dataMatrixDimensionLabel(dimension)}
                  </th>
                ))}
                <th className="min-w-28 px-2 py-2 font-medium">结果</th>
                <th className="min-w-40 px-2 py-2 font-medium">证据/图片</th>
              </tr>
            </thead>
            <tbody>
              {block.dataMatrix.groups.flatMap((group) =>
                group.rows.map((row) => {
                  const evidenceMedia = row.evidence?.media || [];
                  return (
                    <tr key={row.id} data-testid="report-data-matrix-row" className="border-b last:border-0">
                      <td className="sticky left-0 z-10 bg-background px-2 py-2 align-top font-medium text-foreground">
                        {group.label}
                      </td>
                      <td className="px-2 py-2 align-top text-foreground">{row.subject?.label || row.id}</td>
                      {(block.dataMatrix?.schema.dimensions || []).map((dimension) => {
                        const key = dataMatrixDimensionKey(dimension);
                        return (
                          <td key={`${row.id}:${key}`} className="max-w-56 break-words px-2 py-2 align-top text-muted-foreground">
                            {dataMatrixMetricDisplay(row.metrics?.[key])}
                          </td>
                        );
                      })}
                      <td className="max-w-48 break-words px-2 py-2 align-top text-muted-foreground">
                        {row.slots?.result?.summary || row.slots?.result?.status || '-'}
                      </td>
                      <td className="px-2 py-2 align-top">
                        <div className="text-[11px] text-muted-foreground">证据 {row.evidence?.primaryCount ?? evidenceMedia.length} 条</div>
                        <InteractiveMediaStrip media={evidenceMedia} compact limit={6} context={`${group.label} / ${row.subject?.label || row.id}`} testId="report-data-matrix-media-item" />
                      </td>
                    </tr>
                  );
                }),
              )}
            </tbody>
          </table>
        </div>
      )}

      {block.type === 'media' && (block.media?.length ?? 0) > 0 && (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          <InteractiveMediaCards media={block.media?.slice(0, 12)} />
          {(block.media?.length ?? 0) > 12 && (
            <div className="rounded-md border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
              还有 {(block.media?.length ?? 0) - 12} 个素材
            </div>
          )}
        </div>
      )}

      {!block.description && !hasItems && !hasRows && (block.media?.length ?? 0) === 0 && (
        <p className="text-xs leading-5 text-muted-foreground">{block.emptyMessage || '当前模块暂无结构化内容。'}</p>
      )}
    </div>
  );
}

export function ReportSectionBlockStack({ sections, compact = false }: { sections: ReportDetailSection[]; compact?: boolean }) {
  const visibleSections = sections.filter((section) => section.status !== 'empty');

  return (
    <div data-testid="report-section-block-stack" className="space-y-3">
      {visibleSections.map((section) => (
        <section key={section.key} data-testid="report-section-block-group" className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <h3 className={cn('font-semibold', compact ? 'text-sm' : 'text-base')}>{section.title}</h3>
            <Badge variant="outline" className="text-[10px]">{sectionStatusLabel(section.status)}</Badge>
          </div>
          {section.summary && <p className="text-xs leading-5 text-muted-foreground">{section.summary}</p>}
          <div className="grid gap-2">
            {section.blocks.map((block) => (
              <ReportSectionBlockView key={block.id} block={block} compact={compact} />
            ))}
          </div>
        </section>
      ))}
      {visibleSections.length === 0 && (
        <p className="rounded-md border bg-muted/20 px-3 py-2 text-xs leading-5 text-muted-foreground">
          当前报告暂无可展示的结构化模块。
        </p>
      )}
    </div>
  );
}

export function ReportPrintSectionBlocks({ sections }: { sections: ReportDetailSection[] }) {
  return (
    <div data-testid="print-section-block-stack" style={{ display: 'grid', gap: '14px', margin: '12px 0 18px', maxWidth: '100%', overflowWrap: 'anywhere' }}>
      {sections.map((section) => (
        <section key={section.key} data-testid="print-section-block-group" style={{ breakInside: 'avoid', pageBreakInside: 'avoid' }}>
          <h3 style={{ fontSize: '15px', margin: '14px 0 8px', color: '#111827', borderBottom: '1px solid #d1d5db', paddingBottom: '4px' }}>
            {section.title}
          </h3>
          {section.summary && <p style={{ fontSize: '12px', color: '#4b5563', margin: '0 0 8px', lineHeight: 1.6 }}>{section.summary}</p>}
          <div style={{ display: 'grid', gap: '8px' }}>
            {section.blocks.map((block) => (
              <PrintBlock key={block.id} block={block} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function PrintBlock({ block }: { block: ReportDetailSectionBlock }) {
  const hasRows = (block.rows?.length ?? 0) > 0;
  const hasItems = (block.items?.length ?? 0) > 0;
  const allMedia = [
    ...(block.media || []),
    ...(block.items || []).flatMap((item) => item.media || []),
    ...(block.matrix?.rows || []).flatMap((row) =>
      (block.matrix?.objects || []).flatMap((object) => row.cells[object.id]?.media || []),
    ),
    ...(block.dataMatrix?.groups || []).flatMap((group) =>
      group.rows.flatMap((row) => row.evidence?.media || []),
    ),
  ];
  const mediaMap = useResolvedReportMediaMap(allMedia);
  const resolveMedia = (media: ReportDetailMediaItem[] | undefined) =>
    (media || []).map((item) => {
      const index = allMedia.indexOf(item);
      const key = `${item.id || 'media'}:${index}:${item.url}`;
      return mediaMap.get(key) || item;
    });
  const blockMedia = resolveMedia(block.media);

  return (
    <div data-testid="print-section-block" style={{ border: '1px solid #e5e7eb', borderRadius: '6px', padding: '10px', background: '#fff', breakInside: 'avoid', boxSizing: 'border-box', maxWidth: '100%', overflowWrap: 'anywhere' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '6px' }}>
        <strong style={{ fontSize: '12px', color: '#111827' }}>{block.title}</strong>
        <span style={{ fontSize: '10px', color: '#6b7280' }}>{blockTypeLabel(block.type)}</span>
      </div>
      {block.description && <p style={{ fontSize: '12px', color: '#4b5563', lineHeight: 1.65, margin: 0 }}>{block.description}</p>}
      {(block.type === 'facts' || block.type === 'list') && hasItems && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '6px' }}>
          {block.items?.map((item, index) => (
            <div key={`${item.label}-${index}`} data-testid="print-section-block-row" style={{ border: '1px solid #e5e7eb', borderRadius: '4px', padding: '6px', fontSize: '11px' }}>
              <div style={{ color: '#6b7280', fontWeight: 600 }}>{item.label}</div>
              <div style={{ color: '#111827', wordBreak: 'break-word' }}>{item.value}</div>
              {item.note && <div style={{ color: '#6b7280', marginTop: '2px' }}>{item.note}</div>}
              <PrintMediaThumbs media={resolveMedia(item.media)} />
            </div>
          ))}
        </div>
      )}
      {block.type === 'table' && hasRows && (
        <div style={{ maxWidth: '100%', overflowX: 'auto' }}>
        <table style={{ width: '100%', minWidth: '520px', borderCollapse: 'collapse', fontSize: '10px', tableLayout: 'fixed' }}>
          <thead>
            <tr>
              {block.columns?.map((column) => (
                <th key={column} style={{ borderBottom: '1px solid #d1d5db', textAlign: 'left', padding: '5px', color: '#374151' }}>{column}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {block.rows?.map((row, rowIndex) => (
              <tr key={rowIndex} data-testid="print-section-block-row">
                {block.columns?.map((column) => (
                  <td key={column} style={{ borderBottom: '1px solid #f3f4f6', padding: '5px', color: '#4b5563', verticalAlign: 'top', wordBreak: 'break-word' }}>
                    {row[column] || '-'}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}
      {block.type === 'matrix' && block.matrix && block.matrix.rows.length > 0 && (
        <div style={{ maxWidth: '100%', overflowX: 'auto' }}>
        <table style={{ width: '100%', minWidth: '100%', borderCollapse: 'collapse', fontSize: '9px', tableLayout: 'fixed' }}>
          <thead>
            <tr>
              <th style={{ border: '1px solid #d1d5db', textAlign: 'left', padding: '5px', color: '#374151', width: '120px' }}>维度/项目</th>
              {block.matrix.objects.map((object) => (
                <th key={object.id} style={{ border: '1px solid #d1d5db', textAlign: 'left', padding: '5px', color: '#374151' }}>
                  {object.label}
                  {(object.subtitle || object.objectType) && (
                    <div style={{ color: '#6b7280', fontWeight: 400 }}>{[object.subtitle, object.objectType].filter(Boolean).join(' / ')}</div>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {block.matrix.rows.map((row) => (
              <tr key={row.id} data-testid="print-section-block-row">
                <td style={{ border: '1px solid #e5e7eb', padding: '5px', color: '#111827', verticalAlign: 'top', wordBreak: 'break-word' }}>
                  <strong>{row.label}</strong>
                  {row.group && <div style={{ color: '#6b7280' }}>{row.group}</div>}
                </td>
                {block.matrix?.objects.map((object) => {
                  const cell = row.cells[object.id];
                  const cellMedia = cell ? resolveMedia(cell.media) : [];
                  return (
                    <td key={object.id} style={{ border: '1px solid #e5e7eb', padding: '5px', color: '#4b5563', verticalAlign: 'top', wordBreak: 'break-word' }}>
                      {cell ? (
                        <>
                          <div style={{ color: '#111827', fontWeight: 600 }}>{cell.conclusion}</div>
                          {cell.value && cell.value !== cell.conclusion && <div>{cell.value}</div>}
                          {cell.score && <div>评分：{cell.score}</div>}
                          {cell.problems.length > 0 && <div style={{ color: '#991b1b' }}>{cell.problems.join('；')}</div>}
                          <PrintMediaThumbs media={cellMedia} />
                        </>
                      ) : '-'}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}
      {block.type === 'data_matrix' && block.dataMatrix && block.dataMatrix.groups.length > 0 && (
        <div style={{ maxWidth: '100%', overflowX: 'auto' }}>
        <table data-testid="print-data-matrix-block" style={{ width: '100%', minWidth: '100%', borderCollapse: 'collapse', fontSize: '9px', tableLayout: 'fixed' }}>
          <thead>
            <tr>
              <th style={{ border: '1px solid #d1d5db', textAlign: 'left', padding: '5px', color: '#374151', width: '90px' }}>分组</th>
              <th style={{ border: '1px solid #d1d5db', textAlign: 'left', padding: '5px', color: '#374151', width: '90px' }}>行项目</th>
              {(block.dataMatrix.schema.dimensions || []).map((dimension) => (
                <th key={dataMatrixDimensionKey(dimension)} style={{ border: '1px solid #d1d5db', textAlign: 'left', padding: '5px', color: '#374151' }}>
                  {dataMatrixDimensionLabel(dimension)}
                </th>
              ))}
              <th style={{ border: '1px solid #d1d5db', textAlign: 'left', padding: '5px', color: '#374151', width: '90px' }}>结果</th>
              <th style={{ border: '1px solid #d1d5db', textAlign: 'left', padding: '5px', color: '#374151', width: '120px' }}>证据/图片</th>
            </tr>
          </thead>
          <tbody>
            {block.dataMatrix.groups.flatMap((group) =>
              group.rows.map((row) => {
                const evidenceMedia = resolveMedia(row.evidence?.media);
                return (
                  <tr key={row.id} data-testid="print-data-matrix-row">
                    <td style={{ border: '1px solid #e5e7eb', padding: '5px', color: '#111827', verticalAlign: 'top', wordBreak: 'break-word' }}>{group.label}</td>
                    <td style={{ border: '1px solid #e5e7eb', padding: '5px', color: '#111827', verticalAlign: 'top', wordBreak: 'break-word' }}>{row.subject?.label || row.id}</td>
                    {(block.dataMatrix?.schema.dimensions || []).map((dimension) => {
                      const key = dataMatrixDimensionKey(dimension);
                      return (
                        <td key={`${row.id}:${key}`} style={{ border: '1px solid #e5e7eb', padding: '5px', color: '#4b5563', verticalAlign: 'top', wordBreak: 'break-word' }}>
                          {dataMatrixMetricDisplay(row.metrics?.[key])}
                        </td>
                      );
                    })}
                    <td style={{ border: '1px solid #e5e7eb', padding: '5px', color: '#4b5563', verticalAlign: 'top', wordBreak: 'break-word' }}>
                      {row.slots?.result?.summary || row.slots?.result?.status || '-'}
                    </td>
                    <td style={{ border: '1px solid #e5e7eb', padding: '5px', color: '#4b5563', verticalAlign: 'top', wordBreak: 'break-word' }}>
                      <div>证据 {row.evidence?.primaryCount ?? evidenceMedia.length} 条</div>
                      <PrintMediaThumbs media={evidenceMedia} />
                    </td>
                  </tr>
                );
              }),
            )}
          </tbody>
        </table>
        </div>
      )}
      {block.type === 'media' && blockMedia.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '6px' }}>
          {blockMedia.slice(0, 12).map((item) => (
            <div key={`${item.id}-${item.url}`} data-testid="print-section-media-item" style={{ border: '1px solid #e5e7eb', borderRadius: '4px', padding: '6px', fontSize: '10px' }}>
              {isImageType(item.type) ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={item.url} alt={item.name} style={{ width: '100%', height: '72px', objectFit: 'cover', borderRadius: '3px', border: '1px solid #e5e7eb', marginBottom: '4px' }} />
              ) : null}
              <div style={{ fontWeight: 600, color: '#111827', wordBreak: 'break-word' }}>{item.name}</div>
               <div style={{ color: '#6b7280' }}>{[mediaTypeLabel(item.type), mediaRoleLabel(item.role), item.owner].filter(Boolean).join(' / ')}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PrintMediaThumbs({ media }: { media?: ReportDetailMediaItem[] }) {
  if (!media?.length) return null;
  return (
    <div data-testid="print-inline-media-item" style={{ display: 'flex', gap: '5px', flexWrap: 'wrap', marginTop: '5px' }}>
      {media.slice(0, 4).map((item) => (
        <div key={`${item.id}-${item.url}`} style={{ width: '58px', fontSize: '8px', color: '#4b5563' }}>
          {isImageType(item.type) ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={item.url} alt={item.name} style={{ width: '58px', height: '46px', objectFit: 'cover', borderRadius: '3px', border: '1px solid #e5e7eb' }} />
          ) : (
            <div style={{ width: '58px', height: '46px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '3px', border: '1px solid #e5e7eb', background: '#f3f4f6' }}>
              {isVideoType(item.type) ? '视频' : '素材'}
            </div>
          )}
        </div>
      ))}
      {media.length > 4 && <span style={{ alignSelf: 'center', fontSize: '9px', color: '#6b7280' }}>+{media.length - 4}</span>}
    </div>
  );
}
