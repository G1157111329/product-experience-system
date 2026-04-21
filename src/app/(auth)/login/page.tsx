'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { toast } from 'sonner';

export default function LoginPage() {
  const router = useRouter();
  const [account, setAccount] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  // Register dialog
  const [regDialogOpen, setRegDialogOpen] = useState(false);
  const [regForm, setRegForm] = useState({ account: '', password: '', name: '' });
  const [regLoading, setRegLoading] = useState(false);

  // Forgot password dialog
  const [fpDialogOpen, setFpDialogOpen] = useState(false);
  const [fpForm, setFpForm] = useState({ account: '', new_password: '' });
  const [fpLoading, setFpLoading] = useState(false);

  const handleLogin = async () => {
    // Trim whitespace before validation
    const acc = account.trim();
    const pwd = password.trim();
    if (!acc || !pwd) {
      toast.error('请输入账号和密码');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account: acc, password: pwd }),
      });
      const data = await res.json();
      if (data.code === 0) {
        localStorage.setItem('current_user', JSON.stringify(data.data));
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
          <div className="w-14 h-14 rounded-2xl bg-primary flex items-center justify-center mb-3">
            <span className="text-primary-foreground font-bold text-xl">EX</span>
          </div>
          <h1 className="text-xl font-semibold">产品体验管理平台</h1>
          <p className="text-sm text-muted-foreground mt-1">体验计划 · 现场走查 · 报告输出 · 数据分析</p>
        </div>

        {/* Login Card */}
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-base">账号登录</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="account">账号</Label>
              <Input
                id="account"
                placeholder="请输入账号"
                value={account}
                onChange={(e) => setAccount(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">密码</Label>
              <Input
                id="password"
                type="password"
                placeholder="请输入密码"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
              />
            </div>
            <Button className="w-full" onClick={handleLogin} disabled={loading}>
              {loading ? '登录中...' : '登录'}
            </Button>
            <div className="flex justify-between">
              <Button variant="link" className="px-0 h-auto text-xs" onClick={() => setRegDialogOpen(true)}>
                注册新账号
              </Button>
              <Button variant="link" className="px-0 h-auto text-xs" onClick={() => setFpDialogOpen(true)}>
                忘记密码
              </Button>
            </div>
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
                  placeholder="至少4个字符"
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
            <DialogFooter className="gap-2 sm:gap-0">
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
                  placeholder="至少4个字符"
                  value={fpForm.new_password}
                  onChange={(e) => setFpForm({ ...fpForm, new_password: e.target.value })}
                />
              </div>
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="outline" onClick={() => setFpDialogOpen(false)}>取消</Button>
              <Button onClick={handleForgotPassword} disabled={fpLoading}>{fpLoading ? '提交中...' : '提交审核'}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
