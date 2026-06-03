/**
 * Storage module with local static-file storage as the default and S3-compatible
 * storage as an optional driver.
 *
 * Local mode stores files under LOCAL_UPLOAD_DIR and exposes them from
 * LOCAL_PUBLIC_BASE_PATH. S3 mode keeps the existing MinIO/AWS-compatible flow.
 */

import {
  S3Client,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { access, mkdir, unlink, writeFile } from 'fs/promises';
import path from 'path';

const STORAGE_DRIVER = (process.env.STORAGE_DRIVER || 'local').toLowerCase();
const LOCAL_UPLOAD_DIR = process.env.LOCAL_UPLOAD_DIR || path.join(process.cwd(), 'public', 'uploads');
const LOCAL_PUBLIC_BASE_PATH = normalizePublicBasePath(process.env.LOCAL_PUBLIC_BASE_PATH || '/uploads');
const PUBLIC_MEDIA_BASE_URL = process.env.PUBLIC_MEDIA_BASE_URL?.replace(/\/+$/, '') || '';
const S3_ENDPOINT = process.env.S3_ENDPOINT || 'http://127.0.0.1:9000';
const S3_REGION = process.env.S3_REGION || 'us-east-1';
const S3_BUCKET = process.env.S3_BUCKET || 'xp-experience-media';
const S3_ACCESS_KEY = process.env.S3_ACCESS_KEY || 'minioadmin';
const S3_SECRET_KEY = process.env.S3_SECRET_KEY || 'minioadmin';

const MISSING_MEDIA_DATA_URL =
  `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="180" viewBox="0 0 240 180"><rect width="240" height="180" rx="10" fill="#f7f2e9"/><path d="M72 66h86a10 10 0 0 1 10 10v52a10 10 0 0 1-10 10H72a10 10 0 0 1-10-10V76a10 10 0 0 1 10-10Z" fill="none" stroke="#d8c7ad" stroke-width="4"/><path d="m76 122 28-28 22 22 13-13 29 29" fill="none" stroke="#d8c7ad" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><circle cx="145" cy="85" r="8" fill="#d8c7ad"/><text x="120" y="154" text-anchor="middle" font-family="Arial, sans-serif" font-size="14" fill="#8a735c">素材文件缺失</text></svg>',
  )}`;

let _s3Client: S3Client | null = null;

function getS3Client(): S3Client {
  if (!_s3Client) {
    const endpoint = S3_ENDPOINT;
    _s3Client = new S3Client({
      region: S3_REGION,
      endpoint,
      credentials: {
        accessKeyId: S3_ACCESS_KEY,
        secretAccessKey: S3_SECRET_KEY,
      },
      forcePathStyle: endpoint.includes('127.0.0.1') || endpoint.includes('localhost'),
    });
  }
  return _s3Client;
}

function isS3Driver(): boolean {
  return STORAGE_DRIVER === 's3';
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
  const root = path.resolve(LOCAL_UPLOAD_DIR);
  const target = path.resolve(root, ...safeKey.split('/'));
  if (target !== root && !target.startsWith(root + path.sep)) {
    throw new Error('Invalid local storage path');
  }
  return target;
}

function localPublicUrl(key: string): string {
  const safeKey = normalizeObjectKey(key);
  const encodedKey = safeKey.split('/').map(encodeURIComponent).join('/');
  const relativeUrl = `${LOCAL_PUBLIC_BASE_PATH}/${encodedKey}`;
  if (!PUBLIC_MEDIA_BASE_URL) return relativeUrl;
  return `${PUBLIC_MEDIA_BASE_URL}${relativeUrl}`;
}

/**
 * Upload a file to the configured storage driver and return its stable object key.
 */
export async function uploadFile(params: {
  fileContent: Buffer;
  fileName: string;
  contentType: string;
}): Promise<string> {
  const fileName = normalizeObjectKey(params.fileName);

  if (!isS3Driver()) {
    const target = resolveLocalFilePath(fileName);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, params.fileContent);
    return fileName;
  }

  const client = getS3Client();

  const upload = new Upload({
    client,
    params: {
      Bucket: S3_BUCKET,
      Key: fileName,
      Body: params.fileContent,
      ContentType: params.contentType,
    },
  });

  await upload.done();
  return fileName;
}

/**
 * Generate a browser/AI-accessible URL for a stored file.
 * In local mode this is a static URL; in S3 mode it is a presigned URL.
 */
export async function generatePresignedUrl(params: {
  key: string;
  expireTime?: number;
}): Promise<string> {
  if (params.key.startsWith('http')) return params.key;

  if (!isS3Driver()) {
    try {
      await access(resolveLocalFilePath(params.key));
    } catch {
      return MISSING_MEDIA_DATA_URL;
    }
    return localPublicUrl(params.key);
  }

  const client = getS3Client();
  const command = new GetObjectCommand({ Bucket: S3_BUCKET, Key: normalizeObjectKey(params.key) });
  const url = await getSignedUrl(client, command, {
    expiresIn: params.expireTime || 86400,
  });
  return url;
}

export async function deleteFile(key: string | null | undefined): Promise<void> {
  if (!key || key.startsWith('http')) return;

  if (!isS3Driver()) {
    try {
      await unlink(resolveLocalFilePath(key));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }
    return;
  }

  const client = getS3Client();
  await client.send(new DeleteObjectCommand({ Bucket: S3_BUCKET, Key: normalizeObjectKey(key) }));
}

export { LOCAL_PUBLIC_BASE_PATH, LOCAL_UPLOAD_DIR, S3_BUCKET, STORAGE_DRIVER };
