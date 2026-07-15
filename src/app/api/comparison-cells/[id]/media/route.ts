import { NextRequest, NextResponse } from 'next/server';
import { canAccessAssembly, canAccessTask, isAuthResponse, requireUser, type AuthUser } from '@/lib/server/auth';
import { replaceComparisonCellMaterialSelection } from '@/lib/server/material-asset-service';
import { roleForIndex } from '@/lib/comparison-media-role';
import { generatePresignedUrl } from '@/lib/server/storage';
import { getSupabaseClient } from '@/storage/database/supabase-client';

const MAX_INLINE_MEDIA = 5;

type MaterialRow = Record<string, unknown> & {
  id?: string;
  file_path?: string | null;
  file_url?: string | null;
  task_id?: string | null;
  comparison_assembly_id?: string | null;
};

type MaterialLinkRow = {
  material_id: string;
  binding_order: number | null;
};

type AccessibleMediaTarget = {
  user: AuthUser;
  cell: { id: string; assembly_id?: string | null };
  assemblyId: string;
  taskId?: string;
  response?: never;
} | {
  response: NextResponse;
};

async function getAccessibleCell(
  client: ReturnType<typeof getSupabaseClient>,
  request: NextRequest,
  cellId: string,
): Promise<AccessibleMediaTarget> {
  const user = await requireUser(request, client);
  if (isAuthResponse(user)) return { response: user };

  const { data: cell, error } = await client
    .from('comparison_matrix_cells')
    .select('id, assembly_id')
    .eq('id', cellId)
    .maybeSingle();
  if (error) {
    return { response: NextResponse.json({ code: 1, message: error.message || '查询失败' }, { status: 500 }) };
  }

  if (cell?.assembly_id) {
    const assemblyId = String(cell.assembly_id);
    const accessible = await canAccessAssembly(client, user, assemblyId);
    if (!accessible) {
      return { response: NextResponse.json({ code: 1, message: '无权访问' }, { status: 403 }) };
    }
    return { user, cell, assemblyId };
  }

  const { data: matrixRow, error: rowError } = await client
    .from('matrix_rows')
    .select('id,matrix_id')
    .eq('id', cellId)
    .maybeSingle();
  if (rowError) {
    return { response: NextResponse.json({ code: 1, message: rowError.message || '查询失败' }, { status: 500 }) };
  }
  if (!matrixRow?.matrix_id) {
    return { response: NextResponse.json({ code: 1, message: '未找到矩阵单元格或数据矩阵行' }, { status: 404 }) };
  }

  const { data: matrix } = await client
    .from('task_matrices')
    .select('task_id')
    .eq('id', String(matrixRow.matrix_id))
    .maybeSingle();
  if (!matrix?.task_id || !(await canAccessTask(client, user, String(matrix.task_id)))) {
    return { response: NextResponse.json({ code: 1, message: '无权访问' }, { status: 403 }) };
  }

  return {
    user,
    cell: { id: cellId, assembly_id: null },
    assemblyId: '',
    taskId: String(matrix.task_id),
  };
}

async function materialWithUrl(material: MaterialRow): Promise<MaterialRow> {
  const fileKey = material.file_path || material.file_url;
  if (!fileKey || fileKey.startsWith('http') || fileKey.startsWith('data:')) return material;
  return {
    ...material,
    file_url: await generatePresignedUrl({ key: fileKey, expireTime: 30 * 60 }),
  };
}

async function canUseMaterial(
  client: ReturnType<typeof getSupabaseClient>,
  user: AuthUser,
  material: MaterialRow,
  access: Extract<AccessibleMediaTarget, { user: AuthUser }>,
) {
  if (user.role === 'admin') return true;
  if (access.assemblyId && material.comparison_assembly_id === access.assemblyId) return true;
  if (material.task_id) return canAccessTask(client, user, String(material.task_id));
  return false;
}

