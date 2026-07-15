import { NextRequest, NextResponse } from 'next/server';
import { getV3FeatureFlags } from '@/lib/feature-flags-v3';
import { processWecomCallback, settleWecomRouteDenial, verifyWecomChallenge, WecomCallbackError } from '@/lib/server/wecom-callback-auth';
import { fail, ok } from '@/lib/server/api-v1/response';
import { resolveTraceId } from '@/lib/server/api-v1/trace';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { writeSecurityAudit } from '@/lib/server/security-audit';

export const dynamic = 'force-dynamic';

function callbackInput(req: NextRequest, encryptedBody: string) {
  const url = new URL(req.url);
  return {
    signature: url.searchParams.get('msg_signature'),
    timestamp: url.searchParams.get('timestamp'),
    nonce: url.searchParams.get('nonce'),
    encryptedBody,
  };
}

async function denyCallback(req: NextRequest, traceId: string, reason: string, status: number) {
  const stable = await settleWecomRouteDenial({ reason, status }, async () => {
    await writeSecurityAudit(getSupabaseClient(), {
      action: 'wecom.callback_access',
      outcome: 'denied',
      request: req,
      actorUserId: null,
      targetType: 'wecom_callback',
      targetId: null,
      metadata: { reason, traceId },
    });
  });
  return fail(traceId, { message: stable.reason, status: stable.status });
}

export async function GET(req: NextRequest) {
  const traceId = resolveTraceId(req.headers);
  const echostr = new URL(req.url).searchParams.get('echostr');
  if (!echostr) return denyCallback(req, traceId, 'encrypted_echostr_required', 400);
  try {
    // URL verification uses the same signed encrypted envelope; it is never echoed before verification.
    const url = new URL(req.url);
    const challenge = verifyWecomChallenge({ signature: url.searchParams.get('msg_signature'), timestamp: url.searchParams.get('timestamp'), nonce: url.searchParams.get('nonce'), encrypted: echostr });
    return new NextResponse(challenge, { status: 200, headers: { 'Content-Type': 'text/plain' } });
  } catch (error) {
    return denyCallback(req, traceId, error instanceof WecomCallbackError ? error.code : 'wecom_callback_rejected', 403);
  }
}

export async function POST(req: NextRequest) {
  const traceId = resolveTraceId(req.headers);
  const flags = await getV3FeatureFlags();
  if (!flags.wecomMaterialIngestEnabled) return denyCallback(req, traceId, 'wecom_material_ingest_disabled', 503);
  const contentType = req.headers.get('content-type')?.toLowerCase() ?? '';
  if (contentType.includes('application/json')) return denyCallback(req, traceId, 'wecom_plaintext_payload_rejected', 415);
  let body: string;
  try { body = await req.text(); }
  catch { return denyCallback(req, traceId, 'wecom_callback_body_unreadable', 400); }
  try {
    const job = await processWecomCallback(
      callbackInput(req, body),
      undefined,
      async (denial) => writeSecurityAudit(getSupabaseClient(), {
        action: 'wecom.callback_access',
        outcome: 'denied',
        request: req,
        actorUserId: denial.actorUserId,
        targetType: denial.targetType,
        targetId: null,
        metadata: { reason: denial.reason, traceId },
      }),
    ) as { id: string; downloadStatus: string };
    return ok({ accepted: true, jobId: job.id, downloadStatus: job.downloadStatus }, traceId);
  } catch (error) {
    const code = error instanceof WecomCallbackError ? error.code : 'wecom_callback_rejected';
    const status = code === 'wecom_replay_detected' ? 409 : 403;
    return fail(traceId, { message: code, status });
  }
}
