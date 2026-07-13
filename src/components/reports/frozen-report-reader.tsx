'use client';

import React, { useEffect, useId, useMemo, useState } from 'react';
import type { FrozenMedia, FrozenReportViewModel } from '@/lib/report-frozen-view';
import type { ReportFrozenTabKey } from '@/lib/report-frozen-tabs';
import { ReportTabBar } from '@/app/(main)/reports/[id]/components/report-tab-bar';
import { ReportMatrixTab, type MatrixData } from '@/app/(main)/reports/[id]/components/report-matrix-tab';
import { ReportMediaGrid, type ReportMediaRole } from '@/components/reports/report-media-grid';

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
  reportChanged = false,
): ReportFrozenTabKey {
  if (reportChanged) return tabs.includes('summary') ? 'summary' : tabs[0] ?? 'summary';
  if (tabs.includes(current)) return current;
  if (tabs.includes('summary')) return 'summary';
  return tabs[0] ?? 'summary';
}

export function orderedFrozenModels(
  primary: FrozenReportViewModel,
  siblingReports: Array<{ id: string }> = [],
  siblingFrozenViewModels: Record<string, FrozenReportViewModel> = {},
) {
  const seen = new Set([primary.header.id]);
  return [primary, ...siblingReports.flatMap((report) => {
    const model = siblingFrozenViewModels[report.id];
    if (!model || seen.has(model.header.id)) return [];
    seen.add(model.header.id);
    return [model];
  })];
}

function stableHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function safeDomPart(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'report';
}

export function frozenReaderDomPrefix(reportId: string, instanceId: string) {
  return `report-${safeDomPart(reportId).slice(0, 32)}-${stableHash(reportId)}-${safeDomPart(instanceId)}`;
}

function MediaList({ items, role, label }: { items: FrozenMedia[]; role: ReportMediaRole; label?: string }) {
  if (items.length === 0) return null;
  return (
    <div data-content-id={`media-group:${items.map((item) => item.id).join(',')}`}>
      <ReportMediaGrid items={items} role={role} label={label} />
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

function mediaFromUnknown(value: unknown): FrozenMedia[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item, index) => {
    const source = record(item);
    const url = valueText(source.file_url, source.fileUrl, source.file_path, source.url);
    if (!url) return [];
    return [{
      id: String(source.id ?? source.materialId ?? `${url}:${index}`),
      name: valueText(source.file_name, source.fileName, source.name) ?? '素材',
      type: valueText(source.material_type, source.materialType, source.media_type) ?? 'image',
      url,
    }];
  });
}

