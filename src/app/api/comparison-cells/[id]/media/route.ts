import { NextRequest, NextResponse } from 'next/server';
import { canAccessAssembly, canAccessTask, isAuthResponse, requireUser, type AuthUser } from '@/lib/server/auth';
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

async function getAccessibleCell(
  client: ReturnType<typeof getSupabaseClient>,
  request: NextRequest,
  cellId: string,
) {
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
  if (!cell?.assembly_id) {
    return { response: NextResponse.json({ code: 1, message: '未找到矩阵单元格' }, { status: 404 }) };
  }

  const assemblyId = String(cell.assembly_id);
  const accessible = await canAccessAssembly(client, user, assemblyId);
  if (!accessible) {
    return { response: NextResponse.json({ code: 1, message: '无权访问' }, { status: 403 }) };
  }

  return { user, cell, assemblyId };
}

function roleForIndex(index: number) {
  if (index === 0) return 'cell_primary';
  if (index < MAX_INLINE_MEDIA) return 'cell_secondary';
  return 'appendix';
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
  assemblyId: string,
) {
  if (user.role === 'admin') return true;
  if (material.comparison_assembly_id === assemblyId) return true;
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

  const materialRows = (data || []) as MaterialRow[];
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
    if (!(await canUseMaterial(client, access.user, material as MaterialRow, access.assemblyId))) {
      return NextResponse.json({ code: 1, message: `无权使用素材: ${materialId}` }, { status: 403 });
    }
    materials.push(material as MaterialRow);
  }

  const { data: oldMaterials } = await client
    .from('materials')
    .select('id')
    .eq('comparison_cell_id', cellId);
  for (const material of oldMaterials || []) {
    await client
      .from('materials')
      .update({
        comparison_cell_id: null,
        comparison_assembly_id: null,
        media_display_order: 0,
        media_role: null,
      })
      .eq('id', material.id);
  }

  const updatedMaterials: MaterialRow[] = [];
  for (let index = 0; index < materials.length; index += 1) {
    const material = materials[index];
    const { data, error } = await client
      .from('materials')
      .update({
        comparison_cell_id: cellId,
        comparison_assembly_id: access.assemblyId,
        media_display_order: index,
        media_role: roleForIndex(index),
      })
      .eq('id', material.id)
      .select()
      .single();
    if (error) return NextResponse.json({ code: 1, message: error.message || '素材关联失败' }, { status: 500 });
    if (data) updatedMaterials.push(data as MaterialRow);
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
