'use client';

import { useEffect, useState, useCallback, type ReactNode } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Download, Share2, Copy, X, Loader2, Star, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { useImagePreview } from '@/components/image-preview';
import { toast } from 'sonner';
import { PageShell } from '@/components/app';
import { MediaGallery } from '@/components/app/media-gallery';
import { buildDisplayReportContent, type AiSummaryLike, type ReportContentWithReview, type ReportReviewOverrides } from '@/lib/report-review-overrides';

interface Material {
  id: string; material_type: string; file_name: string; file_url: string; file_size: number;
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
  status: string; source_report_id: string | null; source_type: string | null;
  category: string | null; improve_plan: string | null; responsible_person: string | null;
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
  project_type: '项目类型', project_phase: '项目阶段', test_date: '测试日期',
  organizer: '组织人', target_user: '目标用户', test_purpose: '测试目的',
  test_method: '测试方法', status: '状态', assigned_to: '负责人',
  selected_standards: '选择标准', created_at: '创建时间', updated_at: '更新时间',
};

const STATUS_LIST = ['待整改', '整改中', '已验证', '不整改'];
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
    <div className="rounded-lg border bg-background p-3 space-y-3">
      <div className="flex items-center gap-2 min-w-0">
        <Sparkles className="h-4 w-4 text-primary shrink-0" />
        <span className="text-xs font-medium text-primary shrink-0">AI总结</span>
        {summary.tag && <Badge className="text-[10px] shrink-0">{summary.tag}</Badge>}
        {summary.satisfaction_score !== undefined && (
          <Badge variant="outline" className="text-[10px] ml-auto shrink-0">满意度 {summary.satisfaction_score}/10</Badge>
        )}
      </div>
      {summary.summary && <p className="text-xs leading-relaxed whitespace-pre-wrap break-all">{summary.summary}</p>}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {(summary.strengths || []).length > 0 && (
          <div className="rounded-md border bg-muted/20 p-2">
            <p className="text-[10px] font-medium text-emerald-700 mb-1">主要优势</p>
            <div className="space-y-0.5">{summary.strengths!.map((item, idx) => <p key={idx} className="text-[11px] text-muted-foreground break-all">{item}</p>)}</div>
          </div>
        )}
        {(summary.risks || []).length > 0 && (
          <div className="rounded-md border bg-muted/20 p-2">
            <p className="text-[10px] font-medium text-amber-700 mb-1">主要风险</p>
            <div className="space-y-0.5">{summary.risks!.map((item, idx) => <p key={idx} className="text-[11px] text-muted-foreground break-all">{item}</p>)}</div>
          </div>
        )}
      </div>
      {summary.historical_position && (
        <p className="text-[11px] text-muted-foreground break-all">历史表现：{summary.historical_position}</p>
      )}
      {(summary.suggestions || []).length > 0 && (
        <div className="space-y-0.5">
          <p className="text-[10px] font-medium text-muted-foreground">后续建议</p>
          {summary.suggestions!.map((item, idx) => <p key={idx} className="text-[11px] text-muted-foreground break-all">{idx + 1}. {item}</p>)}
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
  const records = report.content?.records || [];
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
        <ReportPaperSection index="01" title="任务信息" subtitle="报告正文以任务数据为准，必要时可回到任务详情修正原始记录。">
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

      <div className="flex flex-wrap gap-2 rounded-xl border bg-background p-3 shadow-sm">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium">事实内容回源编辑</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">检查记录、素材、食谱步骤和效果评价以任务源数据为准。</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => window.location.href = `/tasks/${report.task_id}?tab=senses`}>
          编辑五感记录
        </Button>
        <Button variant="outline" size="sm" onClick={() => window.location.href = `/tasks/${report.task_id}?tab=functions`}>
          编辑功能效果
        </Button>
      </div>

      <ReportPaperSection index="02" title="结论摘要" subtitle="先看结论，再下钻到对应证据。">
        <AiSummaryBlock summary={display.ai_summary} />
        {!display.ai_summary && <p className="text-xs text-muted-foreground">暂无 AI 总结。</p>}
      </ReportPaperSection>
      {display.review_note && (
        <div className="rounded-lg border bg-background p-3 text-xs leading-relaxed">
          <p className="mb-1 font-medium">评审备注</p>
          <p className="whitespace-pre-wrap break-all">{display.review_note}</p>
        </div>
      )}

      {/* Issues with live status */}
      {liveIssues.length > 0 && (
        <ReportPaperSection index="03" title={`问题清单 (${liveIssues.length})`} subtitle="问题状态可直接点选更新，便于报告评审后回写整改进展。">
          <div className="space-y-2">
          {liveIssues.map((issue) => (
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
            </div>
          ))}
          </div>
        </ReportPaperSection>
      )}

      {/* Check Records */}
      {records.length > 0 && (
        <ReportPaperSection index="04" title={`五感检查记录 (${records.length})`} subtitle="每条记录下方保留对应图片/视频证据，避免结论和素材脱节。">
          <div className="space-y-3">
          {records.map((record) => {
            const recordMats = record.materials || [];
            return (
              <div key={record.id} className="p-3 rounded-lg border bg-background space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={cn(
                    'text-[10px] font-medium px-1.5 py-0.5 rounded',
                    record.evaluation_result === '合格' && 'bg-emerald-100 text-emerald-700',
                    record.evaluation_result === '不合格' && 'bg-red-100 text-red-700',
                    record.evaluation_result === '待定' && 'bg-amber-100 text-amber-700',
                  )}>{record.evaluation_result}</span>
                  <span className="text-xs font-medium flex-1 min-w-0 truncate">{record.check_item}</span>
                  {record.check_dimension && (
                    <span className="text-[10px] text-muted-foreground bg-background px-1 py-0.5 rounded">{record.check_dimension}</span>
                  )}
                </div>
                {(record.check_requirement || record.check_standard) && (
                  <div className="text-[10px] text-muted-foreground space-y-0.5 pl-1 break-all">
                    {record.check_requirement && <div>要求: {record.check_requirement}</div>}
                    {record.check_standard && <div>标准: {record.check_standard}</div>}
                  </div>
                )}
                {record.problem_description && (
                  <p className="text-[10px] text-muted-foreground break-all">{record.problem_description}</p>
                )}
                <MediaGallery materials={recordMats} responsive columns={{ mobile: 2, sm: 3, lg: 4 }} onPreview={onPreview} />
              </div>
            );
          })}
          </div>
        </ReportPaperSection>
      )}

      {/* Recipes */}
      {recipes.length > 0 && (
        <ReportPaperSection index="05" title={`功能/食谱效果 (${recipes.length})`} subtitle="步骤问题、效果结论与素材证据保持在同一上下文中。">
          <div className="space-y-3">
          {recipes.map((recipe) => (
            <div key={recipe.id} className="rounded-lg border bg-background p-3 space-y-2">
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="text-[10px] shrink-0">{recipe.recipe_type}</Badge>
                <span className="text-xs font-medium flex-1 min-w-0 truncate">{recipe.name}</span>
                <span className="text-[10px] text-muted-foreground">{recipe.problem_count || 0} 问题</span>
              </div>
              {recipe.recipe_steps?.map((step) => (
                <div key={step.id} className="p-2.5 rounded-lg border bg-muted/10 space-y-1.5">
                  <div className="flex items-center gap-1.5">
                    <span className="w-4 h-4 rounded-full bg-primary/10 text-primary text-[9px] flex items-center justify-center font-medium shrink-0">{step.step_number}</span>
                    <span className="text-xs break-all">{step.operation}</span>
                  </div>
                  {(() => {
                    const pps = step.problem_points && step.problem_points.length > 0
                      ? step.problem_points.filter(p => p.text && p.text.trim())
                      : step.problem_point ? [{ text: step.problem_point }] : [];
                    if (pps.length === 0) return null;
                    return (
                      <div className="ml-5 space-y-0.5">
                        {pps.map((pp, ppIdx) => (
                          <p key={ppIdx} className="text-[10px] text-amber-600 break-all">
                            {pps.length > 1 && <span className="font-medium">问题{ppIdx + 1}: </span>}
                            {pp.text}
                          </p>
                        ))}
                      </div>
                    );
                  })()}
                  <MediaGallery materials={step.materials || []} responsive columns={{ mobile: 2, sm: 3, lg: 4 }} className="ml-5" onPreview={onPreview} />
                </div>
              ))}
              {/* Effect Evaluation */}
              {(recipe.effect_description || recipe.effect_problem_point || recipe.effect_score || recipe.effect_ai_result || (recipe.effect_materials && recipe.effect_materials.length > 0)) && (
                <div className="mt-2 p-2.5 rounded-lg border bg-background space-y-1.5">
                  <div className="flex items-center gap-2">
                    <Star className="h-3.5 w-3.5 text-primary" />
                    <span className="text-[11px] font-medium text-primary">效果/出品效果评价</span>
                    {recipe.effect_score && (
                      <Badge className={`text-[9px] ml-auto ${Number(recipe.effect_score) >= 8 ? 'bg-emerald-600' : Number(recipe.effect_score) >= 6 ? 'bg-blue-600' : Number(recipe.effect_score) >= 4 ? 'bg-amber-600' : 'bg-red-600'} text-white`}>
                        {recipe.effect_score}分/10分
                      </Badge>
                    )}
                  </div>
                  {recipe.effect_ai_result && (
                      <p className="text-[11px] text-muted-foreground whitespace-pre-wrap break-all ml-5">{recipe.effect_ai_result.summary}</p>
                  )}
                  {!recipe.effect_ai_result && recipe.effect_description && (
                    <p className="text-[11px] text-muted-foreground whitespace-pre-wrap break-all ml-5">{recipe.effect_description}</p>
                  )}
                  {(() => {
                    const effectPoints = parseProblemPoints(recipe.effect_problem_point);
                    const effectMaterials = recipe.effect_materials || [];
                    const hasBoundMaterials = effectPoints.some((point) => point.material_ids?.length);
                    return (
                      <>
                        {effectPoints.length > 0 && (
                          <div className="ml-5 space-y-2">
                            {effectPoints.map((point, pointIndex) => {
                              const pointMaterials = getBoundMaterials(effectMaterials, point.material_ids);
                              return (
                                <div key={`${point.text}-${pointIndex}`} className="space-y-1.5">
                                  <p className="text-[11px] text-amber-600 break-all">
                                    {effectPoints.length > 1 ? `问题${pointIndex + 1}: ` : '问题: '}{point.text}
                                  </p>
                                  <MediaGallery materials={pointMaterials} responsive columns={{ mobile: 2, sm: 2, lg: 3 }} gap="gap-3" onPreview={onPreview} />
                                </div>
                              );
                            })}
                          </div>
                        )}
                        <MediaGallery
                          materials={hasBoundMaterials ? [] : effectMaterials}
                          responsive
                          columns={{ mobile: 2, sm: 2, lg: 3 }}
                          gap="gap-3"
                          className="ml-5"
                          onPreview={onPreview}
                        />
                      </>
                    );
                  })()}
                </div>
              )}
            </div>
          ))}
          </div>
        </ReportPaperSection>
      )}

    </div>
  );
}

