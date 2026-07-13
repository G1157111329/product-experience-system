'use client';

import { Fragment, type CSSProperties } from 'react';
import { Badge } from '@/components/ui/badge';
import { pendingMediaDataUrl, toPublicMediaUrl, usePresignedUrls } from '@/lib/use-presigned-url';
import { cn } from '@/lib/utils';
import type { ReportDetailMediaItem, ReportDetailModel, ReportDetailSection, ReportDetailSectionBlock } from '@/lib/server/report-detail';
import { ReportDataMatrixReadView } from '@/components/reports/report-data-matrix-read-view';
import { ReportMediaGrid, type ReportMediaItem, type ReportMediaRole } from '@/components/reports/report-media-grid';
import type { PrintMedia, PrintReportViewModel } from '@/lib/server/report-print-renderer';
import { evaluationStatusLabel } from '@/lib/evaluation-status';

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
    data_matrix: '数据矩阵',
    data_matrix_v3: '数据矩阵',
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
  return toPublicMediaUrl(url) || pendingMediaDataUrl;
}

function usableResolvedMediaUrl(originalUrl: string, resolvedUrl: string | undefined) {
  if (resolvedUrl) return toRenderableMediaUrl(resolvedUrl);
  return toRenderableMediaUrl(originalUrl);
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

function reportMediaItems(media: ReportDetailMediaItem[] | undefined): ReportMediaItem[] {
  return (media || []).flatMap((item, index) => item.url ? [{
    id: String(item.id || `${item.url}:${index}`),
    name: item.name || '素材',
    type: item.type || 'image',
    url: item.url,
  }] : []);
}

function InteractiveMediaStrip({
  media,
  role = 'evidence',
  context,
  testId,
}: {
  media?: ReportDetailSectionBlock['media'];
  role?: ReportMediaRole;
  context?: string;
  testId?: string;
}) {
  const items = reportMediaItems(media);
  if (!items.length) return null;
  return (
    <div data-testid="report-inline-media-strip" data-context={context} data-item-testid={testId} className="mt-2 min-w-0 pb-1">
      <ReportMediaGrid items={items} role={role} carrierKey={context} />
    </div>
  );
}

function InlineMediaStrip({ media, role }: { media?: ReportDetailSectionBlock['media']; role?: ReportMediaRole }) {
  return <InteractiveMediaStrip media={media} role={role} />;
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

function InteractiveMediaCards({ media, role }: { media?: ReportDetailSectionBlock['media']; role: ReportMediaRole }) {
  return <ReportMediaGrid items={reportMediaItems(media)} role={role} />;
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
              <InlineMediaStrip media={item.media} role={item.mediaRole} />
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
              <InlineMediaStrip media={item.media} role={item.mediaRole} />
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
                            <InteractiveMediaStrip media={cell.media} role="compact" context={context} testId="report-matrix-media-item" />
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
        <ReportDataMatrixReadView projection={block.dataMatrix} />
      )}

      {block.type === 'data_matrix_v3' && block.dataMatrixV3 && (
        <div data-testid="report-data-matrix-v3-block">
          <ReportDataMatrixReadView projection={block.dataMatrixV3} />
        </div>
      )}

      {block.type === 'media' && (block.media?.length ?? 0) > 0 && (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          <InteractiveMediaCards media={block.media} role={block.mediaRole ?? 'evidence'} />
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
            {section.blocks.filter((block) => block.id !== 'data_matrix:table').map((block) => (
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
      {block.type === 'data_matrix_v3' && block.dataMatrixV3 && (() => {
        const projection = block.dataMatrixV3;
        const columns = [...(projection.columns || [])].sort(
          (a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0),
        );
        const rows = [...(projection.rows || [])].sort(
          (a, b) => (a.visibleRowIndex ?? 0) - (b.visibleRowIndex ?? 0),
        );
        return (
          <div data-testid="print-data-matrix-v3-block" style={{ maxWidth: '100%', overflowX: 'auto' }}>
            <div style={{ marginBottom: '6px', fontSize: '10px', color: '#6b7280' }}>
              {projection.matrixName || '数据矩阵'}
              {projection.summary
                ? ` · ${projection.summary.totalRows} 行 / ${projection.summary.totalColumns} 列`
                : ''}
            </div>
            <table style={{ width: '100%', minWidth: '100%', borderCollapse: 'collapse', fontSize: '9px', tableLayout: 'fixed' }}>
              <thead>
                <tr>
                  <th style={{ border: '1px solid #d1d5db', textAlign: 'left', padding: '5px', color: '#374151' }}>一级</th>
                  <th style={{ border: '1px solid #d1d5db', textAlign: 'left', padding: '5px', color: '#374151' }}>二级</th>
                  <th style={{ border: '1px solid #d1d5db', textAlign: 'left', padding: '5px', color: '#374151' }}>三级</th>
                  {columns.map((col) => (
                    <th key={col.id} style={{ border: '1px solid #d1d5db', textAlign: 'left', padding: '5px', color: '#374151' }}>
                      {col.label}{col.unitText ? ` (${col.unitText})` : ''}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} data-testid="print-data-matrix-v3-row">
                    <td style={{ border: '1px solid #e5e7eb', padding: '5px', color: '#111827', verticalAlign: 'top', wordBreak: 'break-word' }}>{row.level1Label || '-'}</td>
                    <td style={{ border: '1px solid #e5e7eb', padding: '5px', color: '#111827', verticalAlign: 'top', wordBreak: 'break-word' }}>{row.level2Label || '-'}</td>
                    <td style={{ border: '1px solid #e5e7eb', padding: '5px', color: '#111827', verticalAlign: 'top', wordBreak: 'break-word' }}>{row.level3Label || '-'}</td>
                    {columns.map((col) => {
                      const mediaKey = `${row.id}:${col.id}`;
                      const mediaCount = projection.cellMedia?.[mediaKey]?.length ?? 0;
                      return (
                        <td key={`${row.id}:${col.id}`} style={{ border: '1px solid #e5e7eb', padding: '5px', color: '#4b5563', verticalAlign: 'top', wordBreak: 'break-word' }}>
                          {row.cells?.[col.id] || ''}
                          {mediaCount > 0 ? <div style={{ color: '#6b7280', marginTop: '2px' }}>素材 {mediaCount}</div> : null}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })()}
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

function PaperMedia({ items }: { items: PrintMedia[] }) {
  if (items.length === 0) return null;
  return (
    <div data-testid="paper-media-grid" style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', marginTop: '6px' }}>
      {items.map((item) => (
        <figure key={`${item.id}:${item.url}`} data-media-id={item.id} style={{ width: '72px', margin: 0, border: '1px solid #d1d5db', borderRadius: '4px', padding: '3px', breakInside: 'avoid' }}>
          {isVideoType(item.type) ? (
            <div data-testid="paper-video-poster" style={{ position: 'relative', width: '64px', height: '48px', background: '#e5e7eb' }}>
              {item.posterUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img data-video-poster src={item.posterUrl} alt={item.name} style={{ width: '64px', height: '48px', objectFit: 'cover', display: 'block' }} />
              )}
              <span style={{ position: 'absolute', inset: 'auto 0 0', background: 'rgba(17,24,39,.72)', color: '#fff', textAlign: 'center', fontSize: '9px', fontWeight: 700 }}>VIDEO</span>
            </div>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={item.url} alt={item.name} style={{ width: '64px', height: '48px', objectFit: 'cover', display: 'block', background: '#f3f4f6' }} />
          )}
          <figcaption style={{ marginTop: '2px', color: '#6b7280', fontSize: '8px', overflowWrap: 'anywhere' }}>{item.name}</figcaption>
        </figure>
      ))}
    </div>
  );
}

function PaperMatrix({ matrix }: { matrix: NonNullable<PrintReportViewModel['matrix']> }) {
  if (matrix.kind === 'comparison') {
    return (
      <section data-testid="print-comparison-matrix" style={{ marginTop: '18px' }}>
        <h2 style={{ fontSize: '16px', color: '#0f766e', borderBottom: '2px solid #0f766e', paddingBottom: '4px' }}>{matrix.title}</h2>
        <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', fontSize: '9px' }}>
          <thead><tr><th style={paperCellStyle}>项目</th>{matrix.columns.map((column) => <th key={column.id} style={paperCellStyle}>{column.label}</th>)}</tr></thead>
          <tbody>{matrix.rows.map((row) => (
            <tr key={row.id}><th style={paperCellStyle}>{row.path.join(' / ')}</th>{matrix.columns.map((column) => {
              const cell = row.cells[column.id];
              return <td key={column.id} style={paperCellStyle}>{cell?.value || '-'}{cell?.score && <p><b>评分：</b>{cell.score}</p>}{(cell ? cell.notes : []).map((item) => <p key={`note:${item}`}><b>过程记录：</b>{item}</p>)}{(cell ? cell.problems : []).map((item) => <p key={`problem:${item}`} style={{ color: '#991b1b' }}><b>问题点：</b>{item}</p>)}<PaperMedia items={cell?.media || []} /></td>;
            })}</tr>
          ))}</tbody>
        </table>
      </section>
    );
  }
  return (
    <section data-testid={`print-${matrix.kind}-matrix`} style={{ marginTop: '18px' }}>
      <h2 style={{ fontSize: '16px', color: '#0f766e', borderBottom: '2px solid #0f766e', paddingBottom: '4px' }}>{matrix.title}</h2>
      {matrix.summary && <p style={{ color: '#6b7280' }}>{matrix.summary}</p>}
      {matrix.rows.map((row) => (
        <article key={row.id} data-testid="print-matrix-paper-row" style={paperRowStyle}>
          <h3 style={{ margin: '0 0 6px', fontSize: '12px' }}>{row.path.join(' / ')}</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: '5px' }}>
            {row.fields.map((field) => {
              const value = field.unit && !String(field.value).includes(field.unit) ? `${field.value} ${field.unit}` : String(field.value);
              return <div key={field.id} style={{ border: '1px solid #e5e7eb', borderRadius: '4px', padding: '5px' }}><span style={{ display: 'block', color: '#6b7280' }}>{field.label}</span><b>{value}</b></div>;
            })}
          </div>
          {row.narratives.map((item) => <p key={item.id}><b>{item.label}：</b>{item.text}</p>)}
          {row.issueSummary && <p style={{ color: '#991b1b' }}>问题 {row.issueSummary.count} 个{row.issueSummary.levels.length > 0 ? ` / ${row.issueSummary.levels.join('、')}` : ''}</p>}
          {row.issues.length > 0 && <ul style={{ color: '#991b1b' }}>{row.issues.map((item) => <li key={item.id}>{item.text}{item.status ? `（${item.status}）` : ''}</li>)}</ul>}
          <PaperMedia items={row.media} />
        </article>
      ))}
      {matrix.narratives.map((item) => <p key={item.id}><b>{item.label}：</b>{item.text}</p>)}
    </section>
  );
}

const paperRowStyle: CSSProperties = { border: '1px solid #d1d5db', borderRadius: '6px', padding: '9px', margin: '7px 0', breakInside: 'avoid' };
const paperCellStyle: CSSProperties = { border: '1px solid #d1d5db', padding: '5px', verticalAlign: 'top', overflowWrap: 'anywhere' };

export function ReportPrintDocument({ model }: { model: PrintReportViewModel }) {
  return (
    <article data-testid="report-print-document" data-report-id={model.sourceReportId} style={{ maxWidth: '100%', color: '#111827', fontSize: '11px', lineHeight: 1.55 }}>
      <style>{`@page { size: ${model.page.paper} ${model.page.orientation}; margin: 12mm; } @media print { [data-testid="report-print-document"] { break-after: page; } [data-testid="report-print-document"]:last-child { break-after: auto; } }`}</style>
      <header style={paperRowStyle}><h1 style={{ margin: '0 0 4px', fontSize: '22px' }}>{model.header.title}</h1>{model.header.productModel && <p>{model.header.productModel}</p>}</header>
      <section><h2 style={{ fontSize: '16px', color: '#0f766e' }}>总结</h2><p style={{ whiteSpace: 'pre-wrap' }}>{model.summary.text || '暂无总结'}</p></section>
      {model.issues.length > 0 && <section><h2 style={{ fontSize: '16px', color: '#0f766e' }}>问题</h2>{model.issues.map((issue) => {
        const recipe = issue.recipe;
        const latest = issue.liveOverlay.retest.latest;
        const parameters = recipe?.parameters
          ? typeof recipe.parameters === 'string' ? recipe.parameters : Object.entries(recipe.parameters).map(([key, value]) => `${key}：${String(value)}`).join('；')
          : '';
        return <article key={issue.id} style={paperRowStyle}><h3>{issue.title}</h3>
          {recipe ? <>
            <p><b>食谱名称：</b>{recipe.name}</p>
            {recipe.formula && <p><b>食谱配方：</b>{recipe.formula}</p>}
            {parameters && <p><b>食谱参数：</b>{parameters}</p>}
            {recipe.steps.length > 0 && <details><summary>食谱步骤：{recipe.steps.length}步</summary>{recipe.steps.map((step, index) => <div key={step.id}><b>步骤 {step.stepNumber ?? index + 1}</b> {step.operation}<PaperMedia items={step.evidence} /></div>)}</details>}
            <p><b>食谱效果评价：</b>{recipe.evaluation}（{evaluationStatusLabel(recipe.evaluationStatus)}）</p><PaperMedia items={recipe.evidence} />
          </> : <><p>{issue.details}</p><PaperMedia items={issue.evidence} /></>}
          {issue.liveOverlay.status && <p>当前状态：{({ open: '待整改', rectifying: '整改中', verified_closed: '整改完成', waived: '不整改' }[issue.liveOverlay.status] ?? issue.liveOverlay.status)}</p>}
          {issue.liveOverlay.status === 'verified_closed' && (issue.liveOverlay.rectification || issue.liveOverlay.evidence.length > 0) && <><p><b>整改效果评价：</b>{issue.liveOverlay.rectification}</p><p><b>整改素材：</b></p><PaperMedia items={issue.liveOverlay.evidence} /></>}
          {latest && <div><b>整改复测：</b>{evaluationStatusLabel(latest.result)} {latest.description}<PaperMedia items={latest.evidence} />{issue.liveOverlay.retest.count >= 2 && <p>整改复测记录数：{issue.liveOverlay.retest.count}</p>}</div>}
        </article>;
      })}</section>}
      {model.matrix && <PaperMatrix matrix={model.matrix} />}
      {model.functionEffects.length > 0 && <section><h2 style={{ fontSize: '16px', color: '#0f766e' }}>功能效果</h2>{model.functionEffects.map((effect) => (
        <article key={effect.recipeId} style={paperRowStyle}><h3>{effect.name}</h3><p>整体判断：{evaluationStatusLabel(effect.evaluationStatus)}</p><p>{effect.evaluation}</p><PaperMedia items={effect.evidence} />{effect.steps.map((step, index) => <div key={step.id}><b>步骤 {step.stepNumber ?? index + 1}</b> {step.operation}<PaperMedia items={step.evidence} /></div>)}</article>
      ))}</section>}
    </article>
  );
}
