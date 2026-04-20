'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Download, Video } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useImagePreview } from '@/components/image-preview';

interface Material {
  id: string; material_type: string; file_name: string; file_url: string; file_size: number;
}

interface RecipeStep {
  id: string; step_number: number; operation: string; problem_point: string | null;
  materials?: Material[];
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
  materials?: Material[];
  [key: string]: unknown;
}

interface ReportContent {
  task: Record<string, unknown>;
  records: CheckRecord[];
  issues: Array<Record<string, unknown>>;
  recipes: Recipe[];
  materials: Material[];
  generatedAt: string;
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

const taskFieldLabels: Record<string, string> = {
  task_name: '任务名称', product_category: '产品品类', product_model: '产品型号',
  project_type: '项目类型', project_phase: '项目阶段', test_date: '测试日期',
  organizer: '组织人', target_user: '目标用户', test_purpose: '测试目的',
  test_method: '测试方法', status: '状态', assigned_to: '负责人',
  created_at: '创建时间', updated_at: '更新时间', selected_standards: '选择标准',
};

function ReportSection({ report, open }: { report: ReportDetail; open: (url: string) => void }) {
  const records = report.content?.records || [];
  const issues = report.content?.issues || [];
  const recipes = report.content?.recipes || [];
  const task = report.content?.task;
  const passCount = records.filter((r) => r.evaluation_result === '合格').length;
  const failCount = records.filter((r) => r.evaluation_result === '不合格').length;
  const recipeProblemCount = recipes.reduce((sum, r) => sum + (r.problem_count || 0), 0);

  return (
    <div className="space-y-3">
      {/* Mini stats */}
      <div className="flex gap-3 text-xs text-muted-foreground flex-wrap">
        <span>检查项 <strong className="text-foreground">{records.length}</strong></span>
        <span>合格 <strong className="text-emerald-600">{passCount}</strong></span>
        <span>不合格 <strong className="text-destructive">{failCount}</strong></span>
        <span>整改 <strong className="text-amber-600">{issues.length}</strong></span>
        <span>食谱问题 <strong className="text-orange-600">{recipeProblemCount}</strong></span>
      </div>

      {/* Task Info */}
      {task && (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-2 text-xs">
          {Object.entries(task)
            .filter(([k]) => !['id', 'selected_standards'].includes(k))
            .map(([key, value]) => (
              <div key={key}>
                <span className="text-muted-foreground">{taskFieldLabels[key] || key}: </span>
                <span className="truncate">{String(value || '-')}</span>
              </div>
            ))}
        </div>
      )}

      {/* Check Records */}
      {records.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">检查记录 ({records.length})</p>
          {records.map((record) => {
            const recordMats = record.materials || [];
            const recordImages = recordMats.filter((m) => m.material_type === 'image');
            const recordVideos = recordMats.filter((m) => m.material_type === 'video');
            return (
              <div key={record.id} className="p-2 rounded-lg bg-muted/30 space-y-1.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={cn(
                    'text-[10px] font-medium px-1.5 py-0.5 rounded',
                    record.evaluation_result === '合格' && 'bg-emerald-100 text-emerald-700',
                    record.evaluation_result === '不合格' && 'bg-red-100 text-red-700',
                    record.evaluation_result === '待定' && 'bg-amber-100 text-amber-700',
                  )}>{record.evaluation_result}</span>
                  <span className="text-xs font-medium flex-1">{record.check_item}</span>
                  {record.check_dimension && (
                    <span className="text-[10px] text-muted-foreground bg-background px-1 py-0.5 rounded">{record.check_dimension}</span>
                  )}
                </div>
                {(record.check_requirement || record.check_standard) && (
                  <div className="text-[10px] text-muted-foreground space-y-0.5 pl-1">
                    {record.check_requirement && <div>要求: {record.check_requirement}</div>}
                    {record.check_standard && <div>标准: {record.check_standard}</div>}
                  </div>
                )}
                {record.problem_description && (
                  <p className="text-[10px] text-muted-foreground">{record.problem_description}</p>
                )}
                {(recordImages.length > 0 || recordVideos.length > 0) && (
                  <div className="flex gap-1 flex-wrap">
                    {recordImages.map((mat) => (
                      <div key={mat.id} className="w-12 h-12 rounded overflow-hidden border cursor-pointer" onClick={() => open(mat.file_url)}>
                        <img src={mat.file_url} alt={mat.file_name} className="w-full h-full object-cover" />
                      </div>
                    ))}
                    {recordVideos.map((mat) => (
                      <div key={mat.id} className="w-12 h-12 rounded overflow-hidden border bg-muted flex items-center justify-center">
                        <Video className="h-3 w-3 text-muted-foreground" />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Recipes */}
      {recipes.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">食谱/功能 ({recipes.length})</p>
          {recipes.map((recipe) => (
            <div key={recipe.id} className="border rounded-lg p-3 space-y-2">
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="text-[10px] shrink-0">{recipe.recipe_type}</Badge>
                <span className="text-xs font-medium flex-1">{recipe.name}</span>
                <span className="text-[10px] text-muted-foreground">{recipe.problem_count || 0} 问题</span>
              </div>
              {recipe.recipe_steps?.map((step) => (
                <div key={step.id} className="p-2 rounded bg-muted/30 space-y-1">
                  <div className="flex items-center gap-1.5">
                    <span className="w-4 h-4 rounded-full bg-primary/10 text-primary text-[9px] flex items-center justify-center font-medium shrink-0">{step.step_number}</span>
                    <span className="text-xs">{step.operation}</span>
                  </div>
                  {step.problem_point && <p className="text-[10px] text-amber-600 ml-5">问题: {step.problem_point}</p>}
                  {step.materials?.map((mat) => (
                    mat.material_type === 'image' ? (
                      <div key={mat.id} className="w-10 h-10 rounded overflow-hidden border cursor-pointer ml-5 inline-block" onClick={() => open(mat.file_url)}>
                        <img src={mat.file_url} alt={mat.file_name} className="w-full h-full object-cover" />
                      </div>
                    ) : null
                  ))}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* Issues */}
      {issues.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">问题清单 ({issues.length})</p>
          {issues.map((issue, idx) => (
            <div key={idx} className="flex items-center gap-2 p-2 rounded bg-muted/30">
              <Badge className={cn('text-[10px]', (issue.level === '一类') ? 'bg-red-100 text-red-700' : (issue.level === '二类') ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600')}>
                {String(issue.level || '二类')}
              </Badge>
              <span className="text-xs flex-1 truncate">{String(issue.title || '')}</span>
              <Badge variant="secondary" className="text-[10px]">{String(issue.status || '')}</Badge>
            </div>
          ))}
        </div>
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
  const [loading, setLoading] = useState(true);
  const { previewUrl: _, open, close: __, PreviewComponent } = useImagePreview();

  useEffect(() => {
    fetch(`/api/reports/${id}`).then(r => r.json()).then(async (res) => {
      if (res.code === 0) {
        const rpt = res.data as ReportDetail;
        setReport(rpt);
        // Fetch sibling reports with same product_model for 自研/改型降本
        if (rpt.product_model) {
          const allRes = await fetch('/api/reports?limit=200');
          const allData = await allRes.json();
          const allReports: ReportDetail[] = Array.isArray(allData.data) ? allData.data : (allData.data?.list || []);
          const projectType = (rpt.content?.task as Record<string, unknown>)?.project_type as string;
          const shouldMerge = projectType === '自研' || projectType === '改型/降本/优化';
          if (shouldMerge) {
            const siblings = allReports.filter((r: ReportDetail) =>
              r.id !== rpt.id && r.product_model === rpt.product_model
            ).sort((a: ReportDetail, b: ReportDetail) => a.created_at.localeCompare(b.created_at));
            setSiblingReports(siblings);
          }
        }
      }
    }).finally(() => setLoading(false));
  }, [id]);

  const handleExportPDF = () => {
    window.open(`/reports/print?id=${id}`, '_blank');
  };

  if (loading) return <div className="p-6 animate-pulse space-y-4"><div className="h-8 bg-muted rounded w-64" /></div>;
  if (!report) return <div className="p-6">报告不存在</div>;

  const task = report.content?.task as Record<string, unknown> | undefined;
  const projectType = task?.project_type as string | undefined;
  const taskPhase = task?.project_phase as string | undefined;
  const isMerged = siblingReports.length > 0;

  // Combine all reports for merged stats
  const allReports = isMerged ? [report, ...siblingReports] : [report];
  const totalRecords = allReports.flatMap(r => r.content?.records || []);
  const totalIssues = allReports.flatMap(r => r.content?.issues || []);
  const totalRecipes = allReports.flatMap(r => r.content?.recipes || []);
  const totalPass = totalRecords.filter(r => r.evaluation_result === '合格').length;
  const totalFail = totalRecords.filter(r => r.evaluation_result === '不合格').length;
  const totalRecipePC = totalRecipes.reduce((s, r) => s + (r.problem_count || 0), 0);

  return (
    <div className="p-4 lg:p-6 space-y-4">
      <PreviewComponent />
      <div className="flex items-start gap-3">
        <Button variant="ghost" size="icon" className="shrink-0" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-semibold truncate">{report.product_model || report.title} {isMerged && <Badge variant="secondary" className="text-[10px] ml-1">合并 {allReports.length} 份报告</Badge>}</h1>
          <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground flex-wrap">
            <Badge variant="secondary" className="text-[10px]">{report.status}</Badge>
            {projectType && <span>{projectType}</span>}
            {taskPhase && <span>{taskPhase}</span>}
          </div>
        </div>
        <Button size="sm" onClick={handleExportPDF}>
          <Download className="h-4 w-4 mr-1.5" /> 导出PDF
        </Button>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {[
          { label: '检查项总数', value: totalRecords.length, color: '' },
          { label: '合格', value: totalPass, color: 'text-emerald-600' },
          { label: '不合格', value: totalFail, color: 'text-destructive' },
          { label: '问题整改', value: totalIssues.length, color: 'text-amber-600' },
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

      {/* Report sections - each report is shown completely with a divider */}
      {allReports.map((rpt, idx) => {
        const rptTask = rpt.content?.task as Record<string, unknown> | undefined;
        const rptPhase = rptTask?.project_phase as string | undefined;
        const rptDate = rptTask?.test_date as string | undefined;
        const rptType = rptTask?.project_type as string | undefined;
        return (
          <Card key={rpt.id}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium">
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
            <CardContent>
              {idx > 0 && (
                <div className="border-t border-dashed mb-3 pt-2">
                  <p className="text-[10px] text-muted-foreground">以下为独立报告内容，与上方报告以分割线区分</p>
                </div>
              )}
              <ReportSection report={rpt} open={open} />
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
