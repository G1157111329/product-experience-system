/**
 * POST /api/v1/agent/skills/matrix-evaluation-summary
 * PRD V3.1.2.4 §11.6 — Trigger the matrix evaluation summary skill.
 *
 * Body: { matrixId, scope }
 * Returns the pending suggestion blocks (never auto-applied, PRD §11.5).
 */
import { NextRequest } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { requireUser, isAuthResponse } from '@/lib/server/auth';
import { ok, fail, unauthorized, withTrace } from '@/lib/server/api-v1/response';
import { runMatrixSummarySkill } from '@/lib/server/hermes/skills';

export const dynamic = 'force-dynamic';

interface MatrixSummaryRequestBody {
  matrixId?: string;
  scope?: string;
}

export const POST = withTrace<[NextRequest]>(async (traceId, req) => {
  const client = getSupabaseClient();
  const user = await requireUser(req, client);
  if (isAuthResponse(user)) return unauthorized(traceId, 'unauthorized');

  let body: MatrixSummaryRequestBody;
  try {
    body = await req.json();
  } catch {
    return fail(traceId, { message: '请求体不是合法 JSON', status: 400 });
  }

  if (!body.matrixId || typeof body.matrixId !== 'string') {
    return fail(traceId, { message: 'matrixId 必填', status: 400 });
  }
  const scope = body.scope === 'by_level_1_group' ? 'by_level_1_group' : 'by_level_1_group';

  const result = await runMatrixSummarySkill({
    matrixId: body.matrixId,
    scope,
    userId: user.id,
  });

  if (result.status === 'failed') {
    const status =
      result.errorCode === 'matrix_not_found' ? 404 :
      result.errorCode === 'no_agent_instance' ? 409 : 500;
    return fail(traceId, {
      message: `矩阵总结技能执行失败: ${result.errorCode ?? 'unknown'}`,
      status,
      details: { errorCode: result.errorCode, runId: result.runId || null },
    });
  }

  return ok(
    {
      runId: result.runId,
      traceId: result.traceId,
      suggestions: result.suggestions,
    },
    traceId,
  );
});
