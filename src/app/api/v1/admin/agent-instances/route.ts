/**
 * GET / POST /api/v1/admin/agent-instances
 * PRD V3.1.2.4 §11.3 — Admin CRUD for agent instances.
 *
 * GET: list agent instances (optionally filtered by tenant/status).
 * POST: create a new agent instance.
 *
 * Auth: requireAdmin.
 */
import { NextRequest } from 'next/server';
import { sql, eq } from 'drizzle-orm';
import { getDb } from '@/storage/database/pg-db';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { requireAdmin, isAuthResponse } from '@/lib/server/auth';
import { ok, created, fail, unauthorized, withTrace } from '@/lib/server/api-v1/response';
import { agentInstances } from '@/storage/database/shared/schema';

export const dynamic = 'force-dynamic';

const VALID_STATUSES = new Set(['draft', 'active', 'paused', 'maintenance', 'frozen', 'archived']);

interface CreateAgentInstanceBody {
  name?: string;
  status?: string;
  modelConfigId?: string;
  boundUserId?: string;
  description?: string;
  maxActiveConversations?: number;
  tenantId?: string;
}

export const GET = withTrace<[NextRequest]>(async (traceId, req) => {
  const client = getSupabaseClient();
  const admin = await requireAdmin(req, client);
  if (isAuthResponse(admin)) return unauthorized(traceId, 'unauthorized');

  const url = new URL(req.url);
  const tenantId = url.searchParams.get('tenant_id') || url.searchParams.get('tenantId') || 'default';
  const status = url.searchParams.get('status');
  const limit = Math.min(Number(url.searchParams.get('limit') || 100), 500);
  const offset = Math.max(Number(url.searchParams.get('offset') || 0), 0);

  const db = await getDb();
  const baseQuery = db
    .select({
      id: agentInstances.id,
      tenantId: agentInstances.tenantId,
      name: agentInstances.name,
      status: agentInstances.status,
      modelConfigId: agentInstances.modelConfigId,
      boundUserId: agentInstances.boundUserId,
      description: agentInstances.description,
      maxActiveConversations: agentInstances.maxActiveConversations,
      createdBy: agentInstances.createdBy,
      createdAt: agentInstances.createdAt,
      updatedAt: agentInstances.updatedAt,
    })
    .from(agentInstances)
    .where(eq(agentInstances.tenantId, tenantId))
    .$dynamic();

  const rows = status && VALID_STATUSES.has(status)
    ? await db
        .select()
        .from(agentInstances)
        .where(sql`${agentInstances.tenantId} = ${tenantId} AND ${agentInstances.status} = ${status}`)
        .limit(limit)
        .offset(offset)
        .execute()
    : await baseQuery.limit(limit).offset(offset).execute();

  void baseQuery; // keep type referenced for future filter composition

  return ok({ items: rows, limit, offset }, traceId);
});

export const POST = withTrace<[NextRequest]>(async (traceId, req) => {
  const client = getSupabaseClient();
  const admin = await requireAdmin(req, client);
  if (isAuthResponse(admin)) return unauthorized(traceId, 'unauthorized');

  let body: CreateAgentInstanceBody;
  try {
    body = await req.json();
  } catch {
    return fail(traceId, { message: '请求体不是合法 JSON', status: 400 });
  }

  if (!body.name || typeof body.name !== 'string' || !body.name.trim()) {
    return fail(traceId, { message: 'name 必填', status: 400 });
  }

  const status = body.status && VALID_STATUSES.has(body.status) ? body.status : 'draft';
  const tenantId = body.tenantId || 'default';

  const db = await getDb();
  try {
    const [row] = await db
      .insert(agentInstances)
      .values({
        tenantId,
        name: body.name.trim(),
        status,
        modelConfigId: body.modelConfigId ?? null,
        boundUserId: body.boundUserId ?? null,
        description: body.description ?? null,
        maxActiveConversations: body.maxActiveConversations ?? 5,
        createdBy: admin.id,
        createdAt: sql`NOW()`,
        updatedAt: sql`NOW()`,
      })
      .returning({
        id: agentInstances.id,
        tenantId: agentInstances.tenantId,
        name: agentInstances.name,
        status: agentInstances.status,
        modelConfigId: agentInstances.modelConfigId,
        boundUserId: agentInstances.boundUserId,
        description: agentInstances.description,
        maxActiveConversations: agentInstances.maxActiveConversations,
        createdBy: agentInstances.createdBy,
        createdAt: agentInstances.createdAt,
        updatedAt: agentInstances.updatedAt,
      })
      .execute();

    return created(row, traceId);
  } catch (err) {
    const message = err instanceof Error ? err.message : '创建 agent_instance 失败';
    return fail(traceId, { message, status: 500 });
  }
});
