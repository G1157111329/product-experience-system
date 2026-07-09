/**
 * POST /api/v1/agent/suggestion-blocks/{id}/decide
 * PRD V3.1.2.4 §11.5 — Accept / reject / edit-accept a suggestion block.
 *
 * Body: { decision: 'accepted'|'rejected'|'edited_then_accepted', editedPayload?, matrixId? }
 * On accept: upserts matrix_narrative_blocks and sets ai_suggestion_id.
 */
import { NextRequest } from 'next/server';
import { sql, eq, and } from 'drizzle-orm';
import { getDb } from '@/storage/database/pg-db';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { requireUser, isAuthResponse } from '@/lib/server/auth';
import { ok, fail, unauthorized, notFound, withTrace } from '@/lib/server/api-v1/response';
import { agentSuggestionBlocks, matrixNarrativeBlocks } from '@/storage/database/shared/schema';
import { getV3FeatureFlags } from '@/lib/feature-flags-v3';

export const dynamic = 'force-dynamic';

type Decision = 'accepted' | 'rejected' | 'edited_then_accepted';

interface DecideBody {
  decision?: string;
  editedPayload?: unknown;
  matrixId?: string;
}

function isDecision(value: unknown): value is Decision {
  return value === 'accepted' || value === 'rejected' || value === 'edited_then_accepted';
}

function extractContent(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return '';
  const p = payload as Record<string, unknown>;
  return typeof p.content === 'string' ? p.content : '';
}

function extractScopeNodeId(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const p = payload as Record<string, unknown>;
  return typeof p.scopeNodeId === 'string' ? p.scopeNodeId : null;
}

export const POST = withTrace<[NextRequest, { params: Promise<{ id: string }> }]>(
  async (traceId, req, ctx) => {
    const { id: blockId } = await ctx.params;

    const client = getSupabaseClient();
    const user = await requireUser(req, client);
    if (isAuthResponse(user)) return unauthorized(traceId, 'unauthorized');

    const flags = await getV3FeatureFlags();
    if (!flags.hermesAgentGatewayEnabled) {
      return fail(traceId, { message: '助手功能未启用', status: 403 });
    }

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

    const existing = await db
      .select({
        id: agentSuggestionBlocks.id,
        status: agentSuggestionBlocks.status,
        blockType: agentSuggestionBlocks.blockType,
        payload: agentSuggestionBlocks.payload,
        targetEntityType: agentSuggestionBlocks.targetEntityType,
        targetEntityId: agentSuggestionBlocks.targetEntityId,
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

    let narrativeId: string | null = null;
    if (body.decision === 'accepted' || body.decision === 'edited_then_accepted') {
      const payload = existing[0].payload;
      const content =
        body.decision === 'edited_then_accepted'
          ? extractContent(body.editedPayload) || extractContent(payload)
          : extractContent(payload);
      const scopeNodeId = extractScopeNodeId(payload);
      const matrixId =
        (typeof body.matrixId === 'string' ? body.matrixId : null) ||
        (existing[0].targetEntityType === 'matrix' ? existing[0].targetEntityId : null);

      if (matrixId && content.trim()) {
        const scope = scopeNodeId ? 'level_1_group' : 'matrix';
        const existingNarr = await db
          .select({ id: matrixNarrativeBlocks.id })
          .from(matrixNarrativeBlocks)
          .where(
            and(
              eq(matrixNarrativeBlocks.matrixId, matrixId),
              eq(matrixNarrativeBlocks.blockType, 'summary'),
              eq(matrixNarrativeBlocks.scope, scope),
              scopeNodeId
                ? eq(matrixNarrativeBlocks.scopeNodeId, scopeNodeId)
                : sql`${matrixNarrativeBlocks.scopeNodeId} IS NULL`,
            ),
          )
          .limit(1)
          .execute();

        if (existingNarr[0]) {
          await db
            .update(matrixNarrativeBlocks)
            .set({
              content,
              aiSuggestionId: blockId,
              showInReport: true,
              updatedBy: user.id,
              updatedAt: sql`NOW()`,
            })
            .where(eq(matrixNarrativeBlocks.id, existingNarr[0].id))
            .execute();
          narrativeId = existingNarr[0].id;
        } else {
          const [created] = await db
            .insert(matrixNarrativeBlocks)
            .values({
              matrixId,
              blockType: 'summary',
              scope,
              scopeNodeId,
              content,
              aiSuggestionId: blockId,
              showInReport: true,
              sortOrder: 0,
              updatedBy: user.id,
            })
            .returning({ id: matrixNarrativeBlocks.id })
            .execute();
          narrativeId = created?.id ?? null;
        }
      }
    }

    return ok(
      {
        id: updated.id,
        status: updated.status,
        blockType: updated.blockType,
        payload: updated.payload,
        editedPayload: updated.editedPayload,
        decidedBy: updated.decidedBy,
        decidedAt: updated.decidedAt,
        narrativeId,
      },
      traceId,
    );
  },
);
