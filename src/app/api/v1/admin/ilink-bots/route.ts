import { NextRequest } from 'next/server';
import { desc, eq, sql } from 'drizzle-orm';
import { requireAdmin, isAuthResponse } from '@/lib/server/auth';
import { fail, ok, unauthorized, withTrace } from '@/lib/server/api-v1/response';
import { getIlinkPersonalBotGatewayStatus, refreshIlinkPersonalBotGateway } from '@/lib/server/ilink-personal-bot-gateway';
import { writeSecurityAudit } from '@/lib/server/security-audit';
import { getDb } from '@/storage/database/pg-db';
import { ilinkBotAccounts } from '@/storage/database/shared/schema';
import { getSupabaseClient } from '@/storage/database/supabase-client';

export const dynamic = 'force-dynamic';

export const GET = withTrace<[NextRequest]>(async (traceId, request) => {
  const client = getSupabaseClient();
  const admin = await requireAdmin(request, client);
  if (isAuthResponse(admin)) return unauthorized(traceId, 'unauthorized');
  const db = await getDb();
  const items = await db.select({
    id: ilinkBotAccounts.id,
    platformUserId: ilinkBotAccounts.platformUserId,
    agentInstanceId: ilinkBotAccounts.agentInstanceId,
    botAccountId: ilinkBotAccounts.botAccountId,
    ownerWeixinUserId: ilinkBotAccounts.ownerWeixinUserId,
    status: ilinkBotAccounts.status,
    lastError: ilinkBotAccounts.lastError,
    createdAt: ilinkBotAccounts.createdAt,
    updatedAt: ilinkBotAccounts.updatedAt,
  }).from(ilinkBotAccounts).orderBy(desc(ilinkBotAccounts.updatedAt)).execute();
  return ok({ items, gateway: getIlinkPersonalBotGatewayStatus() }, traceId);
});

export const DELETE = withTrace<[NextRequest]>(async (traceId, request) => {
  const client = getSupabaseClient();
  const admin = await requireAdmin(request, client);
  if (isAuthResponse(admin)) return unauthorized(traceId, 'unauthorized');
  const platformUserId = new URL(request.url).searchParams.get('platformUserId')?.trim() || '';
  if (!platformUserId) return fail(traceId, { message: '缺少平台账号 ID', status: 400 });
  const db = await getDb();
  const [account] = await db.update(ilinkBotAccounts).set({
    status: 'revoked',
    tokenEncrypted: '',
    syncBuffer: null,
    lastError: 'admin_revoked',
    updatedAt: sql`NOW()`,
  }).where(eq(ilinkBotAccounts.platformUserId, platformUserId)).returning().execute();
  if (!account) return fail(traceId, { message: '未找到该账号的 iLink 授权', status: 404 });
  await writeSecurityAudit(client, {
    request, actor: admin, action: 'ilink_bot.revoke', outcome: 'success', targetType: 'ilink_bot_account', targetId: account.id,
    metadata: { platformUserId },
  });
  void refreshIlinkPersonalBotGateway().catch(() => undefined);
  return ok({ id: account.id, platformUserId, status: account.status }, traceId, 'revoked');
});
