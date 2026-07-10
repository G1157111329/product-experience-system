/**
 * GET /api/v1/matrices/{id}/v3-projection
 * PRD V3.1.2.4 §8 — Read V3 matrix projection (hierarchy/columns/cells/styles/
 * narratives/issues/formulas/summary).
 *
 * Separate from the V2 GET /api/v1/matrices/{id} to avoid collision.
 */
import { NextRequest } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { canAccessMatrix, requireUser, isAuthResponse } from '@/lib/server/auth';
import { getV3MatrixProjection } from '@/lib/matrix/projection-v3';
import { ok, fail } from '@/lib/server/api-v1/response';
import { resolveTraceId } from '@/lib/server/api-v1/trace';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const traceId = resolveTraceId(req.headers);
  const { id } = await params;

  const client = getSupabaseClient();
  const user = await requireUser(req, client);
  if (isAuthResponse(user)) return fail(traceId, { message: '未认证', status: 401 });
  if (!(await canAccessMatrix(client, user, id))) {
    return fail(traceId, { message: '无权访问该矩阵', status: 403 });
  }

  try {
    const projection = await getV3MatrixProjection(id);
    if (!projection) return fail(traceId, { message: '矩阵不存在', status: 404 });
    return ok(projection, traceId);
  } catch (err) {
    const message = err instanceof Error ? err.message : '读取失败';
    return fail(traceId, { message, status: 500 });
  }
}