export default function ReportDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const [report, setReport] = useState<ReportDetail | null>(null);
  const [siblingReports, setSiblingReports] = useState<ReportDetail[]>([]);
  const [liveIssuesMap, setLiveIssuesMap] = useState<Record<string, IssueItem[]>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [statusDialogOpen, setStatusDialogOpen] = useState(false);
  const [editingIssue, setEditingIssue] = useState<IssueItem | null>(null);
  const [tempStatus, setTempStatus] = useState('');
  const [tempLevel, setTempLevel] = useState('');
  const [saving, setSaving] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareDuration, setShareDuration] = useState<'7d' | '30d' | 'permanent'>('30d');
  const [shareCreating, setShareCreating] = useState(false);
  const [shareLink, setShareLink] = useState<string | null>(null);
  const [shareLinks, setShareLinks] = useState<Array<{ id: string; share_token: string; expires_at: string | null; is_expired: boolean; created_at: string }>>([]);
  const { open, PreviewComponent } = useImagePreview();

  const fetchReport = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch(`/api/reports/${id}`);
      const data = await res.json();
      if (data.code === 0) {
        const rpt = data.data as ReportDetail;
        setReport(rpt);
        // Fetch sibling reports
        if (rpt.product_model) {
          const allRes = await fetch('/api/reports?limit=200');
          const allData = await allRes.json();
          const allReports: ReportDetail[] = Array.isArray(allData.data) ? allData.data : (allData.data?.list || []);
          const projectType = (rpt.content?.task as Record<string, unknown>)?.project_type as string;
          const shouldMerge = projectType === '自研' || projectType === '改型/降本/优化';
          if (shouldMerge) {
            const byTaskId: Record<string, ReportDetail> = {};
            for (const r of allReports) {
              if (r.product_model !== rpt.product_model) continue;
              // Only merge reports of the same merge-eligible project type
              const rProjectType = (r as unknown as Record<string, unknown>).project_type as string || (r.content?.task as Record<string, unknown>)?.project_type as string;
              if (rProjectType !== '自研' && rProjectType !== '改型/降本/优化') continue;
              const existing = byTaskId[r.task_id];
              if (!existing || r.created_at > existing.created_at) {
                byTaskId[r.task_id] = r;
              }
            }
            byTaskId[rpt.task_id] = rpt;
            const siblings = Object.values(byTaskId)
              .filter((r: ReportDetail) => r.id !== rpt.id)
              .sort((a: ReportDetail, b: ReportDetail) => a.created_at.localeCompare(b.created_at));
            setSiblingReports(siblings);
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
  }, [id]);

  const fetchLiveIssues = async (reportId: string) => {
    const res = await fetch(`/api/issues?limit=500`);
    const data = await res.json();
    const raw = data.data;
    const allIssues: IssueItem[] = Array.isArray(raw) ? raw : (raw?.list || []);
    const reportIssues = allIssues.filter((i: IssueItem) => i.source_report_id === reportId);
    setLiveIssuesMap(prev => ({ ...prev, [reportId]: reportIssues }));
  };

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

  const handleOpenStatusDialog = (issue: IssueItem) => {
    setEditingIssue(issue);
    setTempStatus(issue.status);
    setTempLevel(issue.level || '二类');
    setStatusDialogOpen(true);
  };

  const handleSaveStatus = async () => {
    if (!editingIssue) return;
    setSaving(true);
    try {
      await fetch(`/api/issues/${editingIssue.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: tempStatus, level: tempLevel }),
      });
      setStatusDialogOpen(false);
      // Update local state
      setLiveIssuesMap(prev => {
        const updated = { ...prev };
        Object.keys(updated).forEach(reportId => {
          updated[reportId] = updated[reportId].map(i =>
            i.id === editingIssue.id ? { ...i, status: tempStatus, level: tempLevel } : i
          );
        });
        return updated;
      });
      toast.success('整改状态已更新');
    } finally {
      setSaving(false);
    }
  };

  const handleExportPDF = () => {
    window.open(`/reports/print?id=${id}&mode=fast`, '_blank');
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
    navigator.clipboard.writeText(link).then(() => toast.success('链接已复制')).catch(() => toast.error('复制失败'));
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

  const task = report.content?.task as Record<string, unknown> | undefined;
  const projectType = task?.project_type as string | undefined;
  const taskPhase = task?.project_phase as string | undefined;
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
      <div className="mx-auto flex max-w-6xl flex-col gap-3 rounded-xl border bg-background p-4 shadow-sm lg:flex-row lg:items-start">
        <Button variant="ghost" size="icon" className="h-10 w-10 shrink-0" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-semibold leading-tight break-words lg:text-2xl">{report.product_model || displayReport.title} {isMerged && <Badge variant="secondary" className="text-[10px] ml-1 align-middle">合并 {allReports.length} 份报告</Badge>}</h1>
          <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground flex-wrap">
            <Badge variant="secondary" className="text-[10px]">{report.status}</Badge>
            {projectType && <span>{projectType}</span>}
            {taskPhase && <span>{taskPhase}</span>}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 shrink-0 sm:flex lg:ml-auto">
          <Button size="sm" onClick={handleExportPDF}>
            <Download className="h-4 w-4 mr-1.5" /> 导出PDF
          </Button>
          <Button size="sm" variant="outline" onClick={openShareDialog}>
            <Share2 className="h-4 w-4 mr-1.5" /> 分享
          </Button>
        </div>
      </div>

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
          <p className="mt-1 text-sm font-medium">按阶段阅读报告，随时打开图/视频证据查看细节</p>
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
                onStatusClick={handleOpenStatusDialog}
                onPreview={open}
              />
            </CardContent>
          </Card>
        );
      })}

      {/* Issue Status Quick Edit Dialog */}
      <Dialog open={statusDialogOpen} onOpenChange={(v) => { if (!v) { setStatusDialogOpen(false); setEditingIssue(null); } else setStatusDialogOpen(v); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base">整改状态</DialogTitle>
          </DialogHeader>
          {editingIssue && (
            <div className="space-y-4">
              {/* Issue title */}
              <div className="text-sm font-medium break-all">{editingIssue.title}</div>
              {editingIssue.description && (
                <p className="text-xs text-muted-foreground break-all">{editingIssue.description}</p>
              )}

              {/* Level */}
              <div className="space-y-2">
                <Label>问题点等级</Label>
                <div className="flex gap-2">
                  {['一类', '二类', '三类'].map(l => (
                    <button key={l} type="button" onClick={() => setTempLevel(l)}
                      className={cn('flex-1 px-3 py-2 rounded-lg text-sm font-medium border transition-colors',
                        tempLevel === l
                          ? LEVEL_COLORS[l] + ' border-current'
                          : 'bg-background border-border hover:bg-muted/50')}>
                      {l}
                    </button>
                  ))}
                </div>
              </div>

              {/* Status */}
              <div className="space-y-2">
                <Label>整改状态</Label>
                <div className="flex gap-2">
                  {STATUS_LIST.map(s => (
                    <button key={s} type="button" onClick={() => setTempStatus(s)}
                      className={cn('flex-1 px-2 py-2 rounded-lg text-xs font-medium border transition-colors',
                        tempStatus === s
                          ? STATUS_COLORS[s] + ' border-current'
                          : 'bg-background border-border hover:bg-muted/50')}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex gap-2 justify-end pt-2 border-t">
                <Button variant="outline" onClick={() => { setStatusDialogOpen(false); setEditingIssue(null); }}>取消</Button>
                <Button onClick={handleSaveStatus} disabled={saving}>{saving ? '保存中...' : '保存'}</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Share Sheet */}
      <Sheet open={shareOpen} onOpenChange={setShareOpen}>
        <SheetContent side="bottom" className="rounded-t-2xl max-h-[80vh] p-0">
          <SheetHeader className="px-5 pt-5 pb-2">
            <SheetTitle className="text-base">分享报告</SheetTitle>
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
