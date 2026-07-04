'use client';

import { useEffect, useState, useCallback, type ReactNode } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Share2, Copy, X, Loader2, Star, FileText, ChevronDown, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import { copyToClipboard } from '@/lib/clipboard';
import { useImagePreview } from '@/components/image-preview';
import { toast } from 'sonner';
import { PageShell } from '@/components/app';
import { MediaGallery } from '@/components/app/media-gallery';
import { ComparisonReportView, type ComparisonSnapshot } from '@/components/reports/comparison-report-view';
import { ReportDetailShell } from '@/components/reports/report-detail-shell';
import { IssueRectificationDialog, type IssueForRectification } from '@/components/issues/issue-rectification-dialog';
import { useDictLabels } from '@/hooks/useDictionary';
import { buildDisplayReportContent, type AiSummaryLike, type ReportContentWithReview, type ReportReviewOverrides } from '@/lib/report-review-overrides';
import type { ReportDetailModel } from '@/lib/server/report-detail';
import {
  getReportMergeModel,
  isMergeableReportProjectType,
  normalizeReportProjectType,
  sortReportsByCreatedAtAsc,
} from '@/lib/report-merge';

interface Material {
  id: string; material_type: string; file_name: string; file_url: string; file_path?: string; file_size: number;
  issue_id?: string | null;
}

interface ReEvaluation {
  id: string; issue_id: string; description: string | null; ai_result: { score: number; summary: string } | null;
  created_at: string; created_by: string | null;
}

interface ProblemPoint {
  text: string;
  material_ids?: string[];
}

interface RecipeStep {
  id: string; step_number: number; operation: string; problem_point: string | null;
  problem_points?: ProblemPoint[];
  materials?: Material[];
}

interface Recipe {
  id: string; name: string; ingredients: string | null; recipe_type: string;
  problem_count: number; recipe_steps: RecipeStep[];
  effect_description?: string | null; effect_score?: string | null; effect_problem_point?: string | null;
  effect_ai_result?: { score: number; summary: string } | null;
  effect_materials?: Material[];
}

interface CheckRecord {
  id: string; sensory_dimension?: string; check_dimension?: string; sub_check_dimension?: string;
  check_item: string; check_requirement?: string; check_standard?: string;
  evaluation_result: string; problem_description?: string;
  standard_category?: string; test_phase?: string; experience_flow?: string; touch_point?: string;
  materials?: Material[];
  [key: string]: unknown;
}

interface IssueItem {
  id: string; title: string; description: string | null; level: string | null;
  status: string; source_report_id: string | null; source_type: string | null; source: string | null;
  task_id: string; product_model: string | null;
  category: string | null; improve_plan: string | null; responsible_person: string | null;
  is_improve: boolean | null; no_improve_reason: string | null;
  plan_complete_date: string | null; actual_complete_date: string | null;
  verification_note: string | null;
  [key: string]: unknown;
}

interface ReportContent {
  task: Record<string, unknown>;
  ai_summary?: AiTaskSummary | null;
  records: CheckRecord[];
  issues: Array<Record<string, unknown>>;
  recipes: Recipe[];
  materials: Material[];
  generatedAt: string;
  review_overrides?: ReportReviewOverrides;
}

interface AiTaskSummary {
  tag?: string;
  satisfaction_score?: number;
  summary?: string;
  strengths?: string[];
  risks?: string[];
  historical_position?: string;
  suggestions?: string[];
}

interface ReportDetail {
  id: string;
  task_id: string;
  title: string;
  product_model: string | null;
  status: string;
  version: number;
  content: ReportContent | null;
  report_type?: string | null;
  snapshot?: {
    id: string;
    version: number;
    snapshot_json: ComparisonSnapshot;
    created_at: string;
  } | null;
  created_at: string;
  updated_at: string;
}

