'use client';

import { useState, useEffect, useCallback } from 'react';
import { ClipboardList, AlertTriangle, CheckCircle2, Clock, X, Loader2, Shield } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { useAuth } from '@/lib/auth-context';
import { toast } from 'sonner';
import Link from 'next/link';

interface DashboardData {
  totalTasks: number; completedTasks: number; totalIssues: number; resolvedIssues: number;
  recentTasks: Array<{ id: string; task_name: string; status: string; created_at: string; product_category?: string; product?: string }>;
  recentIssues: Array<{ id: string; title: string; status: string; level: string; created_at: string }>;
  pendingAudits?: Array<{ id: string; request_type: string; status: string; created_at: string; user_name?: string; user_account?: string }>;
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
      const params = new URLSearchParams();
      if (user?.id) params.set('created_by', user.id);
      const res = await fetch(`/api/dashboard?${params}`);
      const d = await res.json();
      if (d.code === 0) setData(d.data);
    } finally { setLoading(false); }
  }, [user?.id]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Fetch pending audits
  useEffect(() => {
    if (!user?.id) return;
    const params = new URLSearchParams();
    if (isAdmin) {
      params.set('admin_user_id', user.id);
    } else {
      params.set('user_id', user.id);
    }
    fetch(`/api/auth/audit?${params}`).then(r => r.json()).then(d => {
      if (d.code === 0) {
        const list = d.data || [];
        // Admin: show all pending; User: show own pending (exclude register type)
        setPendingRequests(isAdmin ? list.filter((a: { status: string }) => a.status === 'pending') : list.filter((a: { status: string; request_type: string }) => a.status === 'pending' && a.request_type !== 'register'));
      }
    }).catch(() => {});
  }, [user?.id, isAdmin]);

  const handleAudit = async (id: string, action: 'approve' | 'reject') => {
    const res = await fetch('/api/auth/audit', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ request_id: id, action, admin_user_id: user?.id }),
    });
    const d = await res.json();
    if (d.code === 0) { toast.success(d.message); fetchData(); } else toast.error(d.message);
    // Refresh pending list
    setPendingRequests(prev => prev?.filter(p => p?.id !== id) || []);
  };

  const handleCancel = async () => {
    if (!cancelId) return;
    const res = await fetch('/api/auth/audit', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ request_id: cancelId, action: 'cancel', user_id: user?.id }),
    });
    const d = await res.json();
    if (d.code === 0) { toast.success('已取消'); setPendingRequests(prev => prev?.filter(p => p?.id !== cancelId) || []); }
    else toast.error(d.message);
    setCancelId(null);
  };

  if (loading || !data) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }

  const completionRate = (data.totalTasks ?? 0) > 0 ? Math.round(((data.completedTasks ?? 0) / data.totalTasks) * 100) : 0;
  const resolutionRate = (data.totalIssues ?? 0) > 0 ? Math.round(((data.resolvedIssues ?? 0) / data.totalIssues) * 100) : 0;

  const stats = [
    { label: '体验计划', value: data.totalTasks ?? 0, icon: ClipboardList, color: 'text-primary', bg: 'bg-primary/10' },
    { label: '完成率', value: `${completionRate}%`, icon: CheckCircle2, color: 'text-emerald-600', bg: 'bg-emerald-50' },
    { label: '问题总数', value: data.totalIssues ?? 0, icon: AlertTriangle, color: 'text-amber-600', bg: 'bg-amber-50' },
    { label: '整改率', value: `${resolutionRate}%`, icon: Clock, color: 'text-blue-600', bg: 'bg-blue-50' },
  ];

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold">工作台</h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">{isAdmin ? '管理视角' : `欢迎，${user?.name || user?.account}`}</p>
        </div>
        {(isAdmin ? (pendingRequests?.length ?? 0) > 0 : (pendingRequests?.length ?? 0) > 0) && (
          <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => setAuditDialogOpen(true)}>
            <Shield className="h-3.5 w-3.5" />
            {isAdmin ? `待审核(${pendingRequests?.length ?? 0})` : `待申请(${pendingRequests?.length ?? 0})`}
          </Button>
        )}
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        {stats.map(s => (
          <Card key={s.label}>
            <CardContent className="py-3 sm:py-4 px-3 sm:px-4">
              <div className="flex items-center gap-2 sm:gap-3">
                <div className={`w-9 h-9 sm:w-10 sm:h-10 rounded-lg ${s.bg} flex items-center justify-center shrink-0`}>
                  <s.icon className={`h-4 w-4 sm:h-5 sm:w-5 ${s.color}`} />
                </div>
                <div className="min-w-0">
                  <div className="text-xl sm:text-2xl font-bold leading-tight">{s.value}</div>
                  <div className="text-[10px] sm:text-xs text-muted-foreground">{s.label}</div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Recent items */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        {/* Recent Tasks */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold">最近体验计划</CardTitle>
              <Link href="/tasks" className="text-xs text-primary hover:underline">查看全部</Link>
            </div>
          </CardHeader>
          <CardContent>
            {(data.recentTasks?.length ?? 0) === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">暂无体验计划</p>
            ) : (
              <div className="space-y-2">
                {(data.recentTasks ?? []).map(t => (
                  <Link key={t.id} href={`/tasks/${t.id}`} className="flex items-center gap-2 py-2 px-2 rounded-lg hover:bg-muted/50 transition-colors">
                    <ClipboardList className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{t.task_name}</div>
                      <div className="flex gap-1 mt-0.5 flex-wrap">
                        {t.product_category && <Badge variant="outline" className="text-[9px]">{t.product_category}{t.product ? ` - ${t.product}` : ''}</Badge>}
                        <span className="text-[10px] text-muted-foreground">{new Date(t.created_at).toLocaleDateString('zh-CN')}</span>
                      </div>
                    </div>
                    <Badge variant={t.status === '已完成' ? 'default' : 'secondary'} className="text-[10px] shrink-0">{t.status}</Badge>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Issues */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold">最近问题点</CardTitle>
              <Link href="/issues" className="text-xs text-primary hover:underline">查看全部</Link>
            </div>
          </CardHeader>
          <CardContent>
            {(data.recentIssues?.length ?? 0) === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">暂无问题点</p>
            ) : (
              <div className="space-y-2">
                {(data.recentIssues ?? []).map(i => (
                  <Link key={i.id} href={`/issues/${i.id}`} className="flex items-center gap-2 py-2 px-2 rounded-lg hover:bg-muted/50 transition-colors">
                    <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{i.title}</div>
                      <span className="text-[10px] text-muted-foreground">{new Date(i.created_at).toLocaleDateString('zh-CN')}</span>
                    </div>
                    <Badge variant={i.level === '一类' ? 'destructive' : i.level === '二类' ? 'secondary' : 'outline'} className="text-[10px] shrink-0">{i.level}</Badge>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Audit/Pending Dialog */}
      <Dialog open={auditDialogOpen} onOpenChange={setAuditDialogOpen}>
        <DialogContent className="max-w-md max-h-[85vh]">
          <DialogHeader>
            <DialogTitle>{isAdmin ? '待审核请求' : '待申请'}</DialogTitle>
            <DialogDescription>{isAdmin ? '审核用户注册、密码重置等请求' : '查看您的待审核申请'}</DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh]">
            {pendingRequests && pendingRequests.length > 0 ? (
              <div className="space-y-2">
                {pendingRequests.map(req => (
                  <div key={req.id} className="p-3 rounded-lg border space-y-2">
                    <div className="flex items-center justify-between">
                      <Badge variant="outline" className="text-[10px]">{req.request_type}</Badge>
                      <span className="text-[10px] text-muted-foreground">{new Date(req.created_at).toLocaleDateString('zh-CN')}</span>
                    </div>
                    {isAdmin && req.user_name && <div className="text-sm">{req.user_name} ({req.user_account})</div>}
                    <div className="flex items-center gap-1.5">
                      {isAdmin ? (
                        <>
                          <Button size="sm" variant="default" className="h-7 text-xs" onClick={() => handleAudit(req.id, 'approve')}>通过</Button>
                          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => handleAudit(req.id, 'reject')}>拒绝</Button>
                        </>
                      ) : (
                        <Button size="sm" variant="ghost" className="h-7 text-xs gap-1 text-destructive" onClick={() => setCancelId(req.id)}>
                          <X className="h-3 w-3" /> 取消申请
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">暂无待处理请求</p>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* Cancel confirm */}
      <Dialog open={!!cancelId} onOpenChange={() => setCancelId(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>确认取消</DialogTitle><DialogDescription>确定要取消该申请吗？</DialogDescription></DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setCancelId(null)}>返回</Button>
            <Button variant="destructive" onClick={handleCancel}>确认取消</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
