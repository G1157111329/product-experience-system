import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { canAccessAssembly, canAccessMaterial, canAccessTask, forbidden, isAuthResponse, requireUser, type AuthUser } from '@/lib/server/auth';
import {
  getMaterialLinkTargetIds,
  replaceMaterialTargets,
  resolveMaterialLinkTarget,
  type MaterialLinkTargetType,
  type MaterialReplacementTarget,
} from '@/lib/server/material-asset-service';
import { deleteFile, generatePresignedUrl } from '@/lib/server/storage';
import { deleteMaterialAsset } from '@/lib/server/frozen-media-retention';

type MaterialScope = {
  task_id?: string | null;
  record_id?: string | null;
  recipe_step_id?: string | null;
  recipe_library_step_id?: string | null;
  recipe_id?: string | null;
  issue_id?: string | null;
  re_evaluation_id?: string | null;
  comparison_cell_id?: string | null;
};

type LinkTarget = {
  type: 'record' | 'recipe' | 'recipe_step' | 'issue' | 're_evaluation' | 'comparison_cell';
  id: string;
};

type MaterialLinkRow = {
  id: string;
  material_id: string;
  binding_order: number | null;
};

function linkTargetForScope(scope: MaterialScope): LinkTarget | null {
  if (scope.record_id) return { type: 'record', id: scope.record_id };
  if (scope.recipe_step_id) return { type: 'recipe_step', id: scope.recipe_step_id };
  if (scope.recipe_id) return { type: 'recipe', id: scope.recipe_id };
  if (scope.issue_id) return { type: 'issue', id: scope.issue_id };
  if (scope.re_evaluation_id) return { type: 're_evaluation', id: scope.re_evaluation_id };
  if (scope.comparison_cell_id) return { type: 'comparison_cell', id: scope.comparison_cell_id };
  return null;
}

const LEGACY_TARGET_FIELDS = [
  ['record_id', 'record'],
  ['recipe_step_id', 'recipe_step'],
  ['recipe_id', 'recipe'],
  ['issue_id', 'issue'],
  ['re_evaluation_id', 're_evaluation'],
  ['comparison_cell_id', 'comparison_cell'],
] as const satisfies ReadonlyArray<readonly [keyof MaterialScope, MaterialLinkTargetType]>;

async function getAssemblyIdForComparisonCell(client: ReturnType<typeof getSupabaseClient>, comparisonCellId: string) {
  const { data } = await client
    .from('comparison_matrix_cells')
    .select('assembly_id')
    .eq('id', comparisonCellId)
    .maybeSingle();
  return data?.assembly_id ? String(data.assembly_id) : null;
}

async function getTaskIdForMaterialScope(client: ReturnType<typeof getSupabaseClient>, scope: MaterialScope) {
  if (scope.task_id) return scope.task_id;
  if (scope.record_id) {
    const { data } = await client.from('check_records').select('task_id').eq('id', scope.record_id).maybeSingle();
    return data?.task_id ? String(data.task_id) : null;
  }
  if (scope.recipe_id) {
    const { data } = await client.from('recipes').select('task_id').eq('id', scope.recipe_id).maybeSingle();
    return data?.task_id ? String(data.task_id) : null;
  }
  if (scope.recipe_step_id) {
    const { data: step } = await client.from('recipe_steps').select('recipe_id').eq('id', scope.recipe_step_id).maybeSingle();
    if (!step?.recipe_id) return null;
    const { data: recipe } = await client.from('recipes').select('task_id').eq('id', step.recipe_id).maybeSingle();
    return recipe?.task_id ? String(recipe.task_id) : null;
  }
  if (scope.issue_id) {
    const { data } = await client.from('issues').select('task_id').eq('id', scope.issue_id).maybeSingle();
    return data?.task_id ? String(data.task_id) : null;
  }
  if (scope.re_evaluation_id) {
    const { data: reEval } = await client.from('issue_re_evaluations').select('issue_id').eq('id', scope.re_evaluation_id).maybeSingle();
    if (!reEval?.issue_id) return null;
    const { data: issue } = await client.from('issues').select('task_id').eq('id', reEval.issue_id).maybeSingle();
    return issue?.task_id ? String(issue.task_id) : null;
  }
  return null;
}

async function canUseMaterialScope(client: ReturnType<typeof getSupabaseClient>, user: AuthUser, scope: MaterialScope) {
  if (scope.comparison_cell_id) {
    const assemblyId = await getAssemblyIdForComparisonCell(client, scope.comparison_cell_id);
    return Boolean(assemblyId && await canAccessAssembly(client, user, assemblyId));
  }
  if (scope.recipe_library_step_id) return user.role === 'admin';
  const taskId = await getTaskIdForMaterialScope(client, scope);
  return Boolean(taskId && await canAccessTask(client, user, taskId));
}

