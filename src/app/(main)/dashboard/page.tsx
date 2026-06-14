'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { AlertTriangle, CheckCircle2, ClipboardList, Clock, Plus, Shield, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useAuth } from '@/lib/auth-context';
import { toast } from 'sonner';
import {
  EmptyState,
  EntityListItem,
  LoadingState,
  MetricCard,
  PageHeader,
  PageShell,
  StatusBadge,
} from '@/components/app';

interface DashboardData {
  totalTasks: number;
  completedTasks: number;
  totalIssues: number;
  resolvedIssues: number;
  recentTasks: Array<{
    id: string;
    task_name: string;
    status: string;
    created_at: string;
    product_category?: string;
    product?: string;
  }>;
  recentIssues: Array<{ id: string; title: string; status: string; level: string; created_at: string }>;
  pendingAudits?: Array<{
    id: string;
    request_type: string;
    status: string;
    created_at: string;
    user_name?: string;
    user_account?: string;
  }>;
}

const emptyDashboard: DashboardData = {
  totalTasks: 0,
  completedTasks: 0,
  totalIssues: 0,
  resolvedIssues: 0,
  recentTasks: [],
  recentIssues: [],
};

function formatDate(date: string) {
  return new Date(date).toLocaleDateString('zh-CN');
}

export default function DashboardPage() {
  const { user, isAdmin } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [auditDialogOpen, setAuditDialogOpen] = useState(false);
  const [pendingRequests, setPendingRequests] = useState<DashboardData['pendingAudits']>([]);
  const [cancelId, setCancelId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/dashboard');
      const d = await res.json();
      setData(d.code === 0 ? d.data : emptyDashboard);
    } catch {
      setData(emptyDashboard);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (!user?.id) return;

    fetch('/api/auth/audit')
      .then((r) => r.json())
      .then((d) => {
        if (d.code !== 0) return;
        const list = d.data || [];
        setPendingRequests(
          isAdmin
            ? list.filter((a: { status: string }) => a.status === 'pending')
            : list.filter(
                (a: { status: string; request_type: string }) =>
                  a.status === 'pending' && a.request_type !== 'register'
              )
        );
      })
      .catch(() => {});
  }, [user?.id, isAdmin]);

  const handleAudit = async (id: string, action: 'approve' | 'reject') => {
    const res = await fetch('/api/auth/audit', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ request_id: id, action }),
    });
    const d = await res.json();
    if (d.code === 0) {
      toast.success(d.message);
      fetchData();
    } else {
      toast.error(d.message);
    }
    setPendingRequests((prev) => prev?.filter((p) => p?.id !== id) || []);
  };

  const handleCancel = async () => {
    if (!cancelId) return;
    const res = await fetch('/api/auth/audit', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ request_id: cancelId, action: 'cancel' }),
    });
    const d = await res.json();
    if (d.code === 0) {
      toast.success('已取消');
      setPendingRequests((prev) => prev?.filter((p) => p?.id !== cancelId) || []);
    } else {
      toast.error(d.message);
    }
    setCancelId(null);
  };

  if (loading || !data) {
    return (
      <PageShell>
        <LoadingState label="正在加载工作台" />
      </PageShell>
    );
  }

  const completionRate = data.totalTasks > 0 ? Math.round((data.completedTasks / data.totalTasks) * 100) : 0;
  const resolutionRate = data.totalIssues > 0 ? Math.round((data.resolvedIssues / data.totalIssues) * 100) : 0;
  const pendingCount = pendingRequests?.length ?? 0;

  return (
    <PageShell className="space-y-4 sm:space-y-6">
      <PageHeader
        title="工作台"
        description={isAdmin ? '管理视角' : `欢迎，${user?.name || user?.account}`}
        actions={
          pendingCount > 0 && (
            <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => setAuditDialogOpen(true)}>
              <Shield className="h-3.5 w-3.5" />
              {isAdmin ? `待审核(${pendingCount})` : `待申请(${pendingCount})`}
            </Button>
          )
        }
      />

      {pendingCount > 0 && (
        <Card className="border-primary/30 bg-primary/5 shadow-sm">
          <CardContent className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4">
            <div className="flex min-w-0 items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <Shield className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <div className="text-sm font-semibold text-foreground">
                  {isAdmin ? '有待审核请求需要处理' : '有待申请事项等待审核'}
                </div>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  {isAdmin ? `当前共有 ${pendingCount} 条注册或账号变更请求。` : `当前共有 ${pendingCount} 条账号申请正在处理中。`}
                </p>
              </div>
            </div>
            <Button size="sm" className="w-full gap-1.5 sm:w-auto" onClick={() => setAuditDialogOpen(true)}>
              <Shield className="h-3.5 w-3.5" />
              {isAdmin ? '处理审核' : '查看申请'}
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
        <MetricCard label="体验计划" value={data.totalTasks} icon={ClipboardList} />
        <MetricCard label="完成率" value={`${completionRate}%`} icon={CheckCircle2} tone="success" />
        <MetricCard label="问题总数" value={data.totalIssues} icon={AlertTriangle} tone="warning" />
        <MetricCard label="整改率" value={`${resolutionRate}%`} icon={Clock} tone="info" />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-3">
              <CardTitle className="text-sm font-semibold">最近体验计划</CardTitle>
              <div className="flex items-center gap-2">
                <Button asChild variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
                  <Link href="/tasks?create=1">
                    <Plus className="h-3.5 w-3.5" />
                    快速新建项目
                  </Link>
                </Button>
                <Link href="/tasks" className="text-xs text-primary hover:underline">
                  查看全部
                </Link>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {data.recentTasks.length === 0 ? (
              <EmptyState
                icon={ClipboardList}
                title="暂无体验计划"
                description="创建第一个体验计划后，最近任务会显示在这里。"
                className="border-0 shadow-none"
              />
            ) : (
              <div className="grid gap-2">
                {data.recentTasks.map((task) => (
                  <EntityListItem
                    key={task.id}
                    href={`/tasks/${task.id}`}
                    title={task.task_name}
                    description={formatDate(task.created_at)}
                    leading={
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                        <ClipboardList className="h-4 w-4 text-primary" />
                      </div>
                    }
                    meta={
                      <>
                        {task.product_category && (
                          <Badge variant="outline" className="max-w-[180px] text-[10px]">
                            <span className="truncate">
                              {task.product_category}
                              {task.product ? ` - ${task.product}` : ''}
                            </span>
                          </Badge>
                        )}
                        <StatusBadge kind="task" value={task.status} />
                      </>
                    }
                    className="border-0 shadow-none"
                  />
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-3">
              <CardTitle className="text-sm font-semibold">最近问题点</CardTitle>
              <Link href="/issues" className="text-xs text-primary hover:underline">
                查看全部
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {data.recentIssues.length === 0 ? (
              <EmptyState
                icon={AlertTriangle}
                title="暂无问题点"
                description="报告生成后的问题点会自动汇总到这里。"
                className="border-0 shadow-none"
              />
            ) : (
              <div className="grid gap-2">
                {data.recentIssues.map((issue) => (
                  <EntityListItem
                    key={issue.id}
                    href={`/issues/${issue.id}`}
                    title={issue.title}
                    description={formatDate(issue.created_at)}
                    leading={
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-950/40">
                        <AlertTriangle className="h-4 w-4 text-amber-700 dark:text-amber-300" />
                      </div>
                    }
                    meta={<StatusBadge kind="issueLevel" value={issue.level} />}
                    className="border-0 shadow-none"
                  />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={auditDialogOpen} onOpenChange={setAuditDialogOpen}>
        <DialogContent className="max-h-[85vh] max-w-md">
          <DialogHeader>
            <DialogTitle>{isAdmin ? '待审核请求' : '待申请'}</DialogTitle>
            <DialogDescription>
              {isAdmin ? '审核用户注册、密码重置等请求' : '查看您的待审核申请'}
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh]">
            {pendingRequests && pendingRequests.length > 0 ? (
              <div className="space-y-2">
                {pendingRequests.map((req) => (
                  <div key={req.id} className="space-y-2 rounded-lg border p-3">
                    <div className="flex items-center justify-between gap-3">
                      <Badge variant="outline" className="text-[10px]">
                        {req.request_type}
                      </Badge>
                      <span className="text-[10px] text-muted-foreground">{formatDate(req.created_at)}</span>
                    </div>
                    {isAdmin && req.user_name && (
                      <div className="break-all text-sm">
                        {req.user_name} ({req.user_account})
                      </div>
                    )}
                    <div className="flex items-center gap-1.5">
                      {isAdmin ? (
                        <>
                          <Button size="sm" className="h-8 text-xs" onClick={() => handleAudit(req.id, 'approve')}>
                            通过
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 text-xs"
                            onClick={() => handleAudit(req.id, 'reject')}
                          >
                            拒绝
                          </Button>
                        </>
                      ) : (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 gap-1 text-xs text-destructive"
                          onClick={() => setCancelId(req.id)}
                        >
                          <X className="h-3 w-3" /> 取消申请
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="py-4 text-center text-sm text-muted-foreground">暂无待处理请求</p>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>

      <Dialog open={!!cancelId} onOpenChange={() => setCancelId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认取消</DialogTitle>
            <DialogDescription>确定要取消该申请吗？</DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-3 sm:gap-3">
            <Button variant="outline" onClick={() => setCancelId(null)}>
              返回
            </Button>
            <Button variant="destructive" onClick={handleCancel}>
              确认取消
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}

