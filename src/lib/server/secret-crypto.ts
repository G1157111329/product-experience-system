import crypto from 'crypto';
import { isProductionRuntime } from './security-config';

const PREFIX = 'enc:v1';

function getEncryptionKey() {
  const raw = process.env.AI_CONFIG_ENCRYPTION_KEY || process.env.AUTH_SESSION_SECRET || process.env.SESSION_SECRET;
  if (!raw && isProductionRuntime()) {
    throw new Error('AI_CONFIG_ENCRYPTION_KEY is required in production');
  }
  const secret = raw || 'development-only-ai-config-encryption-key';
  return crypto.createHash('sha256').update(secret).digest();
}

export function encryptSecret(value: string | null | undefined) {
  if (!value) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [PREFIX, iv.toString('base64url'), tag.toString('base64url'), encrypted.toString('base64url')].join(':');
}

export function decryptSecret(value: string | null | undefined) {
  if (!value) return '';
  if (!value.startsWith(`${PREFIX}:`)) return value;

  const [, , ivText, tagText, encryptedText] = value.split(':');
  if (!ivText || !tagText || !encryptedText) return '';

  const decipher = crypto.createDecipheriv('aes-256-gcm', getEncryptionKey(), Buffer.from(ivText, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagText, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedText, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}

export function isEncryptedSecret(value: unknown) {
  return typeof value === 'string' && value.startsWith(`${PREFIX}:`);
}