function formatBeijingTime(isoStr: string | null | undefined): string {
  if (!isoStr) return '-';
  try {
    const d = new Date(isoStr);
    // Format as YYYY-MM-DD HH:mm:ss in Beijing time (UTC+8)
    const offset = 8 * 60; // Beijing offset in minutes
    const utc = d.getTime() + d.getTimezoneOffset() * 60000;
    const beijing = new Date(utc + offset * 60000);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${beijing.getFullYear()}-${pad(beijing.getMonth() + 1)}-${pad(beijing.getDate())} ${pad(beijing.getHours())}:${pad(beijing.getMinutes())}:${pad(beijing.getSeconds())}`;
  } catch { return String(isoStr); }
}

const taskFieldLabels: Record<string, string> = {
  task_name: '任务名称', product_category: '产品品类', product: '产品', product_model: '产品型号',
  project_number: '项目单号', project_type: '项目类型', project_phase: '项目阶段', test_date: '测试日期',
  organizer: '组织人', target_user: '目标用户', test_purpose: '测试目的',
  test_method: '测试方法', status: '状态', assigned_to: '负责人',
  selected_standards: '选择标准', created_at: '创建时间', updated_at: '更新时间',
};

const STATUS_COLORS: Record<string, string> = {
  '待整改': 'bg-amber-100 text-amber-700',
  '整改中': 'bg-orange-100 text-orange-800',
  '已验证': 'bg-lime-100 text-lime-800',
  '不整改': 'bg-slate-100 text-slate-600',
};
const LEVEL_COLORS: Record<string, string> = {
  '一类': 'bg-red-100 text-red-700',
  '二类': 'bg-amber-100 text-amber-700',
  '三类': 'bg-slate-100 text-slate-600',
};

function parseProblemPoints(value: string | null | undefined): ProblemPoint[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return parsed
        .map((item): ProblemPoint | null => {
          if (typeof item === 'string') return { text: item };
          if (!item || typeof item !== 'object') return null;
          const record = item as Record<string, unknown>;
          const text = typeof record.text === 'string' ? record.text.trim() : '';
          const materialIds = Array.isArray(record.material_ids)
            ? record.material_ids.filter((id): id is string => typeof id === 'string')
            : [];
          return text ? { text, material_ids: materialIds } : null;
        })
        .filter((item): item is ProblemPoint => Boolean(item));
    }
    if (typeof parsed === 'string' && parsed.trim()) return [{ text: parsed.trim() }];
  } catch {
    // Legacy reports stored a plain text problem point.
  }
  return value.trim() ? [{ text: value.trim() }] : [];
}

function getBoundMaterials(materials: Material[] | undefined, ids: string[] | undefined): Material[] {
  if (!materials?.length || !ids?.length) return [];
  const idSet = new Set(ids);
  return materials.filter((material) => idSet.has(material.id));
}

function getStepProblemPoints(step: RecipeStep): ProblemPoint[] {
  if (step.problem_points && step.problem_points.length > 0) {
    return step.problem_points.filter((point) => point.text && point.text.trim());
  }
  return step.problem_point ? [{ text: step.problem_point }] : [];
}

function getUnboundStepMaterials(materials: Material[] | undefined, problemPoints: ProblemPoint[]): Material[] {
  if (!materials?.length) return [];
  const boundIds = new Set(problemPoints.flatMap((point) => point.material_ids || []));
  return materials.filter((material) => !boundIds.has(material.id));
}

function ReportPaperSection({
  index,
  title,
  subtitle,
  children,
  className,
}: {
  index: string;
  title: string;
  subtitle?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('rounded-xl border bg-background p-4 shadow-sm sm:p-5', className)}>
      <div className="mb-4 flex items-start gap-3 border-b pb-3">
        <span className="rounded-md border bg-muted/30 px-2 py-1 text-[11px] font-semibold tabular-nums text-muted-foreground">
          {index}
        </span>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold leading-tight text-foreground">{title}</h2>
          {subtitle && <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{subtitle}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

function AiSummaryBlock({ summary }: { summary?: AiSummaryLike | null }) {
  if (!summary || (!summary.summary && !summary.tag && !summary.historical_position)) return null;
  return (
    <div className="space-y-4 rounded-lg border bg-background p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          <FileText className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-semibold leading-6 text-foreground">结论摘要</h3>
          <p className="text-xs text-muted-foreground">提炼核心判断、优势、风险和后续动作</p>
        </div>
        {summary.tag && <Badge className="shrink-0 text-xs">{summary.tag}</Badge>}
        {summary.satisfaction_score !== undefined && (
          <Badge variant="outline" className="shrink-0 text-xs">满意度 {summary.satisfaction_score}/10</Badge>
        )}
      </div>
      {summary.summary && (
        <div className="rounded-md bg-muted/30 px-4 py-3">
          <p className="whitespace-pre-wrap break-words text-sm leading-7 text-foreground sm:text-[15px]">
            {summary.summary}
          </p>
        </div>
      )}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {(summary.strengths || []).length > 0 && (
          <div className="rounded-md border bg-emerald-50/60 p-3">
            <p className="mb-2 text-sm font-semibold text-emerald-800">主要优势</p>
            <ul className="space-y-2">
              {summary.strengths!.map((item, idx) => (
                <li key={idx} className="flex gap-2 text-sm leading-6 text-foreground">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                  <span className="break-words">{item}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {(summary.risks || []).length > 0 && (
          <div className="rounded-md border bg-amber-50/70 p-3">
            <p className="mb-2 text-sm font-semibold text-amber-800">主要风险</p>
            <ul className="space-y-2">
              {summary.risks!.map((item, idx) => (
                <li key={idx} className="flex gap-2 text-sm leading-6 text-foreground">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
                  <span className="break-words">{item}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
      {summary.historical_position && (
        <div className="rounded-md border bg-muted/20 px-3 py-2 text-sm leading-6 text-muted-foreground">
          <span className="font-medium text-foreground">历史表现：</span>
          <span className="break-words">{summary.historical_position}</span>
        </div>
      )}
      {(summary.suggestions || []).length > 0 && (
        <div className="rounded-md border bg-background p-3">
          <p className="mb-2 text-sm font-semibold text-foreground">后续建议</p>
          <ol className="space-y-2">
            {summary.suggestions!.map((item, idx) => (
              <li key={idx} className="flex gap-2 text-sm leading-6 text-muted-foreground">
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-muted text-[11px] font-semibold text-foreground">
                  {idx + 1}
                </span>
                <span className="break-words">{item}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}

function ReportSection({ report, liveIssues, onStatusClick, onPreview }: {
  report: ReportDetail;
  liveIssues: IssueItem[];
  onStatusClick: (issue: IssueItem) => void;
  onPreview: (url: string) => void;
}) {
  const recipes = report.content?.recipes || [];
  const task = report.content?.task;
  const display = buildDisplayReportContent({
    title: report.title,
    content: report.content as ReportContentWithReview | null,
  });

  return (
    <div className="space-y-5">
      {/* Task Info */}
      {task && (
        <ReportPaperSection index="01" title="任务信息">
        <div className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-2 lg:grid-cols-3">
          {Object.entries(task)
            .filter(([k]) => !['id', 'selected_standards', 'created_by'].includes(k))
            .map(([key, value]) => (
              <div key={key} className="min-w-0 rounded-md border bg-muted/20 p-2.5">
                <div className="mb-1 text-[10px] text-muted-foreground">{taskFieldLabels[key] || key}</div>
                <div className="break-all font-medium leading-relaxed">
                  {(key === 'created_at' || key === 'updated_at') ? formatBeijingTime(value as string) : String(value || '-')}
                </div>
              </div>
            ))}
        </div>
        </ReportPaperSection>
      )}

      <ReportPaperSection index="02" title="结论摘要">
        <AiSummaryBlock summary={display.ai_summary} />
        {!display.ai_summary && <p className="text-xs text-muted-foreground">暂无总结。</p>}
      </ReportPaperSection>
      {display.review_note && (
        <div className="rounded-lg border bg-background p-3 text-xs leading-relaxed">
          <p className="mb-1 font-medium">评审备注</p>
          <p className="whitespace-pre-wrap break-all">{display.review_note}</p>
        </div>
      )}

      {/* Issues with live status */}
      {liveIssues.length > 0 && (
        <ReportPaperSection index="03" title={`问题清单 (${liveIssues.length})`}>
          <div className="space-y-2">
          {liveIssues.map((issue) => {
            const reEvals = (issue._reEvaluations || []) as ReEvaluation[];
            return (
            <div key={issue.id} className="rounded-lg border bg-background p-2.5 space-y-1">
              <div className="flex items-center gap-2">
                <Badge className={cn('text-[10px] shrink-0', LEVEL_COLORS[issue.level || '二类'] || LEVEL_COLORS['二类'])}>
                  {issue.level || '二类'}
                </Badge>
                {issue.source_type === 'recipe_problem' && (
                  <Badge variant="outline" className="text-[10px] shrink-0">食谱/功能</Badge>
                )}
                <span className="text-xs flex-1 break-all">{issue.title}</span>
                <button
                  onClick={() => onStatusClick(issue)}
                  className={cn('text-[10px] px-1.5 py-0.5 rounded cursor-pointer font-medium transition-colors hover:opacity-80 shrink-0',
                    STATUS_COLORS[issue.status] || STATUS_COLORS['待整改'])}
                >
                  {issue.status || '待整改'}
                </button>
              </div>
              {issue.description && (
                <p className="text-[10px] text-muted-foreground pl-1 break-all">{issue.description}</p>
              )}
              {/* Re-evaluations for recipe_problem issues */}
              {reEvals.length > 0 && (
                <div className="mt-1.5 space-y-1.5 border-t pt-1.5">
                  {reEvals.map((re, idx) => {
                    const reMats = (re as unknown as Record<string, unknown>).materials as Material[] | undefined;
                    return (
                    <div key={re.id} className="rounded bg-muted/30 p-2 space-y-1">
                      <div className="flex items-center gap-1.5">
                        <Badge variant="secondary" className="text-[10px]">第{idx + 1}次复测</Badge>
                        {re.ai_result && (
                          <Badge variant="outline" className="text-[10px]">评分: {re.ai_result.score}</Badge>
                        )}
                        <span className="text-[10px] text-muted-foreground ml-auto">
                          {new Date(re.created_at).toLocaleDateString('zh-CN')}
                        </span>
                      </div>
                      {re.description && (
                        <p className="text-[10px] break-all whitespace-pre-wrap">{re.description}</p>
                      )}
                      {re.ai_result && re.ai_result.summary && (
                        <p className="text-[10px] text-muted-foreground break-all">总结: {re.ai_result.summary}</p>
                      )}
                      {reMats && reMats.length > 0 && (
                        <MediaGallery materials={reMats} responsive columns={{ mobile: 2, sm: 3 }} onPreview={onPreview} />
                      )}
                    </div>
                    );
                  })}
                </div>
              )}
            </div>
            );
          })}
          </div>
        </ReportPaperSection>
      )}

      {/* Recipes — collapsed by default, expandable steps */}
      {recipes.length > 0 && (
        <RecipeEffectSection
          recipes={recipes}
          liveIssues={liveIssues}
          onIssueClick={onStatusClick}
          onPreview={onPreview}
        />
      )}

    </div>
  );
}

function matchRecipeProblemIssue(liveIssues: IssueItem[], recipeName: string | undefined, stepNumber: number | undefined, problemText: string): IssueItem | null {
  const title = problemText.substring(0, 200);
  const stepDesc = stepNumber !== undefined ? `步骤${stepNumber}: ` : '';
  for (const issue of liveIssues) {
    if (issue.source_type !== 'recipe_problem') continue;
    if (issue.title !== title) continue;
    if (stepDesc && issue.description && !issue.description.startsWith(stepDesc)) continue;
    if (recipeName && issue.source && !issue.source.includes(`(${recipeName})`)) continue;
    return issue;
  }
  return null;
}

function matchEffectProblemIssue(liveIssues: IssueItem[], problemText: string): IssueItem | null {
  const title = problemText.substring(0, 200);
  for (const issue of liveIssues) {
    if (issue.source_type !== 'recipe_problem') continue;
    if (issue.title === title && (!issue.description || !issue.description.startsWith('步骤'))) return issue;
  }
  return null;
}

function RecipeEffectSection({ recipes, liveIssues, onIssueClick, onPreview }: {
  recipes: Recipe[];
  liveIssues: IssueItem[];
  onIssueClick: (issue: IssueItem) => void;
  onPreview: (url: string) => void;
}) {
  const [expandedRecipeIds, setExpandedRecipeIds] = useState<Set<string>>(new Set());

  const toggleRecipe = (id: string) => {
    setExpandedRecipeIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <ReportPaperSection index="04" title={`功能/食谱效果 (${recipes.length})`}>
      <div className="space-y-2">
      {recipes.map((recipe) => {
        const expanded = expandedRecipeIds.has(recipe.id);
        const effectPoints = parseProblemPoints(recipe.effect_problem_point);
        const stepProblemPoints = (recipe.recipe_steps || []).flatMap((step) =>
          getStepProblemPoints(step).map((pp) => ({ step, pp }))
        );
        const totalPoints = effectPoints.length + stepProblemPoints.length;
        const effectSummary = recipe.effect_ai_result?.summary || recipe.effect_description || '';
        return (
        <div key={recipe.id} className="rounded-lg border bg-background">
          <button
            type="button"
            onClick={() => toggleRecipe(recipe.id)}
            className="flex w-full items-center gap-2 p-3 text-left transition-colors hover:bg-muted/30"
          >
            {expanded ? <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
            <Badge variant="secondary" className="text-[10px] shrink-0">{recipe.recipe_type}</Badge>
            <span className="text-xs font-medium flex-1 min-w-0 truncate">{recipe.name}</span>
            {recipe.effect_score && (
              <Badge className={`text-[9px] shrink-0 ${Number(recipe.effect_score) >= 8 ? 'bg-emerald-600' : Number(recipe.effect_score) >= 6 ? 'bg-blue-600' : Number(recipe.effect_score) >= 4 ? 'bg-amber-600' : 'bg-red-600'} text-white`}>
                {recipe.effect_score}分
              </Badge>
            )}
            <span className="text-[10px] text-muted-foreground shrink-0">{totalPoints} 问题</span>
          </button>

          {/* Always visible: effect evaluation + problem points summary */}
          {(effectSummary || effectPoints.length > 0) && (
            <div className="border-t p-3 space-y-2">
              {effectSummary && (
                <div className="flex items-start gap-2">
                  <Star className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-medium text-primary mb-1">效果/出品效果评价</p>
                    <p className="text-[11px] text-muted-foreground whitespace-pre-wrap break-all">{effectSummary}</p>
                  </div>
                </div>
              )}
              {effectPoints.length > 0 && (
                <div className="space-y-1.5">
                  {effectPoints.map((point, pointIndex) => {
                    const pointMaterials = getBoundMaterials(recipe.effect_materials || [], point.material_ids);
                    const linkedIssue = matchEffectProblemIssue(liveIssues, point.text);
                    return (
                      <div key={`${point.text}-${pointIndex}`} className="space-y-1.5">
                        <p
                          className={cn('text-[11px] text-amber-600 break-all', linkedIssue && 'cursor-pointer hover:underline')}
                          onClick={() => linkedIssue && onIssueClick(linkedIssue)}
                        >
                          {effectPoints.length > 1 ? `问题${pointIndex + 1}: ` : '问题: '}{point.text}
                          {linkedIssue && <span className="ml-1 text-[10px] text-muted-foreground">[{linkedIssue.status}]</span>}
                        </p>
                        {pointMaterials.length > 0 && (
                          <MediaGallery materials={pointMaterials} responsive columns={{ mobile: 2, sm: 2, lg: 3 }} gap="gap-3" onPreview={onPreview} />
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Expanded: step-by-step details */}
          {expanded && (recipe.recipe_steps || []).length > 0 && (
            <div className="border-t p-3 space-y-2">
              <p className="text-[11px] font-medium text-muted-foreground">步骤详情</p>
              {(recipe.recipe_steps || []).map((step) => {
                const problemPoints = getStepProblemPoints(step);
                const stepMaterials = step.materials || [];
                const stepLevelMaterials = getUnboundStepMaterials(stepMaterials, problemPoints);
                return (
                <div key={step.id} className="p-2.5 rounded-lg border bg-muted/10 space-y-1.5">
                  <div className="flex items-center gap-1.5">
                    <span className="w-4 h-4 rounded-full bg-primary/10 text-primary text-[9px] flex items-center justify-center font-medium shrink-0">{step.step_number}</span>
                    <span className="text-xs break-all">{step.operation}</span>
                  </div>
                  {(() => {
                    const pps = problemPoints;
                    if (pps.length === 0) return null;
                    return (
                      <div className="ml-5 space-y-2">
                        {pps.map((pp, ppIdx) => {
                          const pointMaterials = getBoundMaterials(stepMaterials, pp.material_ids);
                          const linkedIssue = matchRecipeProblemIssue(liveIssues, recipe.name, step.step_number, pp.text);
                          return (
                          <div key={`${pp.text}-${ppIdx}`} className="space-y-1.5">
                          <p
                            className={cn('text-[10px] text-amber-600 break-all', linkedIssue && 'cursor-pointer hover:underline')}
                            onClick={() => linkedIssue && onIssueClick(linkedIssue)}
                          >
                            {pps.length > 1 && <span className="font-medium">问题{ppIdx + 1}: </span>}
                            {pp.text}
                            {linkedIssue && <span className="ml-1 text-[9px] text-muted-foreground">[{linkedIssue.status}]</span>}
                          </p>
                          <MediaGallery materials={pointMaterials} responsive columns={{ mobile: 2, sm: 3, lg: 4 }} onPreview={onPreview} />
                          </div>
                          );
                        })}
                      </div>
                    );
                  })()}
                  <MediaGallery materials={stepLevelMaterials} responsive columns={{ mobile: 2, sm: 3, lg: 4 }} className="ml-5" onPreview={onPreview} />
                </div>
                );
              })}
            </div>
          )}
        </div>
        );
      })}
      </div>
    </ReportPaperSection>
  );
}

const FALLBACK_PHASE_ORDER = ['手板', '试制', '试产', '量产'];

function formatDateShort(value: string | null | undefined): string {
  if (!value) return '';
  try {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())}`;
  } catch {
    return String(value);
  }
}