async function loadMaterialById(client: ReturnType<typeof getSupabaseClient>, id: string) {
  return client
    .from('materials')
    .select('*')
    .eq('id', id)
    .maybeSingle();
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const client = getSupabaseClient();
  const { id: cellId } = await params;
  const access = await getAccessibleCell(client, request, cellId);
  if (access.response) return access.response;

  const { data, error } = await client
    .from('materials')
    .select('*')
    .eq('comparison_cell_id', cellId)
    .order('media_display_order', { ascending: true });
  if (error) return NextResponse.json({ code: 1, message: error.message || '查询失败' }, { status: 500 });

  const { data: linkRows, error: linkError } = await client
    .from('material_links')
    .select('material_id, binding_order')
    .eq('target_type', 'comparison_cell')
    .eq('target_id', cellId)
    .order('binding_order', { ascending: true });
  if (linkError) return NextResponse.json({ code: 1, message: linkError.message || '查询素材绑定失败' }, { status: 500 });
  const links = (linkRows || []) as MaterialLinkRow[];
  const linkedIds = links.map((link) => link.material_id);
  const { data: linkedData, error: linkedError } = linkedIds.length > 0
    ? await client.from('materials').select('*').in('id', linkedIds)
    : { data: [], error: null };
  if (linkedError) return NextResponse.json({ code: 1, message: linkedError.message || '查询关联素材失败' }, { status: 500 });

  const rowsById = new Map<string, MaterialRow>();
  for (const material of data || []) rowsById.set(String(material.id), material as MaterialRow);
  for (const material of linkedData || []) rowsById.set(String(material.id), material as MaterialRow);
  const linkedOrder = new Map<string, number>(links.map((link) => [link.material_id, link.binding_order ?? 0]));
  const materialRows = [...rowsById.values()].sort((left, right) => {
    const leftOrder = linkedOrder.get(String(left.id));
    const rightOrder = linkedOrder.get(String(right.id));
    if (leftOrder !== undefined && rightOrder !== undefined) return leftOrder - rightOrder;
    if (leftOrder !== undefined) return -1;
    if (rightOrder !== undefined) return 1;
    return Number(left.media_display_order ?? 0) - Number(right.media_display_order ?? 0);
  });
  const materials = await Promise.all(materialRows.map((material) => materialWithUrl(material)));
  return NextResponse.json({
    code: 0,
    message: 'success',
    data: {
      max_inline_media: MAX_INLINE_MEDIA,
      inline_media: materials.filter((material) => material.media_role !== 'appendix'),
      appendix_media: materials.filter((material) => material.media_role === 'appendix'),
      materials,
    },
  });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const client = getSupabaseClient();
  const { id: cellId } = await params;
  const access = await getAccessibleCell(client, request, cellId);
  if (access.response) return access.response;

  const body = await request.json().catch(() => ({}));
  const requestedMaterialIds: string[] = Array.isArray(body.material_ids)
    ? body.material_ids.map((id: unknown) => String(id)).filter((id: string) => id.length > 0)
    : [];
  const materialIds: string[] = Array.from(new Set<string>(requestedMaterialIds));
  const materials: MaterialRow[] = [];
  for (const materialId of materialIds) {
    const { data: material, error } = await loadMaterialById(client, materialId);
    if (error) return NextResponse.json({ code: 1, message: error.message || '素材查询失败' }, { status: 500 });
    if (!material) return NextResponse.json({ code: 1, message: `素材不存在: ${materialId}` }, { status: 404 });
    if (!(await canUseMaterial(client, access.user, material as MaterialRow, access))) {
      return NextResponse.json({ code: 1, message: `无权使用素材: ${materialId}` }, { status: 403 });
    }
    materials.push(material as MaterialRow);
  }

  const updatedMaterials: MaterialRow[] = [];
  for (let index = 0; index < materials.length; index += 1) {
    const material = materials[index];
    updatedMaterials.push({
      ...material,
      media_display_order: index,
      media_role: roleForIndex(index),
    });
  }
  try {
    await replaceComparisonCellMaterialSelection({
      cellId,
      actorId: access.user.id,
      assemblyId: access.assemblyId || null,
      materialIds,
    });
  } catch (error) {
    return NextResponse.json({ code: 1, message: error instanceof Error ? error.message : '素材更新失败' }, { status: 500 });
  }

  const materialsWithUrls = await Promise.all(updatedMaterials.map(materialWithUrl));
  return NextResponse.json({
    code: 0,
    message: '单元格素材已更新',
    data: {
      max_inline_media: MAX_INLINE_MEDIA,
      inline_count: Math.min(updatedMaterials.length, MAX_INLINE_MEDIA),
      appendix_count: Math.max(updatedMaterials.length - MAX_INLINE_MEDIA, 0),
      inline_media: materialsWithUrls.filter((material) => material.media_role !== 'appendix'),
      appendix_media: materialsWithUrls.filter((material) => material.media_role === 'appendix'),
      materials: materialsWithUrls,
    },
  });
}
