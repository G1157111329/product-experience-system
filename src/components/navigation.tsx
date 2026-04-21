'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect, useCallback } from 'react';
import {
  LayoutDashboard,
  BookOpen,
  ClipboardList,
  AlertTriangle,
  FileText,
  BarChart3,
  Menu,
  ChevronRight,
  User,
  LogOut,
  Shield,
  CheckCircle,
  XCircle,
  Key,
  Pencil,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from '@/components/ui/sheet';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useAuth } from '@/lib/auth-context';
import { toast } from 'sonner';

const navItems = [
  { href: '/dashboard', label: '工作台', icon: LayoutDashboard },
  { href: '/standards', label: '标准管理', icon: BookOpen },
  { href: '/tasks', label: '体验计划', icon: ClipboardList },
  { href: '/issues', label: '问题管理', icon: AlertTriangle },
  { href: '/reports', label: '报告中心', icon: FileText },
  { href: '/analysis', label: '数据分析', icon: BarChart3 },
];

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
  target_user_account?: string;
  target_user_name?: string;
}

function NavContent({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="px-4 py-5 border-b border-border">
        <Link href="/dashboard" className="flex items-center gap-2.5" onClick={onNavigate}>
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
            <span className="text-primary-foreground font-bold text-sm">EX</span>
          </div>
          <div className="flex flex-col">
            <span className="font-semibold text-sm leading-tight">产品体验</span>
            <span className="text-xs text-muted-foreground leading-tight">管理平台</span>
          </div>
        </Link>
      </div>

      {/* Navigation */}
      <ScrollArea className="flex-1 py-3">
        <nav className="px-2 space-y-0.5">
          {navItems.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavigate}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors',
                  isActive
                    ? 'bg-primary/10 text-primary font-medium'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                )}
              >
                <item.icon className="h-4 w-4 shrink-0" />
                <span>{item.label}</span>
                {isActive && <ChevronRight className="h-3 w-3 ml-auto opacity-50" />}
              </Link>
            );
          })}
        </nav>
      </ScrollArea>

      {/* Footer - User info */}
      <div className="px-4 py-3 border-t border-border">
        <UserSection />
      </div>
    </div>
  );
}

