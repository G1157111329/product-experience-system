'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Download, Play, Loader2, AlertCircle, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface Material {
  id: string; material_type: string; file_name: string; file_url: string; file_size: number;
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
  status: string; [key: string]: unknown;
}

interface ReportContent {
  task: Record<string, unknown>;
  ai_summary?: AiTaskSummary | null;
  records: CheckRecord[];
  issues: Array<Record<string, unknown>>;
  recipes: Recipe[];
  materials: Material[];
  generatedAt: string;
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
}

const taskFieldLabels: Record<string, string> = {
  task_name: '任务名称', product_category: '产品品类', product: '产品', product_model: '产品型号',
  project_type: '项目类型', project_phase: '项目阶段', test_date: '测试日期',
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

function SharedAiSummary({ summary }: { summary?: AiTaskSummary | null }) {
  if (!summary || (!summary.summary && !summary.tag && !summary.historical_position)) return null;
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2 min-w-0">
          <h3 className="font-semibold text-sm text-primary shrink-0">AI总结</h3>
          {summary.tag && <Badge className="text-[10px] shrink-0">{summary.tag}</Badge>}
          {summary.satisfaction_score !== undefined && <Badge variant="outline" className="text-[10px] ml-auto shrink-0">满意度 {summary.satisfaction_score}/10</Badge>}
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {summary.summary && <p className="text-sm leading-relaxed break-all whitespace-pre-wrap">{summary.summary}</p>}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {(summary.strengths || []).length > 0 && (
            <div className="rounded-lg bg-muted/30 p-2">
              <p className="text-[10px] font-medium text-emerald-700 mb-1">主要优势</p>
              {summary.strengths!.map((item, idx) => <p key={idx} className="text-xs text-muted-foreground break-all">{item}</p>)}
            </div>
          )}
          {(summary.risks || []).length > 0 && (
            <div className="rounded-lg bg-muted/30 p-2">
              <p className="text-[10px] font-medium text-amber-700 mb-1">主要风险</p>
              {summary.risks!.map((item, idx) => <p key={idx} className="text-xs text-muted-foreground break-all">{item}</p>)}
            </div>
          )}
        </div>
        {summary.historical_position && <p className="text-xs text-muted-foreground break-all">历史表现：{summary.historical_position}</p>}
        {(summary.suggestions || []).length > 0 && (
          <div>
            <p className="text-[10px] font-medium text-muted-foreground mb-1">后续建议</p>
            {summary.suggestions!.map((item, idx) => <p key={idx} className="text-xs text-muted-foreground break-all">{idx + 1}. {item}</p>)}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function ShareReportPage() {
  const params = useParams();
  const token = params.token as string;
  const [report, setReport] = useState<ReportData | null>(null);
  const [siblingReports, setSiblingReports] = useState<ReportData[]>([]);
  const [liveIssuesMap, setLiveIssuesMap] = useState<Record<string, IssueItem[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewIsVideo, setPreviewIsVideo] = useState(false);

  useEffect(() => {
    if (!token) return;
    fetch(`/api/reports/share?token=${token}`)
      .then(r => r.json())
      .then(data => {
        if (data.code === 0) {
          setReport(data.data.report);
          setSiblingReports(data.data.siblingReports || []);
          const issuesMap: Record<string, IssueItem[]> = {};
          issuesMap[data.data.report.id] = data.data.liveIssues || [];
          if (data.data.siblingIssuesMap) {
            Object.assign(issuesMap, data.data.siblingIssuesMap);
          }
          setLiveIssuesMap(issuesMap);
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
    window.open(`/reports/print?id=${report.id}`, '_blank');
  };

  const openPreview = (url: string) => {
    const isVideo = /\.(mp4|webm|mov|avi|mkv)(\?|$)/i.test(url) || url.includes('/video/');
    setPreviewIsVideo(isVideo);
    setPreviewUrl(url);
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

  if (error || !report?.content) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4 p-4">
        <AlertCircle className="h-12 w-12 text-muted-foreground" />
        <h2 className="text-lg font-semibold text-center">{error || '报告不存在'}</h2>
        <p className="text-sm text-muted-foreground text-center">请确认分享链接是否正确</p>
      </div>
    );
  }

  const task = report.content.task as Record<string, unknown> | undefined;
  const projectType = task?.project_type as string | undefined;
  const taskPhase = task?.project_phase as string | undefined;
  const isMerged = siblingReports.length > 0;
  const allReports = isMerged ? [report, ...siblingReports] : [report];

  const totalRecords = allReports.flatMap(r => r.content?.records || []);
  const allLiveIssues = allReports.flatMap(r => liveIssuesMap[r.id] || []);
  const totalRecipes = allReports.flatMap(r => r.content?.recipes || []);
  const totalPass = totalRecords.filter(r => r.evaluation_result === '合格').length;
  const totalFail = totalRecords.filter(r => r.evaluation_result === '不合格').length;
  const totalRecipePC = totalRecipes.reduce((s, r) => s + (r.problem_count || 0), 0);

  return (
    <div className="min-h-screen bg-background overflow-x-hidden">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/80 backdrop-blur-sm border-b px-3 sm:px-4 py-3">
        <div className="max-w-4xl mx-auto flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="text-base sm:text-lg font-semibold truncate">{report.product_model || report.title}</h1>
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

              <SharedAiSummary summary={content.ai_summary} />

              {/* Issues */}
              {liveIssues.length > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <h3 className="font-semibold text-sm text-primary">问题清单 ({liveIssues.length})</h3>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-1">
                      {liveIssues.map((issue, idx) => (
                        <div key={idx} className="flex items-center gap-1.5 sm:gap-2 py-1.5 px-2 rounded bg-muted/30 text-sm min-w-0">
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
                      ))}
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
                        {recordMats.length > 0 && (
                          <div className="flex gap-1.5 flex-wrap">
                            {recordMats.map(mat => (
                              <div key={mat.id}
                                className="w-12 h-12 sm:w-14 sm:h-14 rounded-md overflow-hidden border border-border cursor-pointer relative shrink-0"
                                onClick={() => openPreview(mat.file_url)}>
                                {mat.material_type === 'image' ? (
                                  <img src={mat.file_url} alt={mat.file_name} className="w-full h-full object-cover" />
                                ) : (
                                  <>
                                    <video src={mat.file_url} className="w-full h-full object-cover" muted preload="metadata" />
                                    <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                                      <Play className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-white fill-white" />
                                    </div>
                                  </>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
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
                          <span className="text-xs text-muted-foreground ml-auto shrink-0">{recipe.recipe_steps?.length || 0} 步骤{recipe.effect_score ? <span className="text-primary font-medium ml-1">{recipe.effect_score}分</span> : ''}</span>
                        </div>
                        {recipe.recipe_steps?.map(step => {
                          const stepMats = step.materials || [];
                          return (
                            <div key={step.id} className="ml-1 sm:ml-2 py-1.5 border-t last:border-0">
                              <div className="flex items-start gap-2 min-w-0">
                                <span className="shrink-0 w-5 h-5 rounded-full bg-primary/10 text-primary text-[10px] font-semibold flex items-center justify-center">{step.step_number}</span>
                                <span className="text-sm break-all min-w-0">{step.operation}</span>
                              </div>
                              {(() => {
                                const pps = step.problem_points?.length ? step.problem_points.filter(p => p.text?.trim()) : step.problem_point ? [{ text: step.problem_point }] : [];
                                if (!pps.length) return null;
                                return (
                                  <div className="ml-7 mt-1">
                                    {pps.map((pp, i) => (
                                      <div key={i} className="text-xs text-amber-600 break-all">
                                        {pps.length > 1 && <span className="font-semibold">问题{i + 1}: </span>}{pp.text}
                                      </div>
                                    ))}
                                  </div>
                                );
                              })()}
                              {stepMats.length > 0 && (
                                <div className="flex gap-1.5 mt-1.5 ml-7 flex-wrap">
                                  {stepMats.map(mat => (
                                    <div key={mat.id}
                                      className="w-12 h-12 sm:w-14 sm:h-14 rounded-md overflow-hidden border border-border cursor-pointer relative shrink-0"
                                      onClick={() => openPreview(mat.file_url)}>
                                      {mat.material_type === 'image' ? (
                                        <img src={mat.file_url} alt={mat.file_name} className="w-full h-full object-cover" />
                                      ) : (
                                        <>
                                          <video src={mat.file_url} className="w-full h-full object-cover" muted preload="metadata" />
                                          <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                                            <Play className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-white fill-white" />
                                          </div>
                                        </>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              )}
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
                            {recipe.effect_ai_result && (
                              <p className="text-xs text-muted-foreground whitespace-pre-wrap break-all ml-4">{recipe.effect_ai_result.summary}</p>
                            )}
                            {!recipe.effect_ai_result && recipe.effect_description && (
                              <p className="text-xs text-muted-foreground whitespace-pre-wrap break-all ml-4">{recipe.effect_description}</p>
                            )}
                            {recipe.effect_problem_point && (
                              <p className="text-xs text-amber-600 break-all ml-4">问题: {recipe.effect_problem_point}</p>
                            )}
                            {recipe.effect_materials && recipe.effect_materials.length > 0 && (
                              <div className="flex gap-1.5 flex-wrap ml-4">
                                {recipe.effect_materials.map(mat => (
                                  <div key={mat.id}
                                    className="w-12 h-12 sm:w-14 sm:h-14 rounded-md overflow-hidden border border-border cursor-pointer relative shrink-0"
                                    onClick={() => openPreview(mat.file_url)}>
                                    {mat.material_type === 'image' ? (
                                      <img src={mat.file_url} alt={mat.file_name} className="w-full h-full object-cover" />
                                    ) : (
                                      <>
                                        <video src={mat.file_url} className="w-full h-full object-cover" muted preload="metadata" />
                                        <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                                          <Play className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-white fill-white" />
                                        </div>
                                      </>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}

            </div>
          );
        })}
      </div>

      {/* Media preview overlay */}
      {previewUrl && (
        <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center" onClick={() => setPreviewUrl(null)}>
          <button className="absolute top-3 right-3 z-10 w-8 h-8 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white" onClick={() => setPreviewUrl(null)}>
            <X className="h-5 w-5" />
          </button>
          <div className="w-full h-full flex items-center justify-center p-2" onClick={e => e.stopPropagation()}>
            {previewIsVideo ? (
              <video src={previewUrl} controls autoPlay className="max-w-full max-h-full object-contain rounded" />
            ) : (
              <img src={previewUrl} alt="预览" className="max-w-full max-h-full object-contain rounded" />
            )}
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="border-t mt-4 sm:mt-8 py-4 text-center text-xs text-muted-foreground px-4">
        产品体验管理平台 - 分享报告（仅查看）
      </div>
    </div>
  );
}
