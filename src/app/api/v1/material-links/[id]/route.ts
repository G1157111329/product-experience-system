/**
 * DELETE /api/v1/material-links/{id}
 * PRD V3.1.2.4 §9.3 — Unbind a material from a target.
 *
 * Removes the material_links row. If the material has no remaining links it is
 * transitioned back to 'unassigned' (unless archived).
 */
import { NextRequest } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { requireUser, isAuthResponse } from '@/lib/server/auth';
import { ok, fail } from '@/lib/server/api-v1/response';
import { resolveTraceId } from '@/lib/server/api-v1/trace';
import { unbindMaterial } from '@/lib/server/material-asset-service';

export const dynamic = 'force-dynamic';

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const traceId = resolveTraceId(req.headers);
  const { id: linkId } = await params;

  const client = getSupabaseClient();
  const user = await requireUser(req, client);
  if (isAuthResponse(user)) return fail(traceId, { message: '未认证', status: 401 });

  try {
    await unbindMaterial(linkId);
    return ok({ linkId }, traceId, 'deleted');
  } catch (err) {
    const message = err instanceof Error ? err.message : '解绑失败';
    return fail(traceId, { message, status: 500 });
  }
}
