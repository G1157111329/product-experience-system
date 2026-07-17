/**
 * POST /api/v1/agent/conversations
 * PRD V3.1.2.4 §11.4 — Create a conversation and its memory namespace.
 *
 * Body: { agentInstanceId?, taskId?, title?, projectId? }
 * If agentInstanceId omitted, resolves/creates a default active instance.
 */
import { NextRequest } from 'next/server';
import { sql, eq, and, desc } from 'drizzle-orm';
import { getDb } from '@/storage/database/pg-db';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { canAccessTask, requireUser, isAuthResponse } from '@/lib/server/auth';
import { ok, fail, unauthorized, withTrace } from '@/lib/server/api-v1/response';
import { conversations, agentInstances, aiModelConfigs } from '@/storage/database/shared/schema';
import { getV3FeatureFlags } from '@/lib/feature-flags-v3';

export const dynamic = 'force-dynamic';

interface CreateConversationBody {
  agentInstanceId?: string;
  taskId?: string;
  title?: string;
  projectId?: string;
}

async function resolveOrCreateAgentInstance(userId: string, preferredId?: string): Promise<string | null> {
  const db = await getDb();
  if (preferredId) {
    const rows = await db
      .select({ id: agentInstances.id, status: agentInstances.status, boundUserId: agentInstances.boundUserId })
      .from(agentInstances)
      .where(eq(agentInstances.id, preferredId))
      .limit(1)
      .execute();
    if (
      rows[0]
      && rows[0].status === 'active'
      && rows[0].boundUserId === userId
    ) {
      return rows[0].id;
    }
  }

  const active = await db
    .select({ id: agentInstances.id })
    .from(agentInstances)
    .where(and(
      eq(agentInstances.tenantId, 'default'),
      eq(agentInstances.status, 'active'),
      eq(agentInstances.boundUserId, userId),
    ))
    .limit(1)
    .execute();
  if (active[0]) return active[0].id;

  const models = await db
    .select({ id: aiModelConfigs.id })
    .from(aiModelConfigs)
    .where(eq(aiModelConfigs.isActive, true))
    .limit(1)
    .execute();

  const [created] = await db
    .insert(agentInstances)
    .values({
      tenantId: 'default',
      name: '默认任务助手',
      status: 'active',
      modelConfigId: models[0]?.id ?? null,
      boundUserId: userId,
      description: 'Wave 5 自动创建',
      createdBy: userId,
    })
    .returning({ id: agentInstances.id })
    .execute();
  return created?.id ?? null;
}

export const POST = withTrace<[NextRequest]>(async (traceId, req) => {
  const client = getSupabaseClient();
  const user = await requireUser(req, client);
  if (isAuthResponse(user)) return unauthorized(traceId, 'unauthorized');

  const flags = await getV3FeatureFlags();
  if (!flags.hermesAgentGatewayEnabled) {
    return fail(traceId, { message: '助手功能未启用', status: 403 });
  }

  let body: CreateConversationBody;
  try {
    body = await req.json();
  } catch {
    return fail(traceId, { message: '请求体不是合法 JSON', status: 400 });
  }

  const tenantId = 'default';
  const db = await getDb();

  if (body.taskId && !(await canAccessTask(client, user, body.taskId))) {
    return fail(traceId, { message: '无权访问该体验任务', status: 403 });
  }

  const agentInstanceId = await resolveOrCreateAgentInstance(
    user.id,
    typeof body.agentInstanceId === 'string' ? body.agentInstanceId : undefined,
  );
  if (!agentInstanceId) {
    return fail(traceId, { message: '无法创建助手实例，请先配置 AI 模型', status: 409 });
  }

  try {
    const namespaceKey = `conv:${agentInstanceId}:${user.id}:${Date.now()}`;
    const nsRows = await db.execute(sql`
      INSERT INTO agent_memory_namespaces
        (namespace_key, tenant_id, agent_instance_id, scope_config)
      VALUES
        (${namespaceKey}, ${tenantId}, ${agentInstanceId}, ${JSON.stringify({ kind: 'conversation', userId: user.id })}::jsonb)
      RETURNING id
    `);
    const memoryNamespaceId =
      nsRows.rows.length > 0 ? (nsRows.rows[0] as Record<string, unknown>).id as string : null;

    const [conv] = await db
      .insert(conversations)
      .values({
        tenantId,
        agentInstanceId,
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

export const GET = withTrace<[NextRequest]>(async (traceId, req) => {
  const client = getSupabaseClient();
  const user = await requireUser(req, client);
  if (isAuthResponse(user)) return unauthorized(traceId, 'unauthorized');

  const flags = await getV3FeatureFlags();
  if (!flags.hermesAgentGatewayEnabled) {
    return fail(traceId, { message: '助手功能未启用', status: 403 });
  }

  const taskId = new URL(req.url).searchParams.get('task_id');
  const db = await getDb();
  const where = taskId
    ? and(eq(conversations.platformUserId, user.id), eq(conversations.taskId, taskId))
    : eq(conversations.platformUserId, user.id);
  const rows = await db
    .select({
      id: conversations.id,
      agentInstanceId: conversations.agentInstanceId,
      taskId: conversations.taskId,
      projectId: conversations.projectId,
      title: conversations.title,
      status: conversations.status,
      lastEventId: conversations.lastEventId,
      wecomUserId: conversations.wecomUserId,
      createdAt: conversations.createdAt,
      updatedAt: conversations.updatedAt,
    })
    .from(conversations)
    .where(where)
    .orderBy(desc(conversations.updatedAt))
    .limit(200)
    .execute();

  return ok({
    items: rows.map((row) => ({
      ...row,
      channel: row.wecomUserId ? 'external_chat' : (row.taskId ? 'task' : 'platform'),
      channelLabel: row.wecomUserId ? '微信/企微' : (row.taskId ? '体验任务' : '平台对话'),
    })),
  }, traceId);
});
