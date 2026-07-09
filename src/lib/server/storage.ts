/**
 * Storage module with local static-file storage as the default and S3-compatible
 * storage as an optional driver.
 *
 * Local mode stores files under LOCAL_UPLOAD_DIR and exposes them from
 * LOCAL_PUBLIC_BASE_PATH. S3 mode keeps the existing MinIO/AWS-compatible flow.
 */

import {
  S3Client,
  DeleteObjectCommand,
  type PutObjectCommandInput,
} from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import crypto from 'crypto';
import { createReadStream, createWriteStream } from 'fs';
import { access, mkdir, readFile, stat, unlink, writeFile } from 'fs/promises';
import path from 'path';
import { pipeline } from 'stream/promises';
import { isProductionRuntime, requireProductionEnv } from './security-config';

const STORAGE_DRIVER = (process.env.STORAGE_DRIVER || 'local').toLowerCase();
/**
 * Drives where NEW uploads are written. Defaults to STORAGE_DRIVER so existing
 * behavior is unchanged. Set NEW_UPLOAD_DRIVER=s3 to opt into S3 for new files
 * while keeping the global STORAGE_DRIVER=local (so the 459 legacy files in
 * public/uploads keep serving via the static path).
 *
 * Read paths (generatePresignedUrl, file route) always try local first then
 * fall back to S3, so legacy and new files coexist transparently.
 */
const NEW_UPLOAD_DRIVER = (process.env.NEW_UPLOAD_DRIVER || STORAGE_DRIVER).toLowerCase();
const DEFAULT_LOCAL_UPLOAD_DIR = path.join(/*turbopackIgnore: true*/ process.cwd(), 'public', 'uploads');
const LOCAL_UPLOAD_DIR = path.resolve(/*turbopackIgnore: true*/ process.env.LOCAL_UPLOAD_DIR || DEFAULT_LOCAL_UPLOAD_DIR);
const LOCAL_PUBLIC_BASE_PATH = normalizePublicBasePath(process.env.LOCAL_PUBLIC_BASE_PATH || '/uploads');
const LOCAL_PROTECTED_BASE_PATH = normalizePublicBasePath(process.env.LOCAL_PROTECTED_BASE_PATH || '/api/materials/file');
const PUBLIC_MEDIA_BASE_URL = process.env.PUBLIC_MEDIA_BASE_URL?.replace(/\/+$/, '') || '';
const S3_ENDPOINT = process.env.S3_ENDPOINT || 'http://127.0.0.1:9000';
const S3_REGION = process.env.S3_REGION || 'us-east-1';
const S3_BUCKET = process.env.S3_BUCKET || 'xp-experience-media';
const S3_ACCESS_KEY = process.env.S3_ACCESS_KEY || (isProductionRuntime() ? '' : 'minioadmin');
const S3_SECRET_KEY = process.env.S3_SECRET_KEY || (isProductionRuntime() ? '' : 'minioadmin');

const MISSING_MEDIA_DATA_URL =
  `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="180" viewBox="0 0 240 180"><rect width="240" height="180" rx="10" fill="#f7f2e9"/><path d="M72 66h86a10 10 0 0 1 10 10v52a10 10 0 0 1-10 10H72a10 10 0 0 1-10-10V76a10 10 0 0 1 10-10Z" fill="none" stroke="#d8c7ad" stroke-width="4"/><path d="m76 122 28-28 22 22 13-13 29 29" fill="none" stroke="#d8c7ad" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><circle cx="145" cy="85" r="8" fill="#d8c7ad"/><text x="120" y="154" text-anchor="middle" font-family="Arial, sans-serif" font-size="14" fill="#8a735c">素材文件缺失</text></svg>',
  )}`;

let _s3Client: S3Client | null = null;

