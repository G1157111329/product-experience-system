'use client';

import { useEffect, useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { BrandLogo } from '@/components/brand-logo';
import { useAuth } from '@/lib/auth-context';
import { toast } from 'sonner';

export default function LoginPage() {
  const [account, setAccount] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [loading, setLoading] = useState(false);
  const { isAuthenticated, isLoading } = useAuth();

  // Use refs to always read latest DOM values (prevents autofill desync)
  const accountRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  // Register dialog
  const [regDialogOpen, setRegDialogOpen] = useState(false);
  const [regForm, setRegForm] = useState({ account: '', password: '', name: '' });
  const [regLoading, setRegLoading] = useState(false);

  // Forgot password dialog
  const [fpDialogOpen, setFpDialogOpen] = useState(false);
  const [fpForm, setFpForm] = useState({ account: '', new_password: '' });
  const [fpLoading, setFpLoading] = useState(false);

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      window.location.replace('/dashboard');
    }
  }, [isAuthenticated, isLoading]);

  const handleLogin = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    // Read values from both state AND DOM to handle autofill
    const acc = (accountRef.current?.value || account).trim();
    const pwd = (passwordRef.current?.value || password).trim();

    if (!acc || !pwd) {
      toast.error('请输入账号和密码');
      return;
    }

    // Sync state in case values came from autofill
    setAccount(acc);
    setPassword(pwd);

    setLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        cache: 'no-store',
        body: JSON.stringify({ account: acc, password: pwd, remember_me: rememberMe }),
      });
      const data = await res.json();
      if (data.code === 0) {
        toast.success('登录成功');
        window.location.href = '/dashboard';
      } else {
        toast.error(data.message);
      }
    } catch {
      toast.error('网络错误，请重试');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async () => {
    if (!regForm.account || !regForm.password || !regForm.name) {
      toast.error('请填写完整信息');
      return;
    }
    setRegLoading(true);
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(regForm),
      });
      const data = await res.json();
      if (data.code === 0) {
        toast.success(data.message);
        setRegDialogOpen(false);
        setRegForm({ account: '', password: '', name: '' });
      } else {
        toast.error(data.message);
      }
    } finally {
      setRegLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!fpForm.account || !fpForm.new_password) {
      toast.error('请填写账号和新密码');
      return;
    }
    setFpLoading(true);
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fpForm),
      });
      const data = await res.json();
      if (data.code === 0) {
        toast.success(data.message);
        setFpDialogOpen(false);
        setFpForm({ account: '', new_password: '' });
      } else {
        toast.error(data.message);
      }
    } finally {
      setFpLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <BrandLogo priority className="mb-3 h-28 w-28" />
          <h1 className="text-xl font-semibold">产品体验管理平台</h1>
          <p className="text-sm text-muted-foreground mt-1">体验计划 · 现场走查 · 报告输出 · 数据分析</p>
        </div>

        {/* Login Card */}
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-base">账号登录</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLogin} className="space-y-4" autoComplete="off">
              <div className="space-y-2">
                <Label htmlFor="account">账号</Label>
                <Input
                  ref={accountRef}
                  id="account"
                  name="login-account"
                  placeholder="请输入账号"
                  value={account}
                  onChange={(e) => setAccount(e.target.value)}
                  autoComplete="off"
                  data-1p-ignore
                  data-lpignore="true"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">密码</Label>
                <Input
                  ref={passwordRef}
                  id="password"
                  name="login-password"
                  type="password"
                  placeholder="请输入密码"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="off"
                  data-1p-ignore
                  data-lpignore="true"
                />
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="remember-me"
                  checked={rememberMe}
                  onCheckedChange={(checked) => setRememberMe(checked === true)}
                />
                <Label htmlFor="remember-me" className="cursor-pointer text-xs font-normal text-muted-foreground">
                  保持登录 30 天
                </Label>
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? '登录中...' : '登录'}
              </Button>
              <div className="flex justify-between">
                <Button type="button" variant="link" className="px-0 h-auto text-xs" onClick={() => setRegDialogOpen(true)}>
                  注册新账号
                </Button>
                <Button type="button" variant="link" className="px-0 h-auto text-xs" onClick={() => setFpDialogOpen(true)}>
                  忘记密码
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        {/* Register Dialog */}
        <Dialog open={regDialogOpen} onOpenChange={setRegDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>注册新账号</DialogTitle>
              <DialogDescription>注册后需等待管理员审核通过方可登录</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label>账号</Label>
                <Input
                  placeholder="至少4个字符"
                  value={regForm.account}
                  onChange={(e) => setRegForm({ ...regForm, account: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>密码</Label>
                <Input
                  type="password"
                  placeholder="至少10个字符，需包含字母和数字"
                  value={regForm.password}
                  onChange={(e) => setRegForm({ ...regForm, password: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>名称</Label>
                <Input
                  placeholder="新建任务时将默认作为组织者名称"
                  value={regForm.name}
                  onChange={(e) => setRegForm({ ...regForm, name: e.target.value })}
                />
              </div>
            </div>
            <DialogFooter className="gap-3 sm:gap-3">
              <Button variant="outline" onClick={() => setRegDialogOpen(false)}>取消</Button>
              <Button onClick={handleRegister} disabled={regLoading}>{regLoading ? '提交中...' : '提交注册'}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Forgot Password Dialog */}
        <Dialog open={fpDialogOpen} onOpenChange={setFpDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>重置密码</DialogTitle>
              <DialogDescription>输入账号和新密码，提交后需等待管理员审核</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label>账号</Label>
                <Input
                  placeholder="请输入您的账号"
                  value={fpForm.account}
                  onChange={(e) => setFpForm({ ...fpForm, account: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>新密码</Label>
                <Input
                  type="password"
                  placeholder="至少10个字符，需包含字母和数字"
                  value={fpForm.new_password}
                  onChange={(e) => setFpForm({ ...fpForm, new_password: e.target.value })}
                />
              </div>
            </div>
            <DialogFooter className="gap-3 sm:gap-3">
              <Button variant="outline" onClick={() => setFpDialogOpen(false)}>取消</Button>
              <Button onClick={handleForgotPassword} disabled={fpLoading}>{fpLoading ? '提交中...' : '提交审核'}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
