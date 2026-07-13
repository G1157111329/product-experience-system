'use client';

import { useEffect, useMemo, useState } from 'react';
import type { FrozenMedia, FrozenReportViewModel } from '@/lib/report-frozen-view';
import type { ReportFrozenTabKey } from '@/lib/report-frozen-tabs';
import { ReportTabBar } from '@/app/(main)/reports/[id]/components/report-tab-bar';

const TAB_LABELS: Record<ReportFrozenTabKey, string> = {
  summary: '总结',
  issues: '问题',
  data_matrix: '数据矩阵',
  comparison_matrix: '对比矩阵',
  function_effect: '功能效果',
};

export function resolveFrozenReportTab(
  tabs: ReportFrozenTabKey[],
  current: ReportFrozenTabKey,
): ReportFrozenTabKey {
  if (tabs.includes(current)) return current;
  if (tabs.includes('summary')) return 'summary';
  return tabs[0] ?? 'summary';
}

function MediaList({ items }: { items: FrozenMedia[] }) {
  if (items.length === 0) return null;
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {items.map((item) => (
        <figure key={item.id} data-content-id={`media:${item.id}`} className="overflow-hidden rounded-lg border bg-muted/20">
          {item.type.includes('video') ? (
            <video controls preload="metadata" src={item.url} className="aspect-video w-full object-cover" />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={item.url} alt={item.name} className="aspect-[4/3] w-full object-cover" />
          )}
          <figcaption className="truncate px-2 py-1.5 text-xs text-muted-foreground">{item.name}</figcaption>
        </figure>
      ))}
    </div>
  );
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function valueText(...values: unknown[]) {
  return values.find((value) => typeof value === 'string' && value.trim()) as string | undefined;
}

function FrozenPanel({ model, active }: { model: FrozenReportViewModel; active: ReportFrozenTabKey }) {
  if (active === 'summary') {
    return <p data-content-id="summary" className="whitespace-pre-wrap text-sm leading-7">{model.summary.text || '暂无总结'}</p>;
  }
  if (active === 'issues') {
    return model.issues.length > 0 ? (
      <div className="space-y-4">
        {model.issues.map((issue) => (
          <article key={issue.id} data-content-id={`issue:${issue.id}`} className="space-y-3 rounded-lg border p-4">
            <div>
              <h3 className="font-medium">{issue.title}</h3>
              {issue.details && <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{issue.details}</p>}
            </div>
            <MediaList items={issue.evidence} />
            {(issue.liveOverlay.status || issue.liveOverlay.rectification) && (
              <div className="rounded-md bg-muted/40 p-3 text-sm">
                {issue.liveOverlay.status && <p>当前状态：{issue.liveOverlay.status}</p>}
                {issue.liveOverlay.rectification && <p className="mt-1">整改：{issue.liveOverlay.rectification}</p>}
              </div>
            )}
            <MediaList items={issue.liveOverlay.evidence} />
            {issue.liveOverlay.reEvaluations.length > 0 && (
              <div className="space-y-2 border-t pt-3">
                <h4 className="text-sm font-medium">复评记录</h4>
                {issue.liveOverlay.reEvaluations.map((item, index) => {
                  const evaluation = record(item);
                  const id = String(evaluation.id ?? index);
                  return (
                    <div key={id} data-content-id={`re-evaluation:${id}`} className="rounded-md bg-muted/30 p-3 text-sm text-muted-foreground">
                      {valueText(evaluation.description, evaluation.result, evaluation.conclusion) || '已完成复评'}
                    </div>
                  );
                })}
              </div>
            )}
          </article>
        ))}
      </div>
    ) : <p data-content-id="issues-empty" className="text-sm text-muted-foreground">暂无问题</p>;
  }
  if (active === 'function_effect') {
    return (
      <div className="space-y-4">
        {model.functionEffects.map((effect) => (
          <article key={effect.id} data-content-id={`function:${effect.id}`} className="space-y-3 rounded-lg border p-4">
            <h3 className="font-medium">{effect.name}</h3>
            {effect.evaluation && <p className="whitespace-pre-wrap text-sm text-muted-foreground">{effect.evaluation}</p>}
            {effect.score && <p className="text-sm">评分：{effect.score}</p>}
            <MediaList items={effect.evidence} />
            {effect.steps.length > 0 && (
              <ol className="space-y-2 border-t pt-3">
                {effect.steps.map((item, index) => {
                  const step = record(item);
                  const id = String(step.id ?? index);
                  return (
                    <li key={id} data-content-id={`function-step:${id}`} className="text-sm">
                      <span className="font-medium">步骤 {String(step.step_number ?? index + 1)}</span>
                      {valueText(step.operation, step.description) && <span className="ml-2 text-muted-foreground">{valueText(step.operation, step.description)}</span>}
                    </li>
                  );
                })}
              </ol>
            )}
          </article>
        ))}
      </div>
    );
  }
  const matrixId = model.matrix?.kind === 'comparison'
    ? String(model.matrix.snapshot.id ?? model.header.id)
    : model.matrix
      ? String(model.matrix.projection.matrixId ?? model.header.id)
      : model.header.id;
  return (
    <section data-content-id={`matrix:${matrixId}`} className="rounded-lg border p-4">
      <h3 className="font-medium">{active === 'comparison_matrix' ? '对比矩阵' : '数据矩阵'}</h3>
      <p className="mt-2 text-sm text-muted-foreground">冻结矩阵内容</p>
    </section>
  );
}

export function FrozenReportReader({ model }: { model: FrozenReportViewModel }) {
  const tabSignature = model.tabs.join('|');
  const [active, setActive] = useState<ReportFrozenTabKey>(() => resolveFrozenReportTab(model.tabs, 'summary'));
  useEffect(() => {
    setActive((current) => resolveFrozenReportTab(model.tabs, current));
  }, [model.header.id, tabSignature, model.tabs]);
  const tabs = useMemo(() => model.tabs.map((key) => ({
    key,
    label: TAB_LABELS[key],
    count: key === 'issues' ? model.issues.length : undefined,
  })), [model.issues.length, model.tabs]);

  return (
    <section data-testid="frozen-report-reader">
      <ReportTabBar tabs={tabs} active={active} onChange={(key) => setActive(key as ReportFrozenTabKey)} />
      {model.tabs.map((key) => (
        <div
          key={key}
          id={`report-panel-${key}`}
          role="tabpanel"
          aria-labelledby={`report-tab-${key}`}
          hidden={active !== key}
          className="min-h-[320px] p-4 sm:p-6"
        >
          {active === key && <FrozenPanel model={model} active={key} />}
        </div>
      ))}
    </section>
  );
}