function getS3Client(): S3Client {
  if (!_s3Client) {
    if (isS3Driver()) {
      requireProductionEnv('S3_ACCESS_KEY');
      requireProductionEnv('S3_SECRET_KEY');
      requireProductionEnv('S3_BUCKET');
    }
    const endpoint = S3_ENDPOINT;
    _s3Client = new S3Client({
      region: S3_REGION,
      endpoint,
      credentials: {
        accessKeyId: S3_ACCESS_KEY,
        secretAccessKey: S3_SECRET_KEY,
      },
      forcePathStyle: endpoint.includes('127.0.0.1') || endpoint.includes('localhost'),
      // Disable the SDK's default CRC32 response validation (default is
      // WHEN_SUPPORTED). When streaming media from the Garage S3 backend
      // (v2.1.0), the returned x-amz-checksum-crc32 header does not match the
      // streamed body, so the SDK throws "Checksum mismatch ... in response
      // header x-amz-checksum-crc32" mid-stream. Because the throw happens
      // after the response is already committed, it becomes an
      // uncaughtException that kills the Node process (502 root cause,
      // 2026-07-08). WHEN_REQUIRED only validates when the operation spec
      // explicitly demands it, which GetObject streaming does not.
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    });
  }
  return _s3Client;
}

function isS3Driver(): boolean {
  return STORAGE_DRIVER === 's3';
}

/**
 * Whether new uploads should be written to S3. Independent of the global
 * STORAGE_DRIVER so we can ship the gray-release (legacy files stay local,
 * new files go to S3).
 */
function isNewUploadS3(): boolean {
  return NEW_UPLOAD_DRIVER === 's3';
}

/**
 * True when S3 credentials/endpoint are configured enough to attempt S3
 * operations. Used to decide whether the fallback path is available.
 */
function isS3FallbackAvailable(): boolean {
  if (!process.env.S3_BUCKET && !S3_BUCKET) return false;
  if (isProductionRuntime()) {
    return Boolean(process.env.S3_ACCESS_KEY) && Boolean(process.env.S3_SECRET_KEY);
  }
  return true;
}

/**
 * Check whether a file exists at the local uploads path. Used by the gray-
 * release read path to decide whether to serve a legacy file locally or fall
 * back to S3.
 */
async function localFileExists(key: string): Promise<boolean> {
  try {
    await access(resolveLocalFilePath(key));
    return true;
  } catch {
    return false;
  }
}

function normalizePublicBasePath(value: string): string {
  const trimmed = value.trim();
  if (!trimmed || trimmed === '/') return '/uploads';
  return `/${trimmed.replace(/^\/+|\/+$/g, '')}`;
}

function stripLocalPublicBase(key: string): string {
  if (key.startsWith(`${LOCAL_PUBLIC_BASE_PATH}/`)) {
    return key.slice(LOCAL_PUBLIC_BASE_PATH.length + 1);
  }
  return key.replace(/^\/+/, '');
}