async function withAccessibleFileUrls<T extends { file_path?: string | null; file_url?: string | null }>(materials: T[]) {
  return Promise.all(materials.map(async (material) => {
    const fileKey = material.file_path || material.file_url;
    if (!fileKey || fileKey.startsWith('http') || fileKey.startsWith('data:')) return material;

    try {
      return {
        ...material,
        file_url: await generatePresignedUrl({ key: fileKey, expireTime: 30 * 60 }),
      };
    } catch (error) {
      console.error('[materials] URL generation failed:', fileKey, error);
      return material;
    }
  }));
}

export async function GET(request: NextRequest) {
  const client = getSupabaseClient();
  const user = await requireUser(request, client);
  if (isAuthResponse(user)) return user;

  const { searchParams } = new URL(request.url);
  const scope = {
    task_id: searchParams.get('task_id'),
    record_id: searchParams.get('record_id'),
    recipe_step_id: searchParams.get('recipe_step_id'),
    recipe_library_step_id: searchParams.get('recipe_library_step_id'),
    recipe_id: searchParams.get('recipe_id'),
    issue_id: searchParams.get('issue_id'),
    re_evaluation_id: searchParams.get('re_evaluation_id'),
    comparison_cell_id: searchParams.get('comparison_cell_id'),
  };
  const limit = Math.min(200, Math.max(1, parseInt(searchParams.get('limit') || '100', 10)));

  if (!(await canUseMaterialScope(client, user, scope))) return forbidden();

  let query = client.from('materials').select('*');
  if (scope.task_id) query = query.eq('task_id', scope.task_id);
  if (scope.record_id) query = query.eq('record_id', scope.record_id);
  if (scope.recipe_step_id) query = query.eq('recipe_step_id', scope.recipe_step_id);
  if (scope.recipe_library_step_id) query = query.eq('recipe_library_step_id', scope.recipe_library_step_id);
  if (scope.recipe_id) query = query.eq('recipe_id', scope.recipe_id);
  if (scope.issue_id) query = query.eq('issue_id', scope.issue_id);
  if (scope.re_evaluation_id) query = query.eq('re_evaluation_id', scope.re_evaluation_id);
  if (scope.comparison_cell_id) query = query.eq('comparison_cell_id', scope.comparison_cell_id);

  query = scope.comparison_cell_id
    ? query.order('media_display_order', { ascending: true }).limit(limit)
    : query.order('created_at', { ascending: false }).limit(limit);
  const { data: legacyData, error } = await query;
  if (error) return NextResponse.json({ code: 1, message: '查询失败' }, { status: 500 });

  // New links are additive to legacy FKs. This keeps existing uploads visible
  // while allowing the same material to appear at several independently
  // selected targets.
  const linkedTarget = linkTargetForScope(scope);
  let merged = legacyData || [];
  if (linkedTarget) {
    const { data: linkRows, error: linkError } = await client
      .from('material_links')
      .select('id, material_id, binding_order')
      .eq('target_type', linkedTarget.type)
      .eq('target_id', linkedTarget.id)
      .order('binding_order', { ascending: true });
    if (linkError) return NextResponse.json({ code: 1, message: '查询素材绑定失败' }, { status: 500 });
    const links = (linkRows || []) as MaterialLinkRow[];
    const materialIds = links.map((link) => link.material_id);
    if (materialIds.length > 0) {
      const { data: linkedMaterials, error: linkedError } = await client
        .from('materials')
        .select('*')
        .in('id', materialIds);
      if (linkedError) return NextResponse.json({ code: 1, message: '查询关联素材失败' }, { status: 500 });
      const byId = new Map<string, Record<string, unknown>>();
      for (const material of legacyData || []) byId.set(String(material.id), material as Record<string, unknown>);
      for (const material of linkedMaterials || []) byId.set(String(material.id), material as Record<string, unknown>);
      const linkedOrder = new Map<string, number>(links.map((link) => [link.material_id, link.binding_order ?? 0]));
      merged = [...byId.values()].sort((left, right) => {
        const leftOrder = linkedOrder.get(String(left.id));
        const rightOrder = linkedOrder.get(String(right.id));
        if (leftOrder !== undefined && rightOrder !== undefined) return leftOrder - rightOrder;
        if (leftOrder !== undefined) return -1;
        if (rightOrder !== undefined) return 1;
        return 0;
      }).slice(0, limit);
    }
  }

  const materials = await withAccessibleFileUrls(merged);
  return NextResponse.json({ code: 0, message: 'success', data: materials });
}

