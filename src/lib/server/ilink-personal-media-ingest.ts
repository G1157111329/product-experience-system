import { createDecipheriv } from 'node:crypto';
import { allocateMaterialFileName } from '@/lib/material-naming';
import { detectUploadMediaType } from '@/lib/media-upload-type';
import { uploadFile } from '@/lib/server/storage';
import { getDb } from '@/storage/database/pg-db';
import { materials } from '@/storage/database/shared/schema';

const CDN_BASE_URL = 'https://novac2c.cdn.weixin.qq.com/c2c';
const MAX_MEDIA_BYTES = 100 * 1024 * 1024;

function parseAesKey(value: string) {
  if (/^[0-9a-f]{32}$/i.test(value)) return Buffer.from(value, 'hex');
  const decoded = Buffer.from(value, 'base64');
  if (decoded.length === 16) return decoded;
  if (decoded.length === 32 && /^[0-9a-f]{32}$/i.test(decoded.toString('ascii'))) return Buffer.from(decoded.toString('ascii'), 'hex');
  throw new Error('invalid_ilink_media_aes_key');
}

function decryptAes128Ecb(data: Buffer, aesKey: string) {
  const decipher = createDecipheriv('aes-128-ecb', parseAesKey(aesKey), null);
  decipher.setAutoPadding(true);
  return Buffer.concat([decipher.update(data), decipher.final()]);
}

export async function ingestIlinkPersonalMedia(input: {
  platformUserId: string;
  messageId: string;
  mediaType: 'image' | 'video';
  encryptedQueryParam: string;
  aesKey: string;
}) {
  const url = `${CDN_BASE_URL}/download?encrypted_query_param=${encodeURIComponent(input.encryptedQueryParam)}`;
  const response = await fetch(url, { signal: AbortSignal.timeout(input.mediaType === 'video' ? 120_000 : 30_000), redirect: 'error' });
  if (!response.ok) throw new Error(`ilink_media_download_failed_${response.status}`);
  const cipherText = Buffer.from(await response.arrayBuffer());
  if (cipherText.length > MAX_MEDIA_BYTES + 16) throw new Error('ilink_media_too_large');
  const content = decryptAes128Ecb(cipherText, input.aesKey);
  if (content.length > MAX_MEDIA_BYTES) throw new Error('ilink_media_too_large');
  const uploadType = detectUploadMediaType({
    fileName: `ilink-${input.messageId}.${input.mediaType === 'video' ? 'mp4' : 'jpg'}`,
    declaredMime: 'application/octet-stream',
    prefix: content.subarray(0, 4096),
  });
  if (uploadType.materialType !== input.mediaType) throw new Error('ilink_media_type_mismatch');
  const db = await getDb();
  const existing = await db.select({ fileName: materials.fileName }).from(materials).limit(5000).execute();
  const fileName = allocateMaterialFileName({
    now: new Date(), extension: uploadType.extension,
    existingFileNames: existing.map((item) => item.fileName).filter((value): value is string => Boolean(value)),
  });
  const fileKey = `materials/ilink-inbox/${input.platformUserId}/${fileName}`;
  await uploadFile({ fileContent: content, fileName: fileKey, contentType: uploadType.mimeType });
  const [material] = await db.insert(materials).values({
    createdBy: input.platformUserId,
    materialType: uploadType.materialType,
    fileName,
    filePath: fileKey,
    fileUrl: fileKey,
    fileSize: content.length,
  }).returning().execute();
  return material!;
}
