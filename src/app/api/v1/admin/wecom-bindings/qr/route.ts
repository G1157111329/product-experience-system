import { randomUUID } from 'node:crypto';
import { NextRequest } from 'next/server';
import QRCode from 'qrcode';
import { and, eq } from 'drizzle-orm';
import { getDb } from '@/storage/database/pg-db';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { agentBindingSessions, agentInstances, platformUsers } from '@/storage/database/shared/schema';
import { requireAdmin, isAuthResponse } from '@/lib/server/auth';
import { createBindingState, type BindingProvider } from '@/lib/server/binding-state';
import { ok, fail, unauthorized, withTrace } from '@/lib/server/api-v1/response';
import {
  BINDING_OAUTH_SETTING_KEY,
  resolveBindingOAuthConfig,
  type StoredBindingOAuthConfig,
} from '@/lib/server/binding-oauth-config';

export const dynamic = 'force-dynamic';

function signingSecret() {
  return process.env.AUTH_SESSION_SECRET || process.env.SESSION_SECRET || '';
}

function callbackOrigin(request: NextRequest) {
  return (process.env.PUBLIC_MEDIA_BASE_URL || new URL(request.url).origin).replace(/\/+$/, '');
}

async function providerConfig(client: ReturnType<typeof getSupabaseClient>, provider: BindingProvider) {
  const { data, error } = await client
    .from('platform_settings')
    .select('value')
    .eq('key', BINDING_OAUTH_SETTING_KEY)
    .maybeSingle();
  if (error) throw new Error(error.message || '扫码配置读取失败');
  return resolveBindingOAuthConfig(
    provider,
    (data?.value && typeof data.value === 'object' ? data.value : {}) as StoredBindingOAuthConfig,
  );
}

export const POST = withTrace<[NextRequest]>(async (traceId, request) => {
  const client = getSupabaseClient();
  const admin = await requireAdmin(request, client);
  if (isAuthResponse(admin)) return unauthorized(traceId, 'unauthorized');

  const body = await request.json().catch(() => ({})) as {
    platformUserId?: string;
    agentInstanceId?: string;
    provider?: BindingProvider;
  };
  const provider: BindingProvider = body.provider === 'wechat' ? 'wechat' : 'wecom';
  const platformUserId = String(body.platformUserId || '').trim();
  const agentInstanceId = String(body.agentInstanceId || '').trim() || null;
  if (!platformUserId) return fail(traceId, { message: '请选择平台用户', status: 400 });

  const config = await providerConfig(client, provider);
  if (!config.ready) {
    return fail(traceId, { message: `请先保存${provider === 'wecom' ? '企业微信' : '微信'}扫码配置`, status: 409 });
  }
  if (!signingSecret()) return fail(traceId, { message: 'AUTH_SESSION_SECRET 未配置', status: 500 });

  const db = await getDb();
  const users = await db.select({ id: platformUsers.id }).from(platformUsers).where(eq(platformUsers.id, platformUserId)).limit(1).execute();
  if (users.length === 0) return fail(traceId, { message: '平台用户不存在', status: 404 });
  if (agentInstanceId) {
    const agents = await db
      .select({ id: agentInstances.id, status: agentInstances.status })
      .from(agentInstances)
      .where(and(
        eq(agentInstances.id, agentInstanceId),
        eq(agentInstances.status, 'active'),
        eq(agentInstances.boundUserId, platformUserId),
      ))
      .limit(1)
      .execute();
    if (agents.length === 0) return fail(traceId, { message: 'Agent 实例不存在或未启用', status: 409 });
  }

  const sessionId = randomUUID();
  const expiresAt = Date.now() + 5 * 60 * 1000;
  await db.insert(agentBindingSessions).values({
    id: sessionId,
    provider,
    platformUserId,
    agentInstanceId,
    status: 'pending',
    expiresAt: new Date(expiresAt).toISOString(),
    createdBy: admin.id,
  }).execute();

  const state = createBindingState({ sessionId, provider, expiresAt }, signingSecret());
  const redirectUri = `${callbackOrigin(request)}/api/v1/bindings/oauth/callback`;
  const authorizeUrl = provider === 'wecom'
    ? `https://open.weixin.qq.com/connect/oauth2/authorize?appid=${encodeURIComponent(config.appId)}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=snsapi_base&state=${encodeURIComponent(state)}&agentid=${encodeURIComponent(config.agentId)}#wechat_redirect`
    : `https://open.weixin.qq.com/connect/oauth2/authorize?appid=${encodeURIComponent(config.appId)}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=snsapi_base&state=${encodeURIComponent(state)}#wechat_redirect`;
  const qrDataUrl = await QRCode.toDataURL(authorizeUrl, { width: 280, margin: 1, errorCorrectionLevel: 'M' });

  return ok({ sessionId, provider, authorizeUrl, qrDataUrl, expiresAt: new Date(expiresAt).toISOString() }, traceId, 'created');
});

export const GET = withTrace<[NextRequest]>(async (traceId, request) => {
  const client = getSupabaseClient();
  const admin = await requireAdmin(request, client);
  if (isAuthResponse(admin)) return unauthorized(traceId, 'unauthorized');

  const sessionId = new URL(request.url).searchParams.get('session_id') || '';
  if (!sessionId) return fail(traceId, { message: 'session_id 必填', status: 400 });
  const db = await getDb();
  const rows = await db
    .select()
    .from(agentBindingSessions)
    .where(and(eq(agentBindingSessions.id, sessionId), eq(agentBindingSessions.createdBy, admin.id)))
    .limit(1)
    .execute();
  if (rows.length === 0) return fail(traceId, { message: '扫码会话不存在', status: 404 });
  return ok(rows[0], traceId);
});
