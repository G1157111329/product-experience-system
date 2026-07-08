/**
 * POST /api/v1/material-links
 * PRD V3.1.2.4 §9.3 — Bind a material to a target via material_links.
 *
 * Body: { materialId, targetType, targetId, bindingMethod }
 * bindingMethod ∈ { click_select, drag_attach, upload_at_slot, wecom_ingest, agent_suggested }
 * Returns: { linkId }
 */
import { NextRequest } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { requireUser, isAuthResponse } from '@/lib/server/auth';
import { ok, fail } from '@/lib/server/api-v1/response';
import { resolveTraceId } from '@/lib/server/api-v1/trace';
import { bindMaterial, type BindingMethod } from '@/lib/server/material-asset-service';

export const dynamic = 'force-dynamic';

const VALID_BINDING_METHODS: BindingMethod[] = [
  'click_select',
  'drag_attach',
  'upload_at_slot',
  'wecom_ingest',
  'agent_suggested',
];

export async function POST(req: NextRequest) {
  const traceId = resolveTraceId(req.headers);

  const client = getSupabaseClient();
  const user = await requireUser(req, client);
  if (isAuthResponse(user)) return fail(traceId, { message: '未认证', status: 401 });

  let body: {
    materialId?: string;
    targetType?: string;
    targetId?: string;
    bindingMethod?: string;
  };
  try {
    body = await req.json();
  } catch {
    return fail(traceId, { message: '请求体不是合法 JSON', status: 400 });
  }

  if (!body.materialId || !body.targetType || !body.targetId) {
    return fail(traceId, { message: 'materialId/targetType/targetId 必填', status: 400 });
  }

  const bindingMethod = (body.bindingMethod ?? 'click_select') as BindingMethod;
  if (!VALID_BINDING_METHODS.includes(bindingMethod)) {
    return fail(traceId, { message: `bindingMethod 不合法: ${body.bindingMethod}`, status: 400 });
  }

  try {
    const { linkId } = await bindMaterial({
      materialId: body.materialId,
      targetType: body.targetType,
      targetId: body.targetId,
      bindingMethod,
      boundBy: user.id,
    });
    return ok({ linkId }, traceId, 'created');
  } catch (err) {
    const message = err instanceof Error ? err.message : '绑定失败';
    return fail(traceId, { message, status: 500 });
  }
}
