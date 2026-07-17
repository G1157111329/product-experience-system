import { NextRequest } from 'next/server';
import { and, eq, sql } from 'drizzle-orm';
import { requireAdmin, isAuthResponse } from '@/lib/server/auth';
import { fail, ok, unauthorized, withTrace } from '@/lib/server/api-v1/response';
import { getDb } from '@/storage/database/pg-db';
import { agentInstances, aiModelConfigs, platformUsers } from '@/storage/database/shared/schema';
import { getSupabaseClient } from '@/storage/database/supabase-client';

export const dynamic = 'force-dynamic';

/** Ensures a selected platform user, including an administrator, has one personal active assistant. */
export const POST = withTrace<[NextRequest]>(async (traceId, request) => {
  const client = getSupabaseClient();
  const admin = await requireAdmin(request, client);
  if (isAuthResponse(admin)) return unauthorized(traceId, 'unauthorized');

  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const platformUserId = String(body.platformUserId || '').trim();
  if (!platformUserId) return fail(traceId, { message: '请选择平台用户', status: 400 });

  const db = await getDb();
  const [user] = await db.select({ id: platformUsers.id }).from(platformUsers).where(and(
    eq(platformUsers.id, platformUserId),
    eq(platformUsers.status, 'approved'),
  )).limit(1).execute();
  if (!user) return fail(traceId, { message: '平台用户不存在或未获批准', status: 404 });

  const [existing] = await db.select({
    id: agentInstances.id,
    name: agentInstances.name,
    status: agentInstances.status,
    boundUserId: agentInstances.boundUserId,
  }).from(agentInstances).where(and(
    eq(agentInstances.tenantId, 'default'),
    eq(agentInstances.boundUserId, platformUserId),
    eq(agentInstances.status, 'active'),
  )).limit(1).execute();
  if (existing) return ok({ agent: existing, created: false }, traceId);

  const [model] = await db.select({ id: aiModelConfigs.id }).from(aiModelConfigs)
    .where(eq(aiModelConfigs.isActive, true)).limit(1).execute();
  if (!model) return fail(traceId, { message: '请先在平台配置可用的 AI 模型', status: 409 });

  const [created] = await db.insert(agentInstances).values({
    tenantId: 'default',
    name: '个人 AI 助手',
    status: 'active',
    modelConfigId: model.id,
    boundUserId: platformUserId,
    description: 'iLink 微信绑定自动创建的个人助手',
    createdBy: admin.id,
    createdAt: sql`NOW()`,
    updatedAt: sql`NOW()`,
  }).returning({
    id: agentInstances.id,
    name: agentInstances.name,
    status: agentInstances.status,
    boundUserId: agentInstances.boundUserId,
  }).execute();
  return ok({ agent: created, created: true }, traceId, 'created');
});
