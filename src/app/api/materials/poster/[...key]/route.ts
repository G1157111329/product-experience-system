import { execFile } from 'child_process';
import { createReadStream } from 'fs';
import { mkdir, stat, unlink, writeFile } from 'fs/promises';
import os from 'os';
import path from 'path';
import { Readable } from 'stream';
import { pathToFileURL } from 'url';
import { promisify } from 'util';
import { NextRequest, NextResponse } from 'next/server';
import { canAccessTask, getCurrentUser } from '@/lib/server/auth';
import { localStoragePathVariants } from '@/lib/material-storage-path';
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
const FFMPEG_BIN = process.env.FFMPEG_BIN || 'ffmpeg';

/** Return a stable video tile when a source cannot yield a poster. */
function posterFallbackResponse() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360" role="img" aria-label="视频预览不可用"><rect width="640" height="360" fill="#e2e8f0"/><path d="M276 135v90l82-45z" fill="#64748b"/><text x="320" y="290" text-anchor="middle" fill="#475569" font-family="Arial, sans-serif" font-size="20">视频预览不可用</text></svg>`;
  return new NextResponse(svg, {
    headers: {
      'Content-Type': 'image/svg+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=300',
      'X-Poster-Fallback': '1',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

async function findMaterialByPath(client: ReturnType<typeof getSupabaseClient>, filePath: string) {
  const variants = localStoragePathVariants(filePath);
  for (const candidate of variants) {
    const { data } = await client
      .from('materials')
      .select('id, file_path, file_url, task_id, recipe_library_step_id')
      .eq('file_path', candidate)
      .maybeSingle();
    if (data) return data;
  }
  for (const candidate of variants) {
    const { data } = await client
      .from('materials')
      .select('id, file_path, file_url, task_id, recipe_library_step_id')
      .eq('file_url', candidate)
      .maybeSingle();
    if (data) return data;
  }
  return null;
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
  try {
    await execFileAsync(FFMPEG_BIN, [
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
  } catch (ffmpegError) {
    // Historical mobile MP4 files can be decoded by Chromium even when the
    // lightweight Playwright ffmpeg build rejects their container metadata.
    // Generate the same stable JPG poster through Chromium before falling
    // back to a generic video tile.
    console.warn('[materials/poster] ffmpeg extraction failed; using Chromium fallback', ffmpegError);
    const { chromium } = await import('playwright');
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
      await page.goto(pathToFileURL(sourcePath).href, { waitUntil: 'domcontentloaded' });
      const video = page.locator('video');
      await video.evaluate(async (element) => {
        const videoElement = element as HTMLVideoElement;
        if (videoElement.readyState < 2) {
          await new Promise<void>((resolve, reject) => {
            videoElement.addEventListener('loadeddata', () => resolve(), { once: true });
            videoElement.addEventListener('error', () => reject(new Error('Video decode failed')), { once: true });
          });
        }
        videoElement.style.width = '640px';
        videoElement.style.height = '360px';
        videoElement.style.objectFit = 'cover';
        videoElement.currentTime = Math.min(0.2, Number.isFinite(videoElement.duration) ? videoElement.duration / 2 : 0.2);
        await new Promise<void>((resolve) => videoElement.addEventListener('seeked', () => resolve(), { once: true }));
      });
      await video.screenshot({ path: posterPath, type: 'jpeg', quality: 82 });
    } finally {
      await browser.close();
    }
  }
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
  if (!existsLocally && !useS3) return posterFallbackResponse();

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
    return posterFallbackResponse();
  }
}
