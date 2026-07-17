'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth-context';
import {
  getIssueStatusPresentation,
  toStoredIssueStatus,
} from '@/lib/server/issue-state-machine';
import { PageShell, pageActionButtonClass, pageFilterSelectClass } from '@/components/app';
import { fetchJson, getErrorMessage } from '@/lib/http';
import { toast } from 'sonner';
import { IssueRectificationDialog } from '@/components/issues/issue-rectification-dialog';

interface TaskContext {
  id: string;
  task_name: string;
  project_number: string | null;
  product_model: string | null;
}

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
  task_id: string; task: TaskContext | null; created_at: string; updated_at: string;
  [key: string]: unknown;
}

interface ReportGroup {
  report_id: string;
  report_title: string;
  created_at: string;
  issues: Issue[];
}

function issueGroupMeta(issue: Issue): Pick<ReportGroup, 'report_id' | 'report_title'> {
  if (issue.source_report_id) {
    return {
      report_id: issue.source_report_id,
      report_title: issue.source?.split(' - ')[0] || '报告问题',
    };
  }
  if (!issue.task) {
    return { report_id: `unattributed:${issue.id}`, report_title: '未关联项目/任务的问题' };
  }
  const taskContext = `项目：${issue.task.project_number || issue.task.product_model || '未命名项目'} · 任务：${issue.task.task_name}`;
  if (issue.source_type === 'recipe_problem') {
    return { report_id: `unreported-recipe:${issue.task.id}`, report_title: `食谱/功能问题（未归档报告） · ${taskContext}` };
  }
  if (issue.source_type === 'record_fail') {
    return { report_id: `unreported-record:${issue.task.id}`, report_title: `五感体验问题（未归档报告） · ${taskContext}` };
  }
  return { report_id: `unreported-other:${issue.task.id}`, report_title: `其他未关联报告问题 · ${taskContext}` };
}

const LEVEL_COLORS: Record<string, string> = {
  '一类': 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400',
  '二类': 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400',
  '三类': 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400',
};

