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
import { useAuth } from '@/lib/auth-context';
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
  positive: '表现良好',
  neutral: '可阅读',
  risk: '需关注',
  blocked: '需补充',
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
  ready: '已完成',
  empty: '暂无内容',
  warning: '待完善',
  blocked: '需处理',
};

const evidenceStatusLabel: Record<string, string> = {
  ready: '素材已关联',
  missing: '待补素材',
};

const actionTypeLabel: Record<string, string> = {
  confirm_ai: '确认结论',
  publish: '确认归档版本',
  fill_missing: '补充报告内容',
  retry_pdf: '重新生成PDF',
  share: '分享报告',
  export_pdf: '导出PDF',
  view_source: '查看来源',
  no_action: '无需操作',
};

function userActionLabel(actionType: string) {
  return actionTypeLabel[actionType] || actionType;
}

function deliveryLayoutLabel(layoutProfile: string) {
  if (layoutProfile.includes('comparison') && layoutProfile.includes('image')) return '图片对比矩阵';
  if (layoutProfile.includes('comparison') && layoutProfile.includes('mixed')) return '图文对比矩阵';
  if (layoutProfile.includes('comparison') && layoutProfile.includes('metric')) return '指标对比矩阵';
  if (layoutProfile.includes('model_merged')) return '型号合并报告';
  if (layoutProfile.includes('custom_merged')) return '自定义合并报告';
  if (layoutProfile.includes('a3_landscape')) return 'A3 横向报告';
  if (layoutProfile.includes('a4_portrait')) return 'A4 纵向报告';
  return '标准报告版式';
}

function aiStatusLabel(status: string) {
  if (status === 'confirmed') return '已确认';
  if (status === 'rejected') return '已驳回';
  if (status === 'generated') return '已生成待确认';
  if (status === 'pending') return '待确认';
  return status || '待确认';
}

function evidenceRoleLabel(role: string) {
  if (role.includes('cell')) return '矩阵单元格素材';
  if (role.includes('archive')) return '素材归档';
  if (role.includes('effect')) return '效果评价素材';
  if (role.includes('step')) return '步骤素材';
  if (role.includes('issue')) return '问题点素材';
  if (role.includes('material')) return '素材';
  return role;
}

function ownerTypeLabel(ownerType: string) {
  if (ownerType === 'comparison_cell') return '矩阵单元格';
  if (ownerType === 'record') return '检查记录';
  if (ownerType === 'issue') return '问题点';
  if (ownerType === 'recipe') return '功能/食谱';
  if (ownerType === 'recipe_step') return '步骤';
  return ownerType || '未关联对象';
}

function statusClass(status: string) {
  if (status === 'ready') return 'border-emerald-200 bg-emerald-50 text-emerald-800';
  if (status === 'warning') return 'border-amber-200 bg-amber-50 text-amber-900';
  if (status === 'blocked') return 'border-red-200 bg-red-50 text-red-800';
  return 'border-muted bg-muted/30 text-muted-foreground';
}

function SectionPill({ section }: { section: ReportDetailSection }) {
  return (
    <a
      href={`#report-section-${section.key}`}
      className={cn(
        'flex min-h-10 min-w-40 shrink-0 items-center gap-2 rounded-md border px-3 py-2 text-left text-xs transition-colors hover:bg-muted/60 lg:min-w-0',
        statusClass(section.status),
      )}
    >
      <span className="min-w-0 truncate font-medium">{section.title}</span>
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

function sectionsForCurrentView(model: ReportDetailModel, showDiagnostics: boolean) {
  if (showDiagnostics || !model.template.hideEmptyInReadMode) return model.sections;
  return model.sections.filter((section) => section.status !== 'empty');
}

function SectionEmptyState({ section }: { section: ReportDetailSection }) {
  const message = section.status === 'empty'
    ? '当前模块暂无结构化数据。'
    : section.status === 'warning'
      ? '当前模块已有内容，仍建议补充确认后再归档。'
      : '当前模块需要补充必要信息。';

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
        当前模块没有单独映射的素材证据。
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
            <span className="min-w-0 truncate font-medium">{evidenceRoleLabel(slot.role)}</span>
            <Badge variant={slot.status === 'missing' && slot.required ? 'destructive' : 'outline'} className="text-xs">
              {evidenceStatusLabel[slot.status]}
            </Badge>
          </div>
          <p className="mt-1 truncate text-muted-foreground">{ownerTypeLabel(slot.ownerType)} / {slot.ownerId || '未关联'}</p>
          <p className="mt-1 tabular-nums text-muted-foreground">{slot.materialIds.length} 个素材</p>
        </div>
      ))}
      {slots.length > 6 && (
        <div className="rounded-md border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
          还有 {slots.length - 6} 个素材证据位
        </div>
      )}
    </div>
  );
}