function UserSection() {
  const { user, isAdmin, logout } = useAuth();
  const [profileOpen, setProfileOpen] = useState(false);
  const [auditOpen, setAuditOpen] = useState(false);
  const [auditRequests, setAuditRequests] = useState<AuditRequest[]>([]);

  // Profile edit states
  const [editField, setEditField] = useState<'name' | 'password' | null>(null);
  const [editValue, setEditValue] = useState('');
  const [editLoading, setEditLoading] = useState(false);

  const [auditLoading, setAuditLoading] = useState(false);
  const [allUsers, setAllUsers] = useState<Array<{ id: string; account: string; name: string; role: string }>>([]);
  const [activeTab, setActiveTab] = useState<'audit' | 'users'>('audit');

  const fetchAuditRequests = useCallback(async () => {
    if (!user?.id) return;
    try {
      const res = await fetch(`/api/auth/audit?admin_user_id=${user.id}`);
      const data = await res.json();
      if (data.code === 0) {
        setAuditRequests(data.data || []);
      }
    } catch {
      // silently fail
    }
  }, [user?.id]);

  useEffect(() => {
    if (auditOpen && isAdmin) {
      fetchAuditRequests();
      // Also fetch all users for role management
      fetch(`/api/auth/users?admin_user_id=${user?.id}`)
        .then(res => res.json())
        .then(data => { if (data.code === 0) setAllUsers(data.data || []); })
        .catch(() => {});
    }
  }, [auditOpen, isAdmin, fetchAuditRequests]);

  const handleProfileEdit = async () => {
    if (!user?.id || !editField || !editValue) return;
    setEditLoading(true);
    try {
      const res = await fetch('/api/auth/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: user.id, field: editField, value: editValue }),
      });
      const data = await res.json();
      if (data.code === 0) {
        toast.success(data.message);
        setEditField(null);
        setEditValue('');
      } else {
        toast.error(data.message);
      }
    } finally {
      setEditLoading(false);
    }
  };

  const handleAuditAction = async (requestId: string, action: 'approve' | 'reject') => {
    if (!user?.id) return;
    setAuditLoading(true);
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
      setAuditLoading(false);
    }
  };

  const handleRoleChange = async (targetUserId: string, action: 'upgrade' | 'downgrade') => {
    if (!user?.id) return;
    setAuditLoading(true);
    try {
      const res = await fetch('/api/auth/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ admin_user_id: user.id, target_user_id: targetUserId, action }),
      });
      const data = await res.json();
      if (data.code === 0) {
        toast.success(data.message);
        // Refresh user list
        const usersRes = await fetch(`/api/auth/users?admin_user_id=${user.id}`);
        const usersData = await usersRes.json();
        if (usersData.code === 0) setAllUsers(usersData.data || []);
      } else {
        toast.error(data.message);
      }
    } finally {
      setAuditLoading(false);
    }
  };

  const getRequestTypeLabel = (type: string) => {
    const map: Record<string, string> = {
      register: '注册申请',
      password_reset: '密码重置',
      password_change: '密码修改',
      name_change: '名称修改',
      role_upgrade: '角色升级',
    };
    return map[type] || type;
  };

  const getRequestDescription = (req: AuditRequest) => {
    switch (req.request_type) {
      case 'register':
        return `账号: ${req.user_account}，名称: ${req.user_name || req.new_value ? JSON.parse(req.new_value || '{}').name : '-'}`;
      case 'password_reset':
      case 'password_change':
        return `账号: ${req.user_account}，请求重置/修改密码`;
      case 'name_change':
        return `账号: ${req.user_account}，「${req.old_value}」→「${req.new_value}」`;
      case 'role_upgrade':
        return `将「${req.target_user_name || req.target_user_account}」升级为管理账号`;
      default:
        return '';
    }
  };

  return (
    <>
      <div className="flex items-center gap-2">
        <button
          onClick={() => setProfileOpen(true)}
          className="flex items-center gap-2 flex-1 min-w-0 text-left hover:bg-muted rounded-lg px-2 py-1.5 transition-colors"
        >
          <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
            <User className="h-3.5 w-3.5 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-xs font-medium truncate">{user?.name || user?.account || '未登录'}</div>
            <div className="text-[10px] text-muted-foreground flex items-center gap-1">
              <span className="truncate">{user?.account}</span>
              {isAdmin && <Badge variant="secondary" className="text-[9px] px-1 py-0 h-3.5">管理</Badge>}
            </div>
          </div>
        </button>
        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={logout}>
          <LogOut className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Profile Dialog */}
      <Dialog open={profileOpen} onOpenChange={setProfileOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>个人信息</DialogTitle>
            <DialogDescription>查看和管理您的账号信息</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {/* Account (read-only) */}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">账号</Label>
              <div className="text-sm font-medium">{user?.account}</div>
            </div>

            {/* Name (editable) */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs text-muted-foreground">名称</Label>
                <Button variant="ghost" size="sm" className="h-6 text-xs gap-1" onClick={() => { setEditField('name'); setEditValue(user?.name || ''); }}>
                  <Pencil className="h-3 w-3" /> 修改
                </Button>
              </div>
              {editField === 'name' ? (
                <div className="flex gap-2">
                  <Input value={editValue} onChange={(e) => setEditValue(e.target.value)} placeholder="输入新名称" className="h-8 text-sm" />
                  <Button size="sm" className="h-8" onClick={handleProfileEdit} disabled={editLoading}>{editLoading ? '...' : '提交'}</Button>
                  <Button size="sm" variant="outline" className="h-8" onClick={() => { setEditField(null); setEditValue(''); }}>取消</Button>
                </div>
              ) : (
                <div className="text-sm font-medium">{user?.name || '-'}</div>
              )}
            </div>

            {/* Password (editable) */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs text-muted-foreground">密码</Label>
                <Button variant="ghost" size="sm" className="h-6 text-xs gap-1" onClick={() => { setEditField('password'); setEditValue(''); }}>
                  <Key className="h-3 w-3" /> 修改
                </Button>
              </div>
              {editField === 'password' ? (
                <div className="flex gap-2">
                  <Input type="password" value={editValue} onChange={(e) => setEditValue(e.target.value)} placeholder="输入新密码" className="h-8 text-sm" />
                  <Button size="sm" className="h-8" onClick={handleProfileEdit} disabled={editLoading}>{editLoading ? '...' : '提交'}</Button>
                  <Button size="sm" variant="outline" className="h-8" onClick={() => { setEditField(null); setEditValue(''); }}>取消</Button>
                </div>
              ) : (
                <div className="text-sm font-medium">••••••••</div>
              )}
            </div>

            <Separator />

            {/* Role info */}
            <div className="flex items-center gap-2">
              <Label className="text-xs text-muted-foreground">角色</Label>
              <Badge variant={isAdmin ? 'default' : 'secondary'} className="text-xs">
                {isAdmin ? '管理账号' : '使用账号'}
              </Badge>
            </div>

            {/* Admin: Audit button */}
            {isAdmin && (
              <>
                <Separator />
                <Button variant="outline" className="w-full gap-2" onClick={() => { setProfileOpen(false); setAuditOpen(true); }}>
                  <Shield className="h-4 w-4" />
                  审核管理
                  {auditRequests.length > 0 && (
                    <Badge variant="destructive" className="text-[10px] px-1.5 py-0 h-4 ml-1">{auditRequests.length}</Badge>
                  )}
                </Button>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Audit Dialog (Admin only) */}
      <Dialog open={auditOpen} onOpenChange={setAuditOpen}>
        <DialogContent className="max-w-lg max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>审核管理</DialogTitle>
            <DialogDescription>审核账号请求与权限管理</DialogDescription>
          </DialogHeader>
          {/* Tabs */}
          <div className="flex gap-1 border-b -mt-2">
            <button
              className={cn('px-3 py-2 text-sm font-medium transition-colors border-b-2 -mb-px', activeTab === 'audit' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground')}
              onClick={() => setActiveTab('audit')}
            >
              待审核 {auditRequests.length > 0 && <Badge variant="destructive" className="text-[9px] px-1 py-0 h-3.5 ml-1">{auditRequests.length}</Badge>}
            </button>
            <button
              className={cn('px-3 py-2 text-sm font-medium transition-colors border-b-2 -mb-px', activeTab === 'users' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground')}
              onClick={() => setActiveTab('users')}
            >
              账号权限
            </button>
          </div>
          <ScrollArea className="max-h-[50vh]">
            {activeTab === 'audit' && (
              auditRequests.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm">暂无待审核请求</div>
              ) : (
                <div className="space-y-3">
                  {auditRequests.map((req) => (
                    <div key={req.id} className="border rounded-lg p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <Badge variant="secondary" className="text-xs">{getRequestTypeLabel(req.request_type)}</Badge>
                        <span className="text-[10px] text-muted-foreground">{new Date(req.created_at).toLocaleDateString()}</span>
                      </div>
                      <div className="text-sm">{getRequestDescription(req)}</div>
                      <div className="flex gap-2">
                        <Button size="sm" className="h-7 text-xs gap-1" onClick={() => handleAuditAction(req.id, 'approve')} disabled={auditLoading}>
                          <CheckCircle className="h-3 w-3" /> 通过
                        </Button>
                        <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => handleAuditAction(req.id, 'reject')} disabled={auditLoading}>
                          <XCircle className="h-3 w-3" /> 不通过
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )
            )}
            {activeTab === 'users' && (
              allUsers.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm">暂无已审核账号</div>
              ) : (
                <div className="space-y-2">
                  {allUsers.map((u) => (
                    <div key={u.id} className="flex items-center justify-between border rounded-lg p-3">
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate">{u.name || u.account}</div>
                        <div className="text-[11px] text-muted-foreground">{u.account}</div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge variant={u.role === 'admin' ? 'default' : 'secondary'} className="text-[10px]">
                          {u.role === 'admin' ? '管理' : '普通'}
                        </Badge>
                        {u.id !== user?.id && (
                          u.role === 'user' ? (
                            <Button size="sm" variant="outline" className="h-6 text-[10px]" onClick={() => handleRoleChange(u.id, 'upgrade')} disabled={auditLoading}>
                              升级管理
                            </Button>
                          ) : (
                            <Button size="sm" variant="outline" className="h-6 text-[10px]" onClick={() => handleRoleChange(u.id, 'downgrade')} disabled={auditLoading}>
                              降级普通
                            </Button>
                          )
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function AppSidebar() {
  return (
    <aside className="hidden lg:flex lg:w-60 lg:flex-col lg:border-r border-border bg-card h-screen sticky top-0">
      <NavContent />
    </aside>
  );
}

export function MobileNav() {
  const [open, setOpen] = useState(false);

  return (
    <div className="lg:hidden fixed top-0 left-0 right-0 z-50 bg-card/95 backdrop-blur-sm border-b border-border h-14 flex items-center px-4">
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon" className="h-9 w-9">
            <Menu className="h-5 w-5" />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-60 p-0">
          <SheetTitle className="sr-only">导航菜单</SheetTitle>
          <NavContent onNavigate={() => setOpen(false)} />
        </SheetContent>
      </Sheet>
      <Link href="/dashboard" className="flex items-center gap-2 ml-2">
        <div className="w-6 h-6 rounded-md bg-primary flex items-center justify-center">
          <span className="text-primary-foreground font-bold text-[10px]">EX</span>
        </div>
        <span className="font-semibold text-sm">产品体验</span>
      </Link>
      {/* Mobile user icon */}
      <div className="ml-auto">
        <MobileUserIcon />
      </div>
    </div>
  );
}

function MobileUserIcon() {
  const { user, isAdmin, logout } = useAuth();
  const [profileOpen, setProfileOpen] = useState(false);

  if (!user) return null;

  return (
    <>
      <button onClick={() => setProfileOpen(true)} className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
        <User className="h-4 w-4 text-primary" />
      </button>
      <Dialog open={profileOpen} onOpenChange={setProfileOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>个人信息</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div><span className="text-xs text-muted-foreground">账号：</span><span className="text-sm">{user.account}</span></div>
            <div><span className="text-xs text-muted-foreground">名称：</span><span className="text-sm">{user.name}</span></div>
            <div><span className="text-xs text-muted-foreground">角色：</span><Badge variant={isAdmin ? 'default' : 'secondary'} className="text-xs">{isAdmin ? '管理账号' : '使用账号'}</Badge></div>
            <Separator />
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setProfileOpen(false)}>关闭</Button>
              <Button variant="outline" size="sm" className="gap-1" onClick={logout}><LogOut className="h-3 w-3" /> 退出登录</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function BottomNav() {
  const pathname = usePathname();

  return (
    <div className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-card/95 backdrop-blur-sm border-t border-border safe-bottom">
      <nav className="flex items-center justify-around h-14">
        {navItems.slice(0, 5).map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex flex-col items-center justify-center gap-0.5 px-2 py-1 min-w-0 flex-1',
                isActive ? 'text-primary' : 'text-muted-foreground'
              )}
            >
              <item.icon className="h-4.5 w-4.5" />
              <span className="text-[10px] leading-tight truncate">{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
