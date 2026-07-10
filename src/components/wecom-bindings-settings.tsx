'use client';

/**
 * Admin WeCom bindings settings — PRD V3.1.2.4 §12 skeleton UI.
 * Lists / creates / revokes wecom_bindings via /api/v1/admin/wecom-bindings.
 */
import { useCallback, useEffect, useState } from 'react';
import { KeyRound, Loader2, Plus, QrCode, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

type BindingRow = {
  id: string;
  platformUserId: string;
  wecomUserId: string;
  wecomCorpId: string | null;
  status: string;
  createdAt: string;
  provider?: 'wecom' | 'wechat';
  agentInstanceId?: string | null;
};

type UserOption = { id: string; account: string; name?: string | null };
type AgentOption = { id: string; name: string; status: string };
type QrSession = { sessionId: string; provider: 'wecom' | 'wechat'; qrDataUrl: string; expiresAt: string };
type OAuthProviderConfig = {
  provider: 'wecom' | 'wechat';
  appId: string;
  agentId: string;
  secretConfigured: boolean;
  ready: boolean;
  source: 'environment' | 'platform' | 'missing';
};
type OAuthConfigResponse = {
  wechat: OAuthProviderConfig;
  wecom: OAuthProviderConfig;
  callbackUrl: string;
};

export function WecomBindingsSettings({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [items, setItems] = useState<BindingRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [platformUserId, setPlatformUserId] = useState('');
  const [wecomUserId, setWecomUserId] = useState('');
  const [wecomCorpId, setWecomCorpId] = useState('');
  const [users, setUsers] = useState<UserOption[]>([]);
  const [agents, setAgents] = useState<AgentOption[]>([]);
  const [agentInstanceId, setAgentInstanceId] = useState('');
  const [provider, setProvider] = useState<'wecom' | 'wechat'>('wechat');
  const [qrSession, setQrSession] = useState<QrSession | null>(null);
  const [qrLoading, setQrLoading] = useState(false);
  const [oauthConfig, setOauthConfig] = useState<OAuthConfigResponse | null>(null);
  const [oauthAppId, setOauthAppId] = useState('');
  const [oauthAgentId, setOauthAgentId] = useState('');
  const [oauthSecret, setOauthSecret] = useState('');
  const [oauthSaving, setOauthSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [res, usersRes, agentsRes, configRes] = await Promise.all([
        fetch('/api/v1/admin/wecom-bindings?limit=200', { cache: 'no-store' }),
        fetch('/api/auth/users', { cache: 'no-store' }),
        fetch('/api/v1/admin/agent-instances?limit=200', { cache: 'no-store' }),
        fetch('/api/v1/admin/wecom-bindings/config', { cache: 'no-store' }),
      ]);
      const [json, usersJson, agentsJson, configJson] = await Promise.all([res.json(), usersRes.json(), agentsRes.json(), configRes.json()]);
      if (json.code === 0) {
        setItems((json.data?.items ?? []) as BindingRow[]);
      } else {
        toast.error(json.message || '加载失败');
      }
      if (usersJson.code === 0) setUsers(Array.isArray(usersJson.data) ? usersJson.data : []);
      if (agentsJson.code === 0) {
        setAgents(((agentsJson.data?.items ?? []) as AgentOption[]).filter((item) => item.status === 'active'));
      }
      if (configJson.code === 0) setOauthConfig(configJson.data as OAuthConfigResponse);
    } catch {
      toast.error('加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  useEffect(() => {
    const config = oauthConfig?.[provider];
    setOauthAppId(config?.appId || '');
    setOauthAgentId(config?.agentId || '');
    setOauthSecret('');
  }, [oauthConfig, provider]);

  useEffect(() => {
    if (!qrSession) return;
    const timer = window.setInterval(async () => {
      const response = await fetch(`/api/v1/admin/wecom-bindings/qr?session_id=${encodeURIComponent(qrSession.sessionId)}`, { cache: 'no-store' });
      const json = await response.json();
      if (json.code !== 0) return;
      if (json.data?.status === 'consumed') {
        window.clearInterval(timer);
        setQrSession(null);
        toast.success('扫码绑定成功');
        await load();
      } else if (new Date(qrSession.expiresAt).getTime() < Date.now()) {
        window.clearInterval(timer);
        setQrSession(null);
        toast.error('二维码已过期，请重新生成');
      }
    }, 2000);
    return () => window.clearInterval(timer);
  }, [qrSession, load]);

  const handleCreateQr = async () => {
    if (!platformUserId) {
      toast.error('请选择要绑定的平台用户');
      return;
    }
    if (!oauthConfig?.[provider]?.ready) {
      toast.error(`请先保存${provider === 'wecom' ? '企业微信' : '微信'}扫码配置`);
      return;
    }
    setQrLoading(true);
    try {
      const response = await fetch('/api/v1/admin/wecom-bindings/qr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platformUserId, agentInstanceId: agentInstanceId || undefined, provider }),
      });
      const json = await response.json();
      if (json.code !== 0) {
        toast.error(json.message || '二维码生成失败');
        return;
      }
      setQrSession(json.data as QrSession);
    } catch {
      toast.error('二维码生成失败');
    } finally {
      setQrLoading(false);
    }
  };

  const handleSaveOauthConfig = async () => {
    if (!oauthAppId.trim() || (provider === 'wecom' && !oauthAgentId.trim())) {
      toast.error(provider === 'wecom' ? '请填写 CorpId 和 AgentId' : '请填写 AppId');
      return;
    }
    if (!oauthSecret.trim() && !oauthConfig?.[provider]?.secretConfigured) {
      toast.error('首次配置请填写 Secret');
      return;
    }
    setOauthSaving(true);
    try {
      const response = await fetch('/api/v1/admin/wecom-bindings/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider,
          appId: oauthAppId.trim(),
          agentId: oauthAgentId.trim(),
          secret: oauthSecret,
        }),
      });
      const json = await response.json();
      if (json.code !== 0) {
        toast.error(json.message || '扫码配置保存失败');
        return;
      }
      setOauthConfig((current) => current ? { ...current, [provider]: json.data } : current);
      setOauthSecret('');
      toast.success('扫码配置已保存');
    } catch {
      toast.error('扫码配置保存失败');
    } finally {
      setOauthSaving(false);
    }
  };

  const handleCreate = async () => {
    if (!platformUserId.trim() || !wecomUserId.trim()) {
      toast.error('请填写平台用户 ID 与企微 UserId');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/v1/admin/wecom-bindings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          platformUserId: platformUserId.trim(),
          wecomUserId: wecomUserId.trim(),
          wecomCorpId: wecomCorpId.trim() || null,
        }),
      });
      const json = await res.json();
      if (json.code === 0) {
        toast.success('绑定已保存');
        setPlatformUserId('');
        setWecomUserId('');
        setWecomCorpId('');
        await load();
      } else {
        toast.error(json.message || '保存失败');
      }
    } catch {
      toast.error('保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleRevoke = async (id: string) => {
    if (!window.confirm('确认撤销该企微绑定？')) return;
    try {
      const res = await fetch(`/api/v1/admin/wecom-bindings/${id}`, { method: 'DELETE' });
      const json = await res.json();
      if (json.code === 0) {
        toast.success('已撤销');
        await load();
      } else {
        toast.error(json.message || '撤销失败');
      }
    } catch {
      toast.error('撤销失败');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>微信 / 企微 AI助手接入</DialogTitle>
          <DialogDescription>
            由管理员选择平台账号和 AI助手，用户使用微信或企业微信扫码确认绑定。
          </DialogDescription>
        </DialogHeader>

        <details className="rounded-md border px-3 py-2" open={!oauthConfig?.[provider]?.ready}>
          <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-medium">
            <KeyRound className="h-4 w-4" />
            {provider === 'wecom' ? '企业微信扫码配置' : '微信扫码配置'}
            <Badge variant={oauthConfig?.[provider]?.ready ? 'default' : 'secondary'} className="ml-auto text-[10px]">
              {oauthConfig?.[provider]?.ready ? '已配置' : '待配置'}
            </Badge>
          </summary>
          <div className="mt-3 space-y-3">
            <div className={provider === 'wecom' ? 'grid gap-2 sm:grid-cols-2' : 'space-y-1'}>
              <div className="space-y-1">
                <Label className="text-xs">{provider === 'wecom' ? 'CorpId' : 'AppId'}</Label>
                <Input value={oauthAppId} onChange={(event) => setOauthAppId(event.target.value)} className="h-8" autoComplete="off" />
              </div>
              {provider === 'wecom' && (
                <div className="space-y-1">
                  <Label className="text-xs">AgentId</Label>
                  <Input value={oauthAgentId} onChange={(event) => setOauthAgentId(event.target.value)} className="h-8" autoComplete="off" />
                </div>
              )}
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Secret</Label>
              <Input
                type="password"
                value={oauthSecret}
                onChange={(event) => setOauthSecret(event.target.value)}
                placeholder={oauthConfig?.[provider]?.secretConfigured ? '已保存，留空表示不修改' : '首次配置必填'}
                className="h-8"
                autoComplete="new-password"
              />
            </div>
            {oauthConfig?.callbackUrl && (
              <div className="space-y-1">
                <Label className="text-xs">OAuth 回调地址</Label>
                <Input value={oauthConfig.callbackUrl} readOnly className="h-8 bg-muted/30 text-xs" />
              </div>
            )}
            <Button size="sm" onClick={() => void handleSaveOauthConfig()} disabled={oauthSaving}>
              {oauthSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <KeyRound className="h-3.5 w-3.5" />}
              保存扫码配置
            </Button>
          </div>
        </details>

        <div className="grid gap-4 border-b pb-4 md:grid-cols-[minmax(0,1fr)_280px]">
          <div className="space-y-3">
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="space-y-1">
                <Label className="text-xs">平台账号</Label>
                <select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={platformUserId} onChange={(event) => setPlatformUserId(event.target.value)}>
                  <option value="">请选择</option>
                  {users.map((item) => <option key={item.id} value={item.id}>{item.name || item.account} ({item.account})</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">AI助手实例</Label>
                <select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={agentInstanceId} onChange={(event) => setAgentInstanceId(event.target.value)}>
                  <option value="">默认个人 AI助手</option>
                  {agents.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                </select>
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">扫码方式</Label>
              <div className="grid grid-cols-2 rounded-md border p-1">
                <button type="button" className={`rounded px-3 py-1.5 text-sm ${provider === 'wecom' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`} onClick={() => setProvider('wecom')}>企业微信</button>
                <button type="button" className={`rounded px-3 py-1.5 text-sm ${provider === 'wechat' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`} onClick={() => setProvider('wechat')}>微信</button>
              </div>
            </div>
            <Button size="sm" onClick={() => void handleCreateQr()} disabled={qrLoading || !platformUserId || !oauthConfig?.[provider]?.ready}>
              {qrLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <QrCode className="h-3.5 w-3.5" />}
              生成绑定二维码
            </Button>
            <p className="text-xs text-muted-foreground">二维码 5 分钟有效且只能使用一次。扫码成功后列表会自动刷新。</p>
          </div>

          <div className="flex min-h-64 items-center justify-center rounded-md border bg-muted/20 p-3">
            {qrSession ? (
              <div className="text-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={qrSession.qrDataUrl} alt={`${qrSession.provider === 'wecom' ? '企业微信' : '微信'}绑定二维码`} className="mx-auto h-56 w-56 bg-white" />
                <p className="mt-2 text-xs text-muted-foreground">等待扫码确认</p>
              </div>
            ) : (
              <div className="text-center text-muted-foreground">
                <QrCode className="mx-auto mb-2 h-8 w-8" />
                <p className="text-xs">选择账号后生成二维码</p>
              </div>
            )}
          </div>
        </div>

        <details className="rounded-md border px-3 py-2">
          <summary className="cursor-pointer text-sm font-medium">手动绑定（兼容入口）</summary>
        <div className="mt-3 space-y-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs">平台用户 ID</Label>
              <Input
                value={platformUserId}
                onChange={(e) => setPlatformUserId(e.target.value)}
                placeholder="platform_users.id"
                className="h-8"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">企微 UserId</Label>
              <Input
                value={wecomUserId}
                onChange={(e) => setWecomUserId(e.target.value)}
                placeholder="WeCom userid"
                className="h-8"
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">CorpId（可选）</Label>
            <Input
              value={wecomCorpId}
              onChange={(e) => setWecomCorpId(e.target.value)}
              placeholder="留空则按 UserId 匹配"
              className="h-8"
            />
          </div>
          <Button size="sm" onClick={() => void handleCreate()} disabled={saving}>
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            添加绑定
          </Button>
        </div>
        </details>

        <div className="max-h-64 space-y-2 overflow-y-auto">
          {loading ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />
              加载中…
            </div>
          ) : items.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">暂无绑定</p>
          ) : (
            items.map((item) => (
              <div
                key={item.id}
                className="flex items-start justify-between gap-2 rounded-md border px-3 py-2 text-sm"
              >
                <div className="min-w-0 space-y-0.5">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-medium truncate">{item.wecomUserId}</span>
                    <Badge variant={item.status === 'active' ? 'default' : 'secondary'} className="text-[10px]">
                      {item.provider === 'wechat' ? '微信' : '企微'} · {item.status}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground break-all">
                    平台用户 {item.platformUserId}
                    {item.wecomCorpId ? ` · corp ${item.wecomCorpId}` : ''}
                  </p>
                </div>
                {item.status === 'active' && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 shrink-0 p-0 text-destructive"
                    onClick={() => void handleRevoke(item.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
