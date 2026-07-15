import { createDecipheriv, createHash, timingSafeEqual } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import { getDb } from '@/storage/database/pg-db';
import { wecomBindings, wecomCallbackReplays, wecomMediaIngestJobs } from '@/storage/database/shared/schema';

export interface VerifiedWecomCallback {
  corpId: string;
  messageId: string;
  mediaId: string;
  externalUserId: string;
  mediaType: 'image' | 'video';
  timestamp: number;
  nonce: string;
}

export class WecomCallbackError extends Error {
  constructor(public readonly code: string) { super(code); }
}

export async function settleWecomRouteDenial<T extends { reason: string; status: number }>(
  denial: T,
  writeAudit: () => Promise<void>,
): Promise<T> {
  try { await writeAudit(); }
  catch { /* Route rejection remains stable when audit storage is unavailable. */ }
  return denial;
}

function xmlValue(xml: string, name: string): string {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = xml.match(new RegExp(`<${escaped}>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</${escaped}>`, 'i'));
  return match?.[1]?.trim() ?? '';
}

function requiredConfig() {
  const token = process.env.WECOM_CALLBACK_TOKEN?.trim();
  const encodingKey = process.env.WECOM_ENCODING_AES_KEY?.trim();
  const corpId = process.env.WECOM_CORP_ID?.trim();
  if (!token || !encodingKey || !corpId) throw new WecomCallbackError('wecom_config_missing');
  const key = Buffer.from(`${encodingKey}=`, 'base64');
  if (key.length !== 32) throw new WecomCallbackError('wecom_config_invalid');
  return { token, key, corpId };
}

