'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  ClipboardList,
  AlertTriangle,
  CheckCircle2,
  Clock,
  TrendingUp,
  ArrowRight,
  CheckCircle,
  XCircle,
  UserPlus,
  KeyRound,
  Pencil,
  Shield,
  FileText,
} from 'lucide-react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth-context';
import { toast } from 'sonner';

interface DashboardData {
  taskStats: {
    total: number;
    pending: number;
    inProgress: number;
    review: number;
    completed: number;
    rejected: number;
  };
  issueStats: {
    total: number;
    pending: number;
    inProgress: number;
    verified: number;
    noImprove: number;
    bySeverity: {
      fatal: number;
      serious: number;
      normal: number;
      minor: number;
    };
  };
  recentTasks: Array<{
    id: string;
    task_name: string;
    product_model: string;
    status: string;
    created_at: string;
  }>;
}

interface AuditRequest {
  id: string;
  user_id: string;
  request_type: string;
  status: string;
  old_value: string | null;
  new_value: string | null;
  target_user_id: string | null;
  created_at: string;
  user_account?: string;
  user_name?: string;
  user_role?: string;
  target_user_account?: string;
  target_user_name?: string;
}

const taskStatusMap: Record<string, { label: string; color: string }> = {
  '待执行': { label: '待执行', color: 'bg-muted text-muted-foreground' },
  '进行中': { label: '进行中', color: 'bg-primary/10 text-primary' },
  '待审核': { label: '待审核', color: 'bg-amber-100 text-amber-700' },
  '已完成': { label: '已完成', color: 'bg-emerald-100 text-emerald-700' },
  '已驳回': { label: '已驳回', color: 'bg-destructive/10 text-destructive' },
};

