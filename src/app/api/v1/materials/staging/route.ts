/**
 * GET /api/v1/materials/staging
 * PRD V3.1.2.4 §9.2 — List materials in the staging pool
 * (uploaded/scanning/processing/unassigned/suggested).
 *
 * Query: taskId (optional) — scope to a task's uploads.
 */
import { NextRequest } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { requireUser, isAuthResponse } from '@/lib/server/auth';
import { ok, fail } from '@/lib/server/api-v1/response';
import { resolveTraceId } from '@/lib/server/api-v1/trace';
import { getStagingMaterials } from '@/lib/server/material-asset-service';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const traceId = resolveTraceId(req.headers);

  const client = getSupabaseClient();
  const user = await requireUser(req, client);
  if (isAuthResponse(user)) return fail(traceId, { message: '未认证', status: 401 });

  const url = new URL(req.url);
  const taskId = url.searchParams.get('taskId') || undefined;

  try {
    const items = await getStagingMaterials(taskId);
    return ok({ items }, traceId);
  } catch (err) {
    const message = err instanceof Error ? err.message : '查询失败';
    return fail(traceId, { message, status: 500 });
  }
}
