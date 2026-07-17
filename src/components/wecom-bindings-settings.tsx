'use client';

/**
 * Admin WeCom bindings settings — PRD V3.1.2.4 §12 skeleton UI.
 * Lists / creates / revokes wecom_bindings via /api/v1/admin/wecom-bindings.
 */
import { useCallback, useEffect, useState } from 'react';
import { KeyRound, Loader2, Plus, Trash2 } from 'lucide-react';
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

type OAuthProviderConfig = {
  provider: 'wecom' | 'wechat';
  appId: string;
  agentId: string;
  secretConfigured: boolean;
  ready: boolean;
  source: 'environment' | 'platform' | 'missing';
  authorizedRedirectDomain?: string;
  callbackPath?: string;
};
type OAuthConfigResponse = {
  wechat: OAuthProviderConfig;
  wecom: OAuthProviderConfig;
  callbackUrl: string;
};

type AgentInstance = {
  id: string;
  name: string;
  status: string;
};

export function WecomBindingsSettings({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [items, setItems] = useState<BindingRow[]>([]);
  const [agents, setAgents] = useState<AgentInstance[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [platformUserId, setPlatformUserId] = useState('');
  const [wecomUserId, setWecomUserId] = useState('');
  const [wecomCorpId, setWecomCorpId] = useState('');
  const [bindingProvider, setBindingProvider] = useState<'wecom' | 'wechat'>('wecom');
  const [agentInstanceId, setAgentInstanceId] = useState('');
  const [oauthConfig, setOauthConfig] = useState<OAuthConfigResponse | null>(null);
  const [oauthProvider, setOauthProvider] = useState<'wecom' | 'wechat'>('wecom');
  const [oauthAppId, setOauthAppId] = useState('');
  const [oauthAgentId, setOauthAgentId] = useState('');
  const [oauthSecret, setOauthSecret] = useState('');
  const [oauthSaving, setOauthSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [res, configRes, agentsRes] = await Promise.all([
        fetch('/api/v1/admin/wecom-bindings?limit=200', { cache: 'no-store' }),
        fetch('/api/v1/admin/wecom-bindings/config', { cache: 'no-store' }),
        fetch('/api/v1/admin/agent-instances?status=active', { cache: 'no-store' }),
      ]);
      const [json, configJson, agentsJson] = await Promise.all([res.json(), configRes.json(), agentsRes.json()]);
      if (json.code === 0) {
        setItems((json.data?.items ?? []) as BindingRow[]);
      } else {
        toast.error(json.message || '加载失败');
      }
      if (configJson.code === 0) setOauthConfig(configJson.data as OAuthConfigResponse);
      if (agentsJson.code === 0) setAgents((agentsJson.data?.items ?? []) as AgentInstance[]);
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
    const config = oauthConfig?.[oauthProvider];
    setOauthAppId(config?.appId || '');
    setOauthAgentId(config?.agentId || '');
    setOauthSecret('');
  }, [oauthConfig, oauthProvider]);

  const handleSaveOauthConfig = async () => {
    if (!oauthAppId.trim() || (oauthProvider === 'wecom' && !oauthAgentId.trim())) {
      toast.error(oauthProvider === 'wecom' ? '请填写 CorpId 和 AgentId' : '请填写 AppID');
      return;
    }
    if (!oauthSecret.trim() && !oauthConfig?.[oauthProvider]?.secretConfigured) {
      toast.error('首次配置请填写 Secret');
      return;
    }
    setOauthSaving(true);
    try {
      const response = await fetch('/api/v1/admin/wecom-bindings/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: oauthProvider,
          appId: oauthAppId.trim(),
          ...(oauthProvider === 'wecom' ? { agentId: oauthAgentId.trim() } : {}),
          secret: oauthSecret,
        }),
      });
      const json = await response.json();
      if (json.code !== 0) {
        toast.error(json.message || '企业微信应用配置保存失败');
        return;
      }
      setOauthConfig((current) => current ? { ...current, [oauthProvider]: json.data } : current);
      setOauthSecret('');
      toast.success(`${oauthProvider === 'wecom' ? '企业微信' : '个人微信'}应用配置已保存`);
    } catch {
      toast.error(`${oauthProvider === 'wecom' ? '企业微信' : '个人微信'}应用配置保存失败`);
    } finally {
      setOauthSaving(false);
    }
  };

  const handleCreate = async () => {
    if (!platformUserId.trim() || !wecomUserId.trim()) {
      toast.error(`请填写平台用户 ID 与${bindingProvider === 'wecom' ? '企微 UserId' : '微信 OpenId'}`);
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
          wecomCorpId: bindingProvider === 'wecom' ? wecomCorpId.trim() || null : null,
          provider: bindingProvider,
          agentInstanceId: agentInstanceId || null,
        }),
      });
      const json = await res.json();
      if (json.code === 0) {
        toast.success('绑定已保存');
        setPlatformUserId('');
        setWecomUserId('');
        setWecomCorpId('');
        setAgentInstanceId('');
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
          <DialogTitle>企业微信/个人微信 AI 助手绑定</DialogTitle>
          <DialogDescription>
            管理员配置官方应用，并为外部账号选择平台 AI 助手。
          </DialogDescription>
        </DialogHeader>

        <details className="rounded-md border px-3 py-2" open={!oauthConfig?.[oauthProvider]?.ready}>
          <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-medium">
            <KeyRound className="h-4 w-4" />
            {oauthProvider === 'wecom' ? '企业微信应用配置' : '个人微信应用配置'}
            <Badge variant={oauthConfig?.[oauthProvider]?.ready ? 'default' : 'secondary'} className="ml-auto text-xs">
              {oauthConfig?.[oauthProvider]?.ready ? '已配置' : '待配置'}
            </Badge>
          </summary>
          <div className="mt-3 space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">应用类型</Label>
              <select value={oauthProvider} onChange={(event) => setOauthProvider(event.target.value as 'wecom' | 'wechat')} className="h-8 w-full rounded-md border bg-background px-2 text-sm">
                <option value="wecom">企业微信</option>
                <option value="wechat">个人微信 OAuth</option>
              </select>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="space-y-1">
                <Label className="text-xs">{oauthProvider === 'wecom' ? 'CorpId' : 'AppID'}</Label>
                <Input value={oauthAppId} onChange={(event) => setOauthAppId(event.target.value)} className="h-8" autoComplete="off" />
              </div>
              {oauthProvider === 'wecom' && <div className="space-y-1">
                <Label className="text-xs">AgentId</Label>
                <Input value={oauthAgentId} onChange={(event) => setOauthAgentId(event.target.value)} className="h-8" autoComplete="off" />
              </div>}
            </div>
            {oauthProvider === 'wechat' && <div className="space-y-2 rounded bg-muted px-2 py-2 text-xs text-muted-foreground">
              <p>个人微信仅配置微信开放平台网站应用 OAuth，不包含个人号机器人、消息监听或企业微信字段。</p>
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label className="text-xs">授权回调域名</Label>
                  <Input value={oauthConfig?.wechat.authorizedRedirectDomain || ''} readOnly className="h-8 bg-background text-xs" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">回调路径</Label>
                  <Input value={oauthConfig?.wechat.callbackPath || ''} readOnly className="h-8 bg-background text-xs" />
                </div>
              </div>
              <p>请在微信开放平台的网站应用中登记上方授权回调域名；完整回调地址必须使用当前部署域名和该回调路径。</p>
              <p><code>state</code> 由服务端关联一次性绑定会话并签名；回调会校验签名、渠道和有效期，且只消费一次，以降低 CSRF 与重放风险。</p>
            </div>}
            <div className="space-y-1">
              <Label className="text-xs">{oauthProvider === 'wecom' ? 'Secret' : 'AppSecret'}</Label>
              <Input
                type="password"
                value={oauthSecret}
                onChange={(event) => setOauthSecret(event.target.value)}
                placeholder={oauthConfig?.[oauthProvider]?.secretConfigured ? '已保存，留空表示不修改' : '首次配置必填'}
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
              保存应用配置
            </Button>
          </div>
        </details>

        <details className="rounded-md border px-3 py-2">
          <summary className="cursor-pointer text-sm font-medium">手动绑定（兼容入口）</summary>
        <div className="mt-3 space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">绑定渠道</Label>
            <select value={bindingProvider} onChange={(event) => setBindingProvider(event.target.value as 'wecom' | 'wechat')} className="h-8 w-full rounded-md border bg-background px-2 text-sm">
              <option value="wecom">企业微信</option>
              <option value="wechat">个人微信 OAuth</option>
            </select>
          </div>
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
              <Label className="text-xs">{bindingProvider === 'wecom' ? '企微 UserId' : '微信 OpenId'}</Label>
              <Input
                value={wecomUserId}
                onChange={(e) => setWecomUserId(e.target.value)}
                placeholder={bindingProvider === 'wecom' ? 'WeCom userid' : 'WeChat OpenId'}
                className="h-8"
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">选择 AI 助手</Label>
            <select value={agentInstanceId} onChange={(event) => setAgentInstanceId(event.target.value)} className="h-8 w-full rounded-md border bg-background px-2 text-sm">
              <option value="">使用平台默认助手</option>
              {agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.name}</option>)}
            </select>
          </div>
          {bindingProvider === 'wecom' && <div className="space-y-1">
            <Label className="text-xs">CorpId（可选）</Label>
            <Input
              value={wecomCorpId}
              onChange={(e) => setWecomCorpId(e.target.value)}
              placeholder="留空则按 UserId 匹配"
              className="h-8"
            />
          </div>}
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
                    <Badge variant={item.status === 'active' ? 'default' : 'secondary'} className="text-xs">
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
