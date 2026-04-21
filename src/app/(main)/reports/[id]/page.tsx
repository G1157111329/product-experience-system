'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Download, Video, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { useImagePreview } from '@/components/image-preview';
import { toast } from 'sonner';

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
  task_name: '任务名称', product_category: '产品品类', product: '产品', product_model: '产品型号',
  project_type: '项目类型', project_phase: '项目阶段', test_date: '测试日期',
  organizer: '组织人', target_user: '目标用户', test_purpose: '测试目的',
  test_method: '测试方法', status: '状态', assigned_to: '负责人',
  created_at: '创建时间', updated_at: '更新时间', selected_standards: '选择标准',
};

const STATUS_LIST = ['待整改', '整改中', '已验证', '不整改'];
const STATUS_COLORS: Record<string, string> = {
  '待整改': 'bg-amber-100 text-amber-700',
  '整改中': 'bg-blue-100 text-blue-700',
  '已验证': 'bg-emerald-100 text-emerald-700',
  '不整改': 'bg-slate-100 text-slate-600',
};
const LEVEL_COLORS: Record<string, string> = {
  '一类': 'bg-red-100 text-red-700',
  '二类': 'bg-amber-100 text-amber-700',
  '三类': 'bg-slate-100 text-slate-600',
};

function ReportSection({ report, liveIssues, onStatusClick, open }: {
  report: ReportDetail;
  liveIssues: IssueItem[];
  onStatusClick: (issue: IssueItem) => void;
  open: (url: string) => void;
}) {
  const records = report.content?.records || [];
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
        <span>整改 <strong className="text-amber-600">{liveIssues.length}</strong></span>
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
                      <div key={mat.id} className="w-12 h-12 rounded overflow-hidden border cursor-pointer relative" onClick={() => open(mat.file_url)}>
                        <video src={mat.file_url} className="w-full h-full object-cover" muted preload="metadata" />
                        <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                          <Play className="h-3 w-3 text-white fill-white" />
                        </div>
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
                  {(() => {
                    const pps = step.problem_points && step.problem_points.length > 0
                      ? step.problem_points.filter(p => p.text && p.text.trim())
                      : step.problem_point ? [{ text: step.problem_point }] : [];
                    if (pps.length === 0) return null;
                    return (
                      <div className="ml-5 space-y-0.5">
                        {pps.map((pp, ppIdx) => (
                          <p key={ppIdx} className="text-[10px] text-amber-600">
                            {pps.length > 1 && <span className="font-medium">问题{ppIdx + 1}: </span>}
                            {pp.text}
                          </p>
                        ))}
                      </div>
                    );
                  })()}
                  {step.materials?.map((mat) => (
                    mat.material_type === 'image' ? (
                      <div key={mat.id} className="w-10 h-10 rounded overflow-hidden border cursor-pointer ml-5 inline-block" onClick={() => open(mat.file_url)}>
                        <img src={mat.file_url} alt={mat.file_name} className="w-full h-full object-cover" />
                      </div>
                    ) : (
                      <div key={mat.id} className="w-10 h-10 rounded overflow-hidden border cursor-pointer ml-5 inline-block relative" onClick={() => open(mat.file_url)}>
                        <video src={mat.file_url} className="w-full h-full object-cover" muted preload="metadata" />
                        <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                          <Play className="h-2.5 w-2.5 text-white fill-white" />
                        </div>
                      </div>
                    )
                  ))}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* Issues with live status */}
      {liveIssues.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">问题清单 ({liveIssues.length})</p>
          {liveIssues.map((issue) => (
            <div key={issue.id} className="p-2 rounded bg-muted/30 space-y-1">
              <div className="flex items-center gap-2">
                <Badge className={cn('text-[10px] shrink-0', LEVEL_COLORS[issue.level || '二类'] || LEVEL_COLORS['二类'])}>
                  {issue.level || '二类'}
                </Badge>
                {issue.source_type === 'recipe_problem' && (
                  <Badge variant="outline" className="text-[10px] shrink-0">食谱/功能</Badge>
                )}
                <span className="text-xs flex-1 truncate">{issue.title}</span>
                <button
                  onClick={() => onStatusClick(issue)}
                  className={cn('text-[10px] px-1.5 py-0.5 rounded cursor-pointer font-medium transition-colors hover:opacity-80 shrink-0',
                    STATUS_COLORS[issue.status] || STATUS_COLORS['待整改'])}
                >
                  {issue.status || '待整改'}
                </button>
              </div>
              {issue.description && (
                <p className="text-[10px] text-muted-foreground pl-1">{issue.description}</p>
              )}
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
  const [liveIssuesMap, setLiveIssuesMap] = useState<Record<string, IssueItem[]>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [statusDialogOpen, setStatusDialogOpen] = useState(false);
  const [editingIssue, setEditingIssue] = useState<IssueItem | null>(null);
  const [tempStatus, setTempStatus] = useState('');
  const [tempLevel, setTempLevel] = useState('');
  const [saving, setSaving] = useState(false);
  const { previewUrl: _, open, close: __, PreviewComponent } = useImagePreview();

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
            // Deduplicate: for each task_id, only keep the latest report
            const byTaskId: Record<string, ReportDetail> = {};
            for (const r of allReports) {
              if (r.product_model !== rpt.product_model) continue;
              const existing = byTaskId[r.task_id];
              if (!existing || r.created_at > existing.created_at) {
                byTaskId[r.task_id] = r;
              }
            }
            // Current report's task_id should use current report
            byTaskId[rpt.task_id] = rpt;
            const siblings = Object.values(byTaskId)
              .filter((r: ReportDetail) => r.id !== rpt.id)
              .sort((a: ReportDetail, b: ReportDetail) => a.created_at.localeCompare(b.created_at));
            setSiblingReports(siblings);
          }
        }
        // Sync issues for this report
        await syncReportIssues(rpt.id, rpt);
      } else {
        setLoadError(data.message || '报告加载失败');
      }
    } catch {
      setLoadError('网络错误，请重试');
    } finally {
      setLoading(false);
    }
  }, [id]);

  const syncReportIssues = async (reportId: string, reportData?: ReportDetail | null) => {
    const res = await fetch(`/api/issues?limit=500`);
    const data = await res.json();
    const raw = data.data;
    const allIssues: IssueItem[] = Array.isArray(raw) ? raw : (raw?.list || []);
    let reportIssues = allIssues.filter((i: IssueItem) => i.source_report_id === reportId);

    // If no issues exist yet for this report, auto-create from report content
    // But check for duplicates across ALL reports of the same task
    if (reportIssues.length === 0 && reportData?.content) {
      const content = reportData.content;
      const records = content.records || [];
      const recipes = content.recipes || [];
      const task = content.task as Record<string, unknown> | undefined;

      for (const record of records) {
        if (record.evaluation_result === '不合格') {
          // Check if this exact issue already exists for THIS report
          const alreadyInReport = allIssues.find(i =>
            i.source_report_id === reportId && i.source_type === 'record_fail' && i.title === record.check_item
          );
          if (alreadyInReport) continue;

          // Check if a similar issue exists from another report (same title + source_type + task)
          const existingFromOtherReport = allIssues.find(i =>
            i.source_type === 'record_fail' && i.title === (record.check_item || '不合格检查项') && i.source_report_id !== reportId
          );
          if (existingFromOtherReport) {
            // Re-link the existing issue to the current report
            await fetch(`/api/issues/${existingFromOtherReport.id}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                source_report_id: reportId,
                source: `${reportData.title} - 不合格检查项`,
              }),
            });
          } else {
            // Create a new issue
            await fetch('/api/issues', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                task_id: task?.id,
                title: record.check_item || '不合格检查项',
                product_model: task?.product_model || null,
                level: '二类',
                source: `${reportData.title} - 不合格检查项`,
                source_report_id: reportId,
                source_type: 'record_fail',
                description: [record.check_requirement, record.check_standard, record.problem_description].filter(Boolean).join('\n'),
              }),
            });
          }
        }
      }

      for (const recipe of recipes) {
        for (const step of (recipe.recipe_steps || [])) {
          // Collect all problem points from this step
          const problemPoints: Array<{ text: string; idx: number }> = [];
          const pp = step.problem_points;
          if (Array.isArray(pp) && pp.length > 0) {
            (pp as Array<{ text: string }>).forEach((p, idx) => {
              if (p.text && p.text.trim()) problemPoints.push({ text: p.text, idx });
            });
          } else if (step.problem_point && step.problem_point.trim()) {
            problemPoints.push({ text: step.problem_point, idx: 0 });
          }

          for (const ppItem of problemPoints) {
            const stepDesc = `步骤${step.step_number}: ${step.operation || ''}`;
            // Check if this exact issue already exists for THIS report
            const alreadyInReport = allIssues.find(i =>
              i.source_report_id === reportId && i.source_type === 'recipe_problem' && i.title === ppItem.text && i.description === stepDesc
            );
            if (alreadyInReport) continue;

            // Check if a similar issue exists from another report
            const existingFromOtherReport = allIssues.find(i =>
              i.source_type === 'recipe_problem' && i.title === ppItem.text.substring(0, 200) && i.source_report_id !== reportId
            );
            if (existingFromOtherReport) {
              // Re-link the existing issue to the current report
              await fetch(`/api/issues/${existingFromOtherReport.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  source_report_id: reportId,
                  source: `${reportData.title} - 食谱功能问题(${recipe.name || ''})`,
                }),
              });
            } else {
              // Create a new issue
              await fetch('/api/issues', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  task_id: task?.id,
                  title: ppItem.text.substring(0, 200),
                  product_model: task?.product_model || null,
                  level: '二类',
                  source: `${reportData.title} - 食谱功能问题(${recipe.name || ''})`,
                  source_report_id: reportId,
                  source_type: 'recipe_problem',
                  description: stepDesc,
                }),
              });
            }
          }
        }
      }

      // Re-fetch after auto-creation/re-linking
      const res2 = await fetch(`/api/issues?limit=500`);
      const data2 = await res2.json();
      const raw2 = data2.data;
      const allIssues2: IssueItem[] = Array.isArray(raw2) ? raw2 : (raw2?.list || []);
      reportIssues = allIssues2.filter((i: IssueItem) => i.source_report_id === reportId);
    }

    setLiveIssuesMap(prev => ({ ...prev, [reportId]: reportIssues }));
  };

  useEffect(() => { fetchReport().finally(() => setLoading(false)); }, [fetchReport]);

  // Also sync issues for sibling reports
  useEffect(() => {
    siblingReports.forEach(rpt => {
      if (!liveIssuesMap[rpt.id]) {
        syncReportIssues(rpt.id, rpt);
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
    window.open(`/reports/print?id=${id}`, '_blank');
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
              <ReportSection
                report={rpt}
                liveIssues={liveIssuesMap[rpt.id] || []}
                onStatusClick={handleOpenStatusDialog}
                open={open}
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
              <div className="text-sm font-medium">{editingIssue.title}</div>
              {editingIssue.description && (
                <p className="text-xs text-muted-foreground">{editingIssue.description}</p>
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
    </div>
  );
}
