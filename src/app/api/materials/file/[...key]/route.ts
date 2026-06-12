import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { canAccessTask, getCurrentUser } from '@/lib/server/auth';
import {
  getLocalContentType,
  readLocalFile,
  STORAGE_DRIVER,
  verifyLocalMediaToken,
} from '@/lib/server/storage';

async function findMaterialByPath(client: ReturnType<typeof getSupabaseClient>, path: string) {
  const { data: byFilePath } = await client
    .from('materials')
    .select('id, file_path, file_url, task_id, recipe_library_step_id')
    .eq('file_path', path)
    .maybeSingle();
  if (byFilePath) return byFilePath;

  const { data: byFileUrl } = await client
    .from('materials')
    .select('id, file_path, file_url, task_id, recipe_library_step_id')
    .eq('file_url', path)
    .maybeSingle();
  return byFileUrl;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ key: string[] }> },
) {
  const { key } = await params;
  const fileKey = key.join('/');

  if (STORAGE_DRIVER === 's3') {
    return NextResponse.json({ code: 1, message: 'S3 storage uses presigned object URLs' }, { status: 404 });
  }

  const token = request.nextUrl.searchParams.get('token');
  const exp = request.nextUrl.searchParams.get('exp');
  const hasValidToken = verifyLocalMediaToken(fileKey, token, exp);

  if (!hasValidToken) {
    const client = getSupabaseClient();
    const user = await getCurrentUser(request, client);
    if (!user) return NextResponse.json({ code: 1, message: '未登录' }, { status: 401 });

    const material = await findMaterialByPath(client, fileKey);
    const canAccess = user.role === 'admin'
      || (material?.task_id && await canAccessTask(client, user, String(material.task_id)));
    if (!canAccess) return NextResponse.json({ code: 1, message: '无权限' }, { status: 403 });
  }

  try {
    const body = await readLocalFile(fileKey);
    return new NextResponse(new Uint8Array(body), {
      headers: {
        'Content-Type': getLocalContentType(fileKey),
        'Cache-Control': hasValidToken ? 'private, max-age=300' : 'no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch {
    return NextResponse.json({ code: 1, message: '素材文件不存在' }, { status: 404 });
  }
}