function SectionActionList({ actions }: { actions: ReportDetailAction[] }) {
  if (actions.length === 0) {
    return (
      <div className="rounded-md border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
        当前模块没有单独操作建议。
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
          {userActionLabel(action.type)}
        </Button>
      ))}
    </div>
  );
}

function ReportSectionCanvas({ model, showDiagnostics }: { model: ReportDetailModel; showDiagnostics: boolean }) {
  const sections = sectionsForCurrentView(model, showDiagnostics);

  return (
    <div data-testid="report-section-canvas" className="space-y-3">
      {sections.map((section) => {
        const evidenceSlots = evidenceForSection(section, model.evidenceSlots);
        const sectionActions = actionsForSection(section, model.actions);

        return (
          <section
            key={section.key}
            id={`report-section-${section.key}`}
            data-testid="report-detail-section"
            className="min-w-0 scroll-mt-4 rounded-xl border bg-background p-4 shadow-sm"
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
            </div>

            {showDiagnostics && (
              <div className="mt-4 flex flex-wrap gap-2">
                {section.blockKeys.map((key) => (
                  <span key={key} className="rounded-md border bg-muted/20 px-2 py-1 text-xs text-muted-foreground">
                    {key}
                  </span>
                ))}
              </div>
            )}

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
                  当前模块暂无结构化内容。
                </div>
              )}
            </div>

            {showDiagnostics && (
              <details className="mt-4 rounded-md border bg-muted/10 p-3">
                <summary className="flex cursor-pointer list-none items-center gap-2 text-xs font-medium text-muted-foreground [&::-webkit-details-marker]:hidden">
                  <FolderOpen className="h-4 w-4" />
                  管理员诊断
                </summary>
                <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_16rem]">
                  <div className="min-w-0">
                    <div className="mb-2 flex items-center gap-2">
                      <FolderOpen className="h-4 w-4 text-muted-foreground" />
                      <p className="text-xs font-medium text-muted-foreground">素材证据位</p>
                    </div>
                    <EvidenceSlotList slots={evidenceSlots} />
                  </div>
                  <div>
                    <div className="mb-2 flex items-center gap-2">
                      <Eye className="h-4 w-4 text-muted-foreground" />
                      <p className="text-xs font-medium text-muted-foreground">操作建议</p>
                    </div>
                    <SectionActionList actions={sectionActions} />
                  </div>
                </div>
              </details>
            )}
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
  const { isAdmin } = useAuth();
  const header = model?.header;
  const conclusion = model?.conclusion;
  const title = header?.productModel || header?.title || fallbackTitle;
  const reportType = header?.reportType || 'single_report';
  const legacyBodyOpen = !hasReadableSectionBlocks(model);
  const legacyBodyMode = legacyBodyOpen ? 'fallback' : debugLegacyBody ? 'parity' : 'hidden';
  const visibleSections = model ? sectionsForCurrentView(model, isAdmin) : [];

  return (
    <div data-testid="report-detail-shell" className="mx-auto w-full min-w-0 max-w-6xl space-y-4">
      <div className="min-w-0 space-y-4">
        <section className="min-w-0 rounded-xl border bg-background p-4 shadow-sm">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start">
            <Button variant="ghost" size="icon" className="h-10 w-10 shrink-0" onClick={onBack} aria-label="返回">
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className="min-w-0 flex-1">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <Badge variant="secondary" className="text-xs">
                  {reportTypeLabel[reportType] || reportType}
                </Badge>
                <Badge variant="outline" className="text-xs">
                  {header?.status || fallbackStatus || '草稿'}
                </Badge>
                {header?.defaultViewMode && (
                  <Badge variant="outline" className="text-xs">
                    {viewModeLabel[header.defaultViewMode]}模式
                  </Badge>
                )}
                {mergedCount && mergedCount > 1 && (
                  <Badge variant="secondary" className="text-xs">合并 {mergedCount} 份报告</Badge>
                )}
              </div>
              <h1 className="break-words text-xl font-semibold leading-tight lg:text-2xl">{title}</h1>
              <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
                {header?.layoutProfile && <span>版式：{deliveryLayoutLabel(header.layoutProfile)}</span>}
                {isAdmin && header?.aiConfirmationStatus && <span>结论状态：{aiStatusLabel(header.aiConfirmationStatus)}</span>}
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
          'min-w-0 rounded-xl border p-4 shadow-sm',
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
                <p className="text-xs font-medium text-muted-foreground">结论摘要</p>
                {conclusion?.conclusionLevel && (
                  <Badge variant="outline" className="text-xs">{levelLabel[conclusion.conclusionLevel]}</Badge>
                )}
                {conclusion?.recommendedNextAction && conclusion.recommendedNextAction !== 'no_action' && (
                  <Badge variant="secondary" className="text-xs">下一步：{userActionLabel(conclusion.recommendedNextAction)}</Badge>
                )}
              </div>
              <p className="break-words text-sm leading-6 text-foreground">
                {conclusion?.keyConclusion || '正在加载报告详情。'}
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

        <section data-testid="report-section-nav" className="min-w-0 rounded-xl border bg-background p-3 shadow-sm">
          <div className="mb-3 flex items-center gap-2 px-1">
            <ListChecks className="h-4 w-4 text-muted-foreground" />
            <p className="text-sm font-medium">模块目录</p>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1 lg:grid lg:grid-cols-3 lg:overflow-visible">
            {visibleSections.map((section) => (
              <SectionPill key={section.key} section={section} />
            ))}
            {!visibleSections.length && (
              <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">详情模型加载中</div>
            )}
          </div>
        </section>

        <div id="report-content-canvas" className="min-w-0 space-y-4 scroll-mt-4">
          {model ? (
            <ReportSectionCanvas model={model} showDiagnostics={isAdmin} />
          ) : (
            <section className="min-w-0 rounded-xl border bg-background p-4 shadow-sm">
              <SectionEmptyState section={{ key: 'loading', title: '报告详情', status: 'warning', blockKeys: ['detail_model'], blocks: [] }} />
            </section>
          )}
          {legacyBodyMode !== 'hidden' && (
            <details
              data-testid="report-legacy-content"
              data-display-weight={legacyBodyMode}
              open={legacyBodyOpen}
              className="min-w-0 rounded-xl border bg-background p-4 shadow-sm"
            >
              <summary data-testid="report-legacy-summary" className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-medium [&::-webkit-details-marker]:hidden">
                <span className="flex min-w-0 items-center gap-2">
                  <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="truncate">原始报告内容</span>
                </span>
                <Badge variant={legacyBodyOpen ? 'secondary' : 'outline'} className="shrink-0 text-xs">
                  {legacyBodyOpen ? '兜底视图' : '核对视图'}
                </Badge>
              </summary>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">
                结构化模块是主要阅读界面，原始内容仅用于核对历史报告。
              </p>
              <div data-testid="report-legacy-body" className="mt-4 space-y-4">
                {children}
              </div>
            </details>
          )}
        </div>
      </div>
    </div>
  );
}
