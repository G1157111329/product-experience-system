import { NextRequest } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { requireAdmin, isAuthResponse } from '@/lib/server/auth';
import { ok, fail, unauthorized, withTrace } from '@/lib/server/api-v1/response';
import { writeSecurityAudit } from '@/lib/server/security-audit';
import {
  BINDING_OAUTH_SETTING_KEY,
  describeWeChatWebsiteOAuthCallback,
  resolveBindingOAuthConfig,
  updateStoredBindingOAuthConfig,
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
    provider?: BindingProvider;
    appId?: string;
    agentId?: string;
    secret?: string;
  };
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
