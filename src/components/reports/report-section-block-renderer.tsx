'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
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
          <DialogTitle className="truncate text-base">{item?.name || 'Media preview'}</DialogTitle>
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
              <span>{item.type}</span>
              {item.role && <span>{item.role}</span>}
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
  limit = 6,
  compact = false,
  context,
  testId = 'report-inline-media-item',
}: {
  media?: ReportDetailSectionBlock['media'];
  limit?: number;
  compact?: boolean;
  context?: string;
  testId?: string;
}) {
  const [selected, setSelected] = useState<ReportDetailMediaItem | null>(null);
  if (!media?.length) return null;
  return (
    <>
      {/* Golden contract token: data-testid="report-inline-media-item" */}
      <div data-testid="report-inline-media-strip" className="mt-2 flex gap-2 overflow-x-auto pb-1">
      {media.slice(0, limit).map((item) => (
        <button
          type="button"
          key={`${item.id}-${item.url}`}
          data-testid={testId}
          onClick={() => setSelected(item)}
          className={cn(
            'group relative shrink-0 overflow-hidden rounded-md border bg-muted/30 text-left',
            compact ? 'h-12 w-12' : 'h-16 w-16',
          )}
          title={item.name}
        >
          {isImageType(item.type) ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={item.url} alt={item.name} className="h-full w-full object-cover transition-transform group-hover:scale-105" />
          ) : isVideoType(item.type) ? (
            <video src={item.url} className="h-full w-full object-cover transition-transform group-hover:scale-105" muted preload="metadata" />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-muted text-[10px] font-medium uppercase text-muted-foreground">
              {item.type || 'file'}
            </div>
          )}
          {!isImageType(item.type) && (
            <span className="absolute inset-x-1 bottom-1 rounded bg-background/90 px-1 py-0.5 text-center text-[9px] text-foreground">
              {isVideoType(item.type) ? 'play' : 'media'}
            </span>
          )}
        </button>
      ))}
      {media.length > limit && (
        <div className={cn('flex shrink-0 items-center justify-center rounded-md border bg-muted/20 text-[10px] text-muted-foreground', compact ? 'h-12 w-12' : 'h-16 w-16')}>
          +{media.length - limit}
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

function InteractiveMediaCards({ media }: { media?: ReportDetailSectionBlock['media'] }) {
  const [selected, setSelected] = useState<ReportDetailMediaItem | null>(null);
  if (!media?.length) return null;
  return (
    <>
      {media.map((item) => (
        <button
          type="button"
          key={`${item.id}-${item.url}`}
          data-testid="report-section-media-item"
          onClick={() => setSelected(item)}
          className="min-w-0 overflow-hidden rounded-md border bg-muted/20 text-left text-xs transition-colors hover:bg-muted/40"
        >
          {isImageType(item.type) ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={item.url} alt={item.name} className="h-28 w-full object-cover" />
          ) : isVideoType(item.type) ? (
            <div className="relative h-28 w-full bg-muted">
              <video src={item.url} className="h-full w-full object-cover" muted preload="metadata" />
              <span className="absolute inset-x-3 bottom-2 rounded bg-background/90 px-2 py-1 text-center text-[10px] text-foreground">play</span>
            </div>
          ) : (
            <div className="flex h-28 w-full items-center justify-center bg-muted text-xs font-medium uppercase text-muted-foreground">
              {item.type || 'media'}
            </div>
          )}
          <div className="px-3 py-2">
            <div className="flex items-center justify-between gap-2">
              <span className="min-w-0 truncate font-medium">{item.name}</span>
              <Badge variant="outline" className="shrink-0 text-[10px]">{item.type}</Badge>
            </div>
            {(item.role || item.owner) && (
              <p className="mt-1 truncate text-[11px] text-muted-foreground">
                {[item.role, item.owner].filter(Boolean).join(' / ')}
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
    <div data-testid="report-section-block" className={cn('rounded-md border bg-background', compact ? 'p-2.5' : 'p-3')}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-xs font-medium">{block.title}</p>
        <Badge variant="outline" className="text-[10px]">{block.type}</Badge>
      </div>

      {block.description && (
        <p className="text-sm leading-6 text-muted-foreground">{block.description}</p>
      )}

      {block.type === 'facts' && hasItems && (
        <div className="grid gap-2 sm:grid-cols-2">
          {block.items?.map((item, index) => (
            <div key={`${item.label}-${index}`} data-testid="report-section-block-row" className={cn('rounded-md border px-3 py-2 text-xs', blockItemClass(item.status))}>
              <p className="font-medium text-muted-foreground">{item.label}</p>
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
            <div key={`${item.label}-${index}`} data-testid="report-section-block-row" className={cn('rounded-md border px-3 py-2 text-xs leading-5', blockItemClass(item.status))}>
              <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                <p className="font-medium">{item.label}</p>
                {item.note && <span className="text-[11px] text-muted-foreground">{item.note}</span>}
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
            <div className="mt-2 overflow-x-auto">
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
          <div className="overflow-x-auto">
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
        <div className="overflow-x-auto">
          <table data-testid="report-matrix-block" className="w-full min-w-[48rem] border-collapse text-xs">
            <thead>
              <tr className="border-b bg-muted/30 text-left text-muted-foreground">
                <th className="sticky left-0 z-10 w-48 bg-muted px-2 py-2 font-medium">维度/项目</th>
                {block.matrix.objects.map((object) => (
                  <th key={object.id} className="min-w-56 px-2 py-2 font-medium">
                    <div className="flex flex-col gap-1">
                      <span className="text-foreground">{object.label}</span>
                      <span className="font-normal text-muted-foreground">{[object.subtitle, object.objectType].filter(Boolean).join(' / ')}</span>
                    </div>
                  </th>
                ))}
                <th className="min-w-56 px-2 py-2 font-medium">本项结论</th>
              </tr>
            </thead>
            <tbody>
              {block.matrix.rows.map((row) => (
                <tr key={row.id} data-testid="report-section-block-row" className="border-b last:border-0">
                  <td className="sticky left-0 z-10 bg-background px-2 py-2 align-top">
                    <p className="font-medium text-foreground">{row.label}</p>
                    {row.group && <p className="mt-1 text-[11px] text-muted-foreground">{row.group}</p>}
                  </td>
                  {block.matrix?.objects.map((object) => {
                    const cell = row.cells[object.id];
                    const context = `${object.label} / ${row.label}`;
                    return (
                      <td key={object.id} className="max-w-72 px-2 py-2 align-top text-muted-foreground">
                        {cell ? (
                          <div className={cn('rounded-md border px-2 py-2', blockItemClass(cell.conclusionTag === 'risk' || cell.problems.length > 0 ? 'risk' : undefined))}>
                            <div className="flex items-start justify-between gap-2">
                              <p className="break-words text-foreground">{cell.conclusion}</p>
                              {cell.score && <Badge variant="outline" className="shrink-0 text-[10px]">{cell.score}</Badge>}
                            </div>
                            {cell.value && cell.value !== cell.conclusion && <p className="mt-1 break-words">{cell.value}</p>}
                            {cell.problems.length > 0 && <p className="mt-1 break-words text-red-700">{cell.problems.join('；')}</p>}
                            {cell.anomaly && <p className="mt-1 break-words text-amber-700">{cell.anomaly}</p>}
                            {cell.aiStatus && <p className="mt-1 text-[11px]">AI: {cell.aiStatus}</p>}
                            <InteractiveMediaStrip media={cell.media} limit={3} compact context={context} testId="report-matrix-media-item" />
                          </div>
                        ) : (
                          <span>-</span>
                        )}
                      </td>
                    );
                  })}
                  <td className="px-2 py-2 align-top text-muted-foreground">
                    {row.rowConclusion || '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {block.type === 'media' && (block.media?.length ?? 0) > 0 && (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          <InteractiveMediaCards media={block.media?.slice(0, 12)} />
          {(block.media?.length ?? 0) > 12 && (
            <div className="rounded-md border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
              +{(block.media?.length ?? 0) - 12} more media item(s)
            </div>
          )}
        </div>
      )}

      {!block.description && !hasItems && !hasRows && (block.media?.length ?? 0) === 0 && (
        <p className="text-xs leading-5 text-muted-foreground">{block.emptyMessage || 'No structured content is available for this block.'}</p>
      )}
    </div>
  );
}

export function ReportSectionBlockStack({ sections, compact = false }: { sections: ReportDetailSection[]; compact?: boolean }) {
  return (
    <div data-testid="report-section-block-stack" className="space-y-3">
      {sections.map((section) => (
        <section key={section.key} data-testid="report-section-block-group" className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <h3 className={cn('font-semibold', compact ? 'text-sm' : 'text-base')}>{section.title}</h3>
            <Badge variant="outline" className="text-[10px]">{section.status}</Badge>
          </div>
          {section.summary && <p className="text-xs leading-5 text-muted-foreground">{section.summary}</p>}
          <div className="grid gap-2">
            {section.blocks.map((block) => (
              <ReportSectionBlockView key={block.id} block={block} compact={compact} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

export function ReportPrintSectionBlocks({ sections }: { sections: ReportDetailSection[] }) {
  return (
    <div data-testid="print-section-block-stack" style={{ display: 'grid', gap: '14px', margin: '12px 0 18px' }}>
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

  return (
    <div data-testid="print-section-block" style={{ border: '1px solid #e5e7eb', borderRadius: '6px', padding: '10px', background: '#fff', breakInside: 'avoid' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '6px' }}>
        <strong style={{ fontSize: '12px', color: '#111827' }}>{block.title}</strong>
        <span style={{ fontSize: '10px', color: '#6b7280' }}>{block.type}</span>
      </div>
      {block.description && <p style={{ fontSize: '12px', color: '#4b5563', lineHeight: 1.65, margin: 0 }}>{block.description}</p>}
      {(block.type === 'facts' || block.type === 'list') && hasItems && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '6px' }}>
          {block.items?.map((item, index) => (
            <div key={`${item.label}-${index}`} data-testid="print-section-block-row" style={{ border: '1px solid #e5e7eb', borderRadius: '4px', padding: '6px', fontSize: '11px' }}>
              <div style={{ color: '#6b7280', fontWeight: 600 }}>{item.label}</div>
              <div style={{ color: '#111827', wordBreak: 'break-word' }}>{item.value}</div>
              {item.note && <div style={{ color: '#6b7280', marginTop: '2px' }}>{item.note}</div>}
              {item.media?.length ? (
                <div data-testid="print-inline-media-item" style={{ marginTop: '4px', color: '#0f766e' }}>
                  Evidence: {item.media.slice(0, 4).map((media) => `${media.name} (${media.type})`).join('; ')}
                  {item.media.length > 4 ? `; +${item.media.length - 4}` : ''}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}
      {block.type === 'table' && hasRows && (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10px' }}>
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
      )}
      {block.type === 'matrix' && block.matrix && block.matrix.rows.length > 0 && (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '9px', tableLayout: 'fixed' }}>
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
              <th style={{ border: '1px solid #d1d5db', textAlign: 'left', padding: '5px', color: '#374151', width: '140px' }}>本项结论</th>
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
                  return (
                    <td key={object.id} style={{ border: '1px solid #e5e7eb', padding: '5px', color: '#4b5563', verticalAlign: 'top', wordBreak: 'break-word' }}>
                      {cell ? (
                        <>
                          <div style={{ color: '#111827', fontWeight: 600 }}>{cell.conclusion}</div>
                          {cell.value && cell.value !== cell.conclusion && <div>{cell.value}</div>}
                          {cell.score && <div>Score: {cell.score}</div>}
                          {cell.problems.length > 0 && <div style={{ color: '#991b1b' }}>{cell.problems.join('；')}</div>}
                          {cell.media.length > 0 && <div style={{ color: '#0f766e' }}>Evidence: {cell.media.slice(0, 3).map((media) => media.name).join('; ')}</div>}
                        </>
                      ) : '-'}
                    </td>
                  );
                })}
                <td style={{ border: '1px solid #e5e7eb', padding: '5px', color: '#4b5563', verticalAlign: 'top', wordBreak: 'break-word' }}>{row.rowConclusion}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {block.type === 'media' && (block.media?.length ?? 0) > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '6px' }}>
          {block.media?.slice(0, 12).map((item) => (
            <div key={`${item.id}-${item.url}`} data-testid="print-section-media-item" style={{ border: '1px solid #e5e7eb', borderRadius: '4px', padding: '6px', fontSize: '10px' }}>
              <div style={{ fontWeight: 600, color: '#111827', wordBreak: 'break-word' }}>{item.name}</div>
              <div style={{ color: '#6b7280' }}>{[item.type, item.role, item.owner].filter(Boolean).join(' / ')}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
