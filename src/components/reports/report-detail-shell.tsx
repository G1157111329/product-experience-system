'use client';

import type { ReactNode } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Download,
  Eye,
  FileText,
  FolderOpen,
  ListChecks,
  PackageOpen,
  Share2,
  ShieldAlert,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { hasReadableSectionBlocks, ReportSectionBlockView } from './report-section-block-renderer';
import type { ReportDetailAction, ReportDetailModel, ReportDetailSection, ReportEvidenceSlot } from '@/lib/server/report-detail';

type ReportDetailShellProps = {
  model: ReportDetailModel | null;
  fallbackTitle: string;
  fallbackStatus?: string | null;
  mergedCount?: number;
  onBack: () => void;
  onExportPdf: () => void;
  onShare: () => void;
  debugLegacyBody?: boolean;
  children: ReactNode;
};

const levelLabel: Record<string, string> = {
  positive: '正向',
  neutral: '中性',
  risk: '风险',
  blocked: '阻断',
};

const reportTypeLabel: Record<string, string> = {
  single_report: '普通报告',
  comparison_report: '对比报告',
  model_merged_report: '型号合并',
  custom_merged_report: '自定义合并',
};

const viewModeLabel: Record<string, string> = {
  read: '阅读',
  data: '数据',
  evidence: '证据',
  review: '审核',
  print: '打印',
};

const sectionStatusLabel: Record<string, string> = {
  ready: 'Ready',
  empty: 'Empty',
  warning: 'Needs review',
  blocked: 'Blocked',
};

const evidenceStatusLabel: Record<string, string> = {
  ready: 'Evidence ready',
  missing: 'Evidence missing',
};

function statusClass(status: string) {
  if (status === 'ready') return 'border-emerald-200 bg-emerald-50 text-emerald-800';
  if (status === 'warning') return 'border-amber-200 bg-amber-50 text-amber-900';
  if (status === 'blocked') return 'border-red-200 bg-red-50 text-red-800';
  return 'border-muted bg-muted/30 text-muted-foreground';
}

function severityClass(severity: string) {
  if (severity === 'error') return 'border-red-200 bg-red-50 text-red-800';
  if (severity === 'warning') return 'border-amber-200 bg-amber-50 text-amber-900';
  return 'border-muted bg-muted/30 text-muted-foreground';
}

function SectionPill({ section }: { section: ReportDetailSection }) {
  return (
    <a
      href={`#report-section-${section.key}`}
      className={cn(
        'flex min-h-10 min-w-40 shrink-0 items-center justify-between gap-2 rounded-md border px-3 py-2 text-left text-xs transition-colors hover:bg-muted/60 lg:min-w-0',
        statusClass(section.status),
      )}
    >
      <span className="min-w-0 truncate font-medium">{section.title}</span>
      <span className="shrink-0 tabular-nums">{section.count ?? section.blockKeys.length}</span>
    </a>
  );
}

function sectionIcon(section: ReportDetailSection) {
  if (section.status === 'blocked') return <ShieldAlert className="h-4 w-4 text-red-700" />;
  if (section.status === 'warning') return <AlertTriangle className="h-4 w-4 text-amber-700" />;
  if (section.status === 'empty') return <PackageOpen className="h-4 w-4 text-muted-foreground" />;
  return <CheckCircle2 className="h-4 w-4 text-emerald-700" />;
}

function evidenceForSection(section: ReportDetailSection, slots: ReportEvidenceSlot[]) {
  if (section.key === 'evidence_archive' || section.key === 'source_trace') return slots;
  if (section.blockKeys.some((key) => key.includes('evidence') || key.includes('archive'))) {
    return slots.filter((slot) => section.blockKeys.some((key) => slot.role.includes(key.replace('_list', '').replace('_table', '')) || key.includes(slot.role)));
  }
  if (section.key.includes('metric') || section.key.includes('matrix')) {
    return slots.filter((slot) => slot.ownerType === 'comparison_cell' || slot.role.includes('cell'));
  }
  if (section.key.includes('function') || section.key.includes('recipe')) {
    return slots.filter((slot) => ['recipe', 'recipe_step'].includes(slot.ownerType) || slot.role.includes('effect') || slot.role.includes('step'));
  }
  if (section.key.includes('issue') || section.key.includes('sensory')) {
    return slots.filter((slot) => slot.ownerType === 'record' || slot.ownerType === 'issue' || slot.role.includes('issue'));
  }
  return [];
}

