/**
 * POST /api/v1/agent/conversations/{conversationId}/messages
 * Hermes turn: skills/planner → confirmable platform actions (not advice-only chat).
 */
import { NextRequest } from 'next/server';
import { eq, desc } from 'drizzle-orm';
import { getDb } from '@/storage/database/pg-db';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { requireUser, isAuthResponse } from '@/lib/server/auth';
import { ok, fail, unauthorized, withTrace } from '@/lib/server/api-v1/response';
import { conversations, conversationMessages } from '@/storage/database/shared/schema';
import { getV3FeatureFlags } from '@/lib/feature-flags-v3';
import { canAccessConversationRow } from '@/lib/server/agent-access';
import { dispatchHermesTurn } from '@/lib/server/hermes/hermes-turn';

export const dynamic = 'force-dynamic';

interface MessageBody {
  content?: string;
}

export const POST = withTrace<[NextRequest, { params: Promise<{ conversationId: string }> }]>(
  async (traceId, req, ctx) => {
    const { conversationId } = await ctx.params;

    const client = getSupabaseClient();
    const user = await requireUser(req, client);
    if (isAuthResponse(user)) return unauthorized(traceId, 'unauthorized');

    const flags = await getV3FeatureFlags();
    if (!flags.hermesAgentGatewayEnabled) {
      return fail(traceId, { message: '助手功能未启用', status: 403 });
    }

    let body: MessageBody;
    try {
      body = await req.json();
    } catch {
      return fail(traceId, { message: '请求体不是合法 JSON', status: 400 });
    }

    const content = typeof body.content === 'string' ? body.content.trim() : '';
    if (!content) {
      return fail(traceId, { message: 'content 不能为空', status: 400 });
    }

    const db = await getDb();
    const convRows = await db
      .select()
      .from(conversations)
      .where(eq(conversations.id, conversationId))
      .limit(1)
      .execute();
    const conv = convRows[0];
    if (!conv) {
      return fail(traceId, { message: '对话不存在', status: 404 });
    }
    if (!canAccessConversationRow(user, conv)) {
      return fail(traceId, { message: '无权访问该对话', status: 403 });
    }

    const lastSeqRows = await db
      .select({ eventSeq: conversationMessages.eventSeq })
      .from(conversationMessages)
      .where(eq(conversationMessages.conversationId, conversationId))
      .orderBy(desc(conversationMessages.eventSeq))
      .limit(1)
      .execute();
    const nextSeq = (lastSeqRows[0]?.eventSeq ?? 0) + 1;

    const [userMsg] = await db
      .insert(conversationMessages)
      .values({
        conversationId,
        role: 'user',
        content,
        eventSeq: nextSeq,
      })
      .returning()
      .execute();

    const turn = await dispatchHermesTurn({
      agentInstanceId: conv.agentInstanceId,
      conversationId,
      platformUserId: user.id,
      content,
      userEventSeq: nextSeq,
      trigger: 'manual',
    });

    const assistantRows = await db
      .select()
      .from(conversationMessages)
      .where(eq(conversationMessages.conversationId, conversationId))
      .orderBy(desc(conversationMessages.eventSeq))
      .limit(5)
      .execute();
    const assistantMessage = assistantRows.find((row) => row.role === 'assistant') || null;
    const actionPlanMessage = turn.actionPlanMessageId
      ? assistantRows.find((row) => row.id === turn.actionPlanMessageId)
        || (await db.select().from(conversationMessages).where(eq(conversationMessages.id, turn.actionPlanMessageId)).limit(1).execute())[0]
      : null;

    return ok(
      {
        userMessage: userMsg,
        assistantMessage,
        actionPlanMessage,
        runId: turn.runId,
        status: turn.status,
        errorCode: turn.errorCode ?? null,
      },
      traceId,
      'created',
    );
  },
);

export const GET = withTrace<[NextRequest, { params: Promise<{ conversationId: string }> }]>(
  async (traceId, req, ctx) => {
    const { conversationId } = await ctx.params;
    const client = getSupabaseClient();
    const user = await requireUser(req, client);
    if (isAuthResponse(user)) return unauthorized(traceId, 'unauthorized');

    const db = await getDb();
    const convRows = await db
      .select()
      .from(conversations)
      .where(eq(conversations.id, conversationId))
      .limit(1)
      .execute();
    const conv = convRows[0];
    if (!conv) return fail(traceId, { message: '对话不存在', status: 404 });
    if (!canAccessConversationRow(user, conv)) {
      return fail(traceId, { message: '无权访问该对话', status: 403 });
    }

    const rows = await db
      .select()
      .from(conversationMessages)
      .where(eq(conversationMessages.conversationId, conversationId))
      .orderBy(conversationMessages.eventSeq)
      .execute();

    return ok({ messages: rows }, traceId);
  },
);
