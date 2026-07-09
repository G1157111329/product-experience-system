import { NextRequest, NextResponse } from 'next/server';
import { createReadStream } from 'fs';
import { mkdir, stat } from 'fs/promises';
import path from 'path';
import { canAccessTask, getCurrentUser } from '@/lib/server/auth';
import {
  getLocalContentType,
  isLocalUploadPublicAccess,
  isS3FallbackAvailable,
  localFileExists,
  LOCAL_UPLOAD_DIR,
  verifyLocalMediaToken,
} from '@/lib/server/storage';
import { getSupabaseClient } from '@/storage/database/supabase-client';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.heic', '.heif']);

/**
 * On-demand image thumbnail endpoint.
 *
 * Generates a down-scaled JPEG on first request, caches it under
 * LOCAL_UPLOAD_DIR/.thumbs/<key>.jpg, and re-checks freshness by source mtime
 * (same pattern as the poster endpoint). This lets list/grid views load small
 * (~tens of KB) thumbnails instead of multi-MB originals.
 *
 * Video thumbnails are handled by the sibling /api/materials/poster endpoint
 * (ffmpeg frame extraction); this route only resizes images.
 */
function normalizeObjectKey(key: string): string {
  const segments = key.replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .split('/')
    .filter(Boolean)
    .map((segment) => {
      if (segment === '.' || segment === '..') throw new Error('Invalid storage key');
      const sanitized = segment.replace(/[<>:"|?*\x00-\x1F]/g, '_').trim();
      if (!sanitized || sanitized === '.' || sanitized === '..') throw new Error('Invalid storage key');
      return sanitized;
    });
  if (segments.length === 0) throw new Error('Invalid storage key');
  return segments.join('/');
}

function resolveUploadPath(key: string) {
  const safeKey = normalizeObjectKey(key);
  const target = path.resolve(LOCAL_UPLOAD_DIR, ...safeKey.split('/'));
  if (target !== LOCAL_UPLOAD_DIR && !target.startsWith(LOCAL_UPLOAD_DIR + path.sep)) {
    throw new Error('Invalid local storage path');
  }
  return target;
}

async function findMaterialByPath(client: ReturnType<typeof getSupabaseClient>, filePath: string) {
  const { data: byFilePath } = await client
    .from('materials')
    .select('id, file_path, file_url, task_id, recipe_library_step_id')
    .eq('file_path', filePath)
    .maybeSingle();
  if (byFilePath) return byFilePath;
  const { data: byFileUrl } = await client
    .from('materials')
    .select('id, file_path, file_url, task_id, recipe_library_step_id')
    .eq('file_url', filePath)
    .maybeSingle();
  return byFileUrl;
}

async function ensureCanAccess(request: NextRequest, fileKey: string) {
  if (isLocalUploadPublicAccess()) return true;
  const token = request.nextUrl.searchParams.get('token');
  const exp = request.nextUrl.searchParams.get('exp');
  if (verifyLocalMediaToken(fileKey, token, exp)) return true;

  const client = getSupabaseClient();
  const user = await getCurrentUser(request, client);
  if (!user) return false;
  const material = await findMaterialByPath(client, fileKey);
  return user.role === 'admin'
    || Boolean(material?.task_id && await canAccessTask(client, user, String(material.task_id)));
}

async function isFreshThumb(sourcePath: string, thumbPath: string) {
  try {
    const [sourceStat, thumbStat] = await Promise.all([stat(sourcePath), stat(thumbPath)]);
    return thumbStat.size > 0 && thumbStat.mtimeMs >= sourceStat.mtimeMs;
  } catch {
    return false;
  }
}

async function generateImageThumb(sourcePath: string, thumbPath: string, size: number) {
  await mkdir(path.dirname(thumbPath), { recursive: true });
  // sharp is bundled transitively via next; import lazily so non-image routes
  // don't pay the cost and so a sharp load failure degrades gracefully.
  const sharp = (await import('sharp')).default;
  await sharp(sourcePath)
    .rotate() // honor EXIF orientation
    .resize(size, size, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 80, mozjpeg: true })
    .toFile(thumbPath);
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ key: string[] }> },
) {
  const { key } = await params;
  const fileKey = key.join('/');

  const ext = path.extname(fileKey).toLowerCase();
  if (!IMAGE_EXTENSIONS.has(ext)) {
    // Non-image: direct callers (videos) should use the poster endpoint instead.
    return NextResponse.json({ code: 1, message: '仅支持图片缩略图' }, { status: 400 });
  }

  let localSourcePath: string;
  try {
    localSourcePath = resolveUploadPath(fileKey);
  } catch {
    return NextResponse.json({ code: 1, message: '无效的文件路径' }, { status: 400 });
  }

  const existsLocally = await localFileExists(fileKey);
  // Thumb generation only supports local source files (on-demand sharp resize).
  // If the file isn't local and only in S3 fallback, signal the client to use
  // the original URL instead of generating a thumb.
  if (!existsLocally) {
    if (isS3FallbackAvailable()) {
      return NextResponse.redirect(new URL(`/uploads/${fileKey}`, request.url));
    }
    return NextResponse.json({ code: 1, message: '素材文件不存在' }, { status: 404 });
  }

  if (!(await ensureCanAccess(request, fileKey))) {
    return NextResponse.json({ code: 1, message: '无权限' }, { status: 403 });
  }

  const sizeParam = Number(request.nextUrl.searchParams.get('size') || '400');
  const size = Number.isFinite(sizeParam) && sizeParam >= 64 && sizeParam <= 1200 ? sizeParam : 400;
  const thumbPath = path.join(LOCAL_UPLOAD_DIR, '.thumbs', `${fileKey.replace(/\//g, '__')}@${size}.jpg`);

  try {
    if (!(await isFreshThumb(localSourcePath, thumbPath))) {
      await generateImageThumb(localSourcePath, thumbPath, size);
    }
  } catch (genError) {
    console.error('[thumb] generation failed for', fileKey, genError);
    // Fall back to streaming the original so the UI never breaks.
    const stream = createReadStream(localSourcePath);
    return new NextResponse(stream as unknown as ReadableStream, {
      headers: {
        'Content-Type': getLocalContentType(fileKey),
        'Cache-Control': 'private, max-age=300',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  }

  const stream = createReadStream(thumbPath);
  return new NextResponse(stream as unknown as ReadableStream, {
    headers: {
      'Content-Type': 'image/jpeg',
      'Cache-Control': 'public, max-age=86400',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
