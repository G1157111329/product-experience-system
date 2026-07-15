import { NextRequest } from 'next/server';
import { and, eq, sql } from 'drizzle-orm';
import { getDb } from '@/storage/database/pg-db';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { requireUser, isAuthResponse } from '@/lib/server/auth';
import { fail, ok, unauthorized, withTrace } from '@/lib/server/api-v1/response';
import { agentSuggestionBlocks, matrixNarrativeBlocks } from '@/storage/database/shared/schema';
import { getV3FeatureFlags } from '@/lib/feature-flags-v3';
import { authorizeSuggestionDecisionAccess, AgentResourceAccessError } from '@/lib/server/agent-resource-access';
import { writeSecurityAudit } from '@/lib/server/security-audit';

export const dynamic = 'force-dynamic';
type Decision = 'accepted' | 'rejected' | 'edited_then_accepted';
interface DecideBody { decision?: string; editedPayload?: unknown }

class DecisionRouteError extends Error {
  constructor(readonly statusCode: number, message: string, readonly details?: Record<string, unknown>) { super(message); }
}

const isDecision = (value: unknown): value is Decision => value === 'accepted' || value === 'rejected' || value === 'edited_then_accepted';
function field(payload: unknown, key: string): string {
  return payload && typeof payload === 'object' && typeof (payload as Record<string, unknown>)[key] === 'string'
    ? String((payload as Record<string, unknown>)[key]) : '';
}

export const POST = withTrace<[NextRequest, { params: Promise<{ id: string }> }]>(async (traceId, req, ctx) => {
  const { id: blockId } = await ctx.params;
  const user = await requireUser(req, getSupabaseClient());
  if (isAuthResponse(user)) return unauthorized(traceId, 'unauthorized');
  if (!(await getV3FeatureFlags()).hermesAgentGatewayEnabled) return fail(traceId, { message: '助手功能未启用', status: 403 });

  let body: DecideBody;
  try { body = await req.json(); } catch { return fail(traceId, { message: '请求体不是合法 JSON', status: 400 }); }
  if (!isDecision(body.decision)) return fail(traceId, { message: 'decision 非法', status: 400 });
  if (body.decision === 'edited_then_accepted' && (!body.editedPayload || typeof body.editedPayload !== 'object')) {
    return fail(traceId, { message: 'edited_then_accepted 必须携带 editedPayload', status: 400 });
  }

  let authorized: Awaited<ReturnType<typeof authorizeSuggestionDecisionAccess>>;
  try {
    authorized = await authorizeSuggestionDecisionAccess(
      { user, suggestionBlockId: blockId },
      async (denial) => writeSecurityAudit(getSupabaseClient(), {
        action: 'agent.suggestion_decision_access',
        outcome: 'denied',
        request: req,
        actor: user,
        targetType: denial.resourceType,
        targetId: denial.resourceId,
        metadata: { reason: denial.reason, traceId },
      }),
    );
  } catch (error) {
    const status = error instanceof AgentResourceAccessError && error.code === 'not_found' ? 404 : 403;
    return fail(traceId, { message: status === 404 ? 'suggestion_block 不存在' : '无权操作该建议', status });
  }

  const db = await getDb();
  try {
    const result = await db.transaction(async (tx) => {
      const rows = await tx.select({
        id: agentSuggestionBlocks.id, status: agentSuggestionBlocks.status, blockType: agentSuggestionBlocks.blockType,
        payload: agentSuggestionBlocks.payload,
      }).from(agentSuggestionBlocks).where(eq(agentSuggestionBlocks.id, blockId)).limit(1).execute();
      const existing = rows[0];
      if (!existing) throw new DecisionRouteError(404, 'suggestion_block 不存在');
      if (existing.status !== 'pending') throw new DecisionRouteError(409, `建议块当前状态为 ${existing.status}`, { currentStatus: existing.status });

      const [updated] = await tx.update(agentSuggestionBlocks).set({
        status: body.decision, decidedBy: user.id, decidedAt: sql`NOW()`,
        ...(body.decision === 'edited_then_accepted' ? { editedPayload: body.editedPayload } : {}),
      }).where(and(eq(agentSuggestionBlocks.id, blockId), eq(agentSuggestionBlocks.status, 'pending'))).returning({
        id: agentSuggestionBlocks.id, status: agentSuggestionBlocks.status, blockType: agentSuggestionBlocks.blockType,
        payload: agentSuggestionBlocks.payload, editedPayload: agentSuggestionBlocks.editedPayload,
        decidedBy: agentSuggestionBlocks.decidedBy, decidedAt: agentSuggestionBlocks.decidedAt,
      }).execute();
      if (!updated) throw new DecisionRouteError(409, '建议块已被其他请求决策');

      let narrativeId: string | null = null;
      if (body.decision !== 'rejected') {
        const content = body.decision === 'edited_then_accepted' ? field(body.editedPayload, 'content') || field(existing.payload, 'content') : field(existing.payload, 'content');
        const scopeNodeId = field(existing.payload, 'scopeNodeId') || null;
        if (content.trim()) {
          const scope = scopeNodeId ? 'level_1_group' : 'matrix';
          const prior = await tx.select({ id: matrixNarrativeBlocks.id }).from(matrixNarrativeBlocks).where(and(
            eq(matrixNarrativeBlocks.matrixId, authorized.matrixId), eq(matrixNarrativeBlocks.blockType, 'summary'),
            eq(matrixNarrativeBlocks.scope, scope), scopeNodeId ? eq(matrixNarrativeBlocks.scopeNodeId, scopeNodeId) : sql`${matrixNarrativeBlocks.scopeNodeId} IS NULL`,
          )).limit(1).execute();
          if (prior[0]) {
            await tx.update(matrixNarrativeBlocks).set({ content, aiSuggestionId: blockId, showInReport: true, updatedBy: user.id, updatedAt: sql`NOW()` }).where(eq(matrixNarrativeBlocks.id, prior[0].id)).execute();
            narrativeId = prior[0].id;
          } else {
            const [created] = await tx.insert(matrixNarrativeBlocks).values({ matrixId: authorized.matrixId, blockType: 'summary', scope, scopeNodeId, content, aiSuggestionId: blockId, showInReport: true, sortOrder: 0, updatedBy: user.id }).returning({ id: matrixNarrativeBlocks.id }).execute();
            narrativeId = created?.id ?? null;
          }
        }
      }
      return { ...updated, narrativeId };
    });
    return ok(result, traceId);
  } catch (error) {
    if (error instanceof DecisionRouteError) return fail(traceId, { message: error.message, status: error.statusCode, details: error.details });
    throw error;
  }
});
