/**
 * GET /api/v1/materials/unassigned
 * PRD V3.1.2.4 §9.2 — List unassigned materials (待归属池) for the current user.
 *
 * Returns materials with status='unassigned' and no project_id.
 */
import { NextRequest } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { requireUser, isAuthResponse } from '@/lib/server/auth';
import { ok, fail } from '@/lib/server/api-v1/response';
import { resolveTraceId } from '@/lib/server/api-v1/trace';
import { getUnassignedMaterials, resolveUnassignedMaterialScope } from '@/lib/server/material-asset-service';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const traceId = resolveTraceId(req.headers);

  const client = getSupabaseClient();
  const user = await requireUser(req, client);
  if (isAuthResponse(user)) return fail(traceId, { message: '未认证', status: 401 });

  try {
    const globalRequested = new URL(req.url).searchParams.get('scope') === 'global';
    let scope;
    try { scope = resolveUnassignedMaterialScope({ userId: user.id, isAdmin: user.role === 'admin', globalRequested }); }
    catch { return fail(traceId, { message: '无权访问全局待归属素材池', status: 403 }); }
    const items = await getUnassignedMaterials({ userId: user.id, isAdmin: user.role === 'admin', globalRequested: scope.includeGlobal });
    return ok({ items }, traceId);
  } catch (err) {
    const message = err instanceof Error ? err.message : '查询失败';
    return fail(traceId, { message, status: 500 });
  }
}