export async function PUT(request: NextRequest) {
  const client = getSupabaseClient();
  const user = await requireUser(request, client);
  if (isAuthResponse(user)) return user;

  const body = await request.json();
  const { id, file_name, record_id, recipe_step_id, recipe_id, issue_id, re_evaluation_id, comparison_cell_id } = body;

  if (!id) {
    return NextResponse.json({ code: 1, message: '缺少必要参数' }, { status: 400 });
  }

  const { data: material } = await client
    .from('materials')
    .select('id, task_id, record_id, recipe_step_id, recipe_id, issue_id, re_evaluation_id, recipe_library_step_id, comparison_cell_id')
    .eq('id', id)
    .maybeSingle();
  if (!material) return NextResponse.json({ code: 1, message: '素材不存在' }, { status: 404 });

  if (!(await canAccessMaterial(client, user, id))) return forbidden();
  const targetScope = { record_id, recipe_step_id, recipe_id, issue_id, re_evaluation_id, comparison_cell_id };
  if (Object.values(targetScope).some((value) => value !== undefined && value !== null)) {
    if (!(await canUseMaterialScope(client, user, targetScope))) return forbidden();
  }

  const updateData: Record<string, unknown> = {};
  let changedLinks = false;
  const addTargets: MaterialReplacementTarget[] = [];
  const removeTargets: MaterialReplacementTarget[] = [];
  const currentMaterial = material as Record<string, unknown>;
  const explicitUnlinkTargetId = typeof body.unlink_target_id === 'string' && body.unlink_target_id
    ? body.unlink_target_id
    : null;

  for (const [field, targetType] of LEGACY_TARGET_FIELDS) {
    const requestedTargetId = body[field];
    if (requestedTargetId === undefined) continue;
    if (requestedTargetId !== null && (typeof requestedTargetId !== 'string' || !requestedTargetId)) {
      return NextResponse.json({ code: 1, message: '素材绑定目标格式错误' }, { status: 400 });
    }

    if (typeof requestedTargetId === 'string') {
      const target = await resolveMaterialLinkTarget(targetType, requestedTargetId);
      if (!target) return NextResponse.json({ code: 1, message: '绑定目标不存在' }, { status: 404 });
      if (!(await canUseMaterialScope(client, user, { [field]: requestedTargetId }))) return forbidden();
      addTargets.push({ targetType, targetId: requestedTargetId, bindingMethod: 'click_select' });
      changedLinks = true;
      continue;
    }

    const legacyTargetId = typeof currentMaterial[field] === 'string' ? currentMaterial[field] : null;
    const linkedTargetIds = explicitUnlinkTargetId
      ? [explicitUnlinkTargetId]
      : legacyTargetId
        ? [legacyTargetId]
        : await getMaterialLinkTargetIds(String(id), targetType);
    if (linkedTargetIds.length > 1) {
      return NextResponse.json({ code: 1, message: '素材在多个同类位置使用，请指定解除绑定目标' }, { status: 409 });
    }
    const targetId = linkedTargetIds[0];
    if (targetId) {
      if (!(await canUseMaterialScope(client, user, { [field]: targetId }))) return forbidden();
      removeTargets.push({ targetType, targetId });
      changedLinks = true;
    }
  }

  if (changedLinks || file_name !== undefined) {
    const replacement = await replaceMaterialTargets({
      materialId: String(id), actorId: user.id, add: addTargets, remove: removeTargets,
      patch: file_name === undefined ? undefined : { fileName: file_name === null ? null : String(file_name) },
    });
    return NextResponse.json({ code: 0, message: '更新成功', data: { ...material, file_name, status: replacement.status } });
  }

  if (Object.keys(updateData).length === 0 && !changedLinks) {
    return NextResponse.json({ code: 1, message: '没有需要更新的字段' }, { status: 400 });
  }

  if (Object.keys(updateData).length === 0) {
    return NextResponse.json({ code: 0, message: '素材绑定成功', data: material });
  }

  const data = material;
  const error = null;

  if (error) return NextResponse.json({ code: 1, message: '更新失败' }, { status: 500 });
  return NextResponse.json({ code: 0, message: '更新成功', data });
}

export async function DELETE(request: NextRequest) {
  const client = getSupabaseClient();
  const user = await requireUser(request, client);
  if (isAuthResponse(user)) return user;

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (!id) return NextResponse.json({ code: 1, message: '缺少id' }, { status: 400 });

  const { data: material } = await client
    .from('materials')
    .select('file_path, file_url, task_id, record_id, recipe_step_id, recipe_id, issue_id, re_evaluation_id, recipe_library_step_id, comparison_cell_id')
    .eq('id', id)
    .single();

  if (!material) return NextResponse.json({ code: 1, message: '素材不存在' }, { status: 404 });
  if (!(await canAccessMaterial(client, user, id))) return forbidden();

  const guardedError = await deleteMaterialAsset({ materialId: id, actorId: user.id }, (fileKey) => deleteFile(fileKey))
    .then(() => null)
    .catch((caught: unknown) => caught);
  if (guardedError) {
    const message = guardedError instanceof Error ? guardedError.message : 'material_delete_failed';
    const status = message.includes('active_links') || message.includes('frozen_snapshot') ? 409 : message.includes('owner') ? 403 : 500;
    return NextResponse.json({ code: 1, message }, { status });
  }
  const error = null;
  if (error) return NextResponse.json({ code: 1, message: '删除失败' }, { status: 500 });

  try {
    const fileKey = null;
    await deleteFile(fileKey);
  } catch (storageError) {
    console.error('[materials] Physical file delete failed:', storageError);
    return NextResponse.json({ code: 0, message: '删除成功', warning: 'physical_file_delete_failed' });
  }

  return NextResponse.json({ code: 0, message: '删除成功' });
}
