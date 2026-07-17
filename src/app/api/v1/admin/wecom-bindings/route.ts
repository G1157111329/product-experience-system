/**
 * GET / POST /api/v1/admin/wecom-bindings
 * PRD V3.1.2.4 §12 — Admin CRUD for WeCom user bindings.
 */
import { NextRequest } from 'next/server';
import { and, eq, sql } from 'drizzle-orm';
import { getDb } from '@/storage/database/pg-db';
import { agentInstances, wecomBindings } from '@/storage/database/shared/schema';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { requireAdmin, isAuthResponse } from '@/lib/server/auth';
import { ok, fail, unauthorized, withTrace } from '@/lib/server/api-v1/response';

export const dynamic = 'force-dynamic';

export const GET = withTrace<[NextRequest]>(async (traceId, req) => {
  const client = getSupabaseClient();
  const admin = await requireAdmin(req, client);
  if (isAuthResponse(admin)) return unauthorized(traceId, 'unauthorized');

  const url = new URL(req.url);
  const status = url.searchParams.get('status');
  const limit = Math.min(Number(url.searchParams.get('limit') || 100), 500);
  const offset = Math.max(Number(url.searchParams.get('offset') || 0), 0);

  const db = await getDb();
  const rows = status
    ? await db
        .select()
        .from(wecomBindings)
        .where(eq(wecomBindings.status, status))
        .limit(limit)
        .offset(offset)
        .execute()
    : await db.select().from(wecomBindings).limit(limit).offset(offset).execute();

  return ok({ items: rows, limit, offset }, traceId);
});

export const POST = withTrace<[NextRequest]>(async (traceId, req) => {
  const client = getSupabaseClient();
  const admin = await requireAdmin(req, client);
  if (isAuthResponse(admin)) return unauthorized(traceId, 'unauthorized');

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return fail(traceId, { message: '请求体不是合法 JSON', status: 400 });
  }

  const platformUserId = String(body.platformUserId || body.platform_user_id || '').trim();
  const wecomUserId = String(body.wecomUserId || body.wecom_user_id || '').trim();
  const agentInstanceId = String(body.agentInstanceId || body.agent_instance_id || '').trim();
  if (!platformUserId || !wecomUserId || !agentInstanceId) {
    return fail(traceId, { message: 'platformUserId、wecomUserId 与 agentInstanceId 必填', status: 400 });
  }

  try {
    const db = await getDb();
    const agents = await db
      .select({ id: agentInstances.id })
      .from(agentInstances)
      .where(and(
        eq(agentInstances.id, agentInstanceId),
        eq(agentInstances.status, 'active'),
        eq(agentInstances.boundUserId, platformUserId),
      ))
      .limit(1)
      .execute();
    if (agents.length === 0) {
      return fail(traceId, { message: '只能绑定该平台账号名下的已启用 AI 助手', status: 409 });
    }
    const [row] = await db
      .insert(wecomBindings)
      .values({
        platformUserId,
        wecomUserId,
        wecomCorpId: body.wecomCorpId || body.wecom_corp_id
          ? String(body.wecomCorpId || body.wecom_corp_id)
          : null,
        provider: body.provider === 'wechat' ? 'wechat' : 'wecom',
        agentInstanceId,
        projectScope: (body.projectScope ?? body.project_scope ?? null) as unknown,
        status: 'active',
        boundBy: admin.id,
      })
      .onConflictDoUpdate({
        target: [wecomBindings.wecomUserId, wecomBindings.wecomCorpId],
        set: {
          platformUserId,
          agentInstanceId,
          status: 'active',
          boundBy: admin.id,
          updatedAt: sql`NOW()`,
        },
      })
      .returning()
      .execute();

    return ok(row, traceId, 'created');
  } catch (err) {
    const message = err instanceof Error ? err.message : '创建失败';
    return fail(traceId, { message, status: 500 });
  }
});