function problemTexts(value: unknown): string[] {
  let source = value;
  if (typeof source === 'string') {
    const raw = source;
    try { source = JSON.parse(raw); } catch { return raw.trim() ? [raw.trim()] : []; }
  }
  if (!Array.isArray(source)) return [];
  return source.flatMap((item) => {
    if (typeof item === 'string') return item.trim() ? [item.trim()] : [];
    const text = valueText(record(item).text, record(item).issueText);
    return text ? [text] : [];
  });
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
            <MediaList items={issue.evidence} role="appendix" label="原始问题素材" />
            {(issue.liveOverlay.status || issue.liveOverlay.rectification) && (
              <div className="rounded-md bg-muted/40 p-3 text-sm">
                {issue.liveOverlay.status && <p>当前状态：{issue.liveOverlay.status}</p>}
                {issue.liveOverlay.rectification && <p className="mt-1">整改：{issue.liveOverlay.rectification}</p>}
              </div>
            )}
            <MediaList items={issue.liveOverlay.evidence} role="appendix" label="整改素材" />
            {issue.liveOverlay.reEvaluations.length > 0 && (
              <div className="space-y-2 border-t pt-3">
                <h4 className="text-sm font-medium">复评记录</h4>
                {issue.liveOverlay.reEvaluations.map((item, index) => {
                  const evaluation = record(item);
                  const id = String(evaluation.id ?? index);
                  return (
                    <div key={id} data-content-id={`re-evaluation:${id}`} className="rounded-md bg-muted/30 p-3 text-sm text-muted-foreground">
                      <p>{valueText(evaluation.description, evaluation.result, evaluation.conclusion) || '已完成复评'}</p>
                      {record(evaluation.ai_result).score !== undefined && <p className="mt-1">AI评分：{String(record(evaluation.ai_result).score)}</p>}
                      {valueText(record(evaluation.ai_result).summary) && <p className="mt-1">AI评语：{valueText(record(evaluation.ai_result).summary)}</p>}
                      <div className="mt-2"><MediaList items={mediaFromUnknown(evaluation.materials)} role="appendix" label="复评素材" /></div>
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
            {problemTexts(effect.problemPoints).length > 0 && (
              <ul className="list-disc space-y-1 pl-5 text-sm text-amber-700">
                {problemTexts(effect.problemPoints).map((point, index) => <li key={`${point}:${index}`}>{point}</li>)}
              </ul>
            )}
            <MediaList items={effect.evidence} role="primary" label="效果素材" />
            {effect.steps.length > 0 && (
              <ol className="space-y-2 border-t pt-3">
                {effect.steps.map((item, index) => {
                  const step = record(item);
                  const id = String(step.id ?? index);
                  const problems = problemTexts(step.problem_points ?? step.problem_point);
                  return (
                    <li key={id} data-content-id={`function-step:${id}`} className="space-y-2 text-sm">
                      <div><span className="font-medium">步骤 {String(step.step_number ?? index + 1)}</span>
                        {valueText(step.operation, step.description) && <span className="ml-2 text-muted-foreground">{valueText(step.operation, step.description)}</span>}
                      </div>
                      {problems.length > 0 && <ul className="list-disc pl-5 text-amber-700">{problems.map((point, pointIndex) => <li key={`${point}:${pointIndex}`}>{point}</li>)}</ul>}
                      <MediaList items={mediaFromUnknown(step.materials)} role="evidence" label="过程证据" />
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
  let matrixData: MatrixData | null = null;
  if (model.matrix?.kind === 'comparison') matrixData = { matrixType: 'multi_matrix', matrix: model.matrix.snapshot as never };
  if (model.matrix?.kind === 'data_v2') matrixData = { matrixType: 'data_matrix', dataMatrix: model.matrix.projection as never };
  if (model.matrix?.kind === 'data_v3') matrixData = { matrixType: 'data_matrix_v3', dataMatrixV3: model.matrix.projection as never };
  return <div data-content-id={`matrix:${model.header.id}`}><ReportMatrixTab data={matrixData} /></div>;
}

export function FrozenReportReader({ model, instanceId }: { model: FrozenReportViewModel; instanceId?: string }) {
  const reactId = useId();
  const domPrefix = frozenReaderDomPrefix(model.header.id, instanceId ?? reactId);
  const tabSignature = model.tabs.join('|');
  const [active, setActive] = useState<ReportFrozenTabKey>(() => resolveFrozenReportTab(model.tabs, 'summary'));
  useEffect(() => {
    setActive((current) => resolveFrozenReportTab(model.tabs, current, true));
  }, [model.header.id, tabSignature, model.tabs]);
  const tabs = useMemo(() => model.tabs.map((key) => ({
    key,
    label: TAB_LABELS[key],
    count: key === 'issues' ? model.issues.length : undefined,
  })), [model.issues.length, model.tabs]);

  return (
    <section data-testid="frozen-report-reader">
      <ReportTabBar idPrefix={domPrefix} tabs={tabs} active={active} onChange={(key) => setActive(key as ReportFrozenTabKey)} />
      {model.tabs.map((key) => (
        <div
          key={key}
          id={`${domPrefix}-panel-${key}`}
          role="tabpanel"
          aria-labelledby={`${domPrefix}-tab-${key}`}
          hidden={active !== key}
          className="min-h-[320px] p-4 sm:p-6"
        >
          {active === key && <FrozenPanel model={model} active={key} />}
        </div>
      ))}
    </section>
  );
}
