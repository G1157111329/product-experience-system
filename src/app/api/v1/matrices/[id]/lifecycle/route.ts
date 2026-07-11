import { NextRequest } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { canAccessMatrix, isAuthResponse, requireUser } from '@/lib/server/auth';
import { writeSecurityAudit } from '@/lib/server/security-audit';
import { matrixLifecyclePatch, type MatrixLifecycleAction } from '@/lib/matrix/matrix-lifecycle';
import { hasV3ViewDefinition } from '@/lib/matrix/bootstrap-v3';
import { ok, fail } from '@/lib/server/api-v1/response';
import { resolveTraceId } from '@/lib/server/api-v1/trace';

export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const traceId = resolveTraceId(request.headers);
  const { id } = await params;
  const client = getSupabaseClient();
  const user = await requireUser(request, client);
  if (isAuthResponse(user)) return fail(traceId, { message: '未认证', status: 401 });
  if (!(await canAccessMatrix(client, user, id))) {
    return fail(traceId, { message: '无权操作该矩阵', status: 403 });
  }

  const body = await request.json().catch(() => ({})) as {
    action?: MatrixLifecycleAction;
    reason?: string;
  };
  if (body.action !== 'archive' && body.action !== 'restore') {
    return fail(traceId, { message: 'action 必须为 archive 或 restore', status: 400 });
  }

  const { data: matrix, error: readError } = await client
    .from('task_matrices')
    .select('id,task_id,status,current_design_version_id')
    .eq('id', id)
    .maybeSingle();
  if (readError || !matrix) return fail(traceId, { message: '矩阵不存在', status: 404 });

  const hasV3View = await hasV3ViewDefinition(id);

  if (body.action === 'restore' && matrix.status !== 'archived') {
    return ok(matrix, traceId, '矩阵当前未删除');
  }
  if (body.action === 'archive' && matrix.status === 'archived') {
    return ok(matrix, traceId, '矩阵已在回收区');
  }

  const now = new Date().toISOString();
  const restoreStatus = hasV3View || matrix.current_design_version_id
    ? 'active'
    : 'designing';
  const patch = matrixLifecyclePatch(
    body.action,
    now,
    body.reason?.trim() || 'user_delete',
    restoreStatus,
  );
  const { data: updated, error } = await client
    .from('task_matrices')
    .update(patch)
    .eq('id', id)
    .select('id,task_id,name,status,archived_at,archived_reason,updated_at')
    .single();
  if (error || !updated) return fail(traceId, { message: error?.message || '矩阵状态更新失败', status: 500 });

  await writeSecurityAudit(client, {
    request,
    actor: user,
    action: body.action === 'archive' ? 'task_matrix.archived' : 'task_matrix.restored',
    outcome: 'success',
    targetType: 'task_matrix',
    targetId: id,
    metadata: { taskId: matrix.task_id, previousStatus: matrix.status, nextStatus: updated.status },
  });

  return ok(updated, traceId, body.action === 'archive' ? '矩阵已移入回收区' : '矩阵已恢复');
}
