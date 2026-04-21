'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Download, Play, Film, Image as ImageIcon, Loader2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
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
}

interface CheckRecord {
  id: string; sensory_dimension?: string; check_dimension?: string; sub_check_dimension?: string;
  check_item: string; check_requirement?: string; check_standard?: string;
  evaluation_result: string; problem_description?: string;
  standard_category?: string; test_phase?: string; experience_flow?: string; touch_point?: string;
  materials?: Material[]; [key: string]: unknown;
}

interface IssueItem {
  id: string; title: string; description: string | null; level: string | null;
  status: string; [key: string]: unknown;
}

interface ReportContent {
  task: Record<string, unknown>;
  records: CheckRecord[];
  issues: Array<Record<string, unknown>>;
  recipes: Recipe[];
  materials: Material[];
  generatedAt: string;
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
};

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
      <div className="flex flex-col items-center justify-center min-h-screen gap-4">
        <AlertCircle className="h-12 w-12 text-muted-foreground" />
        <h2 className="text-lg font-semibold">链接已过期</h2>
        <p className="text-sm text-muted-foreground">该分享链接已过期，请联系分享者获取新链接</p>
      </div>
    );
  }

  if (error || !report?.content) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4">
        <AlertCircle className="h-12 w-12 text-muted-foreground" />
        <h2 className="text-lg font-semibold">{error || '报告不存在'}</h2>
        <p className="text-sm text-muted-foreground">请确认分享链接是否正确</p>
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

  const STATUS_BG: Record<string, string> = { '待整改': '#fef3c7', '整改中': '#dbeafe', '已验证': '#d1fae5', '不整改': '#e5e7eb' };
  const STATUS_FG: Record<string, string> = { '待整改': '#92400e', '整改中': '#1e40af', '已验证': '#065f46', '不整改': '#374151' };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/80 backdrop-blur-sm border-b px-4 py-3">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-semibold truncate">{report.product_model || report.title}</h1>
            <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground flex-wrap">
              <Badge variant="secondary" className="text-[10px]">{report.status}</Badge>
              {projectType && <span>{projectType}</span>}
              {taskPhase && <span>{taskPhase}</span>}
              {isMerged && <Badge variant="outline" className="text-[10px]">合并 {allReports.length} 份报告</Badge>}
            </div>
          </div>
          <Button size="sm" onClick={handleExportPDF}>
            <Download className="h-4 w-4 mr-1.5" /> 导出PDF
          </Button>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        {/* Summary Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          {[
            { label: '检查项总数', value: totalRecords.length, color: '' },
            { label: '合格', value: totalPass, color: 'text-emerald-600' },
            { label: '不合格', value: totalFail, color: 'text-destructive' },
            { label: '问题整改', value: allLiveIssues.length, color: 'text-amber-600' },
            { label: '食谱/功能问题', value: totalRecipePC, color: 'text-orange-600' },
          ].map((stat) => (
            <Card key={stat.label}>
              <CardContent className="p-4 text-center">
                <p className={cn('text-2xl font-bold', stat.color)}>{stat.value}</p>
                <p className="text-xs text-muted-foreground mt-1">{stat.label}</p>
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
                  <div className="flex items-center gap-2">
                    {rptPhase && <Badge className="text-[10px]">{rptPhase}</Badge>}
                    <span className="font-semibold text-sm">{rpt.title}</span>
                    {rptDate && <span className="text-xs text-muted-foreground">({rptDate})</span>}
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
                        .filter(([k]) => !['id', 'selected_standards'].includes(k))
                        .map(([key, value]) => (
                          <div key={key} className="text-xs p-2 bg-muted/30 rounded">
                            <div className="text-muted-foreground text-[10px]">{taskFieldLabels[key] || key}</div>
                            <div className="font-medium truncate">{String(value || '-')}</div>
                          </div>
                        ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Check Records */}
              <Card>
                <CardHeader className="pb-2">
                  <h3 className="font-semibold text-sm text-primary">检查记录 ({records.length})</h3>
                  <div className="flex gap-3 text-xs text-muted-foreground mt-1">
                    <span>合格 {passCount}</span><span>不合格 {failCount}</span>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  {records.length > 0 ? records.map(record => {
                    const recordMats = record.materials || [];
                    return (
                      <div key={record.id} className="p-3 rounded-lg bg-muted/30">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={cn('text-[10px] font-medium px-1.5 py-0.5 rounded',
                            record.evaluation_result === '合格' ? 'bg-emerald-100 text-emerald-700' :
                            record.evaluation_result === '不合格' ? 'bg-red-100 text-red-700' :
                            'bg-amber-100 text-amber-700'
                          )}>{record.evaluation_result}</span>
                          <span className="text-sm font-medium flex-1">{record.check_item}</span>
                          {record.sensory_dimension && <Badge variant="outline" className="text-[9px]">{record.sensory_dimension}</Badge>}
                          {record.check_dimension && <span className="text-[10px] text-muted-foreground">{record.check_dimension}</span>}
                        </div>
                        {(record.check_requirement || record.check_standard) && (
                          <div className="text-[10px] text-muted-foreground mt-1 ml-1">
                            {record.check_requirement && <div>要求: {record.check_requirement}</div>}
                            {record.check_standard && <div>标准: {record.check_standard}</div>}
                          </div>
                        )}
                        {record.problem_description && <div className="text-xs text-muted-foreground mt-1 ml-1">{record.problem_description}</div>}
                        {recordMats.length > 0 && (
                          <div className="flex gap-1.5 mt-2 ml-1 flex-wrap">
                            {recordMats.map(mat => (
                              <div key={mat.id}
                                className="w-14 h-14 rounded-md overflow-hidden border border-border cursor-pointer relative"
                                onClick={() => openPreview(mat.file_url)}>
                                {mat.material_type === 'image' ? (
                                  <img src={mat.file_url} alt={mat.file_name} className="w-full h-full object-cover" />
                                ) : (
                                  <>
                                    <video src={mat.file_url} className="w-full h-full object-cover" muted preload="metadata" />
                                    <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                                      <Play className="h-4 w-4 text-white fill-white" />
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
                      <div key={recipe.id} className="border rounded-lg p-3">
                        <div className="flex items-center gap-2 mb-2">
                          <Badge variant="outline" className="text-[10px]">{recipe.recipe_type}</Badge>
                          <span className="font-medium text-sm">{recipe.name}</span>
                          <span className="text-xs text-muted-foreground ml-auto">{recipe.recipe_steps?.length || 0} 步骤</span>
                        </div>
                        {recipe.recipe_steps?.map(step => {
                          const stepMats = step.materials || [];
                          return (
                            <div key={step.id} className="ml-2 py-1.5 border-t last:border-0">
                              <div className="flex items-start gap-2">
                                <span className="shrink-0 w-5 h-5 rounded-full bg-primary/10 text-primary text-[10px] font-semibold flex items-center justify-center">{step.step_number}</span>
                                <span className="text-sm">{step.operation}</span>
                              </div>
                              {(() => {
                                const pps = step.problem_points?.length ? step.problem_points.filter(p => p.text?.trim()) : step.problem_point ? [{ text: step.problem_point }] : [];
                                if (!pps.length) return null;
                                return (
                                  <div className="ml-7 mt-1">
                                    {pps.map((pp, i) => (
                                      <div key={i} className="text-xs text-amber-600">
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
                                      className="w-14 h-14 rounded-md overflow-hidden border border-border cursor-pointer relative"
                                      onClick={() => openPreview(mat.file_url)}>
                                      {mat.material_type === 'image' ? (
                                        <img src={mat.file_url} alt={mat.file_name} className="w-full h-full object-cover" />
                                      ) : (
                                        <>
                                          <video src={mat.file_url} className="w-full h-full object-cover" muted preload="metadata" />
                                          <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                                            <Play className="h-4 w-4 text-white fill-white" />
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
                      </div>
                    ))}
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
                    <div className="space-y-1">
                      {liveIssues.map((issue, idx) => (
                        <div key={idx} className="flex items-center gap-2 py-1.5 px-2 rounded bg-muted/30 text-sm">
                          <span className={cn('text-[10px] font-medium px-1.5 py-0.5 rounded',
                            issue.level === '一类' ? 'bg-red-100 text-red-700' :
                            issue.level === '二类' ? 'bg-amber-100 text-amber-700' :
                            'bg-blue-100 text-blue-700'
                          )}>{issue.level || '二类'}</span>
                          <span className="flex-1">{issue.title}</span>
                          <span className={cn('text-[10px] font-medium px-1.5 py-0.5 rounded')}
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
            </div>
          );
        })}
      </div>

      {/* Media preview dialog */}
      <Dialog open={!!previewUrl} onOpenChange={() => setPreviewUrl(null)}>
        <DialogContent className="max-w-[95vw] max-h-[95vh] p-0 overflow-hidden border-0 bg-black/90 flex items-center justify-center">
          <DialogHeader className="sr-only">
            <DialogTitle>预览</DialogTitle>
          </DialogHeader>
          <div className="relative w-full h-full flex items-center justify-center">
            {previewIsVideo ? (
              <video src={previewUrl!} controls autoPlay className="max-w-full max-h-[90vh] object-contain" style={{ borderRadius: '4px' }} />
            ) : (
              <img src={previewUrl!} alt="预览" className="max-w-full max-h-[90vh] object-contain" />
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Footer */}
      <div className="border-t mt-8 py-4 text-center text-xs text-muted-foreground">
        产品体验管理平台 - 分享报告（仅查看）
      </div>
    </div>
  );
}
