'use client';

import React, { useEffect, useId, useMemo, useState } from 'react';
import { evaluationStatusLabel } from '@/lib/evaluation-status';
import type { FrozenMedia, FrozenRecipeContext, FrozenReportViewModel } from '@/lib/report-frozen-view';
import type { ReportFrozenTabKey } from '@/lib/report-frozen-tabs';
import { ReportTabBar } from '@/app/(main)/reports/[id]/components/report-tab-bar';
import { ReportMatrixTab, type MatrixData } from '@/app/(main)/reports/[id]/components/report-matrix-tab';
import { ReportMediaGrid, type ReportMediaRole } from '@/components/reports/report-media-grid';
import { ReportSummaryTab } from '@/app/(main)/reports/[id]/components/report-summary-tab';

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

function MediaList({ items, role, label, carrierKey }: { items: FrozenMedia[]; role: ReportMediaRole; label?: string; carrierKey?: string }) {
  if (items.length === 0) return null;
  return (
    <div data-content-id={`media-group:${items.map((item) => item.id).join(',')}`}>
      <ReportMediaGrid items={items} role={role} label={label} carrierKey={carrierKey} />
    </div>
  );
}

function issueStatusLabel(status: string) {
  return ({ open: '待整改', rectifying: '整改中', verified_closed: '整改完成', waived: '不整改' }[status] ?? status);
}

function issueSourceLabel(kind: FrozenReportViewModel['issues'][number]['sourceKind']) {
  return ({ sensory: '五感体验', function: '食谱/功能', comparison: '对比项', matrix: '数据矩阵' }[kind]);
}

function IssueContextLines({ issue }: { issue: FrozenReportViewModel['issues'][number] }) {
  const lines = [
    ['对象', issue.context.object],
    ['项目', issue.context.project],
    ['细项', issue.context.item],
  ].filter((line): line is [string, string] => Boolean(line[1]));
  return lines.length > 0 ? <div className="space-y-1 text-sm text-muted-foreground">
    {lines.map(([label, value]) => <p key={label}><span className="font-medium text-foreground">{label}：</span>{value}</p>)}
  </div> : null;
}

function RecipeIssueFacts({ recipe, carrierKey }: { recipe: FrozenRecipeContext; carrierKey: string }) {
  return <div className="space-y-3 text-sm">
    <div>
      <p><span className="text-muted-foreground">食谱名称：</span>{recipe.name}</p>
      {recipe.formula && <p className="mt-1 whitespace-pre-wrap"><span className="text-muted-foreground">食谱配方：</span>{recipe.formula}</p>}
      {recipe.parameters && <p className="mt-1 whitespace-pre-wrap"><span className="text-muted-foreground">食谱参数：</span>{typeof recipe.parameters === 'string' ? recipe.parameters : Object.entries(recipe.parameters).map(([key, value]) => `${key}：${String(value)}`).join('；')}</p>}
    </div>
    {recipe.steps.length > 0 && (
      <details className="rounded-md border px-3 py-2">
        <summary className="cursor-pointer font-medium">食谱步骤：{recipe.steps.length}步</summary>
        <ol className="mt-3 space-y-3 border-t pt-3">
          {recipe.steps.map((step, index) => (
            <li key={step.id} data-content-id={`function-step:${step.id}`}>
              <p><span className="font-medium">步骤 {step.stepNumber ?? index + 1}</span>{step.operation && <span className="ml-2 text-muted-foreground">{step.operation}</span>}</p>
              {step.problemPoints.length > 0 && <p className="mt-1 whitespace-pre-wrap text-muted-foreground">步骤问题点：{step.problemPoints.join('；')}</p>}
              <div className="mt-2"><MediaList items={step.evidence} role="evidence" label="素材" carrierKey={carrierKey} /></div>
            </li>
          ))}
        </ol>
      </details>
    )}
    <div className="border-t pt-3">
      <p className="font-medium">食谱效果评价</p>
      <p className="mt-1 text-muted-foreground">整体判断：{evaluationStatusLabel(recipe.evaluationStatus)}</p>
      {recipe.evaluation && <p className="mt-1 whitespace-pre-wrap text-muted-foreground">{recipe.evaluation}</p>}
      <div className="mt-2"><MediaList items={recipe.evidence} role="primary" label="素材" carrierKey={carrierKey} /></div>
    </div>
  </div>;
}

