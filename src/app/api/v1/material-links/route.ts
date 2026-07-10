/**
 * POST /api/v1/material-links
 * PRD V3.1.2.4 §9.3 — Bind a material to a target via material_links.
 *
 * Body: { materialId, targetType, targetId, bindingMethod }
 * bindingMethod ∈ { click_select, drag_attach, upload_at_slot, wecom_ingest, agent_suggested }
 * Returns: { linkId }
 */
import { NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';
import { getDb } from '@/storage/database/pg-db';
import { matrixCellValues } from '@/storage/database/shared/schema';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { canAccessMaterial, canAccessMatrix, requireUser, isAuthResponse } from '@/lib/server/auth';
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
  if (!(await canAccessMaterial(client, user, body.materialId))) {
    return fail(traceId, { message: '无权访问该素材', status: 403 });
  }

  const bindingMethod = (body.bindingMethod ?? 'click_select') as BindingMethod;
  if (!VALID_BINDING_METHODS.includes(bindingMethod)) {
    return fail(traceId, { message: `bindingMethod 不合法: ${body.bindingMethod}`, status: 400 });
  }

  try {
    if (body.targetType === 'dynamic_matrix_cell_value') {
      const db = await getDb();
      const rows = await db
        .select({ matrixId: matrixCellValues.matrixId })
        .from(matrixCellValues)
        .where(eq(matrixCellValues.id, body.targetId))
        .limit(1)
        .execute();
      const matrixId = rows[0]?.matrixId;
      if (!matrixId) return fail(traceId, { message: '绑定目标不存在', status: 404 });
      if (!(await canAccessMatrix(client, user, matrixId))) {
        return fail(traceId, { message: '无权访问该矩阵', status: 403 });
      }
    }

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
