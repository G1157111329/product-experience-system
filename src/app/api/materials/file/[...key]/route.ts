import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { canAccessTask, getCurrentUser } from '@/lib/server/auth';
import {
  createLocalFileReadStream,
  getLocalContentType,
  isNginxAccelRedirect,
  isS3FallbackAvailable,
  localFileExists,
  NGINX_UPLOADS_INTERNAL,
  statLocalFile,
  STORAGE_DRIVER,
  verifyLocalMediaToken,
} from '@/lib/server/storage';
import { Readable } from 'stream';

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

function parseRange(range: string | null, fileSize: number) {
  if (!range) return null;
  const match = range.match(/^bytes=(\d*)-(\d*)$/);
  if (!match) return { invalid: true as const };

  const [, startText, endText] = match;
  if (!startText && !endText) return { invalid: true as const };

  let start: number;
  let end: number;

  if (!startText) {
    const suffixLength = Number(endText);
    if (!Number.isFinite(suffixLength) || suffixLength <= 0) return { invalid: true as const };
    start = Math.max(fileSize - suffixLength, 0);
    end = fileSize - 1;
  } else {
    start = Number(startText);
    end = endText ? Number(endText) : fileSize - 1;
  }

  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= fileSize) {
    return { invalid: true as const };
  }

  return {
    start,
    end: Math.min(end, fileSize - 1),
  };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ key: string[] }> },
) {
  const { key } = await params;
  const fileKey = key.join('/');

  const token = request.nextUrl.searchParams.get('token');
  const exp = request.nextUrl.searchParams.get('exp');
  const hasValidToken = verifyLocalMediaToken(fileKey, token, exp);

  // Gray-release: figure out where the file lives.
  // - STORAGE_DRIVER=s3 (pure S3): skip local probe, go straight to S3 stream.
  // - otherwise: probe local; if present, serve local; if absent and S3 is
  //   configured as fallback, stream from S3 (new uploads in gray-release mode).
  const existsLocally = STORAGE_DRIVER === 's3' ? false : await localFileExists(fileKey);
  const useS3 = !existsLocally && isS3FallbackAvailable();

  if (!existsLocally && !useS3) {
    return NextResponse.json({ code: 1, message: '素材文件不存在' }, { status: 404 });
  }

  // Auth: required for any non-public path (S3 fallback or local protected mode).
  // The local-public-access + valid-token path stays open (legacy behavior for
  // public/uploads static-style access via signed token).
  if (!hasValidToken) {
    const isLocalPublic = STORAGE_DRIVER !== 's3'
      && (process.env.LOCAL_UPLOAD_PUBLIC_ACCESS || 'public') !== 'protected'
      && existsLocally;
    if (!isLocalPublic) {
      const client = getSupabaseClient();
      const user = await getCurrentUser(request, client);
      if (!user) return NextResponse.json({ code: 1, message: '未登录' }, { status: 401 });

      const material = await findMaterialByPath(client, fileKey);
      const canAccess = user.role === 'admin'
        || (material?.task_id && await canAccessTask(client, user, String(material.task_id)));
      if (!canAccess) return NextResponse.json({ code: 1, message: '无权限' }, { status: 403 });
    }
  }

  const contentType = getLocalContentType(fileKey);
  const cacheControl = hasValidToken ? 'private, max-age=300' : 'no-store';

  // S3 streaming path (supports Range for video playback).
  if (useS3) {
    try {
      const { getS3Client, S3_BUCKET } = await import('@/lib/server/storage');
      const { HeadObjectCommand, GetObjectCommand } = await import('@aws-sdk/client-s3');
      const client = getS3Client();

      // Head to get size for Range handling.
      const head = await client.send(new HeadObjectCommand({ Bucket: S3_BUCKET, Key: fileKey }));
      const totalSize = head.ContentLength ?? 0;

      const range = parseRange(request.headers.get('range'), totalSize);
      if (range?.invalid) {
        return new NextResponse(null, {
          status: 416,
          headers: {
            'Content-Range': `bytes */${totalSize}`,
            'Accept-Ranges': 'bytes',
            'Content-Type': contentType,
            'Cache-Control': cacheControl,
            'X-Content-Type-Options': 'nosniff',
          },
        });
      }

      if (range) {
        const s3Resp = await client.send(new GetObjectCommand({
          Bucket: S3_BUCKET,
          Key: fileKey,
          Range: `bytes=${range.start}-${range.end}`,
        }));
        if (!s3Resp.Body) return NextResponse.json({ code: 1, message: '素材读取失败' }, { status: 500 });
        const body = s3Resp.Body.transformToWebStream() as ReadableStream<Uint8Array>;
        return new NextResponse(body, {
          status: 206,
          headers: {
            'Content-Type': s3Resp.ContentType || contentType,
            'Content-Length': String(range.end - range.start + 1),
            'Content-Range': `bytes ${range.start}-${range.end}/${totalSize}`,
            'Accept-Ranges': 'bytes',
            'Cache-Control': cacheControl,
            'X-Content-Type-Options': 'nosniff',
          },
        });
      }

      const s3Resp = await client.send(new GetObjectCommand({ Bucket: S3_BUCKET, Key: fileKey }));
      if (!s3Resp.Body) return NextResponse.json({ code: 1, message: '素材读取失败' }, { status: 500 });
      const body = s3Resp.Body.transformToWebStream() as ReadableStream<Uint8Array>;
      return new NextResponse(body, {
        headers: {
          'Content-Type': s3Resp.ContentType || contentType,
          'Content-Length': String(totalSize),
          'Accept-Ranges': 'bytes',
          'Cache-Control': cacheControl,
          'X-Content-Type-Options': 'nosniff',
        },
      });
    } catch (error) {
      console.error('[materials/file] S3 stream failed for key:', fileKey, error);
      return NextResponse.json({ code: 1, message: '素材读取失败' }, { status: 500 });
    }
  }

  // Local streaming path (unchanged behavior).
  try {
    const fileStat = await statLocalFile(fileKey);

    if (isNginxAccelRedirect()) {
      const encodedKey = fileKey.split('/').map(encodeURIComponent).join('/');
      const internalPath = `${NGINX_UPLOADS_INTERNAL}/${encodedKey}`;
      return new NextResponse(null, {
        status: 200,
        headers: {
          'X-Accel-Redirect': internalPath,
          'Content-Type': contentType,
          'Cache-Control': cacheControl,
          'Accept-Ranges': 'bytes',
          'X-Content-Type-Options': 'nosniff',
        },
      });
    }

    const range = parseRange(request.headers.get('range'), fileStat.size);
    if (range?.invalid) {
      return new NextResponse(null, {
        status: 416,
        headers: {
          'Content-Range': `bytes */${fileStat.size}`,
          'Accept-Ranges': 'bytes',
          'Content-Type': contentType,
          'Cache-Control': cacheControl,
          'X-Content-Type-Options': 'nosniff',
        },
      });
    }

    if (range) {
      const body = Readable.toWeb(createLocalFileReadStream(fileKey, { start: range.start, end: range.end })) as ReadableStream<Uint8Array>;
      return new NextResponse(body, {
        status: 206,
        headers: {
          'Content-Type': contentType,
          'Content-Length': String(range.end - range.start + 1),
          'Content-Range': `bytes ${range.start}-${range.end}/${fileStat.size}`,
          'Accept-Ranges': 'bytes',
          'Cache-Control': cacheControl,
          'X-Content-Type-Options': 'nosniff',
        },
      });
    }

    const body = Readable.toWeb(createLocalFileReadStream(fileKey)) as ReadableStream<Uint8Array>;
    return new NextResponse(body, {
      headers: {
        'Content-Type': contentType,
        'Content-Length': String(fileStat.size),
        'Accept-Ranges': 'bytes',
        'Cache-Control': cacheControl,
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch {
    return NextResponse.json({ code: 1, message: '素材文件不存在' }, { status: 404 });
  }
}