function actionsForSection(section: ReportDetailSection, actions: ReportDetailAction[]) {
  const actionTypes = new Set<string>();
  if (section.status === 'blocked' || section.status === 'warning' || section.status === 'empty') actionTypes.add('fill_missing');
  if (section.key.includes('ai')) actionTypes.add('confirm_ai');
  if (section.key.includes('source')) actionTypes.add('view_source');
  if (section.key.includes('evidence') || section.key.includes('archive')) {
    actionTypes.add('export_pdf');
    actionTypes.add('share');
  }
  if (actionTypes.size === 0) {
    actionTypes.add('view_source');
  }
  return actions.filter((action) => actionTypes.has(action.type)).slice(0, 3);
}

function SectionEmptyState({ section }: { section: ReportDetailSection }) {
  const message = section.status === 'empty'
    ? 'No structured data has been captured for this section yet.'
    : section.status === 'warning'
      ? 'This section is available, but it still needs review before formal delivery.'
      : 'This section is blocked by a required quality check.';

  return (
    <div data-testid="report-section-empty" className="rounded-md border border-dashed bg-muted/20 px-3 py-4 text-sm text-muted-foreground">
      <div className="flex items-start gap-2">
        <PackageOpen className="mt-0.5 h-4 w-4 shrink-0" />
        <p className="leading-6">{section.summary || message}</p>
      </div>
    </div>
  );
}

function EvidenceSlotList({ slots }: { slots: ReportEvidenceSlot[] }) {
  if (slots.length === 0) {
    return (
      <div className="rounded-md border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
        No evidence slot is mapped to this section.
      </div>
    );
  }

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {slots.slice(0, 6).map((slot) => (
        <div
          key={slot.id}
          data-testid="report-evidence-slot"
          className={cn(
            'rounded-md border px-3 py-2 text-xs leading-5',
            slot.status === 'missing' && slot.required ? 'border-red-200 bg-red-50 text-red-800' : 'bg-muted/20',
          )}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="min-w-0 truncate font-medium">{slot.role}</span>
            <Badge variant={slot.status === 'missing' && slot.required ? 'destructive' : 'outline'} className="text-[10px]">
              {evidenceStatusLabel[slot.status]}
            </Badge>
          </div>
          <p className="mt-1 truncate text-muted-foreground">{slot.ownerType} / {slot.ownerId || 'unassigned'}</p>
          <p className="mt-1 tabular-nums text-muted-foreground">{slot.materialIds.length} material(s)</p>
        </div>
      ))}
      {slots.length > 6 && (
        <div className="rounded-md border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
          +{slots.length - 6} more evidence slot(s)
        </div>
      )}
    </div>
  );
}

function SectionActionList({ actions }: { actions: ReportDetailAction[] }) {
  if (actions.length === 0) {
    return (
      <div className="rounded-md border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
        No section action is available.
      </div>
    );
  }

  return (
    <div data-testid="report-section-actions" className="flex flex-wrap gap-2">
      {actions.map((action) => (
        <Button
          key={action.type}
          type="button"
          size="sm"
          variant={action.priority === 'primary' ? 'default' : 'outline'}
          disabled={!action.enabled}
          title={action.reason}
          className="h-8"
        >
          {action.label}
        </Button>
      ))}
    </div>
  );
}

function ReportSectionCanvas({ model }: { model: ReportDetailModel }) {
  return (
    <div data-testid="report-section-canvas" className="space-y-3">
      {model.sections.map((section) => {
        const evidenceSlots = evidenceForSection(section, model.evidenceSlots);
        const sectionActions = actionsForSection(section, model.actions);

        return (
          <section
            key={section.key}
            id={`report-section-${section.key}`}
            data-testid="report-detail-section"
            className="scroll-mt-4 rounded-xl border bg-background p-4 shadow-sm"
          >
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border bg-background">
                    {sectionIcon(section)}
                  </span>
                  <div className="min-w-0">
                    <h2 className="truncate text-sm font-semibold">{section.title}</h2>
                    <p className="text-xs text-muted-foreground">{sectionStatusLabel[section.status] || section.status}</p>
                  </div>
                </div>
                {section.summary && section.status === 'ready' && (
                  <p className="mt-3 text-sm leading-6 text-muted-foreground">{section.summary}</p>
                )}
              </div>
              <Badge variant={section.status === 'blocked' ? 'destructive' : 'outline'} className="w-fit text-[10px]">
                {section.count ?? section.blockKeys.length}
              </Badge>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {section.blockKeys.map((key) => (
                <span key={key} className="rounded-md border bg-muted/20 px-2 py-1 text-[11px] text-muted-foreground">
                  {key}
                </span>
              ))}
            </div>

            {section.status !== 'ready' && (
              <div className="mt-4">
                <SectionEmptyState section={section} />
              </div>
            )}

            <div className="mt-4 grid gap-3">
              {section.blocks.map((block) => (
                <ReportSectionBlockView key={block.id} block={block} />
              ))}
              {section.blocks.length === 0 && (
                <div className="rounded-md border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                  No structured section block is available.
                </div>
              )}
            </div>

            <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_16rem]">
              <div className="min-w-0">
                <div className="mb-2 flex items-center gap-2">
                  <FolderOpen className="h-4 w-4 text-muted-foreground" />
                  <p className="text-xs font-medium text-muted-foreground">Evidence slots</p>
                </div>
                <EvidenceSlotList slots={evidenceSlots} />
              </div>
              <div>
                <div className="mb-2 flex items-center gap-2">
                  <Eye className="h-4 w-4 text-muted-foreground" />
                  <p className="text-xs font-medium text-muted-foreground">Actions</p>
                </div>
                <SectionActionList actions={sectionActions} />
              </div>
            </div>
          </section>
        );
      })}
    </div>
  );
}

