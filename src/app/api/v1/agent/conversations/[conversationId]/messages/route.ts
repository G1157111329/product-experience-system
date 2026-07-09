/**
 * POST /api/v1/agent/conversations/{conversationId}/messages
 * PRD V3.1.2.4 §11.7 — Send a user message and run Hermes reply.
 *
 * Persists user + assistant messages into conversation_messages (with event_seq)
 * so the SSE stream endpoint can poll them. Returns the assistant reply.
 */
import { NextRequest } from 'next/server';
import { eq, sql, desc } from 'drizzle-orm';
import { getDb } from '@/storage/database/pg-db';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { requireUser, isAuthResponse } from '@/lib/server/auth';
import { ok, fail, unauthorized, withTrace } from '@/lib/server/api-v1/response';
import { conversations, conversationMessages } from '@/storage/database/shared/schema';
import { getV3FeatureFlags } from '@/lib/feature-flags-v3';
import { executeHermesRun } from '@/lib/server/hermes/runtime';

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

    const lastSeqRows = await db
      .select({ eventSeq: conversationMessages.eventSeq })
      .from(conversationMessages)
      .where(eq(conversationMessages.conversationId, conversationId))
      .orderBy(desc(conversationMessages.eventSeq))
      .limit(1)
      .execute();
    let nextSeq = (lastSeqRows[0]?.eventSeq ?? 0) + 1;

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
    nextSeq += 1;

    const history = await db
      .select({
        role: conversationMessages.role,
        content: conversationMessages.content,
      })
      .from(conversationMessages)
      .where(eq(conversationMessages.conversationId, conversationId))
      .orderBy(desc(conversationMessages.eventSeq))
      .limit(8)
      .execute();
    const historyText = history
      .reverse()
      .map((m) => `${m.role}: ${m.content ?? ''}`)
      .join('\n');

    const run = await executeHermesRun({
      agentInstanceId: conv.agentInstanceId,
      conversationId,
      trigger: 'manual',
      systemPrompt:
        '你是产品体验管理平台的任务助手。基于用户消息给出简洁、可执行的建议。不要编造未提供的数据。',
      userPrompt: `对话上下文：\n${historyText}\n\n请回复最新用户消息。`,
      userId: user.id,
      taskId: conv.taskId ?? undefined,
    });

    const assistantContent =
      run.status === 'succeeded' && run.output
        ? run.output
        : `助手暂不可用${run.errorCode ? `（${run.errorCode}）` : ''}，请稍后重试。`;

    const [assistantMsg] = await db
      .insert(conversationMessages)
      .values({
        conversationId,
        role: 'assistant',
        content: assistantContent,
        eventSeq: nextSeq,
      })
      .returning()
      .execute();

    await db
      .update(conversations)
      .set({ updatedAt: sql`NOW()` })
      .where(eq(conversations.id, conversationId))
      .execute();

    return ok(
      {
        userMessage: userMsg,
        assistantMessage: assistantMsg,
        runId: run.runId,
        status: run.status,
        errorCode: run.errorCode ?? null,
      },
      traceId,
      'created',
    );
  },
);
