'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect, useCallback } from 'react';
import {
  LayoutDashboard, BookOpen, ClipboardList, AlertTriangle, FileText,
  BarChart3, Menu, ChevronRight, User, LogOut, Key, Pencil,
  Settings, Plus, Minus,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from '@/components/ui/sheet';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/lib/auth-context';
import { toast } from 'sonner';

interface CategoryWithProducts {
  id: string; name: string; sort_order: number;
  products: Array<{ id: string; name: string; category_id: string; sort_order: number }>;
}

const navItems = [
  { href: '/dashboard', label: '工作台', icon: LayoutDashboard },
  { href: '/standards', label: '标准管理', icon: BookOpen },
  { href: '/tasks', label: '体验计划', icon: ClipboardList },
  { href: '/issues', label: '问题管理', icon: AlertTriangle },
  { href: '/reports', label: '报告中心', icon: FileText },
  { href: '/analysis', label: '数据分析', icon: BarChart3 },
];

function NavContent({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <div className="flex flex-col h-full">
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
      <ScrollArea className="flex-1 py-3">
        <nav className="px-2 space-y-0.5">
          {navItems.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
            return (
              <Link key={item.href} href={item.href} onClick={onNavigate}
                className={cn('flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors',
                  isActive ? 'bg-primary/10 text-primary font-medium' : 'text-muted-foreground hover:bg-muted hover:text-foreground')}>
                <item.icon className="h-4 w-4 shrink-0" />
                <span>{item.label}</span>
                {isActive && <ChevronRight className="h-3 w-3 ml-auto opacity-50" />}
              </Link>
            );
          })}
        </nav>
      </ScrollArea>
      <div className="px-4 py-3 border-t border-border">
        <UserSection />
      </div>
    </div>
  );
}

