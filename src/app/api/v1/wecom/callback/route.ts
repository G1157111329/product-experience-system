/**
 * GET / POST /api/v1/wecom/callback
 * PRD V3.1.2.4 §12 — WeCom callback (URL verify + media message ingest).
 *
 * GET: echo `echostr` when token matches (URL verification).
 * POST: accept JSON media payload (or XML stub), enqueue ingest job when
 *       wecom_material_ingest_enabled is on.
 *
 * Real WeCom crypto (msg_signature / AES) is deferred; this skeleton accepts
 * a JSON body for integration tests and ops dry-runs.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getV3FeatureFlags } from '@/lib/feature-flags-v3';
import { enqueueWecomMediaJob } from '@/lib/server/wecom-ingest-service';
import { ok, fail } from '@/lib/server/api-v1/response';
import { resolveTraceId } from '@/lib/server/api-v1/trace';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const traceId = resolveTraceId(req.headers);
  const url = new URL(req.url);
  const echostr = url.searchParams.get('echostr') || '';
  const token = url.searchParams.get('token') || url.searchParams.get('msg_signature') || '';
  const expected = process.env.WECOM_CALLBACK_TOKEN || '';

  if (expected && token && token !== expected && !url.searchParams.get('echostr')) {
    return fail(traceId, { message: 'token mismatch', status: 403 });
  }

  // WeCom URL verification expects plain echostr body.
  if (echostr) {
    return new NextResponse(echostr, { status: 200, headers: { 'Content-Type': 'text/plain' } });
  }
  return ok({ status: 'ready', traceId }, traceId);
}

export async function POST(req: NextRequest) {
  const traceId = resolveTraceId(req.headers);
  const flags = await getV3FeatureFlags();
  if (!flags.wecomMaterialIngestEnabled) {
    return fail(traceId, { message: 'wecom_material_ingest_enabled=false', status: 503 });
  }

  let body: Record<string, unknown>;
  try {
    const text = await req.text();
    // Prefer JSON; XML crypto path not implemented in skeleton.
    body = text.trim().startsWith('<') ? { rawXml: text } : (JSON.parse(text) as Record<string, unknown>);
  } catch {
    return fail(traceId, { message: '无法解析回调体', status: 400 });
  }

  if (body.rawXml) {
    return ok(
      {
        accepted: false,
        reason: 'xml_crypto_not_implemented',
        hint: 'POST JSON { wecomMsgId, wecomMediaId, mediaType, wecomUserId } for dry-run',
      },
      traceId,
    );
  }

  const wecomMsgId = String(body.wecomMsgId || body.MsgId || body.msg_id || '').trim();
  const wecomMediaId = String(body.wecomMediaId || body.MediaId || body.media_id || '').trim();
  const mediaTypeRaw = String(body.mediaType || body.MsgType || body.msg_type || 'image').toLowerCase();
  const mediaType = (['image', 'video', 'file', 'voice'].includes(mediaTypeRaw)
    ? mediaTypeRaw
    : 'image') as 'image' | 'video' | 'file' | 'voice';
  const wecomUserId = String(body.wecomUserId || body.FromUserName || body.from_user || '').trim() || undefined;
  const wecomCorpId = body.wecomCorpId || body.corp_id
    ? String(body.wecomCorpId || body.corp_id)
    : null;

  if (!wecomMsgId || !wecomMediaId) {
    return fail(traceId, { message: 'wecomMsgId 与 wecomMediaId 必填', status: 400 });
  }

  try {
    const job = await enqueueWecomMediaJob({
      wecomMsgId,
      wecomMediaId,
      mediaType,
      wecomUserId,
      wecomCorpId,
    });
    return ok({ accepted: true, jobId: job.id, downloadStatus: job.downloadStatus }, traceId);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'enqueue failed';
    return fail(traceId, { message, status: 500 });
  }
}
