/**
 * GET /api/v1/agent/conversations/{conversationId}/stream
 * PRD V3.1.2.4 §11.7 — SSE stream of conversation messages.
 *
 * Streams `conversation_messages` as they're generated. Supports Last-Event-ID
 * recovery: on reconnect the client resends the last id and we replay any
 * messages with event_seq > that id, then continue polling for new ones.
 *
 * Auth: requireUser.
 */
import { NextRequest } from 'next/server';
import { sql, eq, and, gt } from 'drizzle-orm';
import { getDb } from '@/storage/database/pg-db';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { requireUser, isAuthResponse } from '@/lib/server/auth';
import { fail, unauthorized, forbidden } from '@/lib/server/api-v1/response';
import { resolveTraceId } from '@/lib/server/api-v1/trace';
import { conversations, conversationMessages } from '@/storage/database/shared/schema';
import {
  createSSEStream,
  parseLastEventId,
  SSE_RESPONSE_HEADERS,
  type SSESend,
} from '@/lib/server/hermes/sse';
import { canAccessConversationRow } from '@/lib/server/agent-access';
import { stripAssistantReasoning } from '@/lib/assistant-output';

export const dynamic = 'force-dynamic';

const POLL_INTERVAL_MS = 2000;
const MAX_STREAM_MS = 10 * 60 * 1000; // safety cap; client reconnects via Last-Event-ID.

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> },
) {
  const traceId = resolveTraceId(req.headers);
  const { conversationId } = await params;

  const client = getSupabaseClient();
  const user = await requireUser(req, client);
  if (isAuthResponse(user)) return unauthorized(traceId, 'unauthorized');

  const db = await getDb();

  // Validate conversation exists + belongs to this user (platform_user_id).
  const convRows = await db
    .select({
      id: conversations.id,
      platformUserId: conversations.platformUserId,
      status: conversations.status,
    })
    .from(conversations)
    .where(eq(conversations.id, conversationId))
    .limit(1)
    .execute();
  if (convRows.length === 0) {
    return fail(traceId, { message: 'conversation 不存在', status: 404 });
  }
  const conv = convRows[0];
  if (!canAccessConversationRow(user, conv)) {
    return forbidden(traceId, '无权访问该会话');
  }

  const lastEventId = parseLastEventId(req.headers.get('last-event-id'));
  const startedAt = Date.now();

  const stream = createSSEStream(async (send: SSESend) => {
    let lastSeenSeq = lastEventId ?? 0;

    const poll = async () => {
      const rows = await db
        .select({
          id: conversationMessages.id,
          role: conversationMessages.role,
          content: conversationMessages.content,
          eventSeq: conversationMessages.eventSeq,
          toolCallId: conversationMessages.toolCallId,
          toolName: conversationMessages.toolName,
          modelName: conversationMessages.modelName,
        })
        .from(conversationMessages)
        .where(
          and(
            eq(conversationMessages.conversationId, conversationId),
            gt(conversationMessages.eventSeq, lastSeenSeq),
          ),
        )
        .orderBy(conversationMessages.eventSeq)
        .execute();

      for (const row of rows) {
        const seq = Number(row.eventSeq);
        if (seq > lastSeenSeq) lastSeenSeq = seq;
        send({
          type: 'message.completed',
          data: {
            messageId: row.id,
            conversationId,
            role: row.role,
            content: row.role === 'assistant' ? stripAssistantReasoning(row.content) : row.content,
            eventSeq: seq,
            toolCallId: row.toolCallId,
            toolName: row.toolName,
            modelName: row.modelName,
          },
        });
      }
    };

    // Initial replay.
    await poll();

    // Poll until the conversation closes or the safety cap elapses.
    while (
      Date.now() - startedAt < MAX_STREAM_MS &&
      conv.status === 'active'
    ) {
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
      await poll();
      // Re-check status in case the conversation was closed mid-stream.
      const statusRows = await db
        .select({ status: conversations.status })
        .from(conversations)
        .where(eq(conversations.id, conversationId))
        .limit(1)
        .execute();
      if (statusRows.length > 0 && statusRows[0].status !== 'active') break;
    }
  }, lastEventId ?? 0);

  return new Response(stream, { headers: SSE_RESPONSE_HEADERS });
}

// Keep imports referenced (sql used in raw-SQL fallback paths elsewhere).
void sql;