/* ── Shared Settings Dialog (used by both desktop & mobile) ── */
function CategoryProductSettings({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [categories, setCategories] = useState<CategoryWithProducts[]>([]);
  const [selectedCatId, setSelectedCatId] = useState<string>('');
  const [newCatName, setNewCatName] = useState('');
  const [newProdName, setNewProdName] = useState('');
  const [addingCat, setAddingCat] = useState(false);
  const [addingProd, setAddingProd] = useState(false);
  const [deletingCatId, setDeletingCatId] = useState<string | null>(null);
  const [deletingProdId, setDeletingProdId] = useState<string | null>(null);

  const fetchCategories = useCallback(async () => {
    const res = await fetch('/api/categories');
    const data = await res.json();
    if (data.code === 0) setCategories(data.data || []);
  }, []);

  useEffect(() => {
    if (open) fetchCategories();
  }, [open, fetchCategories]);

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      setDeletingCatId(null);
      setDeletingProdId(null);
      setNewCatName('');
      setNewProdName('');
      setSelectedCatId('');
    }
  }, [open]);

  const handleAddCategory = async () => {
    if (!newCatName.trim()) return;
    setAddingCat(true);
    try {
      const res = await fetch('/api/categories', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'category', name: newCatName.trim() }),
      });
      const data = await res.json();
      if (data.code === 0) { setNewCatName(''); fetchCategories(); toast.success('品类已添加'); }
      else toast.error(data.message);
    } finally { setAddingCat(false); }
  };

  const handleDeleteCategory = async (catId: string) => {
    setDeletingCatId(null);
    const res = await fetch(`/api/categories?type=category&id=${catId}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.code === 0) { fetchCategories(); toast.success('品类已删除'); }
    else toast.error(data.message);
  };

  const handleAddProduct = async () => {
    if (!newProdName.trim() || !selectedCatId) return;
    setAddingProd(true);
    try {
      const res = await fetch('/api/categories', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'product', name: newProdName.trim(), category_id: selectedCatId }),
      });
      const data = await res.json();
      if (data.code === 0) { setNewProdName(''); fetchCategories(); toast.success('产品已添加'); }
      else toast.error(data.message);
    } finally { setAddingProd(false); }
  };

  const handleDeleteProduct = async (prodId: string) => {
    setDeletingProdId(null);
    const res = await fetch(`/api/categories?type=product&id=${prodId}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.code === 0) { fetchCategories(); toast.success('产品已删除'); }
    else toast.error(data.message);
  };

  const selectedCat = categories.find(c => c.id === selectedCatId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" /> 品类与产品设置
          </DialogTitle>
          <DialogDescription>管理品类和产品选项，修改后全局生效</DialogDescription>
        </DialogHeader>
        <ScrollArea className="max-h-[65vh]">
          <div className="space-y-6 pr-3">
            {/* Category Management */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Badge variant="secondary" className="text-[10px]">品类</Badge> 品类管理
              </h3>
              <div className="space-y-1.5">
                {categories.map(cat => (
                  <div key={cat.id} className="flex items-center gap-2 p-2 rounded-lg border">
                    <span className="text-sm flex-1">{cat.name}</span>
                    <Badge variant="outline" className="text-[10px]">{cat.products.length}个产品</Badge>
                    <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive hover:text-red-700 hover:bg-red-50"
                      onClick={() => setDeletingCatId(cat.id)}>
                      <Minus className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
                {categories.length === 0 && <p className="text-xs text-muted-foreground text-center py-2">暂无品类</p>}
              </div>
              <div className="flex gap-2">
                <Input placeholder="输入品类名称" value={newCatName} onChange={e => setNewCatName(e.target.value)}
                  className="h-8 text-sm" onKeyDown={e => { if (e.key === 'Enter') handleAddCategory(); }} />
                <Button size="sm" className="h-8 gap-1" onClick={handleAddCategory} disabled={addingCat || !newCatName.trim()}>
                  <Plus className="h-3.5 w-3.5" /> 新增
                </Button>
              </div>
              {deletingCatId && (
                <div className="flex items-center gap-2 p-2 rounded-lg bg-destructive/5 border border-destructive/20">
                  <span className="text-xs text-destructive flex-1">确认删除「{categories.find(c => c.id === deletingCatId)?.name}」及其所有产品？</span>
                  <Button size="sm" variant="destructive" className="h-6 text-xs" onClick={() => handleDeleteCategory(deletingCatId)}>确认</Button>
                  <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => setDeletingCatId(null)}>取消</Button>
                </div>
              )}
            </div>

            <Separator />

            {/* Product Management */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Badge variant="secondary" className="text-[10px]">产品</Badge> 产品管理
              </h3>
              <div className="space-y-1.5">
                <Label className="text-xs">选择品类</Label>
                <Select value={selectedCatId} onValueChange={setSelectedCatId}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="选择品类查看产品" /></SelectTrigger>
                  <SelectContent>
                    {categories.map(cat => <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {selectedCat && (
                <>
                  <div className="space-y-1.5">
                    {selectedCat.products.map(prod => (
                      <div key={prod.id} className="flex items-center gap-2 p-2 rounded-lg border">
                        <span className="text-sm flex-1">{prod.name}</span>
                        <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive hover:text-red-700 hover:bg-red-50"
                          onClick={() => setDeletingProdId(prod.id)}>
                          <Minus className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))}
                    {selectedCat.products.length === 0 && (
                      <p className="text-xs text-muted-foreground text-center py-2">该品类暂无产品</p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Input placeholder="输入产品名称" value={newProdName} onChange={e => setNewProdName(e.target.value)}
                      className="h-8 text-sm" onKeyDown={e => { if (e.key === 'Enter') handleAddProduct(); }} />
                    <Button size="sm" className="h-8 gap-1" onClick={handleAddProduct} disabled={addingProd || !newProdName.trim()}>
                      <Plus className="h-3.5 w-3.5" /> 新增
                    </Button>
                  </div>
                  {deletingProdId && (
                    <div className="flex items-center gap-2 p-2 rounded-lg bg-destructive/5 border border-destructive/20">
                      <span className="text-xs text-destructive flex-1">确认删除产品「{selectedCat.products.find(p => p.id === deletingProdId)?.name}」？</span>
                      <Button size="sm" variant="destructive" className="h-6 text-xs" onClick={() => handleDeleteProduct(deletingProdId)}>确认</Button>
                      <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => setDeletingProdId(null)}>取消</Button>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

function UserSection() {
  const { user, isAdmin, logout } = useAuth();
  const [profileOpen, setProfileOpen] = useState(false);
  const [editField, setEditField] = useState<'name' | 'password' | null>(null);
  const [editValue, setEditValue] = useState('');
  const [editLoading, setEditLoading] = useState(false);
  const [allUsers, setAllUsers] = useState<Array<{ id: string; account: string; name: string; role: string }>>([]);
  const [roleLoading, setRoleLoading] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    if (profileOpen && isAdmin && user?.id) {
      fetch(`/api/auth/users?admin_user_id=${user.id}`)
        .then(res => res.json())
        .then(data => { if (data.code === 0) setAllUsers(data.data || []); })
        .catch(() => {});
    }
  }, [profileOpen, isAdmin, user?.id]);

  const handleProfileEdit = async () => {
    if (!user?.id || !editField || !editValue) return;
    setEditLoading(true);
    try {
      const res = await fetch('/api/auth/profile', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: user.id, field: editField, value: editValue }),
      });
      const data = await res.json();
      if (data.code === 0) { toast.success(data.message); setEditField(null); setEditValue(''); }
      else toast.error(data.message);
    } finally { setEditLoading(false); }
  };

  const handleRoleChange = async (targetUserId: string, action: 'upgrade' | 'downgrade') => {
    if (!user?.id) return;
    setRoleLoading(true);
    try {
      const res = await fetch('/api/auth/users', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ admin_user_id: user.id, target_user_id: targetUserId, action }),
      });
      const data = await res.json();
      if (data.code === 0) {
        toast.success(data.message);
        const usersRes = await fetch(`/api/auth/users?admin_user_id=${user.id}`);
        const usersData = await usersRes.json();
        if (usersData.code === 0) setAllUsers(usersData.data || []);
      } else toast.error(data.message);
    } finally { setRoleLoading(false); }
  };

  return (
    <>
      <div className="flex items-center gap-2">
        <button onClick={() => setProfileOpen(true)}
          className="flex items-center gap-2 flex-1 min-w-0 text-left hover:bg-muted rounded-lg px-2 py-1.5 transition-colors">
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
        {/* Admin: Settings icon directly in sidebar footer */}
        {isAdmin && (
          <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => setSettingsOpen(true)} title="品类与产品设置">
            <Settings className="h-3.5 w-3.5" />
          </Button>
        )}
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
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">账号</Label>
              <div className="text-sm font-medium">{user?.account}</div>
            </div>
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
              ) : (<div className="text-sm font-medium">{user?.name || '-'}</div>)}
            </div>
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
              ) : (<div className="text-sm font-medium">••••••••</div>)}
            </div>

            <Separator />

            <div className="flex items-center gap-2">
              <Label className="text-xs text-muted-foreground">角色</Label>
              <Badge variant={isAdmin ? 'default' : 'secondary'} className="text-xs">{isAdmin ? '管理账号' : '使用账号'}</Badge>
            </div>

            {/* Admin: Settings button in profile dialog */}
            {isAdmin && (
              <Button variant="outline" className="w-full gap-2" onClick={() => { setProfileOpen(false); setTimeout(() => setSettingsOpen(true), 100); }}>
                <Settings className="h-4 w-4" /> 品类与产品设置
              </Button>
            )}

            {isAdmin && allUsers.length > 0 && (
              <>
                <Separator />
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">账号权限管理</Label>
                  <div className="space-y-1.5 max-h-40 overflow-y-auto">
                    {allUsers.map((u) => (
                      <div key={u.id} className="flex items-center justify-between text-sm py-1">
                        <div className="min-w-0 flex-1">
                          <span className="font-medium">{u.name || u.account}</span>
                          <span className="text-xs text-muted-foreground ml-1">({u.account})</span>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <Badge variant={u.role === 'admin' ? 'default' : 'secondary'} className="text-[10px] px-1.5">{u.role === 'admin' ? '管理' : '普通'}</Badge>
                          {u.id !== user?.id && (
                            u.role === 'user' ? (
                              <Button size="sm" variant="outline" className="h-5 text-[10px] px-1.5" onClick={() => handleRoleChange(u.id, 'upgrade')} disabled={roleLoading}>升级</Button>
                            ) : (
                              <Button size="sm" variant="outline" className="h-5 text-[10px] px-1.5" onClick={() => handleRoleChange(u.id, 'downgrade')} disabled={roleLoading}>降级</Button>
                            )
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Settings Dialog (Admin only) */}
      <CategoryProductSettings open={settingsOpen} onOpenChange={setSettingsOpen} />
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
          <Button variant="ghost" size="icon" className="h-9 w-9"><Menu className="h-5 w-5" /></Button>
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
      <div className="ml-auto"><MobileUserIcon /></div>
    </div>
  );
}

function MobileUserIcon() {
  const { user, isAdmin, logout } = useAuth();
  const [profileOpen, setProfileOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

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
            <DialogDescription>查看和管理您的账号信息</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div><span className="text-xs text-muted-foreground">账号：</span><span className="text-sm">{user.account}</span></div>
            <div><span className="text-xs text-muted-foreground">名称：</span><span className="text-sm">{user.name}</span></div>
            <div><span className="text-xs text-muted-foreground">角色：</span><Badge variant={isAdmin ? 'default' : 'secondary'} className="text-xs">{isAdmin ? '管理账号' : '使用账号'}</Badge></div>
            <Separator />
            {/* Admin: Settings button in mobile profile */}
            {isAdmin && (
              <Button variant="outline" className="w-full gap-2" onClick={() => { setProfileOpen(false); setTimeout(() => setSettingsOpen(true), 100); }}>
                <Settings className="h-4 w-4" /> 品类与产品设置
              </Button>
            )}
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="flex-1" onClick={() => setProfileOpen(false)}>关闭</Button>
              <Button variant="outline" size="sm" className="flex-1 gap-1" onClick={logout}><LogOut className="h-3 w-3" /> 退出</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      <CategoryProductSettings open={settingsOpen} onOpenChange={setSettingsOpen} />
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
            <Link key={item.href} href={item.href}
              className={cn('flex flex-col items-center justify-center gap-0.5 px-2 py-1 min-w-0 flex-1', isActive ? 'text-primary' : 'text-muted-foreground')}>
              <item.icon className="h-4.5 w-4.5" />
              <span className="text-[10px] leading-tight truncate">{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
