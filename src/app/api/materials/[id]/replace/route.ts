import { NextRequest, NextResponse } from 'next/server';
import { Readable } from 'stream';
import type { ReadableStream as NodeReadableStream } from 'stream/web';
import { canAccessAssembly, canAccessTask, forbidden, isAuthResponse, requireUser } from '@/lib/server/auth';
import { deleteFile, generatePresignedUrl, uploadFile } from '@/lib/server/storage';
import { getSupabaseClient } from '@/storage/database/supabase-client';

export const dynamic = 'force-dynamic';

function getFileExtension(fileName: string) {
  const match = fileName.toLowerCase().match(/\.([a-z0-9]+)$/);
  return match?.[1] || 'jpg';
}

function replaceFileExtension(fileName: string, extension: string) {
  return `${fileName.replace(/\.[^.]+$/, '')}.${extension.replace(/^\.+/, '').toLowerCase() || 'jpg'}`;
}

async function getAssemblyIdForComparisonCell(client: ReturnType<typeof getSupabaseClient>, comparisonCellId: string) {
  const { data } = await client
    .from('comparison_matrix_cells')
    .select('assembly_id')
    .eq('id', comparisonCellId)
    .maybeSingle();
  return data?.assembly_id ? String(data.assembly_id) : null;
}

async function canReplaceMaterial(client: ReturnType<typeof getSupabaseClient>, user: Awaited<ReturnType<typeof requireUser>>, material: Record<string, unknown>) {
  if (isAuthResponse(user)) return false;
  if (material.recipe_library_step_id) return user.role === 'admin';
  if (material.task_id) return canAccessTask(client, user, String(material.task_id));
  if (material.comparison_cell_id) {
    const assemblyId = await getAssemblyIdForComparisonCell(client, String(material.comparison_cell_id));
    return Boolean(assemblyId && await canAccessAssembly(client, user, assemblyId));
  }
  return false;
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const client = getSupabaseClient();
  const user = await requireUser(request, client);
  if (isAuthResponse(user)) return user;

  const { data: material } = await client
    .from('materials')
    .select('id, task_id, recipe_library_step_id, comparison_cell_id, material_type, file_name, file_path, file_url')
    .eq('id', id)
    .maybeSingle();
  if (!material) return NextResponse.json({ code: 1, message: '素材不存在' }, { status: 404 });
  if (!(await canReplaceMaterial(client, user, material))) return forbidden();

  const formData = await request.formData();
  const file = formData.get('file') as File | null;
  if (!file) return NextResponse.json({ code: 1, message: '缺少文件' }, { status: 400 });
  if (!file.type.toLowerCase().startsWith('image/')) {
    return NextResponse.json({ code: 1, message: '仅支持覆盖图片素材' }, { status: 400 });
  }
  if (file.size > 100 * 1024 * 1024) {
    return NextResponse.json({ code: 1, message: '文件大小超过100MB限制' }, { status: 400 });
  }

  const extension = getFileExtension(file.name);
  const nextFileName = replaceFileExtension(String(material.file_name || file.name), extension);
  const folderId = material.recipe_library_step_id || material.task_id || material.comparison_cell_id || 'unknown';
  const storageFileName = `experience-media/${folderId}/image/${nextFileName}`;
  const fileKey = await uploadFile({
    fileContent: Readable.fromWeb(file.stream() as unknown as NodeReadableStream<Uint8Array>),
    fileName: storageFileName,
    contentType: file.type,
  });

  const oldKey = String(material.file_path || material.file_url || '');
  const { data, error } = await client
    .from('materials')
    .update({
      material_type: 'image',
      file_name: nextFileName,
      file_path: fileKey,
      file_url: fileKey,
      file_size: file.size,
    })
    .eq('id', id)
    .select()
    .single();
  if (error) return NextResponse.json({ code: 1, message: '覆盖保存失败' }, { status: 500 });

  if (oldKey && oldKey !== fileKey) {
    await deleteFile(oldKey).catch((error) => console.error('[materials.replace] old file delete failed:', error));
  }

  let accessibleUrl = fileKey;
  try {
    accessibleUrl = await generatePresignedUrl({ key: fileKey, expireTime: 30 * 60 });
  } catch (error) {
    console.error('[materials.replace] URL generation failed:', error);
  }

  return NextResponse.json({ code: 0, message: '覆盖保存成功', data: { ...data, file_url: accessibleUrl } });
}
