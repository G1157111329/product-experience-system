/**
 * PATCH / DELETE /api/v1/admin/wecom-bindings/{id}
 */
import { NextRequest } from 'next/server';
import { eq, sql } from 'drizzle-orm';
import { getDb } from '@/storage/database/pg-db';
import { wecomBindings } from '@/storage/database/shared/schema';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { requireAdmin, isAuthResponse } from '@/lib/server/auth';
import { ok, fail, unauthorized, notFound, withTrace } from '@/lib/server/api-v1/response';

export const dynamic = 'force-dynamic';

export const PATCH = withTrace<[NextRequest, { params: Promise<{ id: string }> }]>(
  async (traceId, req, ctx) => {
    const client = getSupabaseClient();
    const admin = await requireAdmin(req, client);
    if (isAuthResponse(admin)) return unauthorized(traceId, 'unauthorized');
    void admin;

    const { id } = await ctx.params;
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return fail(traceId, { message: '请求体不是合法 JSON', status: 400 });
    }

    const set: Record<string, unknown> = { updatedAt: sql`NOW()` };
    if (body.status !== undefined) set.status = String(body.status);
    if (body.agentInstanceId !== undefined || body.agent_instance_id !== undefined) {
      set.agentInstanceId = body.agentInstanceId || body.agent_instance_id || null;
    }
    if (body.projectScope !== undefined || body.project_scope !== undefined) {
      set.projectScope = body.projectScope ?? body.project_scope ?? null;
    }

    const db = await getDb();
    const [row] = await db
      .update(wecomBindings)
      .set(set)
      .where(eq(wecomBindings.id, id))
      .returning()
      .execute();

    if (!row) return notFound(traceId, '绑定不存在');
    return ok(row, traceId);
  },
);

export const DELETE = withTrace<[NextRequest, { params: Promise<{ id: string }> }]>(
  async (traceId, req, ctx) => {
    const client = getSupabaseClient();
    const admin = await requireAdmin(req, client);
    if (isAuthResponse(admin)) return unauthorized(traceId, 'unauthorized');
    const { id } = await ctx.params;
    const db = await getDb();
    const [row] = await db
      .update(wecomBindings)
      .set({ status: 'unbound', updatedAt: sql`NOW()` })
      .where(eq(wecomBindings.id, id))
      .returning()
      .execute();

    if (!row) return notFound(traceId, '绑定不存在');
    await db.execute(sql`
      UPDATE agent_memory_namespaces
      SET scope_config = COALESCE(scope_config, '{}'::jsonb) || '{"frozen":true,"freeze_reason":"binding_unbound"}'::jsonb,
          updated_at = NOW()
      WHERE binding_id = ${id}
    `);
    return ok(row, traceId, 'unbound');
  },
);
