'use client';

/**
 * Admin WeCom bindings settings — PRD V3.1.2.4 §12 skeleton UI.
 * Lists / creates / revokes wecom_bindings via /api/v1/admin/wecom-bindings.
 */
import { useCallback, useEffect, useState } from 'react';
import Image from 'next/image';
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
  wecomBot: WecomBotConfig;
  wecomBotGateway: WecomBotGatewayStatus;
  callbackUrl: string;
};

type WecomBotConfig = {
  botId: string;
  bindingCorpId: string;
  websocketUrl: string;
  dmPolicy: 'pairing' | 'allowlist' | 'disabled';
  groupPolicy: 'allowlist' | 'disabled';
  secretConfigured: boolean;
  ready: boolean;
  source: 'environment' | 'platform' | 'missing';
};

type WecomBotGatewayStatus = {
  state: 'disabled' | 'connecting' | 'connected' | 'error';
  detail?: string;
  updatedAt: string;
};

type IlinkBotAccount = {
  id: string;
  platformUserId: string;
  agentInstanceId: string;
  botAccountId: string;
  ownerWeixinUserId: string;
  status: 'pending' | 'active' | 'expired' | 'revoked';
  lastError: string | null;
  updatedAt: string;
};

type AgentInstance = {
  id: string;
  name: string;
  status: string;
  boundUserId: string | null;
};

