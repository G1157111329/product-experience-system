import { NextRequest } from 'next/server';
import QRCode from 'qrcode';
import { and, eq, sql } from 'drizzle-orm';
import { requireAdmin, isAuthResponse } from '@/lib/server/auth';
import { fail, ok, unauthorized, withTrace } from '@/lib/server/api-v1/response';
import { refreshIlinkPersonalBotGateway } from '@/lib/server/ilink-personal-bot-gateway';
import { encryptSecret } from '@/lib/server/secret-crypto';
import { getDb } from '@/storage/database/pg-db';
import { agentInstances, ilinkBotAccounts } from '@/storage/database/shared/schema';
import { getSupabaseClient } from '@/storage/database/supabase-client';

const ILINK_BASE_URL = 'https://ilinkai.weixin.qq.com';
const QR_TTL_MS = 8 * 60_000;

type PendingIlinkQr = {
  platformUserId: string;
  agentInstanceId: string;
  adminId: string;
  expiresAt: number;
  baseUrl: string;
};

const pendingQrs = new Map<string, PendingIlinkQr>();

function ilinkHeaders() {
  return {
    'iLink-App-Id': 'bot',
    'iLink-App-ClientVersion': String((2 << 16) | (2 << 8)),
  };
}

function cleanupPendingQrs() {
  const now = Date.now();
  for (const [code, pending] of pendingQrs) if (pending.expiresAt <= now) pendingQrs.delete(code);
}

export const dynamic = 'force-dynamic';

export const POST = withTrace<[NextRequest]>(async (traceId, request) => {
  const client = getSupabaseClient();
  const admin = await requireAdmin(request, client);
  if (isAuthResponse(admin)) return unauthorized(traceId, 'unauthorized');
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const platformUserId = String(body.platformUserId || '').trim();
  const agentInstanceId = String(body.agentInstanceId || '').trim();
  if (!platformUserId || !agentInstanceId) return fail(traceId, { message: '请选择平台账号及其个人 AI 助手', status: 400 });

  const db = await getDb();
  const agent = await db.select({ id: agentInstances.id }).from(agentInstances).where(and(
    eq(agentInstances.id, agentInstanceId),
    eq(agentInstances.boundUserId, platformUserId),
    eq(agentInstances.status, 'active'),
  )).limit(1).execute();
  if (!agent[0]) return fail(traceId, { message: '只能为该平台账号自己的已启用 AI 助手发起 iLink 授权', status: 409 });

  const response = await fetch(`${ILINK_BASE_URL}/ilink/bot/get_bot_qrcode?bot_type=3`, {
    headers: ilinkHeaders(),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) return fail(traceId, { message: `iLink 获取二维码失败（HTTP ${response.status}）`, status: 502 });
  const payload = await response.json() as Record<string, unknown>;
  const qrcode = String(payload.qrcode || '').trim();
  const qrContent = String(payload.qrcode_img_content || qrcode).trim();
  if (!qrcode || !qrContent) return fail(traceId, { message: 'iLink 未返回有效二维码', status: 502 });
  cleanupPendingQrs();
  pendingQrs.set(qrcode, { platformUserId, agentInstanceId, adminId: admin.id, expiresAt: Date.now() + QR_TTL_MS, baseUrl: ILINK_BASE_URL });
  const qrCodeDataUrl = await QRCode.toDataURL(qrContent, { width: 280, margin: 1 });
  return ok({ qrcode, qrCodeDataUrl, expiresAt: new Date(Date.now() + QR_TTL_MS).toISOString() }, traceId);
});

export const GET = withTrace<[NextRequest]>(async (traceId, request) => {
  const client = getSupabaseClient();
  const admin = await requireAdmin(request, client);
  if (isAuthResponse(admin)) return unauthorized(traceId, 'unauthorized');
  const qrcode = new URL(request.url).searchParams.get('qrcode')?.trim() || '';
  cleanupPendingQrs();
  const pending = pendingQrs.get(qrcode);
  if (!pending || pending.adminId !== admin.id) return fail(traceId, { message: '二维码已过期，请重新发起授权', status: 410 });

  const response = await fetch(`${pending.baseUrl}/ilink/bot/get_qrcode_status?qrcode=${encodeURIComponent(qrcode)}`, {
    headers: ilinkHeaders(),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) return fail(traceId, { message: `iLink 查询二维码状态失败（HTTP ${response.status}）`, status: 502 });
  const payload = await response.json() as Record<string, unknown>;
  const status = String(payload.status || 'wait');
  if (status === 'scaned_but_redirect') {
    const redirectHost = String(payload.redirect_host || '').trim().toLowerCase();
    if (redirectHost === 'weixin.qq.com' || redirectHost.endsWith('.weixin.qq.com')) pending.baseUrl = `https://${redirectHost}`;
  }
  if (status !== 'confirmed') return ok({ status, expiresAt: new Date(pending.expiresAt).toISOString() }, traceId);

  const botAccountId = String(payload.ilink_bot_id || '').trim();
  const ownerWeixinUserId = String(payload.ilink_user_id || '').trim();
  const token = String(payload.bot_token || '').trim();
  const baseUrl = String(payload.baseurl || pending.baseUrl).trim().replace(/\/+$/, '');
  if (!botAccountId || !ownerWeixinUserId || !token) return fail(traceId, { message: 'iLink 授权结果不完整，请重新扫码', status: 502 });

  const db = await getDb();
  const [account] = await db.insert(ilinkBotAccounts).values({
    platformUserId: pending.platformUserId,
    agentInstanceId: pending.agentInstanceId,
    botAccountId,
    ownerWeixinUserId,
    tokenEncrypted: encryptSecret(token)!,
    baseUrl,
    status: 'active',
    lastError: '',
    boundBy: admin.id,
  }).onConflictDoUpdate({
    target: ilinkBotAccounts.platformUserId,
    set: {
      agentInstanceId: pending.agentInstanceId,
      botAccountId,
      ownerWeixinUserId,
      tokenEncrypted: encryptSecret(token)!,
      baseUrl,
      syncBuffer: '',
      status: 'active',
      lastError: '',
      boundBy: admin.id,
      updatedAt: sql`NOW()`,
    },
  }).returning().execute();
  pendingQrs.delete(qrcode);
  void refreshIlinkPersonalBotGateway().catch(() => undefined);
  return ok({ status: 'confirmed', account: { id: account!.id, platformUserId: account!.platformUserId, botAccountId: account!.botAccountId } }, traceId);
});
