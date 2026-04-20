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
  id: string; sensory_dimension?: string; check_dimension?: string;
  check_item: string; evaluation_result: string; problem_description?: string;
  materials?: Material[];
  [key: string]: unknown;
}

interface ReportDetail {
  id: string;
  task_id: string;
  title: string;
  status: string;
  version: number;
  content: {
    task: Record<string, unknown>;
    records: CheckRecord[];
    issues: Array<Record<string, unknown>>;
    recipes: Recipe[];
    materials: Material[];
    generatedAt: string;
  } | null;
  created_at: string;
  updated_at: string;
}

// Task field name mapping: English -> Chinese
const taskFieldLabels: Record<string, string> = {
  task_name: '任务名称',
  product_category: '产品品类',
  product_model: '产品型号',
  project_phase: '项目阶段',
  test_date: '测试日期',
  organizer: '组织人',
  target_user: '目标用户',
  test_purpose: '测试目的',
  test_method: '测试方法',
  status: '状态',
  assigned_to: '负责人',
  created_at: '创建时间',
  updated_at: '更新时间',
  selected_standards: '选择标准',
};

export default function ReportDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const [report, setReport] = useState<ReportDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const { previewUrl: _, open, close: __, PreviewComponent } = useImagePreview();

  useEffect(() => {
    fetch(`/api/reports/${id}`).then(r => r.json()).then(res => {
      if (res.code === 0) setReport(res.data);
    }).finally(() => setLoading(false));
  }, [id]);

  const handleExportPDF = () => {
    window.open(`/reports/print?id=${id}`, '_blank');
  };

  if (loading) return <div className="p-6 animate-pulse space-y-4"><div className="h-8 bg-muted rounded w-64" /></div>;
  if (!report) return <div className="p-6">报告不存在</div>;

  const records = report.content?.records || [];
  const issues = report.content?.issues || [];
  const recipes = report.content?.recipes || [];
  const task = report.content?.task;
  const passCount = records.filter((r) => r.evaluation_result === '合格').length;
  const failCount = records.filter((r) => r.evaluation_result === '不合格').length;
  const recipeProblemCount = recipes.reduce((sum, r) => sum + (r.problem_count || 0), 0);
  const totalProblemCount = issues.length + recipeProblemCount;

  return (
    <div className="p-4 lg:p-6 space-y-4">
      <PreviewComponent />
      <div className="flex items-start gap-3">
        <Button variant="ghost" size="icon" className="shrink-0" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-semibold truncate">{report.title}</h1>
          <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground flex-wrap">
            <Badge variant="secondary" className="text-[10px]">{report.status}</Badge>
            <span>V{report.version}</span>
            {task && <span>{String(task.product_model || '')}</span>}
          </div>
        </div>
        <Button size="sm" onClick={handleExportPDF}>
          <Download className="h-4 w-4 mr-1.5" /> 导出PDF
        </Button>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {[
          { label: '检查项总数', value: records.length, color: '' },
          { label: '合格', value: passCount, color: 'text-emerald-600' },
          { label: '不合格', value: failCount, color: 'text-destructive' },
          { label: '问题整改', value: issues.length, color: 'text-amber-600' },
          { label: '食谱/功能问题', value: recipeProblemCount, color: 'text-orange-600' },
        ].map((stat) => (
          <Card key={stat.label}>
            <CardContent className="p-4 text-center">
              <p className={cn('text-2xl font-bold', stat.color)}>{stat.value}</p>
              <p className="text-xs text-muted-foreground mt-1">{stat.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Task Info - Chinese labels */}
      {task && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">任务信息</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 text-sm">
              {Object.entries(task)
                .filter(([k]) => !['id', 'selected_standards'].includes(k))
                .map(([key, value]) => (
                  <div key={key}>
                    <span className="text-xs text-muted-foreground">{taskFieldLabels[key] || key}</span>
                    <p className="truncate">{String(value || '-')}</p>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Check Records - Card layout with thumbnails per record */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">检查记录 ({records.length})</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {records.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">暂无记录</p>
          ) : (
            records.map((record) => {
              const recordMats = record.materials || [];
              const recordImages = recordMats.filter((m) => m.material_type === 'image');
              const recordVideos = recordMats.filter((m) => m.material_type === 'video');
              return (
                <div key={record.id} className="p-3 rounded-lg bg-muted/30 space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={cn(
                      'text-xs font-medium px-1.5 py-0.5 rounded',
                      record.evaluation_result === '合格' && 'bg-emerald-100 text-emerald-700',
                      record.evaluation_result === '不合格' && 'bg-red-100 text-red-700',
                      record.evaluation_result === '待定' && 'bg-amber-100 text-amber-700',
                    )}>{String(record.evaluation_result || '')}</span>
                    <span className="text-sm font-medium flex-1">{String(record.check_item || '')}</span>
                    {record.sensory_dimension && (
                      <Badge variant="secondary" className="text-[10px]">{String(record.sensory_dimension)}</Badge>
                    )}
                    {record.check_dimension && (
                      <span className="text-[10px] text-muted-foreground bg-background px-1.5 py-0.5 rounded">{String(record.check_dimension)}</span>
                    )}
                  </div>
                  {record.problem_description && (
                    <p className="text-xs text-muted-foreground">{String(record.problem_description)}</p>
                  )}
                  {/* Thumbnails per record */}
                  {(recordImages.length > 0 || recordVideos.length > 0) && (
                    <div className="flex gap-1.5 flex-wrap">
                      {recordImages.map((mat) => (
                        <div key={mat.id} className="w-14 h-14 rounded-md overflow-hidden border border-border cursor-pointer"
                          onClick={() => open(mat.file_url)}>
                          <img src={mat.file_url} alt={mat.file_name} className="w-full h-full object-cover" />
                        </div>
                      ))}
                      {recordVideos.map((mat) => (
                        <div key={mat.id} className="w-14 h-14 rounded-md overflow-hidden border border-border bg-muted flex items-center justify-center">
                          <Video className="h-4 w-4 text-muted-foreground" />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      {/* Recipes / Functions List */}
      {recipes.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">食谱/功能列表 ({recipes.length})</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {recipes.map((recipe) => (
              <div key={recipe.id} className="border border-border rounded-lg p-4 space-y-3">
                <div className="flex items-center gap-3">
                  <Badge variant="secondary" className="text-[10px] shrink-0">{recipe.recipe_type}</Badge>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{recipe.name}</p>
                    <p className="text-xs text-muted-foreground">{recipe.ingredients || '-'}</p>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground shrink-0">
                    <span>{recipe.recipe_steps?.length || 0} 步骤</span>
                    <span>{recipe.problem_count || 0} 问题</span>
                  </div>
                </div>
                {recipe.recipe_steps && recipe.recipe_steps.length > 0 && (
                  <div className="space-y-2">
                    {recipe.recipe_steps.map((step) => (
                      <div key={step.id} className="p-3 rounded-lg bg-muted/30 space-y-1.5">
                        <div className="flex items-center gap-2">
                          <span className="w-5 h-5 rounded-full bg-primary/10 text-primary text-[10px] flex items-center justify-center font-medium shrink-0">
                            {step.step_number}
                          </span>
                          <span className="text-sm">{step.operation}</span>
                        </div>
                        {step.problem_point && (
                          <p className="text-xs text-amber-600 ml-7">问题: {step.problem_point}</p>
                        )}
                        {step.materials && step.materials.length > 0 && (
                          <div className="flex gap-1.5 ml-7 flex-wrap">
                            {step.materials.map((mat) => (
                              <div key={mat.id} className="w-14 h-14 rounded-md overflow-hidden border border-border cursor-pointer"
                                onClick={() => mat.material_type === 'image' && open(mat.file_url)}>
                                {mat.material_type === 'image' ? (
                                  <img src={mat.file_url} alt={mat.file_name} className="w-full h-full object-cover" />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center bg-muted"><Video className="h-4 w-4 text-muted-foreground" /></div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Issues */}
      {issues.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">问题清单 ({issues.length})</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {issues.map((issue, idx) => (
              <div key={idx} className="flex items-center gap-3 p-2.5 rounded-lg bg-muted/30">
                <Badge className={cn('text-[10px]',
                  issue.severity === '致命' ? 'bg-red-100 text-red-700' :
                  issue.severity === '严重' ? 'bg-amber-100 text-amber-700' :
                  'bg-blue-100 text-blue-700'
                )}>{String(issue.severity || '')}</Badge>
                <span className="text-sm flex-1 truncate">{String(issue.title || '')}</span>
                <Badge variant="secondary" className="text-[10px]">{String(issue.status || '')}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
