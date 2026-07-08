/**
 * POST /api/v1/agent/suggestion-blocks/{id}/decide
 * PRD V3.1.2.4 §11.5 — Accept / reject / edit-accept a suggestion block.
 *
 * Body: { decision: 'accepted'|'rejected'|'edited_then_accepted', editedPayload? }
 * Transitions the block from 'pending' to the decided status. Only pending
 * blocks may be decided; idempotent re-decisions return 409.
 */
import { NextRequest } from 'next/server';
import { sql, eq } from 'drizzle-orm';
import { getDb } from '@/storage/database/pg-db';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { requireUser, isAuthResponse } from '@/lib/server/auth';
import { ok, fail, unauthorized, notFound, withTrace } from '@/lib/server/api-v1/response';
import { agentSuggestionBlocks } from '@/storage/database/shared/schema';

export const dynamic = 'force-dynamic';

type Decision = 'accepted' | 'rejected' | 'edited_then_accepted';

interface DecideBody {
  decision?: string;
  editedPayload?: unknown;
}

function isDecision(value: unknown): value is Decision {
  return value === 'accepted' || value === 'rejected' || value === 'edited_then_accepted';
}

export const POST = withTrace<[NextRequest, { params: Promise<{ id: string }> }]>(
  async (traceId, req, ctx) => {
    const { id: blockId } = await ctx.params;

    const client = getSupabaseClient();
    const user = await requireUser(req, client);
    if (isAuthResponse(user)) return unauthorized(traceId, 'unauthorized');

    let body: DecideBody;
    try {
      body = await req.json();
    } catch {
      return fail(traceId, { message: '请求体不是合法 JSON', status: 400 });
    }

    if (!isDecision(body.decision)) {
      return fail(traceId, {
        message: "decision 必须为 'accepted' | 'rejected' | 'edited_then_accepted'",
        status: 400,
      });
    }

    if (body.decision === 'edited_then_accepted') {
      if (!body.editedPayload || typeof body.editedPayload !== 'object') {
        return fail(traceId, {
          message: 'edited_then_accepted 必须携带 editedPayload 对象',
          status: 400,
        });
      }
    }

    const db = await getDb();

    // Load current row.
    const existing = await db
      .select({
        id: agentSuggestionBlocks.id,
        status: agentSuggestionBlocks.status,
        blockType: agentSuggestionBlocks.blockType,
        payload: agentSuggestionBlocks.payload,
      })
      .from(agentSuggestionBlocks)
      .where(eq(agentSuggestionBlocks.id, blockId))
      .limit(1)
      .execute();
    if (existing.length === 0) {
      return notFound(traceId, 'suggestion_block 不存在');
    }
    if (existing[0].status !== 'pending') {
      return fail(traceId, {
        message: `该建议块当前状态为 ${existing[0].status}，不可再次决策`,
        status: 409,
        details: { currentStatus: existing[0].status },
      });
    }

    const setClause: Record<string, unknown> = {
      status: body.decision,
      decidedBy: user.id,
      decidedAt: sql`NOW()`,
    };
    if (body.decision === 'edited_then_accepted' && body.editedPayload) {
      setClause.editedPayload = body.editedPayload;
    }

    const [updated] = await db
      .update(agentSuggestionBlocks)
      .set(setClause)
      .where(eq(agentSuggestionBlocks.id, blockId))
      .returning({
        id: agentSuggestionBlocks.id,
        status: agentSuggestionBlocks.status,
        blockType: agentSuggestionBlocks.blockType,
        payload: agentSuggestionBlocks.payload,
        editedPayload: agentSuggestionBlocks.editedPayload,
        decidedBy: agentSuggestionBlocks.decidedBy,
        decidedAt: agentSuggestionBlocks.decidedAt,
      })
      .execute();

    return ok(
      {
        id: updated.id,
        status: updated.status,
        blockType: updated.blockType,
        payload: updated.payload,
        editedPayload: updated.editedPayload,
        decidedBy: updated.decidedBy,
        decidedAt: updated.decidedAt,
      },
      traceId,
    );
  },
);
