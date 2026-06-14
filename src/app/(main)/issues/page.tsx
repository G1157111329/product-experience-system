'use client';

import { PresignedImage } from '@/components/presigned-media';
import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Download, Sparkles, Plus, Loader2, Pencil } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth-context';
import { PageShell, pageActionButtonClass, pageFilterSelectClass } from '@/components/app';
import { MaterialPicker, type Material } from '@/components/material-picker';
import { fetchJson, getErrorMessage } from '@/lib/http';
import { toast } from 'sonner';

interface Issue {
  id: string; title: string; product_model: string | null;
  category: string | null; sub_category: string | null;
  severity: string | null; priority: string | null; level: string | null;
  source: string | null; source_report_id: string | null; source_type: string | null;
  description: string | null; status: string;
  is_improve: boolean | null; improve_plan: string | null;
  no_improve_reason: string | null;
  responsible_person: string | null; plan_complete_date: string | null;
  actual_complete_date: string | null; verification_note: string | null;
  task_id: string; created_at: string; updated_at: string;
}

interface ReEvaluation {
  id: string;
  issue_id: string;
  description: string | null;
  ai_result: { score: number; summary: string } | null;
  created_at: string;
  created_by: string | null;
  materials: Array<{
    id: string;
    material_type: string;
    file_url: string;
    file_path: string | null;
    file_name: string;
  }>;
}

interface ReportGroup {
  report_id: string;
  report_title: string;
  created_at: string;
  issues: Issue[];
}

const STATUS_LIST = ['待整改', '整改中', '已验证', '不整改'];
const LEVEL_LIST = ['一类', '二类', '三类'];
const STATUS_COLORS: Record<string, string> = {
  '待整改': 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  '整改中': 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  '已验证': 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  '不整改': 'bg-muted text-muted-foreground',
};
const LEVEL_COLORS: Record<string, string> = {
  '一类': 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400',
  '二类': 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400',
  '三类': 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400',
};

