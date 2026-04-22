'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Download, Video, Play, Share2, Copy, Clock, Infinity, X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
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
  selected_standards: '选择标准',
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
            .filter(([k]) => !['id', 'selected_standards', 'created_by'].includes(k))
            .map(([key, value]) => (
              <div key={key} className="min-w-0">
                <span className="text-muted-foreground">{taskFieldLabels[key] || key}: </span>
                <span className="break-all">
                  {(key === 'created_at' || key === 'updated_at') ? formatBeijingTime(value as string) : String(value || '-')}
                </span>
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
                <span className="text-xs font-medium flex-1 min-w-0 truncate">{recipe.name}</span>
                <span className="text-[10px] text-muted-foreground">{recipe.problem_count || 0} 问题</span>
              </div>
              {recipe.recipe_steps?.map((step) => (
                <div key={step.id} className="p-2 rounded bg-muted/30 space-y-1">
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
                <p className="text-[10px] text-muted-foreground pl-1 break-all">{issue.description}</p>
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
  const [shareOpen, setShareOpen] = useState(false);
  const [shareDuration, setShareDuration] = useState<'7d' | '30d' | 'permanent'>('30d');
  const [shareCreating, setShareCreating] = useState(false);
  const [shareLink, setShareLink] = useState<string | null>(null);
  const [shareLinks, setShareLinks] = useState<Array<{ id: string; share_token: string; expires_at: string | null; is_expired: boolean; created_at: string }>>([]);
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
    window.open(`/reports/print?id=${id}`, '_blank');
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

  return (
    <div className="p-4 lg:p-6 space-y-4">
      <PreviewComponent />
      <div className="flex items-start gap-3 flex-wrap">
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
        <div className="flex gap-2 shrink-0">
          <Button size="sm" onClick={handleExportPDF}>
            <Download className="h-4 w-4 mr-1.5" /> 导出PDF
          </Button>
          <Button size="sm" variant="outline" onClick={openShareDialog}>
            <Share2 className="h-4 w-4 mr-1.5" /> 分享
          </Button>
        </div>
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

      {/* Share dialog */}
      <Dialog open={shareOpen} onOpenChange={setShareOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>分享报告</DialogTitle>
            <DialogDescription>生成分享链接，其他人可以通过链接查看报告</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">链接有效期</label>
              <div className="grid grid-cols-3 gap-2">
                {([
                  { value: '7d' as const, label: '7天', icon: Clock },
                  { value: '30d' as const, label: '30天', icon: Clock },
                  { value: 'permanent' as const, label: '永久', icon: Infinity },
                ]).map(opt => (
                  <Button key={opt.value} type="button" variant={shareDuration === opt.value ? 'default' : 'outline'}
                    size="sm" className="gap-1" onClick={() => setShareDuration(opt.value)}>
                    <opt.icon className="h-3.5 w-3.5" /> {opt.label}
                  </Button>
                ))}
              </div>
            </div>
            {!shareLink && (
              <Button type="button" className="w-full" onClick={handleCreateShare} disabled={shareCreating}>
                {shareCreating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Share2 className="h-4 w-4 mr-2" />}
                生成分享链接
              </Button>
            )}
            {shareLink && (
              <div className="space-y-2">
                <label className="text-sm font-medium">分享链接</label>
                <div className="flex gap-2">
                  <input readOnly value={shareLink} className="flex-1 text-xs bg-muted rounded-md px-3 py-2 border border-border truncate" onClick={(e) => (e.target as HTMLInputElement).select()} />
                  <Button type="button" size="sm" variant="outline" onClick={() => handleCopyLink(shareLink)}>
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <p className="text-[10px] text-muted-foreground">
                  {shareDuration === 'permanent' ? '此链接永久有效' : `此链接${shareDuration === '7d' ? '7天' : '30天'}内有效`}
                </p>
              </div>
            )}
            {shareLinks.length > 0 && (
              <div className="space-y-2">
                <label className="text-sm font-medium">已创建的链接</label>
                <div className="space-y-1.5 max-h-40 overflow-y-auto">
                  {shareLinks.map(s => {
                    const link = `${typeof window !== 'undefined' ? window.location.origin : ''}/reports/share/${s.share_token}`;
                    return (
                      <div key={s.id} className="flex items-center gap-2 p-2 bg-muted/50 rounded-md text-xs">
                        <div className="flex-1 min-w-0">
                          <div className="truncate text-muted-foreground">{link}</div>
                          <div className="mt-0.5">
                            {s.is_expired ? (
                              <span className="text-destructive">已过期</span>
                            ) : s.expires_at ? (
                              <span className="text-muted-foreground">有效期至 {new Date(s.expires_at).toLocaleDateString('zh-CN')}</span>
                            ) : (
                              <span className="text-muted-foreground">永久有效</span>
                            )}
                          </div>
                        </div>
                        {!s.is_expired && (
                          <Button type="button" variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => handleCopyLink(link)}>
                            <Copy className="h-3 w-3" />
                          </Button>
                        )}
                        <Button type="button" variant="ghost" size="icon" className="h-6 w-6 shrink-0 text-destructive" onClick={() => handleRevokeShare(s.id)}>
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