export function ReportDetailShell({
  model,
  fallbackTitle,
  fallbackStatus,
  mergedCount,
  onBack,
  onExportPdf,
  onShare,
  debugLegacyBody = false,
  children,
}: ReportDetailShellProps) {
  const header = model?.header;
  const conclusion = model?.conclusion;
  const title = header?.productModel || header?.title || fallbackTitle;
  const reportType = header?.reportType || 'single_report';
  const qualityErrors = model?.qualityChecks.filter((check) => check.severity === 'error') ?? [];
  const qualityWarnings = model?.qualityChecks.filter((check) => check.severity === 'warning') ?? [];
  const enabledActions = model?.actions.filter((action) => action.enabled) ?? [];
  const legacyBodyOpen = !hasReadableSectionBlocks(model);
  const legacyBodyMode = legacyBodyOpen ? 'fallback' : debugLegacyBody ? 'parity' : 'hidden';

  return (
    <div data-testid="report-detail-shell" className="mx-auto grid max-w-6xl gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
      <div className="min-w-0 space-y-4">
        <section className="rounded-xl border bg-background p-4 shadow-sm">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start">
            <Button variant="ghost" size="icon" className="h-10 w-10 shrink-0" onClick={onBack} aria-label="返回">
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className="min-w-0 flex-1">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <Badge variant="secondary" className="text-[10px]">
                  {reportTypeLabel[reportType] || reportType}
                </Badge>
                <Badge variant="outline" className="text-[10px]">
                  {header?.status || fallbackStatus || '草稿'}
                </Badge>
                {header?.defaultViewMode && (
                  <Badge variant="outline" className="text-[10px]">
                    {viewModeLabel[header.defaultViewMode]}模式
                  </Badge>
                )}
                {mergedCount && mergedCount > 1 && (
                  <Badge variant="secondary" className="text-[10px]">合并 {mergedCount} 份报告</Badge>
                )}
              </div>
              <h1 className="break-words text-xl font-semibold leading-tight lg:text-2xl">{title}</h1>
              <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
                {header?.layoutProfile && <span>{header.layoutProfile}</span>}
                {header?.aiConfirmationStatus && <span>AI: {header.aiConfirmationStatus}</span>}
                {header?.sourceTaskIds?.length ? <span>来源任务 {header.sourceTaskIds.length}</span> : null}
                {header?.sourceReportIds?.length ? <span>来源报告 {header.sourceReportIds.length}</span> : null}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:flex lg:ml-auto">
              <Button size="sm" onClick={onExportPdf}>
                <Download className="mr-1.5 h-4 w-4" /> 导出PDF
              </Button>
              <Button size="sm" variant="outline" onClick={onShare}>
                <Share2 className="mr-1.5 h-4 w-4" /> 分享
              </Button>
            </div>
          </div>
        </section>

        <section data-testid="report-conclusion-bar" className={cn(
          'rounded-xl border p-4 shadow-sm',
          conclusion?.conclusionLevel === 'blocked' && 'border-red-200 bg-red-50/70',
          conclusion?.conclusionLevel === 'risk' && 'border-amber-200 bg-amber-50/70',
          (!conclusion || conclusion.conclusionLevel === 'neutral' || conclusion.conclusionLevel === 'positive') && 'bg-background',
        )}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border bg-background">
              {conclusion?.conclusionLevel === 'blocked'
                ? <ShieldAlert className="h-4 w-4 text-red-700" />
                : conclusion?.conclusionLevel === 'risk'
                  ? <AlertTriangle className="h-4 w-4 text-amber-700" />
                  : <CheckCircle2 className="h-4 w-4 text-emerald-700" />}
            </span>
            <div className="min-w-0 flex-1">
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <p className="text-xs font-medium text-muted-foreground">结论条</p>
                {conclusion?.conclusionLevel && (
                  <Badge variant="outline" className="text-[10px]">{levelLabel[conclusion.conclusionLevel]}</Badge>
                )}
                {conclusion?.recommendedNextAction && (
                  <Badge variant="secondary" className="text-[10px]">下一步：{conclusion.recommendedNextAction}</Badge>
                )}
              </div>
              <p className="break-words text-sm leading-6 text-foreground">
                {conclusion?.keyConclusion || '正在加载 V2.6 报告详情模型。'}
              </p>
              {conclusion?.keyRisks?.length ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {conclusion.keyRisks.slice(0, 3).map((risk, index) => (
                    <span key={`${risk}-${index}`} className="rounded-md border bg-background px-2 py-1 text-xs text-muted-foreground">
                      {risk}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </section>

        <section data-testid="report-section-nav" className="rounded-xl border bg-background p-3 shadow-sm">
          <div className="mb-3 flex items-center gap-2 px-1">
            <ListChecks className="h-4 w-4 text-muted-foreground" />
            <p className="text-sm font-medium">模块目录</p>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1 lg:grid lg:grid-cols-3 lg:overflow-visible">
            {(model?.sections ?? []).map((section) => (
              <SectionPill key={section.key} section={section} />
            ))}
            {!model?.sections?.length && (
              <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">详情模型加载中</div>
            )}
          </div>
        </section>

        <div id="report-content-canvas" className="space-y-4 scroll-mt-4">
          {model ? (
            <ReportSectionCanvas model={model} />
          ) : (
            <section className="rounded-xl border bg-background p-4 shadow-sm">
              <SectionEmptyState section={{ key: 'loading', title: 'Detail model', status: 'warning', blockKeys: ['detail_model'], blocks: [] }} />
            </section>
          )}
          {legacyBodyMode !== 'hidden' && (
            <details
              data-testid="report-legacy-content"
              data-display-weight={legacyBodyMode}
              open={legacyBodyOpen}
              className="rounded-xl border bg-background p-4 shadow-sm"
            >
              <summary data-testid="report-legacy-summary" className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-medium [&::-webkit-details-marker]:hidden">
                <span className="flex min-w-0 items-center gap-2">
                  <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="truncate">Original report body</span>
                </span>
                <Badge variant={legacyBodyOpen ? 'secondary' : 'outline'} className="shrink-0 text-[10px]">
                  {legacyBodyOpen ? 'Fallback view' : 'Parity mode'}
                </Badge>
              </summary>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">
                Section blocks are the primary report reading surface. This original body is only available for debug and parity checks.
              </p>
              <div data-testid="report-legacy-body" className="mt-4 space-y-4">
                {children}
              </div>
            </details>
          )}
        </div>
      </div>

      <aside className="space-y-4 lg:sticky lg:top-4 lg:self-start">
        <section data-testid="report-action-rail" className="rounded-xl border bg-background p-4 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <FileText className="h-4 w-4 text-muted-foreground" />
            <p className="text-sm font-medium">Action Rail</p>
          </div>
          <div className="space-y-2">
            {enabledActions.slice(0, 5).map((action) => (
              <div key={action.type} className="rounded-md border bg-muted/20 px-3 py-2">
                <p className="text-xs font-medium">{action.label}</p>
                <p className="mt-1 text-[11px] text-muted-foreground">{action.priority}</p>
              </div>
            ))}
            {enabledActions.length === 0 && (
              <p className="text-xs leading-5 text-muted-foreground">当前没有可执行动作，请先处理质量检查项。</p>
            )}
          </div>
        </section>

        <section data-testid="report-quality-checks" className="rounded-xl border bg-background p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between gap-2">
            <p className="text-sm font-medium">质量检查</p>
            <Badge variant={qualityErrors.length ? 'destructive' : 'outline'} className="text-[10px]">
              {qualityErrors.length} 阻断 / {qualityWarnings.length} 风险
            </Badge>
          </div>
          <div className="space-y-2">
            {(model?.qualityChecks ?? []).slice(0, 6).map((check) => (
              <div key={check.code} className={cn('rounded-md border px-3 py-2 text-xs leading-5', severityClass(check.severity))}>
                <p className="font-medium">{check.code}</p>
                <p className="mt-1">{check.message}</p>
              </div>
            ))}
            {!model?.qualityChecks?.length && (
              <p className="text-xs leading-5 text-muted-foreground">暂无阻断项。</p>
            )}
          </div>
        </section>
      </aside>
    </div>
  );
}