export default function IssuesPage() {
  const [issues, setIssues] = useState<Issue[]>([]);
  const [reports, setReports] = useState<{ id: string; title: string; task_id: string; created_at: string; content: Record<string, unknown> }[]>([]);
  const [reportGroups, setReportGroups] = useState<ReportGroup[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<ReportGroup | null>(null);
  const [selectedIssue, setSelectedIssue] = useState<Issue | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterLevel, setFilterLevel] = useState('all');
  const { user, isAdmin } = useAuth();
  const [userTaskIds, setUserTaskIds] = useState<string[]>([]);

  // Re-evaluation states
  const [reEvaluations, setReEvaluations] = useState<ReEvaluation[]>([]);
  const [newReEvalDescription, setNewReEvalDescription] = useState('');
  const [newReEvalMaterialIds, setNewReEvalMaterialIds] = useState<string[]>([]);
  const [newReEvalMaterials, setNewReEvalMaterials] = useState<Material[]>([]);
  const [savingReEval, setSavingReEval] = useState(false);
  const [aiEvaluating, setAiEvaluating] = useState<string | null>(null);
  const [editingReEvalId, setEditingReEvalId] = useState<string | null>(null);
  const [editingReEvalDesc, setEditingReEvalDesc] = useState('');
  const [editingReEvalAiScore, setEditingReEvalAiScore] = useState('');
  const [editingReEvalAiSummary, setEditingReEvalAiSummary] = useState('');
  const [savingReEvalEdit, setSavingReEvalEdit] = useState(false);

  // Fetch current user's task IDs (for non-admin filtering)
  useEffect(() => {
    if (user?.id && !isAdmin) {
      fetchJson<{ code: number; data?: { list?: Array<{ id: string }> } }>('/api/tasks?pageSize=200')
        .then(data => {
          if (data.code === 0) {
            const taskIds = (data.data?.list || []).map((t: { id: string }) => t.id);
            setUserTaskIds(taskIds);
          }
        })
        .catch(() => setUserTaskIds([]));
    }
  }, [user?.id, isAdmin]);

  const fetchIssues = useCallback(async () => {
    const params = new URLSearchParams({ limit: '500' });
    // Non-admin: only fetch issues belonging to user's tasks
    if (!isAdmin && userTaskIds.length > 0) {
      params.set('task_ids', userTaskIds.join(','));
    } else if (!isAdmin) {
      // No tasks yet, nothing to fetch
      setIssues([]);
      return;
    }
    try {
      const data = await fetchJson<{ code: number; data?: Issue[] | { list?: Issue[] }; message?: string }>(`/api/issues?${params}`);
      if (data.code === 0) {
        const raw = data.data;
        setIssues(Array.isArray(raw) ? raw : (raw?.list || []));
      }
    } catch (error) {
      toast.error(getErrorMessage(error, '问题列表加载失败'));
    }
  }, [isAdmin, userTaskIds]);

  const fetchReports = useCallback(async () => {
    try {
      const data = await fetchJson<{ code: number; data?: Array<{ id: string; title: string; task_id: string; created_at: string; content: Record<string, unknown> }> | { list?: Array<{ id: string; title: string; task_id: string; created_at: string; content: Record<string, unknown> }> }; message?: string }>('/api/reports?limit=200');
      if (data.code === 0) {
        const raw = data.data;
        setReports(Array.isArray(raw) ? raw : (raw?.list || []));
      }
    } catch (error) {
      toast.error(getErrorMessage(error, '报告列表加载失败'));
    }
  }, []);

  useEffect(() => {
    if (isAdmin || userTaskIds.length > 0) {
      fetchIssues();
      fetchReports();
    }
  }, [isAdmin, userTaskIds, fetchIssues, fetchReports]);

  // Auto-generate issues from reports' failed records & recipe problems
  useEffect(() => {
    const syncIssuesFromReports = async () => {
      let needRefetch = false;
      // Admin: process all reports; Non-admin: process only user's reports
      const userReports = isAdmin
        ? reports
        : reports.filter(r => userTaskIds.includes(r.task_id));

      for (const report of userReports) {
        const content = report.content as Record<string, unknown>;
        if (!content) continue;
        const records = (content.records || []) as Array<Record<string, unknown>>;
        const recipes = (content.recipes || []) as Array<Record<string, unknown>>;

        for (const record of records) {
          if (record.evaluation_result === '不合格') {
            const existing = issues.find(i => i.source_report_id === report.id && i.source_type === 'record_fail' && i.title === record.check_item);
            if (!existing) {
              await fetch('/api/issues', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  task_id: (content.task as Record<string, unknown>)?.id,
                  title: record.check_item || '不合格检查项',
                  product_model: (content.task as Record<string, unknown>)?.product_model,
                  level: record.problem_level || '二类',
                  source: `${report.title} - 不合格检查项`,
                  source_report_id: report.id,
                  source_type: 'record_fail',
                  description: [record.check_requirement, record.check_standard, record.problem_description].filter(Boolean).join('\n'),
                  status: '待整改',
                }),
              });
              needRefetch = true;
            }
          }
        }

        for (const recipe of recipes) {
          const steps = (recipe.recipe_steps || []) as Array<Record<string, unknown>>;
          for (const step of steps) {
            const stepDesc = `步骤${step.step_number}: ${step.operation || ''}`;
            const problemPoints: Array<{ text: string; idx: number }> = [];
            const pp = step.problem_points;
            if (Array.isArray(pp) && pp.length > 0) {
              pp.forEach((p: { text: string }, idx: number) => {
                if (p.text && p.text.trim()) problemPoints.push({ text: p.text, idx });
              });
            } else if (step.problem_point && String(step.problem_point).trim()) {
              problemPoints.push({ text: String(step.problem_point), idx: 0 });
            }

            for (const ppItem of problemPoints) {
              const title = ppItem.text.substring(0, 200);
              const existing = issues.find(i => i.source_report_id === report.id && i.source_type === 'recipe_problem' && i.title === title && i.description === stepDesc);
              if (!existing) {
                await fetch('/api/issues', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    task_id: (content.task as Record<string, unknown>)?.id,
                    title,
                    product_model: (content.task as Record<string, unknown>)?.product_model,
                    level: '二类',
                    source: `${report.title} - 食谱功能问题(${recipe.name || ''})`,
                    source_report_id: report.id,
                    source_type: 'recipe_problem',
                    description: stepDesc,
                    status: '待整改',
                  }),
                });
                needRefetch = true;
              }
            }
          }
        }
      }
      if (needRefetch) fetchIssues();
    };
    if (reports.length > 0 && (isAdmin || userTaskIds.length > 0)) syncIssuesFromReports();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reports, userTaskIds, isAdmin]);

  // Group issues by source_report_id with status/level filters
  useEffect(() => {
    const filtered = issues.filter(i => {
      if (filterStatus !== 'all' && i.status !== filterStatus) return false;
      if (filterLevel !== 'all' && i.level !== filterLevel) return false;
      return true;
    });
    const groups: Record<string, ReportGroup> = {};
    for (const issue of filtered) {
      const key = issue.source_report_id || 'no-report';
      if (!groups[key]) {
        groups[key] = {
          report_id: key,
          report_title: issue.source?.split(' - ')[0] || '未分类问题',
          created_at: issue.created_at,
          issues: [],
        };
      }
      groups[key].issues.push(issue);
    }
    setReportGroups(Object.values(groups).sort((a, b) => b.created_at.localeCompare(a.created_at)));
  }, [issues, filterStatus, filterLevel]);

  const handleStatusChange = async (issueId: string, newStatus: string) => {
    const res = await fetch(`/api/issues/${issueId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    });
    const data = await res.json();
    if (data.code === 0) {
      setIssues(prev => prev.map(i => i.id === issueId ? { ...i, status: newStatus } : i));
      if (selectedIssue?.id === issueId) setSelectedIssue(prev => prev ? { ...prev, status: newStatus } : prev);
    }
  };

  const handleLevelChange = async (issueId: string, newLevel: string) => {
    const res = await fetch(`/api/issues/${issueId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ level: newLevel }),
    });
    const data = await res.json();
    if (data.code === 0) {
      setIssues(prev => prev.map(i => i.id === issueId ? { ...i, level: newLevel } : i));
      if (selectedIssue?.id === issueId) setSelectedIssue(prev => prev ? { ...prev, level: newLevel } : prev);
    }
  };

  const handleUpdateField = async (issueId: string, field: string, value: unknown) => {
    const res = await fetch(`/api/issues/${issueId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [field]: value }),
    });
    const data = await res.json();
    if (data.code === 0) {
      setIssues(prev => prev.map(i => i.id === issueId ? { ...i, [field]: value } : i));
      if (selectedIssue?.id === issueId) setSelectedIssue(prev => prev ? { ...prev, [field]: value } : prev);
    }
  };

  const downloadCsv = (csvContent: string, filename: string) => {
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleExportIssues = async () => {
    try {
      if (!isAdmin && userTaskIds.length === 0) {
        toast.info('暂无可导出的问题点');
        return;
      }

      const params = new URLSearchParams({ limit: '2000' });
      if (filterStatus !== 'all') params.set('status', filterStatus);
      if (filterLevel !== 'all') params.set('level', filterLevel);
      if (!isAdmin) params.set('task_ids', userTaskIds.join(','));

      const res = await fetch(`/api/issues/export?${params}`);
      const data = await res.json();
      if (data.code !== 0) {
        toast.error(data.message || '导出失败');
        return;
      }
      downloadCsv(data.data.csv, '问题点数据.csv');
      toast.success(`已导出 ${data.data.count || 0} 条问题点`);
    } catch {
      toast.error('导出失败');
    }
  };

  // Fetch re-evaluations for the selected issue
  const fetchReEvaluations = useCallback(async (issueId: string) => {
    const res = await fetch(`/api/issue-re-evaluations?issue_id=${issueId}`);
    const data = await res.json();
    if (data.code === 0) {
      setReEvaluations(data.data || []);
    }
  }, []);

  // Load re-evaluations when dialog opens
  useEffect(() => {
    if (detailOpen && selectedIssue?.source_type === 'recipe_problem') {
      fetchReEvaluations(selectedIssue.id);
      setNewReEvalDescription('');
      setNewReEvalMaterialIds([]);
      setNewReEvalMaterials([]);
    } else {
      setReEvaluations([]);
    }
  }, [detailOpen, selectedIssue?.id, selectedIssue?.source_type, fetchReEvaluations]);

  // Save new re-evaluation
  const handleSaveReEvaluation = async () => {
    if (!selectedIssue) return;
    setSavingReEval(true);
    try {
      // Create re-evaluation record
      const res = await fetch('/api/issue-re-evaluations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          issue_id: selectedIssue.id,
          description: newReEvalDescription,
        }),
      });
      const data = await res.json();
      if (data.code !== 0) {
        toast.error(data.message || '保存失败');
        return;
      }

      const reEvalId = data.data.id;

      // Associate selected materials with the re-evaluation via re_evaluation_id
      for (const matId of newReEvalMaterialIds) {
        await fetch('/api/materials', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: matId, re_evaluation_id: reEvalId }),
        });
      }

      // Also associate newly uploaded materials
      for (const mat of newReEvalMaterials) {
        if (!newReEvalMaterialIds.includes(mat.id)) {
          await fetch('/api/materials', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: mat.id, re_evaluation_id: reEvalId }),
          });
        }
      }

      toast.success('复评估保存成功');
      setNewReEvalDescription('');
      setNewReEvalMaterialIds([]);
      setNewReEvalMaterials([]);
      fetchReEvaluations(selectedIssue.id);
    } catch {
      toast.error('保存失败');
    } finally {
      setSavingReEval(false);
    }
  };

  // AI evaluate a re-evaluation
  const handleAiEvaluate = async (reEvalId: string) => {
    setAiEvaluating(reEvalId);
    try {
      const res = await fetch(`/api/issue-re-evaluations/${reEvalId}/ai-evaluate`, {
        method: 'POST',
      });
      const data = await res.json();
      if (data.code !== 0) {
        toast.error(data.message || 'AI评价失败');
        return;
      }
      toast.success('AI评价完成');
      if (selectedIssue) fetchReEvaluations(selectedIssue.id);
    } catch {
      toast.error('AI评价失败');
    } finally {
      setAiEvaluating(null);
    }
  };

  const handleStartEditReEval = (reEval: ReEvaluation) => {
    setEditingReEvalId(reEval.id);
    setEditingReEvalDesc(reEval.description || '');
    setEditingReEvalAiScore(reEval.ai_result ? String(reEval.ai_result.score) : '');
    setEditingReEvalAiSummary(reEval.ai_result?.summary || '');
  };

  const handleSaveReEvalEdit = async (reEvalId: string) => {
    setSavingReEvalEdit(true);
    try {
      const body: Record<string, unknown> = { description: editingReEvalDesc };
      const score = parseFloat(editingReEvalAiScore);
      if (!isNaN(score) || editingReEvalAiSummary) {
        body.ai_result = { score: isNaN(score) ? 0 : score, summary: editingReEvalAiSummary };
      }
      const res = await fetch(`/api/issue-re-evaluations/${reEvalId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.code !== 0) {
        toast.error(data.message || '保存失败');
        return;
      }
      toast.success('保存成功');
      setEditingReEvalId(null);
      if (selectedIssue) fetchReEvaluations(selectedIssue.id);
    } catch {
      toast.error('保存失败');
    } finally {
      setSavingReEvalEdit(false);
    }
  };

  const totalIssues = issues.length;
  const pendingCount = issues.filter(i => i.status === '待整改').length;
  const inProgressCount = issues.filter(i => i.status === '整改中').length;
  const verifiedCount = issues.filter(i => i.status === '已验证').length;

  return (
    <PageShell size="wide" className="space-y-4 sm:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold">问题管理</h1>
          <p className="text-sm text-muted-foreground mt-1">不合格检查项与食谱功能问题汇总</p>
        </div>
        <Button variant="outline" size="sm" className={cn(pageActionButtonClass, 'w-full sm:w-auto')} onClick={handleExportIssues}>
          <Download className="h-4 w-4" />
          导出数据
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: '问题总数', value: totalIssues, color: '' },
          { label: '待整改', value: pendingCount, color: 'text-amber-600' },
          { label: '整改中', value: inProgressCount, color: 'text-blue-600' },
          { label: '已验证', value: verifiedCount, color: 'text-emerald-600' },
        ].map((stat) => (
          <Card key={stat.label} className="lg:py-4">
            <CardContent className="p-4 text-center">
              <p className={cn('text-2xl font-bold tabular-nums lg:text-3xl', stat.color)}>{stat.value}</p>
              <p className="text-xs text-muted-foreground mt-1">{stat.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className={pageFilterSelectClass}><SelectValue placeholder="状态" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部状态</SelectItem>
            {STATUS_LIST.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterLevel} onValueChange={setFilterLevel}>
          <SelectTrigger className={pageFilterSelectClass}><SelectValue placeholder="等级" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部等级</SelectItem>
            {LEVEL_LIST.map(l => <SelectItem key={l} value={l}>{l}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Report Groups */}
      {reportGroups.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            <p>暂无问题数据</p>
            <p className="text-xs mt-1">生成报告后，不合格检查项和食谱功能问题将自动汇总到此处</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 xl:grid-cols-2">
          {reportGroups.map((group) => (
            <Card key={group.report_id} className="overflow-hidden transition-colors hover:border-primary/30">
              <CardHeader className="border-b bg-muted/20 pb-3 cursor-pointer" onClick={() => setSelectedGroup(selectedGroup?.report_id === group.report_id ? null : group)}>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium">{group.report_title}</CardTitle>
                  <Badge variant="secondary" className="text-xs">{group.issues.length}个问题</Badge>
                </div>
              </CardHeader>
              {(selectedGroup?.report_id === group.report_id || reportGroups.length <= 5) && (
                <CardContent className="pt-0 space-y-2">
                  {group.issues.map((issue) => (
                    <div key={issue.id}
                      className="group flex items-center gap-2 p-2 rounded-lg bg-background border cursor-pointer transition-colors hover:bg-muted/30 flex-wrap sm:flex-nowrap"
                      onClick={() => { setSelectedIssue(issue); setDetailOpen(true); }}>
                      <Badge className={cn('text-[10px] shrink-0', LEVEL_COLORS[issue.level || '二类'] || LEVEL_COLORS['二类'])}>{issue.level || '二类'}</Badge>
                      {issue.source_type === 'recipe_problem' && (
                        <Badge variant="outline" className="text-[10px] shrink-0">食谱/功能</Badge>
                      )}
                      <span className="text-sm flex-1 min-w-0 truncate">{issue.title}</span>
                      <div className="grid w-full shrink-0 grid-cols-4 gap-1 sm:flex sm:w-auto" onClick={(e) => e.stopPropagation()}>
                        {STATUS_LIST.map(s => (
                          <button key={s} onClick={() => handleStatusChange(issue.id, s)}
                            className={cn('min-h-8 rounded px-2 py-1.5 text-[11px] transition-colors sm:min-h-7 sm:flex-none sm:px-2 sm:py-1 lg:min-w-14',
                              issue.status === s ? STATUS_COLORS[s] + ' font-medium' : 'text-muted-foreground hover:bg-muted/50')}>
                            {s}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </CardContent>
              )}
            </Card>
          ))}
        </div>
      )}

      {/* Issue Detail Dialog */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className={cn(
          selectedIssue?.source_type === 'recipe_problem' ? 'max-w-2xl' : 'max-w-lg',
          'max-h-[85vh] overflow-y-auto'
        )}>
          <DialogHeader>
            <DialogTitle className="text-base break-all">{selectedIssue?.title}</DialogTitle>
          </DialogHeader>
          {selectedIssue && (
            <div className="space-y-4">
              {/* Level and Status - shared */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>问题点等级</Label>
                  <div className="flex gap-1">
                    {LEVEL_LIST.map(l => (
                      <button key={l} onClick={() => handleLevelChange(selectedIssue.id, l)}
                        className={cn('flex-1 px-2 py-1.5 rounded text-xs font-medium border transition-colors',
                          selectedIssue.level === l ? LEVEL_COLORS[l] + ' border-current' : 'bg-background border-border hover:bg-muted/50')}>
                        {l}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>整改状态</Label>
                  <div className="grid grid-cols-2 gap-1 sm:grid-cols-4">
                    {STATUS_LIST.map(s => (
                      <button key={s} onClick={() => handleStatusChange(selectedIssue.id, s)}
                        className={cn('min-h-9 rounded border px-2 py-1.5 text-xs font-medium transition-colors',
                          selectedIssue.status === s ? STATUS_COLORS[s] + ' border-current' : 'bg-background border-border hover:bg-muted/50')}>
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {selectedIssue.source && (
                <div className="text-xs text-muted-foreground bg-muted/30 p-2 rounded break-all">
                  来源: {selectedIssue.source}
                </div>
              )}

              {/* Five-sense experience type: original form */}
              {selectedIssue.source_type === 'record_fail' && (
                <>
                  <div className="space-y-1.5">
                    <Label>问题描述</Label>
                    <Textarea value={selectedIssue.description || ''} onChange={(e) => handleUpdateField(selectedIssue.id, 'description', e.target.value)} rows={3} />
                  </div>

                  <div className="space-y-1.5">
                    <Label>整改方案</Label>
                    <Textarea value={selectedIssue.improve_plan || ''} onChange={(e) => handleUpdateField(selectedIssue.id, 'improve_plan', e.target.value)} rows={2} placeholder="填写整改方案..." />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>责任人</Label>
                      <Input value={selectedIssue.responsible_person || ''} onChange={(e) => handleUpdateField(selectedIssue.id, 'responsible_person', e.target.value)} placeholder="责任人" />
                    </div>
                    <div className="space-y-1.5">
                      <Label>计划完成日期</Label>
                      <Input type="date" value={selectedIssue.plan_complete_date || ''} onChange={(e) => handleUpdateField(selectedIssue.id, 'plan_complete_date', e.target.value)} />
                    </div>
                  </div>

                  {selectedIssue.status === '已验证' && (
                    <div className="space-y-1.5">
                      <Label>验证说明</Label>
                      <Textarea value={selectedIssue.verification_note || ''} onChange={(e) => handleUpdateField(selectedIssue.id, 'verification_note', e.target.value)} rows={2} />
                    </div>
                  )}

                  {selectedIssue.status === '不整改' && (
                    <div className="space-y-1.5">
                      <Label>不整改原因</Label>
                      <Textarea value={selectedIssue.no_improve_reason || ''} onChange={(e) => handleUpdateField(selectedIssue.id, 'no_improve_reason', e.target.value)} rows={2} placeholder="说明不整改原因..." />
                    </div>
                  )}
                </>
              )}

              {/* Recipe/Function type: re-evaluation form */}
              {selectedIssue.source_type === 'recipe_problem' && (
                <>
                  {/* New re-evaluation entry (always at top) */}
                  <div className="border rounded-lg p-3 space-y-3 bg-primary/5">
                    <div className="flex items-center gap-2">
                      <Plus className="h-4 w-4 text-primary" />
                      <span className="text-sm font-medium">新增复评估</span>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">描述评价</Label>
                      <Textarea
                        value={newReEvalDescription}
                        onChange={(e) => setNewReEvalDescription(e.target.value)}
                        rows={3}
                        placeholder="输入复测效果描述..."
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">选择素材</Label>
                      <MaterialPicker
                        taskId={selectedIssue.task_id}
                        issueId={undefined}
                        selectedIds={newReEvalMaterialIds}
                        initialMaterials={newReEvalMaterials}
                        onSelectionChange={(ids, mats) => {
                          setNewReEvalMaterialIds(ids);
                          setNewReEvalMaterials(mats);
                        }}
                        selectedPreviewSize="sm"
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" onClick={handleSaveReEvaluation} disabled={savingReEval || (!newReEvalDescription && newReEvalMaterialIds.length === 0)}>
                        {savingReEval ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                        保存评价
                      </Button>
                    </div>
                  </div>

                  {/* History re-evaluations */}
                  {reEvaluations.length > 0 && (
                    <div className="space-y-3">
                      <div className="text-xs font-medium text-muted-foreground">复评估记录 ({reEvaluations.length})</div>
                      {reEvaluations.map((reEval, idx) => {
                        const roundLabel = idx === 0 ? '最新复测' : `第${reEvaluations.length - idx}次复测`;
                        const isEditing = editingReEvalId === reEval.id;
                        return (
                          <div key={reEval.id} className="border rounded-lg p-3 space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-medium text-muted-foreground">{roundLabel}</span>
                              <div className="flex items-center gap-1">
                                <span className="text-[10px] text-muted-foreground">
                                  {new Date(reEval.created_at).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}
                                </span>
                                {!isEditing && (
                                  <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => handleStartEditReEval(reEval)}>
                                    <Pencil className="h-3 w-3" />
                                  </Button>
                                )}
                              </div>
                            </div>
                            {isEditing ? (
                              <>
                                <Textarea
                                  value={editingReEvalDesc}
                                  onChange={(e) => setEditingReEvalDesc(e.target.value)}
                                  rows={2}
                                  placeholder="输入复测效果描述..."
                                  className="text-sm"
                                />
                                {reEval.ai_result && (
                                  <div className="space-y-1.5">
                                    <div className="flex items-center gap-2">
                                      <Input
                                        type="number"
                                        step="0.1"
                                        min="0"
                                        max="10"
                                        value={editingReEvalAiScore}
                                        onChange={(e) => setEditingReEvalAiScore(e.target.value)}
                                        className="h-7 w-20 text-sm font-bold"
                                      />
                                      <span className="text-xs text-muted-foreground">分</span>
                                    </div>
                                    <Textarea
                                      value={editingReEvalAiSummary}
                                      onChange={(e) => setEditingReEvalAiSummary(e.target.value)}
                                      rows={3}
                                      placeholder="AI总结内容..."
                                      className="text-xs"
                                    />
                                  </div>
                                )}
                                <div className="flex gap-2">
                                  <Button size="sm" onClick={() => handleSaveReEvalEdit(reEval.id)} disabled={savingReEvalEdit}>
                                    {savingReEvalEdit ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                                    保存
                                  </Button>
                                  <Button size="sm" variant="ghost" onClick={() => setEditingReEvalId(null)}>
                                    取消
                                  </Button>
                                </div>
                              </>
                            ) : (
                              <>
                                {reEval.description && (
                                  <div className="text-sm bg-muted/30 p-2 rounded break-all">{reEval.description}</div>
                                )}
                                {/* Materials */}
                                {reEval.materials && reEval.materials.length > 0 && (
                                  <div className="flex gap-2 flex-wrap">
                                    {reEval.materials.map((mat) => (
                                      <div key={mat.id} className="shrink-0">
                                        {mat.material_type === 'image' ? (
                                          <PresignedImage filePath={mat.file_path || mat.file_url} alt={mat.file_name} className="h-16 w-16 object-cover rounded border" />
                                        ) : (
                                          <div className="h-16 w-16 rounded border bg-muted/30 flex items-center justify-center">
                                            <span className="text-[10px] text-muted-foreground">视频</span>
                                          </div>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                )}
                                {/* AI Result */}
                                {reEval.ai_result && (
                                  <div className="bg-muted/20 rounded-lg p-2 space-y-1">
                                    <div className="flex items-center gap-2">
                                      <span className="text-sm font-bold text-primary">{reEval.ai_result.score}分</span>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-6 text-xs"
                                        disabled={aiEvaluating === reEval.id}
                                        onClick={() => handleAiEvaluate(reEval.id)}
                                      >
                                        {aiEvaluating === reEval.id ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Sparkles className="h-3 w-3 mr-1" />}
                                        重新AI评价
                                      </Button>
                                    </div>
                                    {reEval.ai_result.summary && (
                                      <p className="text-xs text-muted-foreground break-all">{reEval.ai_result.summary}</p>
                                    )}
                                  </div>
                                )}
                                {!reEval.ai_result && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-7 text-xs"
                                    disabled={aiEvaluating === reEval.id}
                                    onClick={() => handleAiEvaluate(reEval.id)}
                                  >
                                    {aiEvaluating === reEval.id ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Sparkles className="h-3 w-3 mr-1" />}
                                    AI总结
                                  </Button>
                                )}
                              </>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              )}

              {/* Fallback for unknown source type */}
              {selectedIssue.source_type !== 'record_fail' && selectedIssue.source_type !== 'recipe_problem' && (
                <>
                  <div className="space-y-1.5">
                    <Label>问题描述</Label>
                    <Textarea value={selectedIssue.description || ''} onChange={(e) => handleUpdateField(selectedIssue.id, 'description', e.target.value)} rows={3} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>整改方案</Label>
                    <Textarea value={selectedIssue.improve_plan || ''} onChange={(e) => handleUpdateField(selectedIssue.id, 'improve_plan', e.target.value)} rows={2} placeholder="填写整改方案..." />
                  </div>
                </>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