function sanitizePathSegment(segment: string): string {
  const sanitized = segment.replace(/[<>:"|?*\x00-\x1F]/g, '_').trim();
  if (!sanitized || sanitized === '.' || sanitized === '..') return 'file';
  return sanitized;
}

function normalizeObjectKey(key: string): string {
  const rawKey = stripLocalPublicBase(key).replace(/\\/g, '/');
  const segments = rawKey
    .split('/')
    .filter(Boolean)
    .map((segment) => {
      if (segment === '.' || segment === '..') {
        throw new Error('Invalid storage key');
      }
      return sanitizePathSegment(segment);
    });

  if (segments.length === 0) throw new Error('Invalid storage key');
  return segments.join('/');
}

function resolveLocalFilePath(key: string): string {
  const safeKey = normalizeObjectKey(key);
  const target = path.resolve(/*turbopackIgnore: true*/ LOCAL_UPLOAD_DIR, ...safeKey.split('/'));
  if (target !== LOCAL_UPLOAD_DIR && !target.startsWith(LOCAL_UPLOAD_DIR + path.sep)) {
    throw new Error('Invalid local storage path');
  }
  return target;
}

function withPublicMediaBase(relativeUrl: string, absoluteUrl?: boolean) {
  if (!absoluteUrl || !PUBLIC_MEDIA_BASE_URL) return relativeUrl;
  return `${PUBLIC_MEDIA_BASE_URL}${relativeUrl}`;
}

function localPublicUrl(key: string, absoluteUrl?: boolean): string {
  const safeKey = normalizeObjectKey(key);
  const encodedKey = safeKey.split('/').map(encodeURIComponent).join('/');
  const relativeUrl = `${LOCAL_PUBLIC_BASE_PATH}/${encodedKey}`;
  return withPublicMediaBase(relativeUrl, absoluteUrl);
}

function getLocalMediaSigningSecret() {
  const secret = process.env.LOCAL_MEDIA_SIGNING_SECRET
    || process.env.AUTH_SESSION_SECRET
    || process.env.SESSION_SECRET;
  if (secret) return secret;
  if (isProductionRuntime()) throw new Error('LOCAL_MEDIA_SIGNING_SECRET or AUTH_SESSION_SECRET is required in production');
  return 'development-only-local-media-signing-secret';
}

function signLocalMediaToken(key: string, expiresAt: number) {
  return crypto
    .createHmac('sha256', getLocalMediaSigningSecret())
    .update(`${key}.${expiresAt}`)
    .digest('base64url');
}

function localProtectedUrl(key: string, expireTime?: number, absoluteUrl?: boolean): string {
  const safeKey = normalizeObjectKey(key);
  const encodedKey = safeKey.split('/').map(encodeURIComponent).join('/');
  const expiresAt = Math.floor(Date.now() / 1000) + (expireTime || 30 * 60);
  const token = signLocalMediaToken(safeKey, expiresAt);
  const relativeUrl = `${LOCAL_PROTECTED_BASE_PATH}/${encodedKey}?exp=${expiresAt}&token=${encodeURIComponent(token)}`;
  return withPublicMediaBase(relativeUrl, absoluteUrl);
}

export function verifyLocalMediaToken(key: string, token: string | null, expiresAtText: string | null) {
  if (!token || !expiresAtText) return false;
  const expiresAt = Number(expiresAtText);
  if (!Number.isFinite(expiresAt) || expiresAt <= Math.floor(Date.now() / 1000)) return false;

  const safeKey = normalizeObjectKey(key);
  const expected = signLocalMediaToken(safeKey, expiresAt);
  const tokenBuffer = Buffer.from(token);
  const expectedBuffer = Buffer.from(expected);
  return tokenBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(tokenBuffer, expectedBuffer);
}

export function isLocalUploadPublicAccess() {
  return (process.env.LOCAL_UPLOAD_PUBLIC_ACCESS || 'public').trim().toLowerCase() === 'public';
}

/**
 * Upload a file to the configured storage driver and return its stable object key.
 *
 * Gray-release: respects NEW_UPLOAD_DRIVER (defaults to STORAGE_DRIVER). When
 * set to 's3', uploads go to S3 while legacy files keep being read from local.
 */
export async function uploadFile(params: {
  fileContent: Buffer | NodeJS.ReadableStream;
  fileName: string;
  contentType: string;
}): Promise<string> {
  const fileName = normalizeObjectKey(params.fileName);

  if (!isNewUploadS3()) {
    const target = resolveLocalFilePath(fileName);
    await mkdir(path.dirname(target), { recursive: true });
    if (Buffer.isBuffer(params.fileContent)) {
      await writeFile(target, params.fileContent);
    } else {
      await pipeline(params.fileContent, createWriteStream(target));
    }
    return fileName;
  }

  const client = getS3Client();

  const upload = new Upload({
    client,
    params: {
      Bucket: S3_BUCKET,
      Key: fileName,
      Body: params.fileContent as PutObjectCommandInput['Body'],
      ContentType: params.contentType,
    },
  });

  await upload.done();
  return fileName;
}

/**
 * Generate a browser/AI-accessible URL for a stored file.
 *
 * Gray-release read path: tries local first (legacy files in public/uploads),
 * then falls back to S3 when S3 is configured. When STORAGE_DRIVER=s3 globally,
 * skips the local probe and goes straight to S3.
 */
export async function generatePresignedUrl(params: {
  key: string;
  expireTime?: number;
  absoluteUrl?: boolean;
}): Promise<string> {
  if (params.key.startsWith('http')) return params.key;

  // Pure S3 mode: skip local probe (no legacy files expected on this path).
  // Do not expose the raw S3 endpoint here: in production Garage is intentionally
  // bound to 127.0.0.1, so browser-facing URLs must go through the app proxy.
  if (isS3Driver()) {
    return localProtectedUrl(params.key, params.expireTime, params.absoluteUrl);
  }

  // Gray-release / local mode: try local file first.
  const existsLocally = await localFileExists(params.key);
  if (existsLocally) {
    if (isLocalUploadPublicAccess()) return localPublicUrl(params.key, params.absoluteUrl);
    return localProtectedUrl(params.key, params.expireTime, params.absoluteUrl);
  }

  // Fallback to S3 if configured (new uploads written via NEW_UPLOAD_DRIVER=s3).
  if (isS3FallbackAvailable()) {
    return localProtectedUrl(params.key, params.expireTime, params.absoluteUrl);
  }

  return MISSING_MEDIA_DATA_URL;
}

export async function deleteFile(key: string | null | undefined): Promise<void> {
  if (!key || key.startsWith('http')) return;

  // Gray-release: delete from both local and S3 when both are configured,
  // since a file may live in either location. Errors from a missing location
  // are tolerated (ENOENT for local; S3 delete is idempotent).
  if (!isS3Driver()) {
    try {
      await unlink(resolveLocalFilePath(key));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }
    // Also try S3 fallback (new uploads may live there in gray-release mode).
    if (isS3FallbackAvailable()) {
      try {
        const client = getS3Client();
        await client.send(new DeleteObjectCommand({ Bucket: S3_BUCKET, Key: normalizeObjectKey(key) }));
      } catch (error) {
        console.error('[storage] S3 delete fallback failed for key:', key, error);
      }
    }
    return;
  }

  const client = getS3Client();
  await client.send(new DeleteObjectCommand({ Bucket: S3_BUCKET, Key: normalizeObjectKey(key) }));
}

export async function readLocalFile(key: string): Promise<Buffer> {
  return readFile(resolveLocalFilePath(key));
}

export function createLocalFileReadStream(key: string, options?: { start?: number; end?: number }) {
  return createReadStream(resolveLocalFilePath(key), options);
}

export async function statLocalFile(key: string) {
  return stat(resolveLocalFilePath(key));
}

export function getLocalContentType(key: string) {
  const ext = path.extname(key).toLowerCase();
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.png') return 'image/png';
  if (ext === '.gif') return 'image/gif';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.mp4') return 'video/mp4';
  if (ext === '.webm') return 'video/webm';
  if (ext === '.mov') return 'video/quicktime';
  return 'application/octet-stream';
}

export const NGINX_UPLOADS_INTERNAL = (process.env.NGINX_UPLOADS_INTERNAL || '').replace(/\/+$/, '');

export function isNginxAccelRedirect(): boolean {
  return NGINX_UPLOADS_INTERNAL.length > 0;
}

/**
 * 读取图片并转为 base64 data URL（供 AI 视觉模型使用）。
 * 对超过 500KB 的图片，用系统 ImageMagick (convert) 压缩到最长边 800px / JPEG 70% 质量后再转 base64。
 * 压缩后单张约 50-150KB（base64≈70-200KB），3张约 600KB——适配通用 AI API 10MB 限制。
 *
 * Gray-release: tries local file first; if not present, falls back to S3
 * (getObject -> buffer). This fixes the previous bug where S3 mode returned
 * null unconditionally, breaking AI image evaluation.
 *
 * @param key - 素材的 storage key（file_path）
 * @returns data URL 字符串，文件不存在/非图片/压缩失败时返回 null
 */
export async function readLocalImageAsDataUrl(key: string): Promise<string | null> {
  const safeKey = normalizeObjectKey(key);
  const contentType = getLocalContentType(safeKey);
  if (!contentType.startsWith('image/')) return null;

  // Try local first.
  if (!isS3Driver()) {
    try {
      const filePath = resolveLocalFilePath(safeKey);
      const stats = await stat(filePath);

      // 小图（<500KB）直接转 base64
      if (stats.size <= 500 * 1024) {
        const buffer = await readFile(filePath);
        return `data:${contentType};base64,${buffer.toString('base64')}`;
      }

      // 大图：用 ImageMagick 压缩到最长边 800px JPEG 70%
      const { execFile } = await import('child_process');
      const { promisify } = await import('util');
      const execFileAsync = promisify(execFile);
      const tmpPath = `${filePath}.ai_compress.jpg`;
      await execFileAsync('convert', [
        filePath,
        '-resize', '800x800>',   // 最长边缩到800px（>表示只缩小不放大）
        '-quality', '70',         // JPEG 质量70%
        '-strip',                 // 去除 EXIF 等元数据
        tmpPath,
      ], { timeout: 10000 });
      const compressed = await readFile(tmpPath);
      // 清理临时文件
      await unlink(tmpPath).catch(() => {});
      return `data:image/jpeg;base64,${compressed.toString('base64')}`;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        // Non-"missing file" error: log and fall through to S3 only if available.
        console.error('[storage] readLocalImageAsDataUrl local read failed:', error);
      }
      // else: file not local — fall through to S3 fallback below.
    }
  }

  // S3 fallback (used in gray-release when NEW_UPLOAD_DRIVER=s3 or STORAGE_DRIVER=s3).
  if (isS3FallbackAvailable() || isS3Driver()) {
    try {
      const client = getS3Client();
      const { GetObjectCommand } = await import('@aws-sdk/client-s3');
      const resp = await client.send(new GetObjectCommand({ Bucket: S3_BUCKET, Key: safeKey }));
      if (!resp.Body) return null;
      const buffer = Buffer.from(await resp.Body.transformToByteArray());
      if (buffer.length <= 500 * 1024) {
        return `data:${contentType};base64,${buffer.toString('base64')}`;
      }
      // Compress large S3 image via ImageMagick using a temp file.
      const { execFile } = await import('child_process');
      const { promisify } = await import('util');
      const execFileAsync = promisify(execFile);
      const os = await import('os');
      const tmpIn = path.join(os.tmpdir(), `s3img-${Date.now()}-in${path.extname(safeKey) || '.img'}`);
      const tmpOut = `${tmpIn}.jpg`;
      await writeFile(tmpIn, buffer);
      try {
        await execFileAsync('convert', [tmpIn, '-resize', '800x800>', '-quality', '70', '-strip', tmpOut], { timeout: 10000 });
        const compressed = await readFile(tmpOut);
        return `data:image/jpeg;base64,${compressed.toString('base64')}`;
      } finally {
        await unlink(tmpIn).catch(() => {});
        await unlink(tmpOut).catch(() => {});
      }
    } catch (error) {
      console.error('[storage] readLocalImageAsDataUrl S3 fallback failed:', error);
      return null;
    }
  }

  return null;
}

export { LOCAL_PUBLIC_BASE_PATH, LOCAL_PROTECTED_BASE_PATH, LOCAL_UPLOAD_DIR, S3_BUCKET, STORAGE_DRIVER, NEW_UPLOAD_DRIVER, getS3Client, isNewUploadS3, isS3FallbackAvailable, localFileExists };
