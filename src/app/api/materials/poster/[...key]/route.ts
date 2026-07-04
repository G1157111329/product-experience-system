import { execFile } from 'child_process';
import { createReadStream } from 'fs';
import { mkdir, stat } from 'fs/promises';
import path from 'path';
import { Readable } from 'stream';
import { promisify } from 'util';
import { NextRequest, NextResponse } from 'next/server';
import { canAccessTask, getCurrentUser } from '@/lib/server/auth';
import {
  getLocalContentType,
  isLocalUploadPublicAccess,
  LOCAL_UPLOAD_DIR,
  STORAGE_DRIVER,
  verifyLocalMediaToken,
} from '@/lib/server/storage';
import { getSupabaseClient } from '@/storage/database/supabase-client';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const execFileAsync = promisify(execFile);
const VIDEO_EXTENSIONS = new Set(['.mp4', '.m4v', '.mov', '.webm']);

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
  return { safeKey, target };
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

async function isFreshPoster(sourcePath: string, posterPath: string) {
  try {
    const [sourceStat, posterStat] = await Promise.all([stat(sourcePath), stat(posterPath)]);
    return posterStat.size > 0 && posterStat.mtimeMs >= sourceStat.mtimeMs;
  } catch {
    return false;
  }
}

async function generatePoster(sourcePath: string, posterPath: string) {
  await mkdir(path.dirname(posterPath), { recursive: true });
  await execFileAsync('ffmpeg', [
    '-y',
    '-hide_banner',
    '-loglevel',
    'error',
    '-ss',
    '0.2',
    '-i',
    sourcePath,
    '-frames:v',
    '1',
    '-vf',
    'scale=640:-2',
    '-q:v',
    '4',
    posterPath,
  ], { timeout: 30_000 });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ key: string[] }> },
) {
  if (STORAGE_DRIVER === 's3') {
    return NextResponse.json({ code: 1, message: 'S3 storage does not support local poster generation' }, { status: 404 });
  }

  const { key } = await params;
  let safeKey: string;
  let sourcePath: string;
  try {
    const resolved = resolveUploadPath(key.join('/'));
    safeKey = resolved.safeKey;
    sourcePath = resolved.target;
  } catch {
    return NextResponse.json({ code: 1, message: 'Invalid media path' }, { status: 400 });
  }

  if (!VIDEO_EXTENSIONS.has(path.extname(safeKey).toLowerCase())) {
    return NextResponse.json({ code: 1, message: 'Only video poster is supported' }, { status: 400 });
  }

  if (!(await ensureCanAccess(request, safeKey))) {
    return NextResponse.json({ code: 1, message: '未登录或无权访问素材' }, { status: 401 });
  }

  try {
    await stat(sourcePath);
    const posterPath = path.resolve(LOCAL_UPLOAD_DIR, '.posters', ...safeKey.split('/')) + '.jpg';
    if (!(await isFreshPoster(sourcePath, posterPath))) {
      await generatePoster(sourcePath, posterPath);
    }

    const posterStat = await stat(posterPath);
    const body = Readable.toWeb(createReadStream(posterPath)) as ReadableStream<Uint8Array>;
    return new NextResponse(body, {
      headers: {
        'Content-Type': getLocalContentType(posterPath),
        'Content-Length': String(posterStat.size),
        'Cache-Control': 'public, max-age=86400',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    console.error('[materials/poster] Failed to generate poster:', error);
    return NextResponse.json({ code: 1, message: '视频首帧生成失败' }, { status: 500 });
  }
}
