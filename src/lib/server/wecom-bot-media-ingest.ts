import { createDecipheriv } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { allocateMaterialFileName } from '@/lib/material-naming';
import { detectUploadMediaType } from '@/lib/media-upload-type';
import { deleteFile, uploadFile } from '@/lib/server/storage';
import { getDb } from '@/storage/database/pg-db';
import { materials, wecomMediaIngestJobs } from '@/storage/database/shared/schema';

const MAX_MEDIA_BYTES = 100 * 1024 * 1024;
const OFFICIAL_MEDIA_HOST_SUFFIXES = ['weixin.qq.com', 'qq.com'];

export type WecomBotMediaInput = {
  messageId: string;
  mediaId: string;
  mediaType: 'image' | 'video';
  platformUserId: string;
  wecomBindingId: string;
  base64?: string;
  url?: string;
  aesKey?: string;
  declaredMime?: string;
};

function isOfficialWecomMediaUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:'
      && OFFICIAL_MEDIA_HOST_SUFFIXES.some((suffix) => url.hostname === suffix || url.hostname.endsWith(`.${suffix}`));
  } catch {
    return false;
  }
}

function decryptCallbackMedia(buffer: Buffer, aesKey?: string) {
  if (!aesKey) return buffer;
  const key = Buffer.from(aesKey, 'base64');
  if (key.length !== 32) throw new Error('invalid_wecom_media_aes_key');
  const decipher = createDecipheriv('aes-256-cbc', key, key.subarray(0, 16));
  return Buffer.concat([decipher.update(buffer), decipher.final()]);
}

async function readCallbackMedia(input: WecomBotMediaInput) {
  if (input.base64) {
    const compact = input.base64.replace(/\s/g, '');
    if (compact.length > Math.ceil(MAX_MEDIA_BYTES * 4 / 3) + 8) throw new Error('wecom_media_too_large');
    return decryptCallbackMedia(Buffer.from(compact, 'base64'), input.aesKey);
  }
  if (!input.url || !isOfficialWecomMediaUrl(input.url)) throw new Error('wecom_media_source_rejected');
  const response = await fetch(input.url, { signal: AbortSignal.timeout(20_000), redirect: 'error' });
  if (!response.ok) throw new Error(`wecom_media_download_failed_${response.status}`);
  const length = Number(response.headers.get('content-length') || 0);
  if (Number.isFinite(length) && length > MAX_MEDIA_BYTES) throw new Error('wecom_media_too_large');
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length > MAX_MEDIA_BYTES) throw new Error('wecom_media_too_large');
  return decryptCallbackMedia(buffer, input.aesKey);
}

/**
 * Writes a received official WeCom bot attachment into the bound platform
 * user's protected material inventory. It intentionally does not bind the
 * asset to a task: the personal assistant must propose a target first.
 */
export async function ingestWecomBotMedia(input: WecomBotMediaInput) {
  const db = await getDb();
  const prior = await db.select({ materialId: wecomMediaIngestJobs.materialId })
    .from(wecomMediaIngestJobs)
    .where(and(
      eq(wecomMediaIngestJobs.wecomMsgId, input.messageId),
      eq(wecomMediaIngestJobs.wecomMediaId, input.mediaId),
    ))
    .limit(1)
    .execute();
  if (prior[0]?.materialId) return { materialId: prior[0].materialId, duplicate: true as const };

  const content = await readCallbackMedia(input);
  const uploadType = detectUploadMediaType({
    fileName: `wecom-${input.messageId}.${input.mediaType === 'video' ? 'mp4' : 'jpg'}`,
    declaredMime: input.declaredMime || 'application/octet-stream',
    prefix: content.subarray(0, 4096),
  });
  if (uploadType.materialType !== input.mediaType) throw new Error('wecom_media_type_mismatch');

  const existing = await db.select({ fileName: materials.fileName }).from(materials).limit(5000).execute();
  const fileName = allocateMaterialFileName({
    now: new Date(),
    extension: uploadType.extension,
    existingFileNames: existing.map((item) => item.fileName).filter((value): value is string => Boolean(value)),
  });
  const fileKey = `materials/wecom-inbox/${input.platformUserId}/${fileName}`;
  await uploadFile({ fileContent: content, fileName: fileKey, contentType: uploadType.mimeType });

  try {
    const [material] = await db.insert(materials).values({
      createdBy: input.platformUserId,
      materialType: uploadType.materialType,
      fileName,
      filePath: fileKey,
      fileUrl: fileKey,
      fileSize: content.length,
    }).returning().execute();
    await db.insert(wecomMediaIngestJobs).values({
      wecomMsgId: input.messageId,
      wecomMediaId: input.mediaId,
      mediaType: input.mediaType,
      wecomBindingId: input.wecomBindingId,
      expiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString(),
      downloadStatus: 'downloaded',
      materialId: material!.id,
      lastError: 'wecom_bot_media',
    }).execute();
    return { materialId: material!.id, duplicate: false as const };
  } catch (error) {
    await deleteFile(fileKey).catch(() => undefined);
    throw error;
  }
}

export { isOfficialWecomMediaUrl };