function FrozenPanel({ model, active }: { model: FrozenReportViewModel; active: ReportFrozenTabKey }) {
  if (active === 'summary') {
    return <ReportSummaryTab data={{
      aiSummary: model.summary.aiSummary,
      summaryText: model.summary.text,
      taskInfo: model.summary.taskInfo,
      stats: model.summary.stats,
    }} />;
  }
  if (active === 'issues') {
    return model.issues.length > 0 ? (
      <div className="space-y-4">
        {model.issues.map((issue) => {
          const latest = issue.liveOverlay.retest.latest;
          const rectified = issue.liveOverlay.status === 'verified_closed';
          return <details key={issue.id} data-content-id={`issue:${issue.id}`} className="rounded-lg border p-4">
            <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2 marker:hidden">
              {issue.level && <span className="rounded border px-1.5 py-0.5 text-xs text-muted-foreground">{issue.level}</span>}
              <span className="rounded border border-primary/30 bg-primary/5 px-1.5 py-0.5 text-xs text-primary">{issueSourceLabel(issue.sourceKind)}</span>
              <span className="min-w-0 flex-1 font-medium">{issue.title}</span>
              {issue.liveOverlay.status && <span className="text-sm text-muted-foreground">{issueStatusLabel(issue.liveOverlay.status)}</span>}
            </summary>
            <div className="mt-4 space-y-4">
              <IssueContextLines issue={issue} />
              {issue.recipe ? <>
                <RecipeIssueFacts recipe={issue.recipe} carrierKey={model.header.id} />
                <div className="border-t pt-3 text-sm">
                  <p className="whitespace-pre-wrap text-muted-foreground"><span className="font-medium text-foreground">问题：</span>{issue.details || issue.title}</p>
                  <div className="mt-2"><MediaList items={issue.evidence} role="appendix" label="素材" carrierKey={model.header.id} /></div>
                </div>
              </> : <>
                <p className="whitespace-pre-wrap text-sm text-muted-foreground"><span className="font-medium text-foreground">问题：</span>{issue.details || issue.title}</p>
                <MediaList items={issue.evidence} role="appendix" label="素材" carrierKey={model.header.id} />
              </>}
              {rectified && (issue.liveOverlay.rectification || issue.liveOverlay.evidence.length > 0) && (
                <div className="rounded-md bg-muted/40 p-3 text-sm">
                  <p className="font-medium">整改效果评价</p>
                  {issue.liveOverlay.rectification && <p className="mt-1 whitespace-pre-wrap text-muted-foreground">{issue.liveOverlay.rectification}</p>}
                  <div className="mt-2"><MediaList items={issue.liveOverlay.evidence} role="appendix" label="整改素材" carrierKey={model.header.id} /></div>
                </div>
              )}
              {latest && (
                <div className="space-y-2 border-t pt-3 text-sm">
                  <p className="font-medium">整改复测</p>
                  <div data-content-id={`re-evaluation:${latest.id}`} className="rounded-md bg-muted/30 p-3 text-muted-foreground">
                    <p>结果：{evaluationStatusLabel(latest.result)}</p>
                    {latest.description && <p className="mt-1 whitespace-pre-wrap">{latest.description}</p>}
                    {(latest.createdAt || latest.createdBy) && <p className="mt-1 text-xs">{[latest.createdAt, latest.createdBy].filter(Boolean).join(' · ')}</p>}
                    <div className="mt-2"><MediaList items={latest.evidence} role="appendix" label="复测素材" carrierKey={model.header.id} /></div>
                  </div>
                  {issue.liveOverlay.retest.count >= 2 && <p className="text-muted-foreground">整改复测记录数：{issue.liveOverlay.retest.count}</p>}
                </div>
              )}
            </div>
          </details>;
        })}
      </div>
    ) : <p data-content-id="issues-empty" className="text-sm text-muted-foreground">暂无问题</p>;
  }
  if (active === 'function_effect') {
    return (
      <div className="space-y-4">
        {model.functionEffects.map((effect) => {
          const relatedIssues = model.issues.filter((issue) => issue.recipe?.recipeId === effect.recipeId);
          return <article key={effect.recipeId} data-content-id={`function:${effect.recipeId}`} className="space-y-3 rounded-lg border p-4">
            <div className="flex flex-wrap items-center gap-2"><h3 className="font-medium">{effect.name}</h3><span className="rounded border px-1.5 py-0.5 text-xs text-muted-foreground">步骤数：{effect.steps.length}</span>{effect.effectScore && <span className="rounded border px-1.5 py-0.5 text-xs text-muted-foreground">效果评分：{effect.effectScore}</span>}<span className="rounded border px-1.5 py-0.5 text-xs text-muted-foreground">问题点数量：{relatedIssues.length}</span></div>
            {effect.formula && <p className="text-sm text-muted-foreground"><span className="font-medium text-foreground">食谱/食材：</span>{effect.formula}</p>}
            {effect.parameters && <p className="text-sm text-muted-foreground"><span className="font-medium text-foreground">食谱参数：</span>{typeof effect.parameters === 'string' ? effect.parameters : Object.entries(effect.parameters).map(([key, value]) => `${key}：${String(value)}`).join('；')}</p>}
            <div className="border-t pt-3"><p className="font-medium text-sm">效果评价</p><p className="mt-1 text-sm text-muted-foreground">整体判断：{evaluationStatusLabel(effect.evaluationStatus)}</p>{effect.evaluation && <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{effect.evaluation}</p>}<div className="mt-2"><MediaList items={effect.evidence} role="primary" label="素材" carrierKey={model.header.id} /></div></div>
            {effect.steps.length > 0 && <details className="rounded-md border px-3 py-2"><summary className="cursor-pointer font-medium text-sm">食谱步骤：{effect.steps.length}步</summary><ol className="mt-3 space-y-2 border-t pt-3">{effect.steps.map((item, index) => <li key={item.id} data-content-id={`function-step:${item.id}`} className="space-y-2 text-sm"><div><span className="font-medium">步骤 {String(item.stepNumber ?? index + 1)}</span>{item.operation && <span className="ml-2 text-muted-foreground">{item.operation}</span>}</div>{item.problemPoints.length > 0 && <p className="whitespace-pre-wrap text-muted-foreground">步骤问题点：{item.problemPoints.join('；')}</p>}<MediaList items={item.evidence} role="evidence" label="素材" carrierKey={model.header.id} /></li>)}</ol></details>}
            {relatedIssues.length > 0 && <div className="border-t pt-3 text-sm"><p className="font-medium">问题点</p>{relatedIssues.map((issue) => <div key={issue.id} className="mt-2 rounded-md bg-muted/30 p-3"><p className="whitespace-pre-wrap text-muted-foreground">{issue.details || issue.title}</p><MediaList items={issue.evidence} role="appendix" label="素材" carrierKey={model.header.id} /></div>)}</div>}
          </article>;
        })}
      </div>
    );
  }
  const selectedMatrix = active === 'data_matrix' ? (model.dataMatrix ?? model.matrix) : model.matrix;
  let matrixData: MatrixData | null = null;
  if (selectedMatrix?.kind === 'comparison') matrixData = { matrixType: 'multi_matrix', matrix: selectedMatrix.snapshot as never };
  if (selectedMatrix?.kind === 'data_v2') matrixData = { matrixType: 'data_matrix', dataMatrix: selectedMatrix.projection as never };
  if (selectedMatrix?.kind === 'data_v3') matrixData = { matrixType: 'data_matrix_v3', dataMatrixV3: selectedMatrix.projection as never };
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
