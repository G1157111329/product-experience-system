'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth-context';

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
  '整改中': 'bg-orange-100 text-orange-800 dark:bg-orange-950/30 dark:text-orange-300',
  '已验证': 'bg-lime-100 text-lime-800 dark:bg-lime-950/30 dark:text-lime-300',
  '不整改': 'bg-muted text-muted-foreground',
};
const LEVEL_COLORS: Record<string, string> = {
  '一类': 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  '二类': 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  '三类': 'bg-slate-100 text-slate-600 dark:bg-slate-800/30 dark:text-slate-400',
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

  // Fetch current user's task IDs (for non-admin filtering)
  useEffect(() => {
    if (user?.id && !isAdmin) {
      fetch(`/api/tasks?created_by=${user.id}&pageSize=200`)
        .then(r => r.json())
        .then(data => {
          if (data.code === 0) {
            const taskIds = (data.data?.list || []).map((t: { id: string }) => t.id);
            setUserTaskIds(taskIds);
          }
        });
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
    const res = await fetch(`/api/issues?${params}`);
    const data = await res.json();
    if (data.code === 0) {
      const raw = data.data;
      setIssues(Array.isArray(raw) ? raw : (raw?.list || []));
    }
  }, [isAdmin, userTaskIds]);

  const fetchReports = useCallback(async () => {
    const reportsRes = await fetch('/api/reports?limit=200');
    const data = await reportsRes.json();
    if (data.code === 0) {
      const raw = data.data;
      setReports(Array.isArray(raw) ? raw : (raw?.list || []));
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

  const totalIssues = issues.length;
  const pendingCount = issues.filter(i => i.status === '待整改').length;
  const inProgressCount = issues.filter(i => i.status === '整改中').length;
  const verifiedCount = issues.filter(i => i.status === '已验证').length;

  return (
    <div className="p-4 lg:p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">问题管理</h1>
          <p className="text-sm text-muted-foreground mt-1">不合格检查项与食谱功能问题汇总</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: '问题总数', value: totalIssues, color: '' },
          { label: '待整改', value: pendingCount, color: 'text-amber-600' },
          { label: '整改中', value: inProgressCount, color: 'text-blue-600' },
          { label: '已验证', value: verifiedCount, color: 'text-emerald-600' },
        ].map((stat) => (
          <Card key={stat.label}>
            <CardContent className="p-4 text-center">
              <p className={cn('text-2xl font-bold', stat.color)}>{stat.value}</p>
              <p className="text-xs text-muted-foreground mt-1">{stat.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-28"><SelectValue placeholder="状态" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部状态</SelectItem>
            {STATUS_LIST.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterLevel} onValueChange={setFilterLevel}>
          <SelectTrigger className="w-28"><SelectValue placeholder="等级" /></SelectTrigger>
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
        <div className="space-y-3">
          {reportGroups.map((group) => (
            <Card key={group.report_id} className="overflow-hidden">
              <CardHeader className="pb-2 cursor-pointer" onClick={() => setSelectedGroup(selectedGroup?.report_id === group.report_id ? null : group)}>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium">{group.report_title}</CardTitle>
                  <Badge variant="secondary" className="text-xs">{group.issues.length}个问题</Badge>
                </div>
              </CardHeader>
              {(selectedGroup?.report_id === group.report_id || reportGroups.length <= 5) && (
                <CardContent className="pt-0 space-y-2">
                  {group.issues.map((issue) => (
                    <div key={issue.id}
                      className="flex items-center gap-2 p-2 rounded-lg bg-background border cursor-pointer hover:bg-muted/30"
                      onClick={() => { setSelectedIssue(issue); setDetailOpen(true); }}>
                      <Badge className={cn('text-[10px] shrink-0', LEVEL_COLORS[issue.level || '二类'] || LEVEL_COLORS['二类'])}>{issue.level || '二类'}</Badge>
                      {issue.source_type === 'recipe_problem' && (
                        <Badge variant="outline" className="text-[10px] shrink-0">食谱/功能</Badge>
                      )}
                      <span className="text-sm flex-1 truncate">{issue.title}</span>
                      <div className="flex gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                        {STATUS_LIST.map(s => (
                          <button key={s} onClick={() => handleStatusChange(issue.id, s)}
                            className={cn('px-1.5 py-0.5 rounded text-[10px] transition-colors',
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
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base break-all">{selectedIssue?.title}</DialogTitle>
          </DialogHeader>
          {selectedIssue && (
            <div className="space-y-4">
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
                  <div className="flex gap-1">
                    {STATUS_LIST.map(s => (
                      <button key={s} onClick={() => handleStatusChange(selectedIssue.id, s)}
                        className={cn('flex-1 px-1 py-1.5 rounded text-[10px] font-medium border transition-colors',
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
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
