/**
 * Create a V3 excel-like matrix for a task.
 * POST /api/v1/tasks/{id}/matrices
 *
 * Body: { name, description?, view_mode?: 'excel_like_dynamic_matrix' | 'v2_designer' }
 * Default view_mode = excel_like_dynamic_matrix (PRD §13.2).
 */
import { NextRequest } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { canAccessTask, isAuthResponse, requireUser } from '@/lib/server/auth';
import { writeSecurityAudit } from '@/lib/server/security-audit';
import { bootstrapV3MatrixView } from '@/lib/matrix/bootstrap-v3';
import { getV3FeatureFlags } from '@/lib/feature-flags-v3';
import { ok, fail } from '@/lib/server/api-v1/response';
import { resolveTraceId } from '@/lib/server/api-v1/trace';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const traceId = resolveTraceId(req.headers);
  const { id: taskId } = await params;

  const client = getSupabaseClient();
  const user = await requireUser(req, client);
  if (isAuthResponse(user)) return fail(traceId, { message: '未认证', status: 401 });

  if (!(await canAccessTask(client, user, taskId))) {
    return fail(traceId, { message: '无权访问该任务', status: 403 });
  }

  const flags = await getV3FeatureFlags();
  if (!flags.taskMatrixEnabled) {
    return fail(traceId, { message: '数据矩阵功能未启用', status: 403 });
  }

  let body: { name?: string; description?: string; view_mode?: string };
  try {
    body = await req.json();
  } catch {
    return fail(traceId, { message: '请求体不是合法 JSON', status: 400 });
  }

  if (!body.name?.trim()) {
    return fail(traceId, { message: '矩阵名称不能为空', status: 400 });
  }

  const viewMode = body.view_mode === 'v2_designer' ? 'v2_designer' : 'excel_like_dynamic_matrix';
  const useV3 = viewMode === 'excel_like_dynamic_matrix' && flags.dynamicMatrixExcelLikeViewEnabled;

  const { data, error } = await client
    .from('task_matrices')
    .insert({
      task_id: taskId,
      name: body.name.trim(),
      description: body.description?.trim() ?? null,
      status: useV3 ? 'active' : 'designing',
      comparability_status: 'not_applicable',
      created_by: user.id,
    })
    .select()
    .single();

  if (error) {
    if (error.message?.includes('duplicate') || error.message?.includes('unique')) {
      return fail(traceId, { message: '该任务中已存在同名矩阵', status: 409 });
    }
    return fail(traceId, { message: error.message, status: 500 });
  }

  let viewDefinitionId: string | null = null;
  if (useV3) {
    try {
      const boot = await bootstrapV3MatrixView({ matrixId: data.id, userId: user.id });
      viewDefinitionId = boot.viewDefinitionId;
    } catch (err) {
      // Roll back the matrix row if bootstrap fails.
      await client.from('task_matrices').delete().eq('id', data.id);
      const message = err instanceof Error ? err.message : '初始化 V3 视图失败';
      return fail(traceId, { message, status: 500 });
    }
  }

  await writeSecurityAudit(client, {
    request: req,
    actor: user,
    action: 'task_matrix.created',
    outcome: 'success',
    targetType: 'task_matrix',
    targetId: data.id,
    metadata: { taskId, name: body.name, viewMode, viewDefinitionId },
  });

  return ok(
    {
      id: data.id,
      taskId: data.task_id,
      name: data.name,
      description: data.description,
      status: useV3 ? 'active' : data.status,
      viewMode: useV3 ? 'excel_like_dynamic_matrix' : 'v2_designer',
      currentViewDefinitionId: viewDefinitionId,
      createdAt: data.created_at,
    },
    traceId,
    'created',
  );
}
