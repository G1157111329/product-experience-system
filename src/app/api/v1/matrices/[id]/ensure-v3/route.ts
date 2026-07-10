/**
 * POST /api/v1/matrices/{id}/ensure-v3
 * Ensure a task_matrix has a V3 excel-like view definition + structural columns.
 * Used when opening a legacy matrix under the Wave 2 flag.
 */
import { NextRequest } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { canAccessMatrix, requireUser, isAuthResponse } from '@/lib/server/auth';
import { ensureV3ViewForMatrix } from '@/lib/matrix/bootstrap-v3';
import { ok, fail } from '@/lib/server/api-v1/response';
import { resolveTraceId } from '@/lib/server/api-v1/trace';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const traceId = resolveTraceId(req.headers);
  const { id: matrixId } = await params;

  const client = getSupabaseClient();
  const user = await requireUser(req, client);
  if (isAuthResponse(user)) return fail(traceId, { message: '未认证', status: 401 });
  if (!(await canAccessMatrix(client, user, matrixId))) {
    return fail(traceId, { message: '无权访问该矩阵', status: 403 });
  }

  try {
    const result = await ensureV3ViewForMatrix({ matrixId, userId: user.id });
    return ok(result, traceId);
  } catch (err) {
    const message = err instanceof Error ? err.message : '初始化失败';
    return fail(traceId, { message, status: 500 });
  }
}
