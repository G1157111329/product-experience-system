import { NextRequest } from 'next/server';
import { and, eq, sql } from 'drizzle-orm';
import { getDb } from '@/storage/database/pg-db';
import { agentBindingSessions } from '@/storage/database/shared/schema';
import { verifyBindingState, type BindingProvider } from '@/lib/server/binding-state';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import {
  BINDING_OAUTH_SETTING_KEY,
  resolveBindingOAuthConfig,
  type StoredBindingOAuthConfig,
} from '@/lib/server/binding-oauth-config';

export const dynamic = 'force-dynamic';

function html(title: string, message: string, ok: boolean) {
  const color = ok ? '#047857' : '#b91c1c';
  return new Response(`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head><body style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Microsoft YaHei',sans-serif;background:#f8fafc;color:#111827"><main style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px"><section style="width:100%;max-width:420px;border:1px solid #d1d5db;border-radius:8px;background:#fff;padding:28px;text-align:center"><h1 style="margin:0 0 12px;font-size:20px;color:${color}">${title}</h1><p style="margin:0;color:#4b5563;line-height:1.7">${message}</p></section></main></body></html>`, {
    status: ok ? 200 : 400,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

async function fetchJson(url: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(url, { cache: 'no-store', signal: controller.signal });
    return await response.json() as Record<string, unknown>;
  } finally {
    clearTimeout(timeout);
  }
}

async function resolveExternalIdentity(provider: BindingProvider, code: string) {
  const client = getSupabaseClient();
  const { data, error } = await client
    .from('platform_settings')
    .select('value')
    .eq('key', BINDING_OAUTH_SETTING_KEY)
    .maybeSingle();
  if (error) throw new Error(error.message || '扫码配置读取失败');
  const config = resolveBindingOAuthConfig(
    provider,
    (data?.value && typeof data.value === 'object' ? data.value : {}) as StoredBindingOAuthConfig,
  );
  if (!config.ready) throw new Error('扫码配置不可用，请联系管理员');
  if (provider === 'wecom') {
    const corpId = config.appId;
    const secret = config.secret;
    const token = await fetchJson(`https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=${encodeURIComponent(corpId)}&corpsecret=${encodeURIComponent(secret)}`);
    if (!token.access_token) throw new Error(String(token.errmsg || '企业微信 access_token 获取失败'));
    const user = await fetchJson(`https://qyapi.weixin.qq.com/cgi-bin/user/getuserinfo?access_token=${encodeURIComponent(String(token.access_token))}&code=${encodeURIComponent(code)}`);
    const userId = String(user.UserId || user.userid || user.OpenId || user.openid || '').trim();
    if (!userId) throw new Error(String(user.errmsg || '企业微信未返回成员身份'));
    return { userId, corpId };
  }

  const appId = config.appId;
  const secret = config.secret;
  const user = await fetchJson(`https://api.weixin.qq.com/sns/oauth2/access_token?appid=${encodeURIComponent(appId)}&secret=${encodeURIComponent(secret)}&code=${encodeURIComponent(code)}&grant_type=authorization_code`);
  const userId = String(user.openid || '').trim();
  if (!userId) throw new Error(String(user.errmsg || '微信未返回 OpenId'));
  return { userId, corpId: appId };
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code') || '';
  const state = request.nextUrl.searchParams.get('state') || '';
  const secret = process.env.AUTH_SESSION_SECRET || process.env.SESSION_SECRET || '';
  const payload = secret ? verifyBindingState(state, secret) : null;
  if (!code || !payload) return html('绑定失败', '二维码已失效或授权参数不完整，请让管理员重新生成。', false);

  const db = await getDb();
  const sessions = await db
    .select()
    .from(agentBindingSessions)
    .where(and(
      eq(agentBindingSessions.id, payload.sessionId),
      eq(agentBindingSessions.provider, payload.provider),
      eq(agentBindingSessions.status, 'pending'),
    ))
    .limit(1)
    .execute();
  const session = sessions[0];
  if (!session || new Date(session.expiresAt).getTime() < Date.now()) {
    return html('绑定失败', '二维码已过期或已被使用，请让管理员重新生成。', false);
  }

  try {
    const identity = await resolveExternalIdentity(payload.provider, code);
    await db.transaction(async (tx) => {
      const claimedSessions = await tx
        .update(agentBindingSessions)
        .set({ status: 'consumed', externalUserId: identity.userId, consumedAt: sql`NOW()` })
        .where(and(
          eq(agentBindingSessions.id, session.id),
          eq(agentBindingSessions.status, 'pending'),
          sql`${agentBindingSessions.expiresAt} > NOW()`,
        ))
        .returning({ id: agentBindingSessions.id })
        .execute();
      if (claimedSessions.length !== 1) {
        throw new Error('二维码已过期或已被使用');
      }

      await tx.execute(sql`
        INSERT INTO wecom_bindings
          (platform_user_id, wecom_user_id, wecom_corp_id, provider, agent_instance_id, status, bound_by, updated_at)
        VALUES
          (${session.platformUserId}, ${identity.userId}, ${identity.corpId}, ${payload.provider}, ${session.agentInstanceId}, 'active', ${session.createdBy}, NOW())
        ON CONFLICT (wecom_user_id, wecom_corp_id)
        DO UPDATE SET
          platform_user_id = EXCLUDED.platform_user_id,
          provider = EXCLUDED.provider,
          agent_instance_id = EXCLUDED.agent_instance_id,
          status = 'active',
          bound_by = EXCLUDED.bound_by,
          updated_at = NOW()
      `);
    });
    return html('绑定成功', '机器人已绑定，可以关闭此页面并回到管理端查看。', true);
  } catch (error) {
    const message = error instanceof Error ? error.message : '外部身份校验失败';
    return html('绑定失败', message.replace(/[<>&]/g, ''), false);
  }
}
