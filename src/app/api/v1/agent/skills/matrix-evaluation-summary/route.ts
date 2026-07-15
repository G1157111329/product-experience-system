/**
 * POST /api/v1/agent/skills/matrix-evaluation-summary
 * PRD V3.1.2.4 §11.6 — Trigger the matrix evaluation summary skill.
 *
 * Body: { matrixId, scope }
 * Returns the pending suggestion blocks (never auto-applied, PRD §11.5).
 * Auto-provisions a default active agent_instance when none exists.
 */
import { NextRequest } from 'next/server';
import { eq, and } from 'drizzle-orm';
import { getDb } from '@/storage/database/pg-db';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { requireUser, isAuthResponse } from '@/lib/server/auth';
import { ok, fail, unauthorized, withTrace } from '@/lib/server/api-v1/response';
import { runMatrixSummarySkill } from '@/lib/server/hermes/skills';
import { getV3FeatureFlags } from '@/lib/feature-flags-v3';
import { agentInstances, aiModelConfigs } from '@/storage/database/shared/schema';
import { authorizeMatrixSkillAccess, AgentResourceAccessError } from '@/lib/server/agent-resource-access';
import { writeSecurityAudit } from '@/lib/server/security-audit';

export const dynamic = 'force-dynamic';

interface MatrixSummaryRequestBody {
  matrixId?: string;
  scope?: string;
}

/** Ensure at least one active agent instance exists for the default tenant. */
async function ensureDefaultAgentInstance(userId: string): Promise<void> {
  const db = await getDb();
  const existing = await db
    .select({ id: agentInstances.id })
    .from(agentInstances)
    .where(and(eq(agentInstances.tenantId, 'default'), eq(agentInstances.status, 'active')))
    .limit(1)
    .execute();
  if (existing.length > 0) return;

  const models = await db
    .select({ id: aiModelConfigs.id })
    .from(aiModelConfigs)
    .where(eq(aiModelConfigs.isActive, true))
    .limit(1)
    .execute();

  await db
    .insert(agentInstances)
    .values({
      tenantId: 'default',
      name: '默认矩阵助手',
      status: 'active',
      modelConfigId: models[0]?.id ?? null,
      description: 'Wave 5 自动创建的默认 AI助手实例',
      createdBy: userId,
    })
    .execute();
}

export const POST = withTrace<[NextRequest]>(async (traceId, req) => {
  const client = getSupabaseClient();
  const user = await requireUser(req, client);
  if (isAuthResponse(user)) return unauthorized(traceId, 'unauthorized');

  const flags = await getV3FeatureFlags();
  if (!flags.hermesAgentGatewayEnabled) {
    return fail(traceId, { message: '助手功能未启用', status: 403 });
  }

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

  try {
    await authorizeMatrixSkillAccess(
      { user, matrixId: body.matrixId },
      async (denial) => writeSecurityAudit(client, {
        action: 'agent.matrix_summary_access',
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
    return fail(traceId, { message: status === 404 ? '矩阵不存在' : '无权访问该矩阵', status });
  }

  try {
    await ensureDefaultAgentInstance(user.id);
  } catch {
    // Non-fatal — skill will still report no_agent_instance if insert failed.
  }

  const result = await runMatrixSummarySkill({
    matrixId: body.matrixId,
    scope,
    user,
  });

  if (result.status === 'failed') {
    const status =
      result.errorCode === 'matrix_not_found' ? 404 :
      result.errorCode === 'no_agent_instance' ? 409 : 500;
    const friendly =
      result.errorCode === 'no_agent_instance'
        ? '助手暂不可用：请先在设置中配置 AI 模型'
        : `矩阵总结技能执行失败: ${result.errorCode ?? 'unknown'}`;
    return fail(traceId, {
      message: friendly,
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