const requestTypeConfig: Record<string, { label: string; icon: typeof UserPlus; color: string }> = {
  register: { label: '账号注册', icon: UserPlus, color: 'text-primary' },
  password_reset: { label: '密码重置', icon: KeyRound, color: 'text-amber-600' },
  password_change: { label: '密码修改', icon: KeyRound, color: 'text-amber-600' },
  name_change: { label: '名称修改', icon: Pencil, color: 'text-blue-600' },
  role_upgrade: { label: '角色升级', icon: Shield, color: 'text-emerald-600' },
};

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const { user, isAdmin } = useAuth();

  // Audit states (admin)
  const [auditOpen, setAuditOpen] = useState(false);
  const [auditRequests, setAuditRequests] = useState<AuditRequest[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [actioningId, setActioningId] = useState<string | null>(null);

  // My requests states (non-admin)
  const [myRequestsOpen, setMyRequestsOpen] = useState(false);
  const [myRequests, setMyRequests] = useState<AuditRequest[]>([]);
  const [myRequestsLoading, setMyRequestsLoading] = useState(false);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const fetchAuditRequests = useCallback(async () => {
    if (!user?.id) return;
    setAuditLoading(true);
    try {
      const res = await fetch(`/api/auth/audit?admin_user_id=${user.id}`);
      const data = await res.json();
      if (data.code === 0) {
        setAuditRequests(data.data || []);
      }
    } catch {
      // silently fail
    } finally {
      setAuditLoading(false);
    }
  }, [user?.id]);

  const fetchMyRequests = useCallback(async () => {
    if (!user?.id) return;
    setMyRequestsLoading(true);
    try {
      const res = await fetch(`/api/auth/audit?user_id=${user.id}`);
      const data = await res.json();
      if (data.code === 0) {
        // Filter: exclude register type, only show pending
        const filtered = (data.data || []).filter(
          (r: AuditRequest) => r.request_type !== 'register' && r.status === 'pending'
        );
        setMyRequests(filtered);
      }
    } catch {
      // silently fail
    } finally {
      setMyRequestsLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    const params = new URLSearchParams();
    // Admin sees all data; non-admin sees only own data
    if (user?.id && !isAdmin) params.set('created_by', user.id);
    fetch(`/api/dashboard?${params.toString()}`)
      .then((r) => r.json())
      .then((res) => {
        if (res.code === 0) setData(res.data);
      })
      .finally(() => setLoading(false));
  }, [user?.id, isAdmin]);

  useEffect(() => {
    if (auditOpen && isAdmin) {
      fetchAuditRequests();
    }
  }, [auditOpen, isAdmin, fetchAuditRequests]);

  useEffect(() => {
    if (myRequestsOpen && !isAdmin) {
      fetchMyRequests();
    }
  }, [myRequestsOpen, isAdmin, fetchMyRequests]);

  // Prefetch my requests count for non-admin users on mount
  useEffect(() => {
    if (!isAdmin && user?.id) {
      fetchMyRequests();
    }
  }, [isAdmin, user?.id, fetchMyRequests]);

  const handleAuditAction = async (requestId: string, action: 'approve' | 'reject') => {
    if (!user?.id) return;
    setActioningId(requestId);
    try {
      const res = await fetch('/api/auth/audit', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ request_id: requestId, admin_user_id: user.id, action }),
      });
      const data = await res.json();
      if (data.code === 0) {
        toast.success(data.message);
        fetchAuditRequests();
      } else {
        toast.error(data.message);
      }
    } finally {
      setActioningId(null);
    }
  };

  const handleCancelRequest = async (requestId: string) => {
    if (!user?.id) return;
    setCancellingId(requestId);
    try {
      const res = await fetch('/api/auth/audit', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ request_id: requestId, user_id: user.id, action: 'cancel' }),
      });
      const data = await res.json();
      if (data.code === 0) {
        toast.success('已取消申请');
        fetchMyRequests();
      } else {
        toast.error(data.message);
      }
    } finally {
      setCancellingId(null);
    }
  };

  // Group audit requests by type (admin)
  const groupedRequests = auditRequests.reduce((acc, req) => {
    const type = req.request_type;
    if (!acc[type]) acc[type] = [];
    acc[type].push(req);
    return acc;
  }, {} as Record<string, AuditRequest[]>);

  // Type order: register first, then password changes, then name changes
  const typeOrder = ['register', 'password_reset', 'password_change', 'name_change', 'role_upgrade'];
  const sortedTypes = Object.keys(groupedRequests).sort((a, b) => typeOrder.indexOf(a) - typeOrder.indexOf(b));

  if (loading) {
    return (
      <div className="p-4 lg:p-6 space-y-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-muted rounded w-48" />
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-28 bg-muted rounded-lg" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!data) return <div className="p-6">加载失败</div>;

  const statCards = [
    {
      label: '体验任务',
      value: data.taskStats.total,
      icon: ClipboardList,
      sub: `${data.taskStats.inProgress} 进行中`,
      color: 'text-primary',
      bg: 'bg-primary/10',
    },
    {
      label: '问题总数',
      value: data.issueStats.total,
      icon: AlertTriangle,
      sub: `${data.issueStats.pending} 待整改`,
      color: 'text-amber-600',
      bg: 'bg-amber-100',
    },
    {
      label: '已完成任务',
      value: data.taskStats.completed,
      icon: CheckCircle2,
      sub: `${data.taskStats.total > 0 ? Math.round((data.taskStats.completed / data.taskStats.total) * 100) : 0}% 完成率`,
      color: 'text-emerald-600',
      bg: 'bg-emerald-100',
    },
    {
      label: isAdmin ? '待审核' : '待申请',
      value: isAdmin ? auditRequests.length : myRequests.length,
      icon: isAdmin ? Shield : FileText,
      sub: isAdmin ? '账号审核' : `${myRequests.length} 条待审核`,
      color: isAdmin ? 'text-primary' : 'text-blue-600',
      bg: isAdmin ? 'bg-primary/10' : 'bg-blue-100',
      onClick: isAdmin ? () => setAuditOpen(true) : () => setMyRequestsOpen(true),
    },
  ];

  return (
    <div className="p-4 lg:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl lg:text-2xl font-semibold">工作台</h1>
          <p className="text-sm text-muted-foreground mt-1">产品体验管理平台概览</p>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
        {statCards.map((card) => (
          <Card
            key={card.label}
            className={cn('relative overflow-hidden', card.onClick && 'cursor-pointer hover:shadow-md transition-shadow')}
            onClick={card.onClick}
          >
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">{card.label}</p>
                  <p className="text-2xl lg:text-3xl font-bold mt-1">{card.value}</p>
                  <p className="text-xs text-muted-foreground mt-1">{card.sub}</p>
                </div>
                <div className={cn('rounded-lg p-2', card.bg)}>
                  <card.icon className={cn('h-4 w-4', card.color)} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-4 lg:gap-6">
        {/* Issue Severity */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
              问题等级分布
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {[
              { label: '一类', value: data.issueStats.bySeverity.fatal, color: 'bg-red-500' },
              { label: '二类', value: data.issueStats.bySeverity.serious, color: 'bg-amber-500' },
              { label: '三类', value: data.issueStats.bySeverity.normal, color: 'bg-blue-500' },
              { label: '轻微', value: data.issueStats.bySeverity.minor, color: 'bg-emerald-500' },
            ].map((item) => (
              <div key={item.label} className="flex items-center gap-3">
                <div className={cn('w-2 h-2 rounded-full', item.color)} />
                <span className="text-sm flex-1">{item.label}</span>
                <span className="text-sm font-medium">{item.value}</span>
                <div className="w-20 h-1.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className={cn('h-full rounded-full', item.color)}
                    style={{
                      width: data.issueStats.total > 0 ? `${(item.value / data.issueStats.total) * 100}%` : '0%',
                    }}
                  />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Recent Tasks */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium">最近任务</CardTitle>
              <Link
                href="/tasks"
                className="text-xs text-primary hover:underline flex items-center gap-1"
              >
                查看全部 <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {data.recentTasks.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">
                暂无任务，点击
                <Link href="/tasks" className="text-primary hover:underline mx-1">创建任务</Link>
                开始体验
              </div>
            ) : (
              <div className="space-y-2">
                {data.recentTasks.map((task) => (
                  <Link
                    key={task.id}
                    href={`/tasks/${task.id}`}
                    className="flex items-center justify-between p-3 rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{task.task_name}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{task.product_model}</p>
                    </div>
                    <Badge
                      variant="secondary"
                      className={cn('text-[10px] shrink-0 ml-2', taskStatusMap[task.status]?.color)}
                    >
                      {taskStatusMap[task.status]?.label || task.status}
                    </Badge>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Audit Dialog (Admin only) */}
      <Dialog open={auditOpen} onOpenChange={setAuditOpen}>
        <DialogContent className="max-w-lg max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" />
              账号审核
            </DialogTitle>
            <DialogDescription>审核账号注册、密码修改、名称修改等申请</DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh]">
            {auditLoading ? (
              <div className="text-center py-10 text-muted-foreground text-sm">加载中...</div>
            ) : auditRequests.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground text-sm">暂无待审核请求</div>
            ) : (
              <div className="space-y-5">
                {sortedTypes.map((type) => {
                  const config = requestTypeConfig[type] || { label: type, icon: Shield, color: 'text-muted-foreground' };
                  const requests = groupedRequests[type];
                  return (
                    <div key={type}>
                      {/* Section header */}
                      <div className="flex items-center gap-2 mb-3">
                        <config.icon className={cn('h-4 w-4', config.color)} />
                        <span className="text-sm font-semibold">{config.label}</span>
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">{requests.length}</Badge>
                      </div>
                      {/* Request items */}
                      <div className="space-y-2">
                        {requests.map((req) => (
                          <div key={req.id} className="border rounded-lg p-3 flex items-center gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium">{req.user_name || req.user_account}</div>
                              <div className="text-xs text-muted-foreground mt-0.5 space-x-2">
                                <span>账号: {req.user_account}</span>
                                {req.request_type === 'name_change' && (
                                  <>
                                    <span>原名称: {req.old_value}</span>
                                    <span>→ 新名称: {req.new_value}</span>
                                  </>
                                )}
                                {req.request_type === 'register' && (() => {
                                  try {
                                    const v = JSON.parse(req.new_value || '{}');
                                    return <span>名称: {v.name || '-'}</span>;
                                  } catch { return null; }
                                })()}
                              </div>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                                onClick={() => handleAuditAction(req.id, 'approve')}
                                disabled={actioningId === req.id}
                              >
                                <CheckCircle className="h-5 w-5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-destructive hover:text-red-700 hover:bg-red-50"
                                onClick={() => handleAuditAction(req.id, 'reject')}
                                disabled={actioningId === req.id}
                              >
                                <XCircle className="h-5 w-5" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                      <Separator className="mt-4" />
                    </div>
                  );
                })}
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* My Requests Dialog (Non-admin only) */}
      <Dialog open={myRequestsOpen} onOpenChange={setMyRequestsOpen}>
        <DialogContent className="max-w-lg max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-blue-600" />
              我的申请
            </DialogTitle>
            <DialogDescription>查看并管理您的待审核申请</DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh]">
            {myRequestsLoading ? (
              <div className="text-center py-10 text-muted-foreground text-sm">加载中...</div>
            ) : myRequests.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground text-sm">暂无待审核申请</div>
            ) : (
              <div className="space-y-2">
                {myRequests.map((req) => {
                  const config = requestTypeConfig[req.request_type] || { label: req.request_type, icon: FileText, color: 'text-muted-foreground' };
                  return (
                    <div key={req.id} className="border rounded-lg p-3 flex items-center gap-3">
                      <div className={cn('rounded-lg p-2 bg-muted', config.color)}>
                        <config.icon className="h-4 w-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium">{config.label}</div>
                        <div className="text-xs text-muted-foreground mt-0.5 space-x-2">
                          {req.request_type === 'name_change' && (
                            <>
                              <span>原名称: {req.old_value}</span>
                              <span>→ 新名称: {req.new_value}</span>
                            </>
                          )}
                          {(req.request_type === 'password_reset' || req.request_type === 'password_change') && (
                            <span>新密码已填写</span>
                          )}
                          <span>{new Date(req.created_at).toLocaleDateString()}</span>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-red-700 hover:bg-red-50 shrink-0"
                        onClick={() => handleCancelRequest(req.id)}
                        disabled={cancellingId === req.id}
                      >
                        <XCircle className="h-5 w-5" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}
