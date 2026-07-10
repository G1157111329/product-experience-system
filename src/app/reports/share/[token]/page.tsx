'use client';

import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { Download, Loader2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useImagePreview } from '@/components/image-preview';
import { MediaGallery } from '@/components/app/media-gallery';
import type { ComparisonSnapshot } from '@/components/reports/comparison-report-view';
import { ReportSectionBlockStack } from '@/components/reports/report-section-block-renderer';
import { buildDisplayReportContent, type AiSummaryLike, type ReportContentWithReview, type ReportReviewOverrides } from '@/lib/report-review-overrides';
import { selectEffectEvaluationText } from '@/lib/report-content-rules';
import type { ReportDetailModel } from '@/lib/server/report-detail';
import { ReportSummaryTab } from '@/app/(main)/reports/[id]/components/report-summary-tab';
import { ReportMatrixTab, type MatrixData } from '@/app/(main)/reports/[id]/components/report-matrix-tab';

interface Material {
  id: string; material_type: string; file_name: string; file_url: string; file_path?: string; file_size: number;
}

interface ProblemPoint { text: string; material_ids?: string[]; }

interface RecipeStep {
  id: string; step_number: number; operation: string; problem_point: string | null;
  problem_points?: ProblemPoint[]; materials?: Material[];
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
  experience_standard?: string; check_tool?: string; problem_level?: string;
  materials?: Material[]; [key: string]: unknown;
}

interface IssueItem {
  id: string; title: string; description: string | null; level: string | null;
  status: string; source_type?: string; [key: string]: unknown;
}

