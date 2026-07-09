import { execFile } from 'child_process';
import { createReadStream } from 'fs';
import { mkdir, stat, unlink, writeFile } from 'fs/promises';
import os from 'os';
import path from 'path';
import { Readable } from 'stream';
import { promisify } from 'util';
import { NextRequest, NextResponse } from 'next/server';
import { canAccessTask, getCurrentUser } from '@/lib/server/auth';
import {
  getLocalContentType,
  isLocalUploadPublicAccess,
  isS3FallbackAvailable,
  localFileExists,
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
  const { key } = await params;
  let safeKey: string;
  let localSourcePath: string;
  try {
    const resolved = resolveUploadPath(key.join('/'));
    safeKey = resolved.safeKey;
    localSourcePath = resolved.target;
  } catch {
    return NextResponse.json({ code: 1, message: 'Invalid media path' }, { status: 400 });
  }

  if (!VIDEO_EXTENSIONS.has(path.extname(safeKey).toLowerCase())) {
    return NextResponse.json({ code: 1, message: 'Only video poster is supported' }, { status: 400 });
  }

  if (!(await ensureCanAccess(request, safeKey))) {
    return NextResponse.json({ code: 1, message: '未登录或无权访问素材' }, { status: 401 });
  }

  // Decide source location (gray-release aware).
  const existsLocally = STORAGE_DRIVER === 's3' ? false : await localFileExists(safeKey);
  const useS3 = !existsLocally && isS3FallbackAvailable();
  if (!existsLocally && !useS3) {
    return NextResponse.json({ code: 1, message: '视频源文件不存在' }, { status: 404 });
  }

  // Poster cache lives next to local uploads regardless of source.
  const posterPath = path.resolve(LOCAL_UPLOAD_DIR, '.posters', ...safeKey.split('/')) + '.jpg';

  try {
    // For S3 sources, we need the bytes locally to run ffmpeg. Download once
    // to a temp path (per request), and reuse the local poster cache for output.
    let ffmpegSourcePath = localSourcePath;
    let tmpDownloadPath: string | null = null;
    if (useS3) {
      // S3 poster freshness: just regenerate each call is wasteful; cache by
      // poster file mtime presence (no source mtime comparison available).
      const posterExists = await stat(posterPath).then(() => true).catch(() => false);
      if (!posterExists) {
        const { getS3Client, S3_BUCKET } = await import('@/lib/server/storage');
        const { GetObjectCommand } = await import('@aws-sdk/client-s3');
        const client = getS3Client();
        const s3Resp = await client.send(new GetObjectCommand({ Bucket: S3_BUCKET, Key: safeKey }));
        if (!s3Resp.Body) throw new Error('S3 object body empty');
        const buf = Buffer.from(await s3Resp.Body.transformToByteArray());
        tmpDownloadPath = path.join(os.tmpdir(), `poster-src-${Date.now()}${path.extname(safeKey) || '.mp4'}`);
        await writeFile(tmpDownloadPath, buf);
        ffmpegSourcePath = tmpDownloadPath;
        try {
          await generatePoster(ffmpegSourcePath, posterPath);
        } finally {
          await unlink(tmpDownloadPath).catch(() => {});
        }
      }
    } else {
      if (!(await isFreshPoster(localSourcePath, posterPath))) {
        await generatePoster(localSourcePath, posterPath);
      }
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
