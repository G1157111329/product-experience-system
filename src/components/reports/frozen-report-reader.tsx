'use client';

import React, { useEffect, useId, useMemo, useState } from 'react';
import { evaluationStatusLabel } from '@/lib/evaluation-status';
import { excludeClaimedRecipeMediaFromEffects, type FrozenIssue, type FrozenMedia, type FrozenRecipeContext, type FrozenReportViewModel } from '@/lib/report-frozen-view';
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
  mergedReportOrder: string[] = [],
) {
  const byId = new Map<string, FrozenReportViewModel>([
    [primary.header.id, primary],
    ...Object.entries(siblingFrozenViewModels),
  ]);
  const orderedIds = mergedReportOrder.length > 0
    ? mergedReportOrder
    : [primary.header.id, ...siblingReports.map((report) => report.id)];
  const seen = new Set<string>();
  return orderedIds.flatMap((id) => {
    const model = byId.get(id);
    if (!model || seen.has(model.header.id)) return [];
    seen.add(model.header.id);
    return [model];
  });
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
  return ({ open: '\u5f85\u6574\u6539', rectifying: '\u6574\u6539\u4e2d', verified_closed: '\u5df2\u6574\u6539', waived: '\u4e0d\u6574\u6539' }[status] ?? status);
}
function issueSourceLabel(kind: FrozenReportViewModel['issues'][number]['sourceKind']) {
  return ({ sensory: '\u4e94\u611f\u4f53\u9a8c', function: '\u98df\u8c31/\u529f\u80fd', comparison: '\u98df\u8c31/\u529f\u80fd-\u5bf9\u6bd4\u77e9\u9635', matrix: '\u6570\u636e\u77e9\u9635' }[kind]);
}

function IssueContextLines({ issue }: { issue: FrozenReportViewModel['issues'][number] }) {
  const context = issue.context ?? { object: '', project: '', item: '' };
  const lines = issue.sourceKind === 'sensory'
    ? [
      ['\u68c0\u9a8c\u6807\u51c6\u7c7b\u578b', context.standardType],
      ['\u68c0\u9a8c\u8981\u6c42\u53ca\u8303\u56f4', context.inspectionRange],
      ['\u68c0\u67e5\u6807\u51c6', context.inspectionStandard],
      ['\u63cf\u8ff0\u68c0\u67e5\u9879\u5185\u5bb9', context.nonStandardContent],
      ['\u68c0\u67e5\u7ed3\u679c', context.checkResult],
    ]
    : issue.sourceKind === 'matrix'
      ? [
        ['\u4e00\u7ea7\u5927\u7c7b', context.primaryCategory],
        ['\u4e8c\u7ea7\u7ec6\u9879/\u4e09\u7ea7\u7ec6\u9879', context.secondaryDetail],
        ['\u5bf9\u6bd4\u7ef4\u5ea6', context.comparisonDimension],
        ['\u95ee\u9898', issue.details || issue.title],
      ]
      : issue.sourceKind === 'comparison' ? [
        ['\u5bf9\u8c61', context.object],
        ['\u9879\u76ee', context.project],
        ['\u7ec6\u9879', context.item],
        ['\u95ee\u9898', issue.details || issue.title],
      ] : [];
  const visible = lines.filter((line): line is [string, string] => Boolean(line[1]));
  return visible.length > 0 ? (
    <div className="space-y-1.5 border-l-2 border-primary/35 bg-muted/20 px-3 py-2 text-sm leading-6 text-muted-foreground">
      {visible.map(([label, value]) => (
        <p key={label}>
          <span className="font-medium text-foreground">{label}：</span>
          {value}
        </p>
      ))}
    </div>
  ) : null;
}

function RecipeIssueFacts({ recipe, carrierKey }: { recipe: FrozenRecipeContext; carrierKey: string }) {
  const steps = recipe.steps ?? [];
  return <div className="space-y-3 text-sm">
    <div>
      <p><span className="text-muted-foreground">食谱名称：</span>{recipe.name}</p>
      {recipe.formula && <p className="mt-1 whitespace-pre-wrap"><span className="text-muted-foreground">食谱配方：</span>{recipe.formula}</p>}
      {recipe.parameters && <p className="mt-1 whitespace-pre-wrap"><span className="text-muted-foreground">食谱参数：</span>{typeof recipe.parameters === 'string' ? recipe.parameters : Object.entries(recipe.parameters).map(([key, value]) => `${key}：${String(value)}`).join('；')}</p>}
    </div>
    {steps.length > 0 && (
      <details className="rounded-md border px-3 py-2">
        <summary className="cursor-pointer font-medium">食谱步骤：{steps.length}步</summary>
        <ol className="mt-3 space-y-3 border-t pt-3">
          {steps.map((step, index) => (
            <li key={step.id} data-content-id={`function-step:${step.id}`}>
              <p><span className="font-medium">步骤 {step.stepNumber ?? index + 1}</span>{step.operation && <span className="ml-2 text-muted-foreground">{step.operation}</span>}</p>
              {(step.problemPoints ?? []).length > 0 && <p className="mt-1 whitespace-pre-wrap text-muted-foreground">步骤问题点：{(step.problemPoints ?? []).join('；')}</p>}
              <div className="mt-2"><MediaList items={step.evidence ?? []} role="evidence" label="素材" carrierKey={carrierKey} /></div>
            </li>
          ))}
        </ol>
      </details>
    )}
    <div className="border-t pt-3">
      <p className="font-medium">食谱效果评价</p>
      <p className="mt-1 text-muted-foreground">整体判断：{evaluationStatusLabel(recipe.evaluationStatus)}</p>
      {recipe.evaluation && <p className="mt-1 whitespace-pre-wrap text-muted-foreground">{recipe.evaluation}</p>}
      <div className="mt-2"><MediaList items={recipe.evidence} role="evidence" label="素材" carrierKey={carrierKey} /></div>
    </div>
  </div>;
}