export default function IssuesPage() {
  const statusList = ['待整改', '整改中', '整改完成', '不整改'];
  const levelList = ['一类', '二类', '三类'];
  const [issues, setIssues] = useState<Issue[]>([]);
  const [reportGroups, setReportGroups] = useState<ReportGroup[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<ReportGroup | null>(null);
  const [selectedIssue, setSelectedIssue] = useState<Issue | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterLevel, setFilterLevel] = useState('all');
  const { isAdmin } = useAuth();

  const fetchIssues = useCallback(async () => {
    const params = new URLSearchParams({ canonical: '1', limit: '500' });
    try {
      const data = await fetchJson<{ code: number; data?: Issue[] | { list?: Issue[] }; message?: string }>(`/api/issues?${params}`);
      if (data.code === 0) {
        const raw = data.data;
        setIssues(Array.isArray(raw) ? raw : (raw?.list || []));
      }
    } catch (error) {
      toast.error(getErrorMessage(error, '问题列表加载失败'));
    }
  }, []);

  useEffect(() => {
    fetchIssues();
  }, [fetchIssues]);

  // Group issues by source_report_id with status/level filters
  useEffect(() => {
      const filtered = issues.filter(i => {
        if (!i.task_id) return false;
      if (filterStatus !== 'all' && getIssueStatusPresentation(i.status).label !== filterStatus) return false;
      if (filterLevel !== 'all' && i.level !== filterLevel) return false;
      return true;
    });
    const groups: Record<string, ReportGroup> = {};
    for (const issue of filtered) {
      const groupMeta = issueGroupMeta(issue);
      const key = groupMeta.report_id;
      if (!groups[key]) {
        groups[key] = {
          report_id: key,
          report_title: groupMeta.report_title,
          created_at: issue.created_at,
          issues: [],
        };
      }
      groups[key].issues.push(issue);
    }
    setReportGroups(Object.values(groups).sort((a, b) => b.created_at.localeCompare(a.created_at)));
  }, [issues, filterStatus, filterLevel]);

  const handleStatusChange = async (issueId: string, newStatus: string, transition?: string) => {
    const body: Record<string, unknown> = { status: newStatus };
    if (transition) body.transition = transition;
    const res = await fetch(`/api/issues/${issueId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (data.code === 0) {
      const storedStatus = toStoredIssueStatus(newStatus);
      setIssues(prev => prev.map(i => i.id === issueId ? { ...i, status: storedStatus } : i));
      if (selectedIssue?.id === issueId) setSelectedIssue(prev => prev ? { ...prev, status: storedStatus } : prev);
    }
  };

  const handleStatusAction = async (issue: Issue, label: '待整改' | '整改中' | '不整改' | '整改完成') => {
    await handleStatusChange(issue.id, label);
    if (label === '整改中' || label === '不整改') {
      setSelectedIssue({ ...issue, status: toStoredIssueStatus(label), is_improve: label === '整改中' });
      setDetailOpen(true);
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
      const params = new URLSearchParams({ limit: '2000' });
      if (filterStatus !== 'all') params.set('status', filterStatus);
      if (filterLevel !== 'all') params.set('level', filterLevel);
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

  const totalIssues = issues.length;
  const issueStatusKeys = issues.map((issue) => getIssueStatusPresentation(issue.status).key);
  const pendingCount = issueStatusKeys.filter((status) => status === 'pending').length;
  const inProgressCount = issueStatusKeys.filter((status) => status === 'rectifying').length;
  const verifiedCount = issueStatusKeys.filter((status) => status === 'rectified').length;
  const waivedCount = issueStatusKeys.filter((status) => status === 'waived').length;

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
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {[
          { label: '问题总数', value: totalIssues, color: '' },
          { label: '待整改', value: pendingCount, color: 'text-foreground' },
          { label: '整改中', value: inProgressCount, color: 'text-amber-600' },
          { label: '不整改', value: waivedCount, color: 'text-muted-foreground' },
          { label: '整改完成', value: verifiedCount, color: 'text-emerald-600' },
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
            {statusList.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterLevel} onValueChange={setFilterLevel}>
          <SelectTrigger className={pageFilterSelectClass}><SelectValue placeholder="等级" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部等级</SelectItem>
            {levelList.map(l => <SelectItem key={l} value={l}>{l}</SelectItem>)}
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
              <CardHeader
                role="button"
                tabIndex={0}
                aria-expanded={selectedGroup?.report_id === group.report_id || reportGroups.length <= 5}
                className="cursor-pointer border-b bg-muted/20 pb-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => setSelectedGroup(selectedGroup?.report_id === group.report_id ? null : group)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    setSelectedGroup(selectedGroup?.report_id === group.report_id ? null : group);
                  }
                }}
              >
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium">{group.report_title}</CardTitle>
                  <Badge variant="secondary" className="text-xs">{group.issues.length}个问题</Badge>
                </div>
              </CardHeader>
              {(selectedGroup?.report_id === group.report_id || reportGroups.length <= 5) && (
                <CardContent className="pt-0 space-y-2">
                  {group.issues.map((issue) => (
                    <div key={issue.id}
                      role="row"
                      tabIndex={0}
                      className="group flex items-center gap-2 p-2 rounded-lg bg-background border cursor-pointer transition-colors hover:bg-muted/30 flex-wrap sm:flex-nowrap"
                      onClick={() => { setSelectedIssue(issue); setDetailOpen(true); }}
                      onKeyDown={(event) => {
                        if (event.target !== event.currentTarget) return;
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          setSelectedIssue(issue);
                          setDetailOpen(true);
                        }
                      }}>
                      <Badge className={cn('text-xs shrink-0', LEVEL_COLORS[issue.level || '二类'] || LEVEL_COLORS['二类'])}>{issue.level || '二类'}</Badge>
                      <Badge variant="outline" className="text-xs shrink-0">{
                        issue.source_kind === 'comparison' ? '对比矩阵'
                          : issue.source_kind === 'matrix' ? '数据矩阵'
                            : issue.source_kind === 'sensory' ? '五感体验'
                              : '食谱/功能'
                      }</Badge>
                      <span className="text-sm flex-1 min-w-0 truncate">{issue.title}</span>
                      <div className="flex w-full shrink-0 flex-wrap gap-1 sm:w-auto" onClick={(e) => e.stopPropagation()}>
                        {(['待整改', '整改中', '整改完成', '不整改'] as const).map((label) => {
                          const current = getIssueStatusPresentation(issue.status);
                          const candidate = getIssueStatusPresentation(label);
                          return (
                            <button
                              key={label}
                              onClick={() => void handleStatusAction(issue, label)}
                              aria-pressed={current.key === candidate.key}
                              className={cn(
                                'min-h-11 rounded px-2 py-1.5 text-xs transition-colors sm:flex-none sm:px-2 sm:py-1 lg:min-w-14',
                                candidate.className,
                                current.key === candidate.key
                                  ? 'font-semibold underline underline-offset-2'
                                  : 'opacity-60 hover:bg-muted/50 hover:opacity-100',
                              )}
                            >
                              {label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </CardContent>
              )}
            </Card>
          ))}
        </div>
      )}

      {/* Issue Rectification Dialog (reusable) */}
      <IssueRectificationDialog
        issue={selectedIssue}
        open={detailOpen}
        onOpenChange={(v) => { setDetailOpen(v); if (!v) setSelectedIssue(null); }}
        onSaved={(updated) => {
          setIssues(prev => prev.map(i => i.id === updated.id ? { ...i, ...updated } as Issue : i));
        }}
      />
    </PageShell>
  );
}
