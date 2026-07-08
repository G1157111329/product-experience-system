/**
 * POST /api/v1/agent/conversations
 * PRD V3.1.2.4 §11.4 — Create a conversation and its memory namespace.
 *
 * Body: { agentInstanceId, taskId?, title?, projectId? }
 * Creates a `conversations` row plus a dedicated `agent_memory_namespaces`
 * row for this conversation's memory scope. Returns the conversation.
 */
import { NextRequest } from 'next/server';
import { sql } from 'drizzle-orm';
import { getDb } from '@/storage/database/pg-db';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { requireUser, isAuthResponse } from '@/lib/server/auth';
import { ok, fail, unauthorized, withTrace } from '@/lib/server/api-v1/response';
import { conversations, agentInstances } from '@/storage/database/shared/schema';
import { eq } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

interface CreateConversationBody {
  agentInstanceId: string;
  taskId?: string;
  title?: string;
  projectId?: string;
}

export const POST = withTrace<[NextRequest]>(async (traceId, req) => {
  const client = getSupabaseClient();
  const user = await requireUser(req, client);
  if (isAuthResponse(user)) return unauthorized(traceId, 'unauthorized');

  let body: CreateConversationBody;
  try {
    body = await req.json();
  } catch {
    return fail(traceId, { message: '请求体不是合法 JSON', status: 400 });
  }

  if (!body.agentInstanceId || typeof body.agentInstanceId !== 'string') {
    return fail(traceId, { message: 'agentInstanceId 必填', status: 400 });
  }

  const tenantId = 'default';
  const db = await getDb();

  // Validate the agent instance exists and is usable.
  const instanceRows = await db
    .select({ id: agentInstances.id, status: agentInstances.status })
    .from(agentInstances)
    .where(eq(agentInstances.id, body.agentInstanceId))
    .limit(1)
    .execute();
  if (instanceRows.length === 0) {
    return fail(traceId, { message: 'agent_instance 不存在', status: 404 });
  }
  const instance = instanceRows[0];
  if (instance.status === 'archived' || instance.status === 'frozen') {
    return fail(traceId, { message: `agent_instance 当前状态(${instance.status})不可用`, status: 409 });
  }

  try {
    // Create the memory namespace first (table added by migration 0006; raw SQL
    // because Drizzle schema does not export this table object).
    const namespaceKey = `conv:${body.agentInstanceId}:${user.id}:${Date.now()}`;
    const nsRows = await db.execute(sql`
      INSERT INTO agent_memory_namespaces
        (namespace_key, tenant_id, agent_instance_id, scope_config)
      VALUES
        (${namespaceKey}, ${tenantId}, ${body.agentInstanceId}, ${JSON.stringify({ kind: 'conversation', userId: user.id })}::jsonb)
      RETURNING id
    `);
    const memoryNamespaceId =
      nsRows.rows.length > 0 ? (nsRows.rows[0] as Record<string, unknown>).id as string : null;

    // Create the conversation row.
    const [conv] = await db
      .insert(conversations)
      .values({
        tenantId,
        agentInstanceId: body.agentInstanceId,
        platformUserId: user.id,
        projectId: body.projectId ?? null,
        taskId: body.taskId ?? null,
        memoryNamespaceId,
        title: body.title ?? null,
        status: 'active',
        lastEventId: 0,
      })
      .returning()
      .execute();

    return ok(
      {
        id: conv.id,
        agentInstanceId: conv.agentInstanceId,
        platformUserId: conv.platformUserId,
        taskId: conv.taskId,
        projectId: conv.projectId,
        memoryNamespaceId: conv.memoryNamespaceId,
        title: conv.title,
        status: conv.status,
        createdAt: conv.createdAt,
      },
      traceId,
      'created',
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : '创建会话失败';
    return fail(traceId, { message, status: 500 });
  }
});
