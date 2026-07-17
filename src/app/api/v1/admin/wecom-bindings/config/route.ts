import { NextRequest } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { requireAdmin, isAuthResponse } from '@/lib/server/auth';
import { ok, fail, unauthorized, withTrace } from '@/lib/server/api-v1/response';
import { writeSecurityAudit } from '@/lib/server/security-audit';
import { getWecomBotGatewayStatus, refreshWecomBotGateway } from '@/lib/server/wecom-bot-gateway';
import {
  BINDING_OAUTH_SETTING_KEY,
  describeWeChatWebsiteOAuthCallback,
  resolveBindingOAuthConfig,
  resolveWecomBotConfig,
  updateStoredBindingOAuthConfig,
  updateStoredWecomBotConfig,
  type StoredBindingOAuthConfig,
} from '@/lib/server/binding-oauth-config';
import type { BindingProvider } from '@/lib/server/binding-state';

export const dynamic = 'force-dynamic';

async function loadStoredConfig(client: ReturnType<typeof getSupabaseClient>) {
  const { data, error } = await client
    .from('platform_settings')
    .select('value')
    .eq('key', BINDING_OAUTH_SETTING_KEY)
    .maybeSingle();
  if (error) throw new Error(error.message || '扫码配置读取失败');
  return (data?.value && typeof data.value === 'object' ? data.value : {}) as StoredBindingOAuthConfig;
}

function publicConfig(provider: BindingProvider, stored: StoredBindingOAuthConfig) {
  const resolved = resolveBindingOAuthConfig(provider, stored);
  return {
    provider,
    appId: resolved.appId,
    agentId: resolved.agentId,
    secretConfigured: Boolean(resolved.secret),
    ready: resolved.ready,
    source: resolved.source,
  };
}

function publicWecomBotConfig(stored: StoredBindingOAuthConfig) {
  const resolved = resolveWecomBotConfig(stored);
  return {
    botId: resolved.botId,
    bindingCorpId: resolved.bindingCorpId,
    websocketUrl: resolved.websocketUrl,
    dmPolicy: resolved.dmPolicy,
    groupPolicy: resolved.groupPolicy,
    secretConfigured: Boolean(resolved.secret),
    ready: resolved.ready,
    source: resolved.source,
  };
}

export const GET = withTrace<[NextRequest]>(async (traceId, request) => {
  const client = getSupabaseClient();
  const admin = await requireAdmin(request, client);
  if (isAuthResponse(admin)) return unauthorized(traceId, 'unauthorized');
  try {
    const stored = await loadStoredConfig(client);
    const callbackUrl = `${(process.env.PUBLIC_MEDIA_BASE_URL || new URL(request.url).origin).replace(/\/+$/, '')}/api/v1/bindings/oauth/callback`;
    return ok({
      wechat: {
        ...publicConfig('wechat', stored),
        ...describeWeChatWebsiteOAuthCallback(callbackUrl),
      },
      wecom: publicConfig('wecom', stored),
      wecomBot: publicWecomBotConfig(stored),
      wecomBotGateway: getWecomBotGatewayStatus(),
      callbackUrl,
    }, traceId);
  } catch (error) {
    return fail(traceId, { message: error instanceof Error ? error.message : '扫码配置读取失败', status: 500 });
  }
});

export const PUT = withTrace<[NextRequest]>(async (traceId, request) => {
  const client = getSupabaseClient();
  const admin = await requireAdmin(request, client);
  if (isAuthResponse(admin)) return unauthorized(traceId, 'unauthorized');
  const body = await request.json().catch(() => ({})) as {
    configKind?: 'oauth' | 'wecom_bot';
    provider?: BindingProvider;
    appId?: string;
    agentId?: string;
    secret?: string;
    botId?: string;
    bindingCorpId?: string;
    websocketUrl?: string;
    dmPolicy?: string;
    groupPolicy?: string;
  };
  if (body.configKind === 'wecom_bot') {
    const botId = String(body.botId || '').trim();
    const bindingCorpId = String(body.bindingCorpId || '').trim();
    if (!botId || !bindingCorpId) {
      return fail(traceId, { message: 'Bot ID 与绑定主体 CorpId 必填', status: 400 });
    }
    try {
      const current = await loadStoredConfig(client);
      const next = updateStoredWecomBotConfig(current, {
        botId,
        bindingCorpId,
        secret: String(body.secret || ''),
        websocketUrl: String(body.websocketUrl || ''),
        dmPolicy: String(body.dmPolicy || ''),
        groupPolicy: String(body.groupPolicy || ''),
      });
      const resolved = resolveWecomBotConfig(next, {});
      if (!resolved.secret) return fail(traceId, { message: '首次配置必须填写 Bot Secret', status: 400 });
      const { error } = await client.from('platform_settings').upsert({
        key: BINDING_OAUTH_SETTING_KEY,
        value: next,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'key' });
      if (error) throw new Error(error.message || '企微 AI Bot 配置保存失败');
      void refreshWecomBotGateway().catch(() => undefined);
      await writeSecurityAudit(client, {
        request,
        actor: admin,
        action: 'wecom_bot_config.update',
        outcome: 'success',
        targetType: 'platform_setting',
        targetId: BINDING_OAUTH_SETTING_KEY,
        metadata: { containsSecret: Boolean(body.secret), dmPolicy: resolved.dmPolicy, groupPolicy: resolved.groupPolicy },
      });
      return ok(publicWecomBotConfig(next), traceId, 'updated');
    } catch (error) {
      return fail(traceId, { message: error instanceof Error ? error.message : '企微 AI Bot 配置保存失败', status: 500 });
    }
  }
  const provider: BindingProvider = body.provider === 'wecom' ? 'wecom' : 'wechat';
  const appId = String(body.appId || '').trim();
  const agentId = String(body.agentId || '').trim();
  if (!appId || (provider === 'wecom' && !agentId)) {
    return fail(traceId, { message: provider === 'wecom' ? 'CorpId 和 AgentId 必填' : 'AppId 必填', status: 400 });
  }
  try {
    const current = await loadStoredConfig(client);
    const next = updateStoredBindingOAuthConfig(current, provider, {
      appId,
      agentId,
      secret: String(body.secret || ''),
    });
    const resolved = resolveBindingOAuthConfig(provider, next, {});
    if (!resolved.secret) return fail(traceId, { message: '首次配置必须填写 Secret', status: 400 });
    const { error } = await client.from('platform_settings').upsert({
      key: BINDING_OAUTH_SETTING_KEY,
      value: next,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'key' });
    if (error) throw new Error(error.message || '扫码配置保存失败');
    await writeSecurityAudit(client, {
      request,
      actor: admin,
      action: 'binding_oauth_config.update',
      outcome: 'success',
      targetType: 'platform_setting',
      targetId: BINDING_OAUTH_SETTING_KEY,
      metadata: { provider, containsSecret: Boolean(body.secret) },
    });
    return ok(publicConfig(provider, next), traceId, 'updated');
  } catch (error) {
    return fail(traceId, { message: error instanceof Error ? error.message : '扫码配置保存失败', status: 500 });
  }
});
