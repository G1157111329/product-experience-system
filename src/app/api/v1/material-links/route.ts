import { NextRequest } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { canAccessAssembly, canAccessMaterial, canAccessMatrix, canAccessTask, requireUser, isAuthResponse } from '@/lib/server/auth';
import { ok, fail } from '@/lib/server/api-v1/response';
import { resolveTraceId } from '@/lib/server/api-v1/trace';
import {
  isMaterialLinkTargetType,
  replaceMaterialTargetsBatch,
  replaceMatrixCellMaterialSelection,
  resolveMaterialLinkTarget,
  type BindingMethod,
  type MaterialLinkTargetResource,
  type MaterialReplacementTarget,
} from '@/lib/server/material-asset-service';

export const dynamic = 'force-dynamic';

const VALID_BINDING_METHODS: BindingMethod[] = ['click_select', 'drag_attach', 'upload_at_slot', 'wecom_ingest', 'agent_suggested'];

async function canAccessTarget(resource: MaterialLinkTargetResource, client: ReturnType<typeof getSupabaseClient>, user: Awaited<ReturnType<typeof requireUser>>) {
  if (resource.kind === 'task') return !isAuthResponse(user) && canAccessTask(client, user, resource.id);
  if (resource.kind === 'assembly') return !isAuthResponse(user) && canAccessAssembly(client, user, resource.id);
  return !isAuthResponse(user) && canAccessMatrix(client, user, resource.id);
}

type ReplacementCommand = { materialId: string; add: MaterialReplacementTarget[]; remove: MaterialReplacementTarget[] };

export async function POST(req: NextRequest) {
  const traceId = resolveTraceId(req.headers);
  const client = getSupabaseClient();
  const user = await requireUser(req, client);
  if (isAuthResponse(user)) return fail(traceId, { message: '未认证', status: 401 });

  let body: {
    materialId?: string; targetType?: string; targetId?: string; bindingMethod?: string;
    add?: MaterialReplacementTarget[]; remove?: MaterialReplacementTarget[]; commands?: ReplacementCommand[];
    matrixCell?: { matrixId?: string; leafRowId?: string; columnId?: string; materialIds?: string[] };
  };
  try { body = await req.json(); }
  catch { return fail(traceId, { message: '请求体不是合法 JSON', status: 400 }); }

  const bindingMethod = (body.bindingMethod ?? 'click_select') as BindingMethod;
  if (!VALID_BINDING_METHODS.includes(bindingMethod)) return fail(traceId, { message: 'bindingMethod 不合法', status: 400 });
  if (body.matrixCell) {
    const { matrixId, leafRowId, columnId, materialIds } = body.matrixCell;
    if (!matrixId || !leafRowId || !columnId || !Array.isArray(materialIds)) return fail(traceId, { message: 'matrixCell 参数不完整', status: 400 });
    try {
      return ok(await replaceMatrixCellMaterialSelection({ matrixId, leafRowId, columnId, materialIds, actorId: user.id }), traceId, 'updated');
    } catch (error) {
      return fail(traceId, { message: error instanceof Error ? error.message : '素材替换失败', status: 500 });
    }
  }
  const legacyTarget = body.targetType && body.targetId && isMaterialLinkTargetType(body.targetType)
    ? { targetType: body.targetType, targetId: body.targetId, bindingMethod }
    : null;
  const commands: ReplacementCommand[] = body.commands ?? (body.materialId ? [{
    materialId: body.materialId,
    add: body.add ?? (legacyTarget ? [legacyTarget] : []),
    remove: body.remove ?? [],
  }] : []);
  if (commands.length === 0) return fail(traceId, { message: 'replacement command 必填', status: 400 });

  try {
    for (const command of commands) {
      if (!command.materialId || !(await canAccessMaterial(client, user, command.materialId))) return fail(traceId, { message: '无权访问该素材', status: 403 });
      for (const targetInput of [...command.add, ...command.remove]) {
        if (!isMaterialLinkTargetType(targetInput.targetType)) return fail(traceId, { message: '不支持的素材绑定目标', status: 400 });
        const target = await resolveMaterialLinkTarget(targetInput.targetType, targetInput.targetId);
        if (!target) return fail(traceId, { message: '绑定目标不存在', status: 404 });
        if (!(await canAccessTarget(target, client, user))) return fail(traceId, { message: '无权访问该绑定目标', status: 403 });
      }
    }
    const replacements = await replaceMaterialTargetsBatch(commands.map((command) => ({ ...command, actorId: user.id })));
    const firstLink = replacements[0]?.links.find((link) => commands[0].add.some((target) => target.targetType === link.targetType && target.targetId === link.targetId));
    return ok({ replacements, linkId: firstLink?.id ?? null }, traceId, 'updated');
  } catch (error) {
    return fail(traceId, { message: error instanceof Error ? error.message : '素材替换失败', status: 500 });
  }
}