function MergedIssuesSection({ reports, liveIssuesMap, onIssueClick }: {
  reports: ReportDetail[];
  liveIssuesMap: Record<string, IssueItem[]>;
  onIssueClick: (issue: IssueItem) => void;
}) {
  const phaseOrder = useDictLabels('project_phase_dict');
  // Group reports by phase, then by date
  type Group = { key: string; phase: string | null; date: string | null; issues: Array<{ issue: IssueItem; report: ReportDetail }> };
  const groups: Group[] = [];
  const findGroup = (phase: string | null, date: string | null, key: string): Group => {
    let g = groups.find((item) => item.phase === phase && item.date === date);
    if (!g) {
      g = { key, phase, date, issues: [] };
      groups.push(g);
    }
    return g;
  };

  for (const rpt of reports) {
    const rptTask = rpt.content?.task as Record<string, unknown> | undefined;
    const phase = (rptTask?.project_phase as string) || null;
    const date = (rptTask?.test_date as string) || null;
    const dateShort = formatDateShort(date);
    // Decide group key: phase+date when both phase exists AND multiple reports in same phase, otherwise phase-only or date-only
    let key: string;
    let gPhase: string | null;
    let gDate: string | null;
    if (phase) {
      // Group under phase; if multiple dates within same phase, will separate by date
      gPhase = phase;
      gDate = dateShort || null;
      key = `${phase}|${dateShort}`;
    } else {
      gPhase = null;
      gDate = dateShort || null;
      key = `|${dateShort}`;
    }
    const group = findGroup(gPhase, gDate, key);
    for (const issue of (liveIssuesMap[rpt.id] || [])) {
      group.issues.push({ issue, report: rpt });
    }
  }

  // Sort groups: phase groups first by dict-supplied phase order (with frozen
  // fallback), then by date asc; no-phase groups at end by date asc.
  const order = phaseOrder.length > 0 ? phaseOrder : FALLBACK_PHASE_ORDER;
  groups.sort((a, b) => {
    if (a.phase && !b.phase) return -1;
    if (!a.phase && b.phase) return 1;
    if (a.phase && b.phase) {
      const ai = order.indexOf(a.phase);
      const bi = order.indexOf(b.phase);
      const pa = ai === -1 ? 999 : ai;
      const pb = bi === -1 ? 999 : bi;
      if (pa !== pb) return pa - pb;
      return (a.date || '').localeCompare(b.date || '');
    }
    return (a.date || '').localeCompare(b.date || '');
  });

  const totalIssues = groups.reduce((s, g) => s + g.issues.length, 0);
  if (totalIssues === 0) return null;

  return (
    <Card className="mx-auto max-w-6xl border bg-background shadow-sm">
      <CardHeader className="border-b bg-background pb-3">
        <CardTitle className="text-sm font-medium">问题点合并视图 ({totalIssues})</CardTitle>
      </CardHeader>
      <CardContent className="pt-4 space-y-4">
        {groups.map((group, idx) => {
          const heading = group.phase
            ? (group.date ? `${group.phase} ${group.date}` : group.phase)
            : (group.date || '未指定日期');
          return (
            <div key={`${group.key}-${idx}`} className="space-y-2">
              <div className="flex items-center gap-2 border-b pb-1">
                <span className="text-sm font-semibold">{heading}</span>
                <Badge variant="secondary" className="text-[10px]">{group.issues.length} 个</Badge>
              </div>
              <div className="space-y-1.5">
                {group.issues.map(({ issue }) => (
                  <button
                    key={issue.id}
                    type="button"
                    onClick={() => onIssueClick(issue)}
                    className="flex w-full items-center gap-2 rounded-lg border bg-background p-2 text-left transition-colors hover:bg-muted/30"
                  >
                    <Badge className={cn('text-[10px] shrink-0', LEVEL_COLORS[issue.level || '二类'] || LEVEL_COLORS['二类'])}>
                      {issue.level || '二类'}
                    </Badge>
                    {issue.source_type === 'recipe_problem' ? (
                      <Badge variant="outline" className="text-[10px] shrink-0">功能</Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px] shrink-0">五感</Badge>
                    )}
                    <span className="text-xs flex-1 min-w-0 break-all">{issue.title}</span>
                    <span className={cn('text-[10px] px-1.5 py-0.5 rounded shrink-0', STATUS_COLORS[issue.status] || STATUS_COLORS['待整改'])}>
                      {issue.status || '待整改'}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

export default function ReportDetailPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const id = params.id as string;
  const debugLegacyBody = searchParams.get('debug') === 'legacy' || searchParams.get('parity') === '1';
  const [report, setReport] = useState<ReportDetail | null>(null);
  const [detailModel, setDetailModel] = useState<ReportDetailModel | null>(null);
  const [siblingReports, setSiblingReports] = useState<ReportDetail[]>([]);
  const [liveIssuesMap, setLiveIssuesMap] = useState<Record<string, IssueItem[]>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [rectificationOpen, setRectificationOpen] = useState(false);
  const [editingIssue, setEditingIssue] = useState<IssueItem | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareDuration, setShareDuration] = useState<'7d' | '30d' | 'permanent'>('30d');
  const [shareCreating, setShareCreating] = useState(false);
  const [shareLink, setShareLink] = useState<string | null>(null);
  const [shareLinks, setShareLinks] = useState<Array<{ id: string; share_token: string; expires_at: string | null; is_expired: boolean; created_at: string }>>([]);
  const { open, PreviewComponent } = useImagePreview();

  const fetchLiveIssues = useCallback(async (reportId: string) => {
    const res = await fetch(`/api/issues?source_report_id=${reportId}&limit=500`);
    const data = await res.json();
    const raw = data.data;
    const allIssues: IssueItem[] = Array.isArray(raw) ? raw : (raw?.list || []);
    const reportIssues = allIssues.filter((i: IssueItem) => i.source_report_id === reportId);
    // Fetch re-evaluations for recipe_problem issues
    const recipeIssues = reportIssues.filter((i: IssueItem) => i.source_type === 'recipe_problem');
    if (recipeIssues.length > 0) {
      try {
        const issueIds = recipeIssues.map(i => i.id).join(',');
        const reRes = await fetch(`/api/issue-re-evaluations?issue_ids=${issueIds}`);
        const reData = await reRes.json();
        if (reData.code === 0 && reData.data) {
          const reEvalMap: Record<string, ReEvaluation[]> = {};
          for (const re of reData.data) {
            if (!reEvalMap[re.issue_id]) reEvalMap[re.issue_id] = [];
            reEvalMap[re.issue_id].push(re);
          }
          // Attach re-evaluations (with embedded materials) to issues
          for (const issue of recipeIssues) {
            (issue as Record<string, unknown>)._reEvaluations = reEvalMap[issue.id] || [];
          }
        }
      } catch { /* ignore re-evaluation fetch errors */ }
    }
    setLiveIssuesMap(prev => ({ ...prev, [reportId]: reportIssues }));
  }, []);

  const fetchReport = useCallback(async () => {
    setLoading(true);
    setDetailModel(null);
    setLoadError(null);
    try {
      const [res, detailRes] = await Promise.all([
        fetch(`/api/reports/${id}`),
        fetch(`/api/reports/${id}/detail`),
      ]);
      const data = await res.json();
      const detailData = await detailRes.json().catch(() => null);
      if (data.code === 0) {
        const rpt = data.data as ReportDetail;
        setReport(rpt);
        if (detailData?.code === 0) setDetailModel(detailData.data as ReportDetailModel);
        setSiblingReports([]);
        // Fetch sibling reports
        const mergeModel = getReportMergeModel(rpt.product_model);
        if (mergeModel) {
          const allRes = await fetch('/api/reports?limit=200');
          const allData = await allRes.json();
          const allReports: ReportDetail[] = Array.isArray(allData.data) ? allData.data : (allData.data?.list || []);
          const projectType = (rpt.content?.task as Record<string, unknown>)?.project_type as string;
          if (isMergeableReportProjectType(projectType)) {
            const byTaskId: Record<string, ReportDetail> = {};
            for (const r of allReports) {
              if (getReportMergeModel(r.product_model) !== mergeModel) continue;
              // Only merge reports of the same merge-eligible project type
              const rProjectType = normalizeReportProjectType((r as unknown as Record<string, unknown>).project_type as string || (r.content?.task as Record<string, unknown>)?.project_type as string);
              if (!isMergeableReportProjectType(rProjectType)) continue;
              const existing = byTaskId[r.task_id];
              if (!existing || r.created_at > existing.created_at) {
                byTaskId[r.task_id] = r;
              }
            }
            byTaskId[rpt.task_id] = rpt;
            const siblingSummaries = sortReportsByCreatedAtAsc(Object.values(byTaskId))
              .filter((r: ReportDetail) => r.id !== rpt.id)
              .filter((r: ReportDetail) => Boolean(r.id));
            const siblings = await Promise.all(siblingSummaries.map(async (summary) => {
              const detailRes = await fetch(`/api/reports/${summary.id}`);
              const detailData = await detailRes.json();
              return detailData.code === 0 ? detailData.data as ReportDetail : null;
            }));
            setSiblingReports(siblings.filter((item): item is ReportDetail => Boolean(item?.content)));
          }
        }
        // Fetch live issues for this report
        await fetchLiveIssues(rpt.id);
      } else {
        setLoadError(data.message || '报告加载失败');
      }
    } catch {
      setLoadError('网络错误，请重试');
    } finally {
      setLoading(false);
    }
  }, [fetchLiveIssues, id]);

  useEffect(() => { fetchReport().finally(() => setLoading(false)); }, [fetchReport]);

  // Also fetch issues for sibling reports
  useEffect(() => {
    siblingReports.forEach(rpt => {
      if (!liveIssuesMap[rpt.id]) {
        fetchLiveIssues(rpt.id);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siblingReports]);

  const handleOpenRectification = (issue: IssueItem) => {
    setEditingIssue(issue);
    setRectificationOpen(true);
  };

  const handleRectificationSaved = async (updated: IssueForRectification) => {
    setLiveIssuesMap(prev => {
      const updatedMap = { ...prev };
      Object.keys(updatedMap).forEach(reportId => {
        updatedMap[reportId] = updatedMap[reportId].map(i =>
          i.id === updated.id ? { ...i, ...updated } as IssueItem : i
        );
      });
      return updatedMap;
    });
    // Refresh re-evaluations for this issue's report
    if (updated.source_report_id) {
      await fetchLiveIssues(updated.source_report_id);
    }
  };

  const handleExportPDF = async () => {
    if (report?.report_type === 'comparison_report') {
      toast.info('正在准备对比报告PDF...');
      try {
        const preflightRes = await fetch(`/api/reports/${id}/pdf?preflight=1`);
        const preflight = await preflightRes.json().catch(() => null);
        if (!preflightRes.ok || preflight?.code !== 0 || preflight?.data?.preflight?.ok === false) {
          const firstError = preflight?.data?.preflight?.errors?.[0]?.message;
          toast.error(firstError || preflight?.message || 'PDF导出预检未通过，请稍后重试');
          return;
        }
        const opened = window.open(`/api/reports/${id}/pdf`, '_blank');
        if (!opened) {
          toast.error('浏览器阻止了新窗口，请允许弹窗后重试');
          return;
        }
        toast.success('PDF已在新窗口打开');
      } catch {
        toast.error('PDF导出失败，请稍后重试');
      }
      return;
    }
    const opened = window.open(`/reports/print?id=${id}&mode=fast`, '_blank');
    if (!opened) {
      toast.error('浏览器阻止了新窗口，请允许弹窗后重试');
      return;
    }
    toast.success('打印导出页已打开');
  };

  const openShareDialog = async () => {
    setShareOpen(true);
    setShareLink(null);
    setShareDuration('30d');
    try {
      const res = await fetch(`/api/reports/share/list?report_id=${id}`);
      const data = await res.json();
      if (data.code === 0) setShareLinks(data.data || []);
    } catch { setShareLinks([]); }
  };

  const handleCreateShare = async () => {
    setShareCreating(true);
    try {
      const res = await fetch('/api/reports/share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ report_id: id, duration: shareDuration }),
      });
      const data = await res.json();
      if (data.code === 0) {
        const token = data.data.share_token;
        const domain = window.location.origin;
        setShareLink(`${domain}/reports/share/${token}`);
        toast.success('分享链接已创建');
        const listRes = await fetch(`/api/reports/share/list?report_id=${id}`);
        const listData = await listRes.json();
        if (listData.code === 0) setShareLinks(listData.data || []);
      } else {
        toast.error(data.message);
      }
    } finally { setShareCreating(false); }
  };

  const handleCopyLink = (link: string) => {
    copyToClipboard(link).then(() => toast.success('链接已复制')).catch(() => toast.error('复制失败'));
  };

  const handleRevokeShare = async (shareId: string) => {
    const res = await fetch(`/api/reports/share/list?id=${shareId}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.code === 0) {
      toast.success('已撤销');
      setShareLinks(prev => prev.filter(s => s.id !== shareId));
    }
  };

  if (loading) return <div className="p-6 animate-pulse space-y-4"><div className="h-8 bg-muted rounded w-64" /></div>;
  if (!report) return (
    <div className="p-6 space-y-3">
      <p className="text-muted-foreground">{loadError || '报告不存在'}</p>
      <Button variant="outline" onClick={() => fetchReport()}>重试</Button>
    </div>
  );

  const isComparisonReport = report.report_type === 'comparison_report';
  const comparisonSnapshot = report.snapshot?.snapshot_json;
  const isMerged = siblingReports.length > 0;
  const allReports = isMerged ? [report, ...siblingReports] : [report];

  // Total stats
  const totalRecords = allReports.flatMap(r => r.content?.records || []);
  const allLiveIssues = allReports.flatMap(r => liveIssuesMap[r.id] || []);
  const totalRecipes = allReports.flatMap(r => r.content?.recipes || []);
  const totalPass = totalRecords.filter(r => r.evaluation_result === '合格').length;
  const totalFail = totalRecords.filter(r => r.evaluation_result === '不合格').length;
  const totalRecipePC = totalRecipes.reduce((s, r) => s + (r.problem_count || 0), 0);
  const displayReport = buildDisplayReportContent({
    title: report.title,
    content: report.content as ReportContentWithReview | null,
  });

  return (
    <PageShell size="wide" className="space-y-5">
      <PreviewComponent />
      <ReportDetailShell
        model={detailModel}
        fallbackTitle={report.product_model || displayReport.title}
        fallbackStatus={report.status}
        mergedCount={isMerged ? allReports.length : undefined}
        onBack={() => router.back()}
        onExportPdf={handleExportPDF}
        onShare={openShareDialog}
        debugLegacyBody={debugLegacyBody}
      >
      {isComparisonReport ? (
        <div className="mx-auto max-w-6xl">
          {comparisonSnapshot ? (
            <ComparisonReportView snapshot={comparisonSnapshot} title={report.title} onPreview={open} />
          ) : (
            <Card className="border bg-background shadow-sm">
              <CardContent className="p-6 text-sm text-muted-foreground">
                该对比报告还没有可渲染的快照，请先在对比任务中生成 comparison_report 快照。
              </CardContent>
            </Card>
          )}
        </div>
      ) : (
        <>
      {/* Summary Stats */}
      <div className="mx-auto grid max-w-6xl grid-cols-3 gap-2 sm:grid-cols-5 lg:gap-3">
        {[
          { label: '检查项总数', value: totalRecords.length, color: '' },
          { label: '合格', value: totalPass, color: 'text-emerald-600' },
          { label: '不合格', value: totalFail, color: 'text-destructive' },
          { label: '问题整改', value: allLiveIssues.length, color: 'text-amber-600' },
          { label: '食谱/功能问题', value: totalRecipePC, color: 'text-orange-600' },
        ].map((stat) => (
          <Card key={stat.label} className="border bg-background shadow-sm lg:py-4">
            <CardContent className="p-3 text-center sm:p-4">
              <p className={cn('text-2xl font-bold tabular-nums lg:text-3xl', stat.color)}>{stat.value}</p>
              <p className="text-xs text-muted-foreground mt-1">{stat.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="mx-auto max-w-6xl rounded-xl border bg-background p-3 shadow-sm lg:flex lg:items-center lg:justify-between lg:gap-4">
        <div className="min-w-0">
          <p className="text-xs font-medium text-muted-foreground">报告导航</p>
        </div>
        <div className="mt-3 flex gap-2 overflow-x-auto lg:mt-0 lg:justify-end">
          {allReports.map((rpt, idx) => {
            const rptTask = rpt.content?.task as Record<string, unknown> | undefined;
            const rptPhase = rptTask?.project_phase as string | undefined;
            return (
              <a
                key={rpt.id}
                href={`#report-section-${idx}`}
                className="shrink-0 rounded-md border bg-background px-3 py-2 text-xs font-medium transition-colors hover:bg-muted"
              >
                {isMerged ? rptPhase || `报告 ${idx + 1}` : '报告正文'}
              </a>
            );
          })}
          <Button variant="outline" size="sm" className="shrink-0" onClick={handleExportPDF}>
            导出PDF
          </Button>
        </div>
      </div>

      {/* Merged issues view (only for model-merged reports) */}
      {isMerged && (
        <MergedIssuesSection
          reports={allReports}
          liveIssuesMap={liveIssuesMap}
          onIssueClick={handleOpenRectification}
        />
      )}

      {/* Report sections */}
      {allReports.map((rpt, idx) => {
        const rptTask = rpt.content?.task as Record<string, unknown> | undefined;
        const rptPhase = rptTask?.project_phase as string | undefined;
        const rptDate = rptTask?.test_date as string | undefined;
        const rptType = rptTask?.project_type as string | undefined;
        return (
          <Card key={rpt.id} id={`report-section-${idx}`} className="mx-auto max-w-6xl scroll-mt-4 overflow-hidden border bg-background shadow-sm">
            <CardHeader className="border-b bg-background pb-3">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-sm font-medium min-w-0 break-all">
                  {isMerged ? (
                    <>
                      {rptPhase && <Badge variant="outline" className="text-[10px] mr-1.5">{rptPhase}</Badge>}
                      {rpt.title}
                      {rptDate && <span className="text-muted-foreground font-normal ml-2">({rptDate})</span>}
                    </>
                  ) : (
                    rpt.title
                  )}
                </CardTitle>
                {isMerged && idx > 0 && (
                  <Badge variant="secondary" className="text-[10px]">{rptType || ''}</Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="pt-4">
              {idx > 0 && (
                <div className="border-t border-dashed mb-3 pt-2">
                  <p className="text-[10px] text-muted-foreground">以下为独立报告内容，与上方报告以分割线区分</p>
                </div>
              )}
              <ReportSection
                report={rpt}
                liveIssues={liveIssuesMap[rpt.id] || []}
                onStatusClick={handleOpenRectification}
                onPreview={open}
              />
            </CardContent>
          </Card>
        );
      })}
        </>
      )}
      </ReportDetailShell>

      {/* Issue Rectification Dialog (reusable) */}
      <IssueRectificationDialog
        issue={editingIssue}
        open={rectificationOpen}
        onOpenChange={(v) => { setRectificationOpen(v); if (!v) setEditingIssue(null); }}
        onSaved={handleRectificationSaved}
      />

      {/* Share Sheet */}
      <Sheet open={shareOpen} onOpenChange={setShareOpen}>
        <SheetContent side="bottom" className="rounded-t-2xl max-h-[80vh] p-0">
          <SheetHeader className="px-5 pt-5 pb-2">
            <SheetTitle className="text-base">分享报告</SheetTitle>
            <SheetDescription className="sr-only">生成只读分享链接，供未登录用户查看和导出该报告。</SheetDescription>
          </SheetHeader>
          <div className="px-5 pb-5 overflow-y-auto max-h-[calc(80vh-4rem)]">
            {!shareLink ? (
              <div className="space-y-4">
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">选择有效期</p>
                  <div className="flex gap-2">
                    {([
                      { value: '7d' as const, label: '7天' },
                      { value: '30d' as const, label: '30天' },
                      { value: 'permanent' as const, label: '永久' },
                    ]).map(opt => (
                      <Button key={opt.value} type="button" variant={shareDuration === opt.value ? 'default' : 'outline'}
                        size="sm" className="flex-1 h-11 text-sm" onClick={() => setShareDuration(opt.value)}>
                        {opt.label}
                      </Button>
                    ))}
                  </div>
                </div>
                <Button type="button" className="w-full h-11" onClick={handleCreateShare} disabled={shareCreating}>
                  {shareCreating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Share2 className="h-4 w-4 mr-2" />}
                  生成分享链接
                </Button>
                {shareLinks.length > 0 && (
                  <div className="pt-2 border-t">
                    <p className="text-xs text-muted-foreground mb-2">已有链接 ({shareLinks.length})</p>
                    <div className="space-y-2">
                      {shareLinks.slice(0, 5).map(s => (
                        <div key={s.id} className="flex items-center gap-2 text-xs py-1.5 px-2 rounded-lg bg-muted/50">
                          <span className={cn('shrink-0 text-xs font-medium', s.is_expired ? 'text-destructive' : 'text-emerald-600')}>
                            {s.is_expired ? '已过期' : s.expires_at ? `${new Date(s.expires_at).toLocaleDateString('zh-CN')}前` : '永久'}
                          </span>
                          <span className="flex-1 min-w-0 truncate text-muted-foreground text-xs">
                            {`/reports/share/${s.share_token}`}
                          </span>
                          <div className="flex shrink-0 gap-1">
                            {!s.is_expired && (
                              <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleCopyLink(`${typeof window !== 'undefined' ? window.location.origin : ''}/reports/share/${s.share_token}`)}>
                                <Copy className="h-3 w-3" />
                              </Button>
                            )}
                            <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleRevokeShare(s.id)}>
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                <div className="bg-primary/5 rounded-xl p-4 space-y-3 border border-primary/10">
                  <p className="text-sm font-medium">链接已生成</p>
                  <div className="bg-background rounded-lg px-3 py-2.5 text-xs break-all select-all cursor-text border"
                    onClick={(e) => { const sel = window.getSelection(); if (sel) sel.selectAllChildren(e.currentTarget); }}>
                    {shareLink}
                  </div>
                  <Button type="button" className="w-full h-11" onClick={() => handleCopyLink(shareLink)}>
                    <Copy className="h-4 w-4 mr-2" /> 复制链接
                  </Button>
                  <p className="text-xs text-muted-foreground text-center">
                    {shareDuration === 'permanent' ? '此链接永久有效' : `此链接${shareDuration === '7d' ? '7天' : '30天'}内有效`}
                  </p>
                </div>
                <Button type="button" variant="outline" className="w-full h-10" onClick={() => { setShareLink(null); }}>
                  继续生成
                </Button>
                {shareLinks.length > 0 && (
                  <div className="border-t pt-3">
                    <p className="text-xs text-muted-foreground mb-2">全部链接 ({shareLinks.length})</p>
                    <div className="space-y-2">
                      {shareLinks.map(s => (
                        <div key={s.id} className="flex items-center gap-2 text-xs py-1.5 px-2 rounded-lg bg-muted/50">
                          <span className={cn('shrink-0 text-xs font-medium', s.is_expired ? 'text-destructive' : 'text-emerald-600')}>
                            {s.is_expired ? '已过期' : s.expires_at ? `${new Date(s.expires_at).toLocaleDateString('zh-CN')}前` : '永久'}
                          </span>
                          <span className="flex-1 min-w-0 truncate text-muted-foreground text-xs">
                            {`/reports/share/${s.share_token}`}
                          </span>
                          <div className="flex shrink-0 gap-1">
                            {!s.is_expired && (
                              <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleCopyLink(`${typeof window !== 'undefined' ? window.location.origin : ''}/reports/share/${s.share_token}`)}>
                                <Copy className="h-3 w-3" />
                              </Button>
                            )}
                            <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleRevokeShare(s.id)}>
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </PageShell>
  );
}
