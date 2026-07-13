'use client';

import { useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import { MediaGallery } from '@/components/app/media-gallery';
import {
  dataMatrixReadLayout,
  type ReportDataMatrixReadField,
  type ReportDataMatrixReadMedia,
} from '@/lib/report-data-matrix-layout';

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
  return (
    <MediaGallery
      materials={items.map((item) => ({
        id: item.id,
        file_url: item.url,
        file_name: item.name,
        material_type: item.type,
      }))}
      responsive
      columns={{ mobile: 2, sm: 3, lg: 4 }}
      gap="gap-2"
    />
  );
}

export function ReportDataMatrixReadView({ projection }: { projection: unknown }) {
  const layout = useMemo(() => dataMatrixReadLayout(projection), [projection]);

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
              <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">层级路径</p>
              <p className="mt-1 break-words text-sm font-semibold">
                {card.path.length > 0 ? card.path.join(' / ') : `第 ${cardIndex + 1} 行`}
              </p>
            </div>

            {(['inputs', 'calculated', 'evaluation'] as const).map((group) => {
              const fields = card.fields.filter((field) => field.group === group);
              if (fields.length === 0) return null;
              return (
                <section key={group} className="min-w-0 space-y-1.5">
                  <h4 className="text-[11px] font-medium text-muted-foreground">{GROUP_LABELS[group]}</h4>
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