interface ReEvaluation {
  id: string; issue_id: string; description: string | null;
  ai_result: { score: number; summary: string } | null;
  created_at: string; materials?: Material[];
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

interface ReportData {
  id: string; task_id: string; title: string; product_model: string | null;
  status: string; version: number; content: ReportContent | null; created_at: string;
  report_type?: string | null;
  snapshot?: {
    id: string;
    version: number;
    snapshot_json: ComparisonSnapshot;
    created_at: string;
  } | null;
}

const taskFieldLabels: Record<string, string> = {
  task_name: '任务名称', product_category: '产品品类', product: '产品', product_model: '产品型号',
  project_number: '项目单号', project_type: '项目类型', project_phase: '项目阶段', test_date: '测试日期',
  organizer: '组织人', target_user: '目标用户', test_purpose: '测试目的',
  test_method: '测试方法', status: '状态', assigned_to: '负责人',
  created_at: '创建时间', updated_at: '更新时间',
};

const hiddenFields = ['id', 'selected_standards', 'created_by'];

function formatBeijingTime(dateStr: string | null | undefined): string {
  if (!dateStr) return '-';
  try {
    const d = new Date(dateStr);
    const bj = new Date(d.getTime() + 8 * 3600 * 1000);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${bj.getUTCFullYear()}-${pad(bj.getUTCMonth() + 1)}-${pad(bj.getUTCDate())} ${pad(bj.getUTCHours())}:${pad(bj.getUTCMinutes())}:${pad(bj.getUTCSeconds())}`;
  } catch { return String(dateStr); }
}

const STATUS_BG: Record<string, string> = { '待整改': '#fef3c7', '整改中': '#dbeafe', '已验证': '#d1fae5', '不整改': '#e5e7eb' };
const STATUS_FG: Record<string, string> = { '待整改': '#92400e', '整改中': '#1e40af', '已验证': '#065f46', '不整改': '#374151' };

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

function SharedAiSummary({ summary }: { summary?: AiSummaryLike | null }) {
  if (!summary || (!summary.summary && !summary.tag && !summary.historical_position)) return null;
  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-semibold leading-6 text-foreground">总结</h3>
            <p className="text-xs text-muted-foreground">核心判断、优势、风险和后续动作</p>
          </div>
          {summary.tag && <Badge className="shrink-0 text-xs">{summary.tag}</Badge>}
          {summary.satisfaction_score !== undefined && <Badge variant="outline" className="shrink-0 text-xs">满意度 {summary.satisfaction_score}/10</Badge>}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {summary.summary && (
          <div className="rounded-md bg-muted/30 px-4 py-3">
            <p className="whitespace-pre-wrap break-words text-sm leading-7 text-foreground sm:text-[15px]">{summary.summary}</p>
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
      </CardContent>
    </Card>
  );
}

export default function ShareReportPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const token = params.token as string;
  const [report, setReport] = useState<ReportData | null>(null);
  const [siblingReports, setSiblingReports] = useState<ReportData[]>([]);
  const [detailModelsMap, setDetailModelsMap] = useState<Record<string, ReportDetailModel>>({});
  const [liveIssuesMap, setLiveIssuesMap] = useState<Record<string, IssueItem[]>>({});
  const [reEvaluationsMap, setReEvaluationsMap] = useState<Record<string, ReEvaluation[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);
  const { open: openPreview, PreviewComponent } = useImagePreview();
  const shareParityMode = searchParams.get('parity') === '1' || searchParams.get('debug') === 'legacy';

  useEffect(() => {
    if (!token) return;
    fetch(`/api/reports/share?token=${token}`)
      .then(r => r.json())
      .then(data => {
        if (data.code === 0) {
          setReport(data.data.report);
          setSiblingReports(data.data.siblingReports || []);
          setDetailModelsMap({
            ...(data.data.detailModel ? { [data.data.report.id]: data.data.detailModel as ReportDetailModel } : {}),
            ...(data.data.siblingDetailModels || {}),
          });
          const issuesMap: Record<string, IssueItem[]> = {};
          issuesMap[data.data.report.id] = data.data.liveIssues || [];
          if (data.data.siblingIssuesMap) {
            Object.assign(issuesMap, data.data.siblingIssuesMap);
          }
          setLiveIssuesMap(issuesMap);
          // Populate re-evaluations map
          const reEvalMap: Record<string, ReEvaluation[]> = {};
          if (data.data.reEvaluationsMap) {
            Object.assign(reEvalMap, data.data.reEvaluationsMap);
          }
          if (data.data.siblingReEvaluationsMap) {
            Object.assign(reEvalMap, data.data.siblingReEvaluationsMap);
          }
          setReEvaluationsMap(reEvalMap);
        } else if (data.code === 1 && data.message?.includes('过期')) {
          setExpired(true);
        } else {
          setError(data.message || '获取报告失败');
        }
      })
      .catch(() => setError('网络错误'))
      .finally(() => setLoading(false));
  }, [token]);

  const handleExportPDF = () => {
    if (!report) return;
  if (report.report_type === 'comparison_report') {
      window.open(`/api/reports/${report.id}/pdf?share_token=${token}`, '_blank');
      return;
    }
    window.open(`/reports/print?id=${report.id}&mode=fast&share_token=${token}`, '_blank');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="ml-3 text-muted-foreground">加载报告...</span>
      </div>
    );
  }

  if (expired) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4 p-4">
        <AlertCircle className="h-12 w-12 text-muted-foreground" />
        <h2 className="text-lg font-semibold">链接已过期</h2>
        <p className="text-sm text-muted-foreground text-center">该分享链接已过期，请联系分享者获取新链接</p>
      </div>
    );
  }

  if (error || !report || (!report.content && report.report_type !== 'comparison_report')) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4 p-4">
        <AlertCircle className="h-12 w-12 text-muted-foreground" />
        <h2 className="text-lg font-semibold text-center">{error || '报告不存在'}</h2>
        <p className="text-sm text-muted-foreground text-center">请确认分享链接是否正确</p>
      </div>
    );
  }

  const isComparisonReport = report.report_type === 'comparison_report';
  const comparisonSnapshot = report.snapshot?.snapshot_json;
  const comparisonDetailModel = detailModelsMap[report.id];

  if (isComparisonReport) {
    return (
      <div className="min-h-screen overflow-x-hidden bg-background">
        <div className="sticky top-0 z-10 border-b bg-background/80 px-3 py-3 backdrop-blur-sm sm:px-4">
          <div className="mx-auto flex max-w-6xl items-center gap-3">
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-base font-semibold sm:text-lg">{report.title}</h1>
              <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                <Badge variant="secondary" className="shrink-0 text-[10px]">{report.status}</Badge>
                <Badge variant="outline" className="shrink-0 text-[10px]">comparison_report</Badge>
              </div>
            </div>
            <Button size="sm" onClick={handleExportPDF} className="h-8 shrink-0 text-xs">
              <Download className="mr-1 h-3.5 w-3.5" /> <span className="hidden sm:inline">导出PDF</span><span className="sm:hidden">PDF</span>
            </Button>
          </div>
        </div>
        <div className="mx-auto max-w-6xl px-3 py-4 sm:px-4 sm:py-6">
          <ReportSummaryTab
            data={{
              aiSummary: (report.content?.ai_summary || null) as Record<string, unknown> | null,
              taskInfo: (report.content?.task || null) as Record<string, unknown> | null,
              stats: {
                totalCheckItems: report.content?.records?.length || 0,
                passCount: 0,
                failCount: 0,
                issueCount: liveIssuesMap[report.id]?.length || 0,
                recipeCount: report.content?.recipes?.length || 0,
              },
              conclusion: { level: '', text: '' },
              generatedAt: report.created_at,
            }}
          />
          {comparisonSnapshot ? (
            <ReportMatrixTab data={{ matrixType: 'multi_matrix', matrix: comparisonSnapshot }} />
          ) : (
            <Card>
              <CardContent className="p-6 text-sm text-muted-foreground">
                该对比报告还没有可渲染的快照。
              </CardContent>
            </Card>
          )}
          {comparisonDetailModel && (
            <Card data-testid="share-section-block-card" className="mt-4">
              <CardContent className="p-3 sm:p-4">
                <ReportSectionBlockStack sections={comparisonDetailModel.sections} compact />
              </CardContent>
            </Card>
          )}
        </div>
        <PreviewComponent />
      </div>
    );
  }

  const legacyReport = report as ReportData & { content: ReportContent };
  const legacySiblingReports = siblingReports.filter((item): item is ReportData & { content: ReportContent } => Boolean(item.content));
  const task = legacyReport.content.task as Record<string, unknown> | undefined;
  const projectType = task?.project_type as string | undefined;
  const taskPhase = task?.project_phase as string | undefined;
  const isMerged = legacySiblingReports.length > 0;
  const allReports = isMerged ? [legacyReport, ...legacySiblingReports] : [legacyReport];

  const totalRecords = allReports.flatMap(r => r.content?.records || []);
  const allLiveIssues = allReports.flatMap(r => liveIssuesMap[r.id] || []);
  const totalRecipes = allReports.flatMap(r => r.content?.recipes || []);
  const totalPass = totalRecords.filter(r => r.evaluation_result === '合格').length;
  const totalFail = totalRecords.filter(r => r.evaluation_result === '不合格').length;
  const totalRecipePC = totalRecipes.reduce((s, r) => s + (r.problem_count || 0), 0);
  const displayReport = buildDisplayReportContent({
    title: legacyReport.title,
    content: legacyReport.content as unknown as ReportContentWithReview,
  });
  const snapshotJson = legacyReport.snapshot?.snapshot_json as unknown as Record<string, unknown> | undefined;
  const reportContentRecord = legacyReport.content as unknown as Record<string, unknown>;
  const frozenProjection = (snapshotJson?.matrix_projection || reportContentRecord.data_matrix_projection) as Record<string, unknown> | undefined;
  const sharedMatrixData: MatrixData = frozenProjection?.projectionVersion === 'v3'
    ? { matrixType: 'data_matrix_v3', dataMatrixV3: frozenProjection as unknown as MatrixData['dataMatrixV3'] }
    : frozenProjection && Array.isArray(frozenProjection.groups)
      ? { matrixType: 'data_matrix', dataMatrix: frozenProjection as MatrixData['dataMatrix'] }
      : snapshotJson && (snapshotJson.objects || snapshotJson.comparison_objects)
        ? { matrixType: 'multi_matrix', matrix: snapshotJson as unknown as ComparisonSnapshot }
        : { matrixType: 'single_waterfall', waterfall: totalRecipes as unknown as Record<string, unknown>[] };

  return (
    <div className="min-h-screen bg-background overflow-x-hidden">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/80 backdrop-blur-sm border-b px-3 sm:px-4 py-3">
        <div className="max-w-4xl mx-auto flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="text-base sm:text-lg font-semibold truncate">{report.product_model || displayReport.title}</h1>
            <div className="flex items-center gap-1.5 mt-0.5 text-xs text-muted-foreground flex-wrap">
              <Badge variant="secondary" className="text-[10px] shrink-0">{report.status}</Badge>
              {projectType && <span className="shrink-0">{projectType}</span>}
              {taskPhase && <span className="shrink-0">{taskPhase}</span>}
              {isMerged && <Badge variant="outline" className="text-[10px] shrink-0">合并 {allReports.length} 份报告</Badge>}
            </div>
          </div>
          <Button size="sm" onClick={handleExportPDF} className="shrink-0 text-xs h-8">
            <Download className="h-3.5 w-3.5 mr-1" /> <span className="hidden sm:inline">导出PDF</span><span className="sm:hidden">PDF</span>
          </Button>
        </div>
      </div>

      <div data-testid="share-frozen-report-view" className="mx-auto max-w-6xl px-3 py-4 sm:px-4 sm:py-6">
        <ReportSummaryTab
          data={{
            aiSummary: displayReport.content.ai_summary as Record<string, unknown> | null,
            taskInfo: task || null,
            stats: {
              totalCheckItems: totalRecords.length,
              passCount: totalPass,
              failCount: totalFail,
              issueCount: allLiveIssues.length,
              recipeCount: totalRecipes.length,
            },
            conclusion: { level: '', text: String(displayReport.content.ai_summary?.summary || '') },
            generatedAt: legacyReport.created_at,
          }}
        />
        <ReportMatrixTab data={sharedMatrixData} />
      </div>

      {/* Frozen share contract: legacy report DOM must never mount or load media. */}
      {false && (
      <div className="max-w-4xl mx-auto px-3 sm:px-4 py-4 sm:py-6 space-y-4 sm:space-y-6">
        {/* Summary Stats */}
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
          {[
            { label: '检查项', value: totalRecords.length, color: '' },
            { label: '合格', value: totalPass, color: 'text-emerald-600' },
            { label: '不合格', value: totalFail, color: 'text-destructive' },
            { label: '问题整改', value: allLiveIssues.length, color: 'text-amber-600' },
            { label: '食谱问题', value: totalRecipePC, color: 'text-orange-600' },
          ].map((stat) => (
            <Card key={stat.label} className="py-0">
              <CardContent className="p-2.5 sm:p-4 text-center">
                <p className={cn('text-lg sm:text-2xl font-bold', stat.color)}>{stat.value}</p>
                <p className="text-[10px] sm:text-xs text-muted-foreground mt-0.5">{stat.label}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Report sections */}
        {allReports.map((rpt, idx) => {
          const content = rpt.content;
          if (!content) return null;
          const records = content.records || [];
          const recipes = content.recipes || [];
          const passCount = records.filter(r => r.evaluation_result === '合格').length;
          const failCount = records.filter(r => r.evaluation_result === '不合格').length;
          const liveIssues = liveIssuesMap[rpt.id] || [];
          const rptTask = content.task as Record<string, unknown> | undefined;
          const rptPhase = rptTask?.project_phase as string | undefined;
          const rptDate = rptTask?.test_date as string | undefined;
          const detailModel = detailModelsMap[rpt.id];
          const showLegacyContent = !detailModel || shareParityMode;
          const displayContent = buildDisplayReportContent({
            title: rpt.title,
            content: content as unknown as ReportContentWithReview,
          });

          return (
            <div key={rpt.id} className="space-y-4">
              {/* Section divider for merged reports */}
              {idx > 0 && (
                <div className="border-t-2 border-dashed border-primary/30 pt-4">
                  <div className="flex items-center gap-2 flex-wrap min-w-0">
                    {rptPhase && <Badge className="text-[10px] shrink-0">{rptPhase}</Badge>}
                    <span className="font-semibold text-sm break-all">{rpt.title}</span>
                    {rptDate && <span className="text-xs text-muted-foreground shrink-0">({rptDate})</span>}
                  </div>
                </div>
              )}

              {/* Section header */}
              {idx === 0 && !isMerged && (
                <h2 className="text-lg font-semibold">{rpt.title}</h2>
              )}

              {detailModel && (
                <Card data-testid="share-section-block-card">
                  <CardContent className="p-3 sm:p-4">
                    <ReportSectionBlockStack sections={detailModel.sections} compact />
                  </CardContent>
                </Card>
              )}

              {showLegacyContent && (
                <div data-testid="share-legacy-content" data-display-weight={detailModel ? 'parity' : 'fallback'} className="space-y-4">
              {/* Task Info */}
              {rptTask && (
                <Card>
                  <CardHeader className="pb-2">
                    <h3 className="font-semibold text-sm text-primary">任务信息</h3>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {Object.entries(rptTask)
                        .filter(([k]) => !hiddenFields.includes(k))
                        .map(([key, value]) => {
                          const label = taskFieldLabels[key] || key;
                          const isTimeField = key === 'created_at' || key === 'updated_at';
                          const displayValue = isTimeField ? formatBeijingTime(value as string) : String(value || '-');
                          return (
                            <div key={key} className="text-xs p-2 bg-muted/30 rounded min-w-0">
                              <div className="text-muted-foreground text-[10px] truncate">{label}</div>
                              <div className="font-medium break-all line-clamp-3">{displayValue}</div>
                            </div>
                          );
                        })}
                    </div>
                  </CardContent>
                </Card>
              )}

              <SharedAiSummary summary={displayContent.ai_summary} />
              {displayContent.review_note && (
                <Card className="border-amber-200 bg-amber-50/70 dark:bg-amber-950/20">
                  <CardContent className="p-3">
                    <p className="mb-1 text-xs font-medium text-amber-900 dark:text-amber-200">评审备注</p>
                    <p className="whitespace-pre-wrap break-all text-xs text-amber-900 dark:text-amber-200">{displayContent.review_note}</p>
                  </CardContent>
                </Card>
              )}

              {/* Issues */}
              {liveIssues.length > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <h3 className="font-semibold text-sm text-primary">问题清单 ({liveIssues.length})</h3>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {liveIssues.map((issue, idx) => {
                        const reEvals = reEvaluationsMap[issue.id] || [];
                        return (
                          <div key={idx} className="p-2 rounded bg-muted/30 space-y-1.5 min-w-0">
                            <div className="flex items-center gap-1.5 sm:gap-2 text-sm min-w-0">
                              <span className={cn('text-[10px] font-medium px-1.5 py-0.5 rounded shrink-0',
                                issue.level === '一类' ? 'bg-red-100 text-red-700' :
                                issue.level === '二类' ? 'bg-amber-100 text-amber-700' :
                                'bg-blue-100 text-blue-700'
                              )}>{issue.level || '二类'}</span>
                              <span className="flex-1 min-w-0 break-all text-xs sm:text-sm">{issue.title}</span>
                              <span className={cn('text-[10px] font-medium px-1.5 py-0.5 rounded shrink-0')}
                                style={{
                                  background: STATUS_BG[issue.status] || '#fef3c7',
                                  color: STATUS_FG[issue.status] || '#92400e',
                                }}>{issue.status}</span>
                            </div>
                            {issue.source_type && (
                              <div className="text-[10px] text-muted-foreground">
                                来源: {issue.source_type === 'record_fail' ? '五感体验' : '功能效果'}
                              </div>
                            )}
                            {/* Re-evaluation results for recipe_problem type */}
                            {reEvals.length > 0 && (
                              <div className="mt-1.5 space-y-2 border-t border-border/50 pt-1.5">
                                {reEvals.map((reEval, reIdx) => {
                                  const label = reIdx === 0 ? '最新复测' : `第${reEvals.length - reIdx}次复测`;
                                  return (
                                    <div key={reEval.id} className="bg-background/50 rounded p-2 space-y-1">
                                      <div className="flex items-center gap-1.5">
                                        <Badge variant="outline" className="text-[9px] shrink-0">{label}</Badge>
                                        {reEval.ai_result?.score != null && (
                                          <span className="text-[10px] font-medium text-primary">{reEval.ai_result.score}分</span>
                                        )}
                                        <span className="text-[9px] text-muted-foreground">{new Date(reEval.created_at).toLocaleDateString('zh-CN')}</span>
                                      </div>
                                      {reEval.description && (
                                        <div className="text-[11px] text-muted-foreground whitespace-pre-wrap break-all">{reEval.description}</div>
                                      )}
                                      {reEval.ai_result?.summary && (
                                        <div className="text-[11px] text-primary/80 whitespace-pre-wrap break-all">AI评语: {reEval.ai_result.summary}</div>
                                      )}
                                      {reEval.materials && reEval.materials.length > 0 && (
                                        <MediaGallery materials={reEval.materials} responsive columns={{ mobile: 2, sm: 3, lg: 4 }} onPreview={openPreview} />
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
                  </CardContent>
                </Card>
              )}

              {/* Check Records */}
              <Card>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-semibold text-sm text-primary shrink-0">检查记录 ({records.length})</h3>
                    <div className="flex gap-3 text-xs text-muted-foreground shrink-0">
                      <span>合格 {passCount}</span><span>不合格 {failCount}</span>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  {records.length > 0 ? records.map(record => {
                    const recordMats = record.materials || [];
                    return (
                      <div key={record.id} className="p-2.5 sm:p-3 rounded-lg bg-muted/30 space-y-1.5">
                        <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                          <span className={cn('text-[10px] font-medium px-1.5 py-0.5 rounded shrink-0',
                            record.evaluation_result === '合格' ? 'bg-emerald-100 text-emerald-700' :
                            record.evaluation_result === '不合格' ? 'bg-red-100 text-red-700' :
                            'bg-amber-100 text-amber-700'
                          )}>{record.evaluation_result}</span>
                          <span className="text-sm font-medium min-w-0 break-all">{record.check_item}</span>
                        </div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {record.sensory_dimension && <Badge variant="outline" className="text-[9px] max-w-[80px] truncate">{record.sensory_dimension}</Badge>}
                          {record.check_dimension && <span className="text-[10px] text-muted-foreground max-w-[100px] truncate">{record.check_dimension}</span>}
                          {record.standard_category && <span className="text-[10px] text-muted-foreground">{record.standard_category}</span>}
                        </div>
                        {(record.check_requirement || record.check_standard) && (
                          <div className="text-[10px] text-muted-foreground space-y-0.5 break-all">
                            {record.check_requirement && <div>要求: {record.check_requirement}</div>}
                            {record.check_standard && <div>标准: {record.check_standard}</div>}
                          </div>
                        )}
                        {record.problem_description && <div className="text-xs text-muted-foreground break-all">{record.problem_description}</div>}
                        <MediaGallery materials={recordMats} responsive columns={{ mobile: 2, sm: 3, lg: 4 }} onPreview={openPreview} />
                      </div>
                    );
                  }) : <p className="text-sm text-muted-foreground text-center py-4">暂无记录</p>}
                </CardContent>
              </Card>

              {/* Recipes */}
              {recipes.length > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <h3 className="font-semibold text-sm text-primary">食谱/功能列表 ({recipes.length})</h3>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {recipes.map(recipe => (
                      <div key={recipe.id} className="border rounded-lg p-2.5 sm:p-3">
                        <div className="flex items-center gap-2 mb-2 min-w-0">
                          <Badge variant="outline" className="text-[10px] shrink-0">{recipe.recipe_type}</Badge>
                          <span className="font-medium text-sm min-w-0 break-all">{recipe.name}</span>
                          <span className="text-xs text-muted-foreground ml-auto shrink-0">{recipe.recipe_steps?.length || 0} 步骤</span>
                        </div>
                        {recipe.recipe_steps?.map(step => {
                          const stepMats = step.materials || [];
                          const problemPoints = getStepProblemPoints(step);
                          const stepLevelMats = getUnboundStepMaterials(stepMats, problemPoints);
                          return (
                            <div key={step.id} className="ml-1 sm:ml-2 py-1.5 border-t last:border-0">
                              <div className="flex items-start gap-2 min-w-0">
                                <span className="shrink-0 w-5 h-5 rounded-full bg-primary/10 text-primary text-[10px] font-semibold flex items-center justify-center">{step.step_number}</span>
                                <span className="text-sm break-all min-w-0">{step.operation}</span>
                              </div>
                              {(() => {
                                const pps = problemPoints;
                                if (!pps.length) return null;
                                return (
                                  <div className="ml-7 mt-1 space-y-2">
                                    {pps.map((pp, i) => {
                                      const pointMaterials = getBoundMaterials(stepMats, pp.material_ids);
                                      return (
                                      <div key={`${pp.text}-${i}`} className="space-y-1.5">
                                      <div className="text-xs text-amber-600 break-all">
                                        {pps.length > 1 && <span className="font-semibold">问题{i + 1}: </span>}{pp.text}
                                      </div>
                                      <MediaGallery materials={pointMaterials} responsive columns={{ mobile: 2, sm: 3, lg: 4 }} onPreview={openPreview} />
                                      </div>
                                      );
                                    })}
                                  </div>
                                );
                              })()}
                              <MediaGallery materials={stepLevelMats} responsive columns={{ mobile: 2, sm: 3, lg: 4 }} className="ml-7 mt-1.5" onPreview={openPreview} />
                            </div>
                          );
                        })}
                        {/* Effect Evaluation */}
                        {(recipe.effect_description || recipe.effect_problem_point || recipe.effect_score || recipe.effect_ai_result || (recipe.effect_materials && recipe.effect_materials.length > 0)) && (
                          <div className="mt-2 p-2.5 rounded-lg border border-primary/20 bg-primary/5 space-y-1.5">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-medium text-primary">效果/出品效果评价</span>
                              {recipe.effect_score && (
                                <Badge className={`text-[9px] ml-auto ${Number(recipe.effect_score) >= 8 ? 'bg-emerald-600' : Number(recipe.effect_score) >= 6 ? 'bg-blue-600' : Number(recipe.effect_score) >= 4 ? 'bg-amber-600' : 'bg-red-600'} text-white`}>
                                  {recipe.effect_score}分/10分
                                </Badge>
                              )}
                            </div>
                            {selectEffectEvaluationText(recipe) && (
                              <p className="text-xs text-muted-foreground whitespace-pre-wrap break-all ml-4">
                                {selectEffectEvaluationText(recipe)}
                              </p>
                            )}
                            {(() => {
                              const effectPoints = parseProblemPoints(recipe.effect_problem_point);
                              const effectMaterials = recipe.effect_materials || [];
                              const hasBoundMaterials = effectPoints.some((point) => point.material_ids?.length);
                              return (
                                <>
                                  {effectPoints.length > 0 && (
                                    <div className="ml-4 space-y-2">
                                      {effectPoints.map((point, pointIndex) => {
                                        const pointMaterials = getBoundMaterials(effectMaterials, point.material_ids);
                                        return (
                                          <div key={`${point.text}-${pointIndex}`} className="space-y-1.5">
                                            <p className="text-xs text-amber-600 break-all">
                                              {effectPoints.length > 1 ? `问题${pointIndex + 1}: ` : '问题: '}{point.text}
                                            </p>
                                            <MediaGallery materials={pointMaterials} responsive columns={{ mobile: 2, sm: 2, lg: 3 }} gap="gap-3" onPreview={openPreview} />
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
                                    className="ml-4"
                                    onPreview={openPreview}
                                  />
                                </>
                              );
                            })()}
                          </div>
                        )}
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}

                </div>
              )}

            </div>
          );
        })}
      </div>
      )}

      {/* Media preview overlay */}
      <PreviewComponent />

      {/* Footer */}
      <div className="border-t mt-4 sm:mt-8 py-4 text-center text-xs text-muted-foreground px-4">
        产品体验管理平台 - 分享报告（仅查看）
      </div>
    </div>
  );
}