function FrozenPanel({ model, active, onManageIssue }: { model: FrozenReportViewModel; active: ReportFrozenTabKey; onManageIssue?: (issue: FrozenIssue) => void }) {
  const [expandedIssueIds, setExpandedIssueIds] = useState<Set<string>>(() => new Set());
  const visibleFunctionEffects = excludeClaimedRecipeMediaFromEffects(model.functionEffects, model.issues);
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
          const olderRetests = issue.liveOverlay.retest.history.slice(1);
          const rectified = issue.liveOverlay.status === 'verified_closed';
          const expanded = expandedIssueIds.has(issue.id);
          const StatusElement = issue.canManage && issue.liveIssueId && onManageIssue ? 'button' : 'span';
          const statusActionProps = issue.canManage && issue.liveIssueId && onManageIssue ? {
            type: 'button' as const,
            'data-testid': 'report-issue-status-action',
            'aria-label': `打开问题整改：${issue.title}`,
            onClick: () => onManageIssue(issue),
          } : {};
          return <article key={issue.id} data-content-id={`issue:${issue.id}`} data-expanded={expanded} className="rounded-lg border p-4">
            <div className="flex items-center gap-2">
              <button
                type="button"
                data-testid="report-issue-toggle"
                data-issue-header="true"
                aria-expanded={expanded}
                aria-controls={`issue-detail-${issue.id}`}
                className="grid min-w-0 flex-1 grid-cols-[auto_auto_minmax(0,1fr)] items-center gap-2 text-left"
                onClick={() => setExpandedIssueIds((current) => {
                  const next = new Set(current);
                  if (next.has(issue.id)) next.delete(issue.id); else next.add(issue.id);
                  return next;
                })}
              >
                <span data-issue-field="level" className="inline-flex shrink-0 items-center rounded border px-1.5 py-0.5 text-xs leading-5 text-muted-foreground">{issue.level || '—'}</span>
                <span data-issue-field="source" className="inline-flex shrink-0 items-center rounded border border-primary/30 bg-primary/5 px-1.5 py-0.5 text-xs leading-5 text-primary">{issueSourceLabel(issue.sourceKind)}</span>
                <span data-issue-field="description" className="min-w-0 break-words font-medium leading-6">{issue.title}</span>
              </button>
              <StatusElement
                {...statusActionProps}
                data-issue-field="status"
                className="inline-flex min-h-11 shrink-0 items-center justify-center rounded px-3 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {issueStatusLabel(issue.liveOverlay.status || 'open')}
              </StatusElement>
            </div>
            {expanded && <div id={`issue-detail-${issue.id}`} className="mt-4 space-y-4">
              <IssueContextLines issue={issue} />
              {issue.recipe ? <>
                <RecipeIssueFacts recipe={issue.recipe} carrierKey={model.header.id} />
                <MediaList items={issue.evidence} role="evidence" label="问题证据" carrierKey={model.header.id} />
              </> : <>
                <MediaList items={issue.evidence} role="evidence" label="问题证据" carrierKey={model.header.id} />
              </>}
              {rectified && (issue.liveOverlay.rectification || issue.liveOverlay.evidence.length > 0) && (
                <div className="rounded-md bg-muted/40 p-3 text-sm">
                  <p className="font-medium">整改效果评价</p>
                  {issue.liveOverlay.rectification && <p className="mt-1 whitespace-pre-wrap text-muted-foreground">{issue.liveOverlay.rectification}</p>}
                  <div className="mt-2"><MediaList items={issue.liveOverlay.evidence} role="evidence" label="整改证据" carrierKey={model.header.id} /></div>
                </div>
              )}
              {latest && (
                <div className="space-y-2 border-t pt-3 text-sm">
                  <p className="font-medium">整改复测</p>
                  <div data-content-id={`re-evaluation:${latest.id}`} className="rounded-md bg-muted/30 p-3 text-muted-foreground">
                    <p>结果：{evaluationStatusLabel(latest.result)}</p>
                    {latest.description && <p className="mt-1 whitespace-pre-wrap">{latest.description}</p>}
                    {(latest.createdAt || latest.createdBy) && <p className="mt-1 text-xs">{[latest.createdAt, latest.createdBy].filter(Boolean).join(' · ')}</p>}
                    <div className="mt-2"><MediaList items={latest.evidence} role="evidence" label="复测证据" carrierKey={model.header.id} /></div>
                  </div>
                  {olderRetests.length > 0 && (
                    <details className="rounded-md border bg-background px-3 py-2">
                      <summary className="cursor-pointer font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">历史复测（{olderRetests.length}）</summary>
                      <ol className="mt-3 space-y-3 border-t pt-3">
                        {olderRetests.map((retest) => (
                          <li key={retest.id} data-content-id={`re-evaluation:${retest.id}`} className="rounded-md bg-muted/20 p-3 text-muted-foreground">
                            <p>结果：{evaluationStatusLabel(retest.result)}</p>
                            {retest.description && <p className="mt-1 whitespace-pre-wrap">{retest.description}</p>}
                            {(retest.createdAt || retest.createdBy) && <p className="mt-1 text-xs">{[retest.createdAt, retest.createdBy].filter(Boolean).join(' · ')}</p>}
                            <div className="mt-2"><MediaList items={retest.evidence} role="evidence" label="复测证据" carrierKey={model.header.id} /></div>
                          </li>
                        ))}
                      </ol>
                    </details>
                  )}
                  {issue.liveOverlay.retest.count >= 2 && <p className="text-muted-foreground">整改复测记录数：{issue.liveOverlay.retest.count}</p>}
                </div>
              )}
              {onManageIssue && !issue.liveIssueId && <p className="rounded-md bg-muted/40 p-3 text-sm text-muted-foreground">关联缺失，无法进入整改</p>}
            </div>}
          </article>;
        })}
      </div>
    ) : <p data-content-id="issues-empty" className="text-sm text-muted-foreground">暂无问题</p>;
  }
  if (active === 'function_effect') {
    return (
      <div className="space-y-3">
        {visibleFunctionEffects.map((effect) => {
          const problemCount = model.issues.filter((issue) => issue.recipe?.recipeId === effect.recipeId).length;
          const steps = effect.steps ?? [];
          return <article key={effect.recipeId} data-content-id={`function:${effect.recipeId}`} className="overflow-hidden rounded-lg border bg-background shadow-sm">
            <div data-testid="function-effect-preview" className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/25 px-4 py-3">
              <h3 className="font-semibold text-foreground">{effect.name}</h3>
              <div className="flex flex-wrap items-center gap-1.5"><span className="rounded border bg-background px-2 py-1 text-xs text-muted-foreground">步骤数：{steps.length}</span><span className="rounded border bg-background px-2 py-1 text-xs text-muted-foreground">整体判断：{evaluationStatusLabel(effect.evaluationStatus)}</span><span className="rounded border bg-background px-2 py-1 text-xs text-muted-foreground">问题点数量：{problemCount}</span></div>
            </div>
            <div className="space-y-3 px-4 py-3">
              {(effect.formula || effect.parameters) && <div className="grid gap-1.5 text-sm text-muted-foreground sm:grid-cols-2">
                {effect.formula && <p><span className="font-medium text-foreground">食谱/食材：</span>{effect.formula}</p>}
                {effect.parameters && <p><span className="font-medium text-foreground">食谱参数：</span>{typeof effect.parameters === 'string' ? effect.parameters : Object.entries(effect.parameters).map(([key, value]) => `${key}：${String(value)}`).join('；')}</p>}
              </div>}
              <div className="border-t pt-3"><p className="text-sm font-semibold">效果评价</p><p className="mt-1 text-sm text-muted-foreground">整体判断：{evaluationStatusLabel(effect.evaluationStatus)}</p>{effect.evaluation && <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{effect.evaluation}</p>}<div className="mt-2"><MediaList items={effect.evidence} role="primary" label="素材" carrierKey={model.header.id} /></div></div>
              {steps.length > 0 && <details className="rounded-md border bg-muted/10 px-3 py-2"><summary className="cursor-pointer text-sm font-medium">食谱步骤：{steps.length}步</summary><ol className="mt-3 space-y-3 border-t pt-3">{steps.map((item, index) => <li key={item.id} data-content-id={`function-step:${item.id}`} className="space-y-2 text-sm"><div><span className="font-medium">步骤 {String(item.stepNumber ?? index + 1)}</span>{item.operation && <span className="ml-2 text-muted-foreground">{item.operation}</span>}</div>{(item.problemPoints ?? []).length > 0 && <p className="whitespace-pre-wrap text-muted-foreground">步骤问题点：{(item.problemPoints ?? []).join('；')}</p>}<MediaList items={item.evidence ?? []} role="evidence" label="素材" carrierKey={model.header.id} /></li>)}</ol></details>}
            </div>
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

export function FrozenReportReader({ model, instanceId, onManageIssue }: { model: FrozenReportViewModel; instanceId?: string; onManageIssue?: (issue: FrozenIssue) => void }) {
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
          {active === key && <FrozenPanel model={model} active={key} onManageIssue={onManageIssue} />}
        </div>
      ))}
    </section>
  );
}
