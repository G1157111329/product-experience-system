/**
 * POST /api/v1/wecom/media/retry/{jobId}
 * PRD V3.1.2.4 §12 — Retry a WeCom media ingest job.
 */
import { NextRequest } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { requireUser, isAuthResponse } from '@/lib/server/auth';
import { getV3FeatureFlags } from '@/lib/feature-flags-v3';
import { retryWecomMediaJob } from '@/lib/server/wecom-ingest-service';
import { ok, fail } from '@/lib/server/api-v1/response';
import { resolveTraceId } from '@/lib/server/api-v1/trace';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> },
) {
  const traceId = resolveTraceId(req.headers);
  const { jobId } = await params;

  const client = getSupabaseClient();
  const user = await requireUser(req, client);
  if (isAuthResponse(user)) return fail(traceId, { message: '未认证', status: 401 });
  void user;

  const flags = await getV3FeatureFlags();
  if (!flags.wecomMaterialIngestEnabled) {
    return fail(traceId, { message: 'wecom_material_ingest_enabled=false', status: 503 });
  }

  const result = await retryWecomMediaJob(jobId);
  if (result.error === 'job_not_found') {
    return fail(traceId, { message: '任务不存在', status: 404 });
  }
  return ok(result, traceId);
}