function safeEqualHex(actual: string, expected: string) {
  const a = Buffer.from(actual, 'hex');
  const b = Buffer.from(expected, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}

export function decryptWecomPayload(encrypted: string): { xml: string; corpId: string } {
  const { key } = requiredConfig();
  let decrypted: Buffer;
  try {
    const decipher = createDecipheriv('aes-256-cbc', key, key.subarray(0, 16));
    decipher.setAutoPadding(false);
    decrypted = Buffer.concat([decipher.update(Buffer.from(encrypted, 'base64')), decipher.final()]);
  } catch {
    throw new WecomCallbackError('wecom_aes_invalid');
  }
  const pad = decrypted[decrypted.length - 1];
  if (!pad || pad > 32) throw new WecomCallbackError('wecom_aes_invalid');
  const payload = decrypted.subarray(0, decrypted.length - pad);
  if (payload.length < 20) throw new WecomCallbackError('wecom_aes_invalid');
  const length = payload.readUInt32BE(16);
  if (length < 1 || 20 + length > payload.length) throw new WecomCallbackError('wecom_aes_invalid');
  return { xml: payload.subarray(20, 20 + length).toString('utf8'), corpId: payload.subarray(20 + length).toString('utf8') };
}

export function verifyWecomCallback(input: {
  signature: string | null;
  timestamp: string | null;
  nonce: string | null;
  encryptedBody: string;
  now?: number;
}): VerifiedWecomCallback {
  const { token, corpId: expectedCorpId } = requiredConfig();
  const encrypted = xmlValue(input.encryptedBody, 'Encrypt');
  const timestamp = Number(input.timestamp);
  if (!input.signature || !input.nonce || !encrypted || !Number.isFinite(timestamp)) throw new WecomCallbackError('wecom_request_invalid');
  const nowSeconds = Math.floor((input.now ?? Date.now()) / 1000);
  if (Math.abs(nowSeconds - timestamp) > 5 * 60) throw new WecomCallbackError('wecom_timestamp_stale');
  const expected = createHash('sha1').update([token, String(input.timestamp), input.nonce, encrypted].sort().join('')).digest('hex');
  if (!safeEqualHex(input.signature, expected)) throw new WecomCallbackError('wecom_signature_invalid');
  const decrypted = decryptWecomPayload(encrypted);
  if (decrypted.corpId !== expectedCorpId) throw new WecomCallbackError('wecom_corp_mismatch');
  const messageId = xmlValue(decrypted.xml, 'MsgId');
  const mediaId = xmlValue(decrypted.xml, 'MediaId');
  const externalUserId = xmlValue(decrypted.xml, 'FromUserName');
  const mediaTypeRaw = xmlValue(decrypted.xml, 'MsgType').toLowerCase();
  if (!messageId || !mediaId || !externalUserId || !['image', 'video'].includes(mediaTypeRaw)) {
    throw new WecomCallbackError('wecom_payload_invalid');
  }
  return { corpId: expectedCorpId, messageId, mediaId, externalUserId, mediaType: mediaTypeRaw as VerifiedWecomCallback['mediaType'], timestamp, nonce: input.nonce };
}

export function verifyWecomChallenge(input: {
  signature: string | null;
  timestamp: string | null;
  nonce: string | null;
  encrypted: string;
  now?: number;
}): string {
  const { token, corpId } = requiredConfig();
  const timestamp = Number(input.timestamp);
  if (!input.signature || !input.nonce || !input.encrypted || !Number.isFinite(timestamp)) throw new WecomCallbackError('wecom_request_invalid');
  if (Math.abs(Math.floor((input.now ?? Date.now()) / 1000) - timestamp) > 5 * 60) throw new WecomCallbackError('wecom_timestamp_stale');
  const expected = createHash('sha1').update([token, String(input.timestamp), input.nonce, input.encrypted].sort().join('')).digest('hex');
  if (!safeEqualHex(input.signature, expected)) throw new WecomCallbackError('wecom_signature_invalid');
  const decrypted = decryptWecomPayload(input.encrypted);
  if (decrypted.corpId !== corpId) throw new WecomCallbackError('wecom_corp_mismatch');
  return decrypted.xml;
}

export interface WecomClaimTransaction {
  claim(callback: VerifiedWecomCallback): Promise<boolean>;
  enqueue(callback: VerifiedWecomCallback): Promise<{ id: string; downloadStatus: string }>;
}

export async function claimWecomCallback(callback: VerifiedWecomCallback, tx: WecomClaimTransaction) {
  if (!(await tx.claim(callback))) throw new WecomCallbackError('wecom_replay_detected');
  return tx.enqueue(callback);
}

export async function enqueueVerifiedWecomCallback(callback: VerifiedWecomCallback) {
  const db = await getDb();
  return db.transaction(async (transaction) => claimWecomCallback(callback, {
    async claim(value) {
      const inserted = await transaction.insert(wecomCallbackReplays).values({
        messageId: value.messageId,
        nonce: value.nonce,
        corpId: value.corpId,
        messageTimestamp: new Date(value.timestamp * 1000).toISOString(),
      }).onConflictDoNothing().returning({ id: wecomCallbackReplays.id }).execute();
      return inserted.length === 1;
    },
    async enqueue(value) {
      const bindings = await transaction.select({ id: wecomBindings.id }).from(wecomBindings).where(and(
        eq(wecomBindings.wecomUserId, value.externalUserId),
        eq(wecomBindings.wecomCorpId, value.corpId),
        eq(wecomBindings.status, 'active'),
      )).limit(1).execute();
      const rows = await transaction.insert(wecomMediaIngestJobs).values({
        wecomMsgId: value.messageId,
        wecomMediaId: value.mediaId,
        mediaType: value.mediaType,
        wecomBindingId: bindings[0]?.id ?? null,
        expiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString(),
        downloadStatus: 'pending',
        lastError: 'awaiting_download_worker',
      }).returning({ id: wecomMediaIngestJobs.id, downloadStatus: wecomMediaIngestJobs.downloadStatus }).execute();
      if (!rows[0]) throw new WecomCallbackError('wecom_enqueue_failed');
      return rows[0];
    },
  }));
}

export async function processWecomCallback(
  input: Parameters<typeof verifyWecomCallback>[0],
  enqueue: (callback: VerifiedWecomCallback) => Promise<unknown> = enqueueVerifiedWecomCallback,
  onDenied?: (denial: { actorUserId: null; targetType: 'wecom_callback'; reason: string }) => Promise<void>,
) {
  try {
    const verified = verifyWecomCallback(input);
    return await enqueue(verified);
  } catch (error) {
    if (onDenied) {
      try {
        await onDenied({
          actorUserId: null,
          targetType: 'wecom_callback',
          reason: error instanceof WecomCallbackError ? error.code : 'wecom_callback_rejected',
        });
      } catch { /* Audit storage must not replace the stable callback rejection. */ }
    }
    throw error;
  }
}

void sql;