type PlatformUser = {
  id: string;
  account: string;
  name: string | null;
  role: string;
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
  const [platformUsers, setPlatformUsers] = useState<PlatformUser[]>([]);
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
  const [botId, setBotId] = useState('');
  const [botBindingCorpId, setBotBindingCorpId] = useState('');
  const [botSecret, setBotSecret] = useState('');
  const [botWebsocketUrl, setBotWebsocketUrl] = useState('wss://openws.work.weixin.qq.com');
  const [botDmPolicy, setBotDmPolicy] = useState<WecomBotConfig['dmPolicy']>('pairing');
  const [botGroupPolicy, setBotGroupPolicy] = useState<WecomBotConfig['groupPolicy']>('disabled');
  const [botSaving, setBotSaving] = useState(false);
  const [ilinkAccounts, setIlinkAccounts] = useState<IlinkBotAccount[]>([]);
  const [ilinkQr, setIlinkQr] = useState<{ qrcode: string; qrCodeDataUrl: string; expiresAt: string } | null>(null);
  const [ilinkStarting, setIlinkStarting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [res, configRes, agentsRes, ilinkRes, usersRes] = await Promise.all([
        fetch('/api/v1/admin/wecom-bindings?limit=200', { cache: 'no-store' }),
        fetch('/api/v1/admin/wecom-bindings/config', { cache: 'no-store' }),
        fetch('/api/v1/admin/agent-instances?status=active', { cache: 'no-store' }),
        fetch('/api/v1/admin/ilink-bots', { cache: 'no-store' }),
        fetch('/api/auth/users', { cache: 'no-store' }),
      ]);
      const [json, configJson, agentsJson, ilinkJson, usersJson] = await Promise.all([res.json(), configRes.json(), agentsRes.json(), ilinkRes.json(), usersRes.json()]);
      if (json.code === 0) {
        setItems((json.data?.items ?? []) as BindingRow[]);
      } else {
        toast.error(json.message || '加载失败');
      }
      if (configJson.code === 0) setOauthConfig(configJson.data as OAuthConfigResponse);
      if (agentsJson.code === 0) setAgents((agentsJson.data?.items ?? []) as AgentInstance[]);
      if (ilinkJson.code === 0) setIlinkAccounts((ilinkJson.data?.items ?? []) as IlinkBotAccount[]);
      if (usersJson.code === 0) setPlatformUsers((usersJson.data ?? []) as PlatformUser[]);
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

  useEffect(() => {
    const config = oauthConfig?.wecomBot;
    setBotId(config?.botId || '');
    setBotBindingCorpId(config?.bindingCorpId || '');
    setBotSecret('');
    setBotWebsocketUrl(config?.websocketUrl || 'wss://openws.work.weixin.qq.com');
    setBotDmPolicy(config?.dmPolicy || 'pairing');
    setBotGroupPolicy(config?.groupPolicy || 'disabled');
  }, [oauthConfig]);

  useEffect(() => {
    if (!ilinkQr) return;
    const timer = window.setInterval(() => {
      void fetch(`/api/v1/admin/ilink-bots/qr?qrcode=${encodeURIComponent(ilinkQr.qrcode)}`, { cache: 'no-store' })
        .then((response) => response.json())
        .then((json) => {
          if (json.code === 0 && json.data?.status === 'confirmed') {
            window.clearInterval(timer);
            setIlinkQr(null);
            toast.success('iLink Bot 授权成功');
            void load();
          }
        })
        .catch(() => undefined);
    }, 2500);
    return () => window.clearInterval(timer);
  }, [ilinkQr, load]);

  const handlePlatformUserChange = (userId: string) => {
    setPlatformUserId(userId);
    setAgentInstanceId('');
    setIlinkQr(null);
  };

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

  const handleSaveWecomBotConfig = async () => {
    if (!botId.trim() || !botBindingCorpId.trim()) {
      toast.error('请填写 Bot ID 与绑定主体 CorpId');
      return;
    }
    if (!botSecret.trim() && !oauthConfig?.wecomBot.secretConfigured) {
      toast.error('首次配置请填写 Bot Secret');
      return;
    }
    setBotSaving(true);
    try {
      const response = await fetch('/api/v1/admin/wecom-bindings/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          configKind: 'wecom_bot',
          botId: botId.trim(),
          bindingCorpId: botBindingCorpId.trim(),
          secret: botSecret,
          websocketUrl: botWebsocketUrl.trim(),
          dmPolicy: botDmPolicy,
          groupPolicy: botGroupPolicy,
        }),
      });
      const json = await response.json();
      if (json.code !== 0) {
        toast.error(json.message || '企微 AI Bot 配置保存失败');
        return;
      }
      setOauthConfig((current) => current ? { ...current, wecomBot: json.data as WecomBotConfig } : current);
      setBotSecret('');
      toast.success('企微 AI Bot 配置已保存');
    } catch {
      toast.error('企微 AI Bot 配置保存失败');
    } finally {
      setBotSaving(false);
    }
  };

  const handleStartIlinkQr = async () => {
    if (!platformUserId.trim()) {
      toast.error('请先选择平台账号');
      return;
    }
    setIlinkStarting(true);
    try {
      let selectedAgentInstanceId = agentInstanceId;
      if (!selectedAgentInstanceId) {
        const assistantResponse = await fetch('/api/v1/admin/ilink-bots/assistant', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ platformUserId }),
        });
        const assistantJson = await assistantResponse.json();
        if (assistantJson.code !== 0 || !assistantJson.data?.agent?.id) {
          return toast.error(assistantJson.message || '个人 AI 助手创建失败');
        }
        const createdAgent = assistantJson.data.agent as AgentInstance;
        selectedAgentInstanceId = createdAgent.id;
        setAgents((previous) => previous.some((agent) => agent.id === createdAgent.id) ? previous : [...previous, createdAgent]);
        setAgentInstanceId(createdAgent.id);
      }
      const response = await fetch('/api/v1/admin/ilink-bots/qr', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platformUserId: platformUserId.trim(), agentInstanceId: selectedAgentInstanceId }),
      });
      const json = await response.json();
      if (json.code !== 0) return toast.error(json.message || 'iLink 二维码创建失败');
      setIlinkQr(json.data);
    } catch {
      toast.error('iLink 二维码创建失败');
    } finally {
      setIlinkStarting(false);
    }
  };

  const handleRevokeIlink = async (account: IlinkBotAccount) => {
    if (!window.confirm(`确认撤销平台账号 ${account.platformUserId} 的 iLink 授权？该用户需要重新扫码才能恢复。`)) return;
    const response = await fetch(`/api/v1/admin/ilink-bots?platformUserId=${encodeURIComponent(account.platformUserId)}`, { method: 'DELETE' });
    const json = await response.json();
    if (json.code !== 0) return toast.error(json.message || '撤销失败');
    toast.success('iLink 授权已撤销');
    await load();
  };

  const handleCreate = async () => {
    if (!platformUserId.trim() || !wecomUserId.trim() || !agentInstanceId) {
      toast.error(!agentInstanceId
        ? '请选择该平台账号的 AI 助手'
        : `请填写平台用户 ID 与${bindingProvider === 'wecom' ? '企微 UserId' : '微信 OpenId'}`);
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

        <details className="rounded-md border px-3 py-2" open={!oauthConfig?.wecomBot.ready}>
          <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-medium">
            <KeyRound className="h-4 w-4" />
            企微 AI Bot（推荐）
            <Badge variant={oauthConfig?.wecomBot.ready ? 'default' : 'secondary'} className="ml-auto text-xs">
              {oauthConfig?.wecomBot.ready ? '已配置' : '待配置'}
            </Badge>
          </summary>
          <div className="mt-3 space-y-3">
            <p className="text-xs text-muted-foreground">用于消息与素材录入；平台以绑定主体和企微 UserId 路由到各自的个人 AI 助手，默认只接受配对私聊。</p>
            {oauthConfig?.wecomBotGateway && (
              <p className="text-xs text-muted-foreground">
                网关状态：{({ disabled: '未连接', connecting: '连接中', connected: '已连接', error: '异常' } as const)[oauthConfig.wecomBotGateway.state]}
                {oauthConfig.wecomBotGateway.detail ? `（${oauthConfig.wecomBotGateway.detail}）` : ''}
              </p>
            )}
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="space-y-1">
                <Label className="text-xs">Bot ID</Label>
                <Input value={botId} onChange={(event) => setBotId(event.target.value)} className="h-8" autoComplete="off" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">绑定主体 CorpId</Label>
                <Input value={botBindingCorpId} onChange={(event) => setBotBindingCorpId(event.target.value)} className="h-8" autoComplete="off" />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Bot Secret</Label>
              <Input type="password" value={botSecret} onChange={(event) => setBotSecret(event.target.value)} placeholder={oauthConfig?.wecomBot.secretConfigured ? '已保存，留空表示不修改' : '首次配置必填'} className="h-8" autoComplete="new-password" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">WebSocket 网关</Label>
              <Input value={botWebsocketUrl} onChange={(event) => setBotWebsocketUrl(event.target.value)} className="h-8" autoComplete="off" />
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="space-y-1">
                <Label className="text-xs">私聊策略</Label>
                <select value={botDmPolicy} onChange={(event) => setBotDmPolicy(event.target.value as WecomBotConfig['dmPolicy'])} className="h-8 w-full rounded-md border bg-background px-2 text-sm">
                  <option value="pairing">仅已绑定用户</option>
                  <option value="allowlist">白名单</option>
                  <option value="disabled">关闭</option>
                </select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">群聊策略</Label>
                <select value={botGroupPolicy} onChange={(event) => setBotGroupPolicy(event.target.value as WecomBotConfig['groupPolicy'])} className="h-8 w-full rounded-md border bg-background px-2 text-sm">
                  <option value="disabled">关闭</option>
                  <option value="allowlist">白名单</option>
                </select>
              </div>
            </div>
            <Button size="sm" onClick={() => void handleSaveWecomBotConfig()} disabled={botSaving}>
              {botSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <KeyRound className="h-3.5 w-3.5" />}
              保存企微 AI Bot 配置
            </Button>
          </div>
        </details>

        <details className="rounded-md border px-3 py-2" open>
          <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-medium">
            <KeyRound className="h-4 w-4" />
            个人微信 iLink Bot（每人独立）
            <Badge variant="secondary" className="ml-auto text-xs">扫码授权</Badge>
          </summary>
          <div className="mt-3 space-y-3">
            <p className="text-xs text-muted-foreground">选择平台账号及其个人 AI 助手后，由该用户自己的微信扫码。扫码产生独立 Bot 身份；仅扫码用户可私聊并录入素材。</p>
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="space-y-1">
                <Label className="text-xs">平台用户</Label>
                <select value={platformUserId} onChange={(event) => handlePlatformUserChange(event.target.value)} className="h-8 w-full rounded-md border bg-background px-2 text-sm" aria-label="选择平台用户">
                  <option value="">请选择平台用户</option>
                  {platformUsers.map((user) => <option key={user.id} value={user.id}>{user.name || user.account}（{user.account}）</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">个人 AI 助手</Label>
                <select value={agentInstanceId} onChange={(event) => setAgentInstanceId(event.target.value)} className="h-8 w-full rounded-md border bg-background px-2 text-sm">
                  <option value="">请选择该账号的助手</option>
                  {agents.filter((agent) => agent.boundUserId === platformUserId.trim()).map((agent) => <option key={agent.id} value={agent.id}>{agent.name}</option>)}
                </select>
              </div>
            </div>
            {platformUserId && agents.every((agent) => agent.boundUserId !== platformUserId) && <p role="status" className="text-xs text-muted-foreground">该用户尚无个人助手；生成授权时将自动创建，管理员本人也适用。</p>}
            <Button size="sm" onClick={() => void handleStartIlinkQr()} disabled={ilinkStarting || !platformUserId}>
              {ilinkStarting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <KeyRound className="h-3.5 w-3.5" />}
              生成 iLink 扫码授权
            </Button>
            {ilinkQr && <div className="rounded-md border p-3 text-center">
              <Image src={ilinkQr.qrCodeDataUrl} alt="iLink 扫码授权" width={224} height={224} unoptimized className="mx-auto h-56 w-56" />
              <p className="mt-2 text-xs text-muted-foreground">请用目标用户自己的微信扫码并在手机确认。二维码有效至 {new Date(ilinkQr.expiresAt).toLocaleTimeString()}。</p>
            </div>}
            <div className="space-y-2">
              {ilinkAccounts.length === 0 ? <p className="text-xs text-muted-foreground">尚无 iLink 授权。</p> : ilinkAccounts.map((account) => <div key={account.id} className="flex items-center justify-between gap-2 rounded border px-2 py-1.5 text-xs">
                <span className="min-w-0 truncate">用户 {account.platformUserId} · Bot {account.botAccountId} · {account.status}</span>
                {account.status === 'active' && <Button size="sm" variant="ghost" className="h-7 text-destructive" onClick={() => void handleRevokeIlink(account)}>撤销授权</Button>}
              </div>)}
            </div>
          </div>
        </details>

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
              <p>个人微信网站应用 OAuth 仅用于账号身份绑定；聊天与素材入口请使用上方“个人微信 iLink Bot”。iLink 扫码生成独立机器人身份，与本页 OAuth 不是同一条通道。</p>
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
              <Label className="text-xs">平台用户</Label>
              <select value={platformUserId} onChange={(event) => handlePlatformUserChange(event.target.value)} className="h-8 w-full rounded-md border bg-background px-2 text-sm" aria-label="选择平台用户">
                <option value="">请选择平台用户</option>
                {platformUsers.map((user) => <option key={user.id} value={user.id}>{user.name || user.account}（{user.account}）</option>)}
              </select>
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
              <option value="" disabled>请选择该平台账号的 AI 助手</option>
              {agents
                .filter((agent) => agent.boundUserId === platformUserId.trim())
                .map((agent) => <option key={agent.id} value={agent.id}>{agent.name}</option>)}
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
