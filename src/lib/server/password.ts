import crypto from 'crypto';

const LEGACY_HASH_SALT = 'xp_experience_platform';
const SCRYPT_KEY_LENGTH = 64;
const SCRYPT_PARAMS = {
  N: 16_384,
  r: 8,
  p: 1,
  maxmem: 64 * 1024 * 1024,
};

function legacyHashPassword(password: string) {
  return crypto.createHash('sha256').update(LEGACY_HASH_SALT + password).digest('hex');
}

export function hashPassword(password: string) {
  const salt = crypto.randomBytes(16).toString('base64url');
  const hash = crypto.scryptSync(password, salt, SCRYPT_KEY_LENGTH, SCRYPT_PARAMS).toString('base64url');
  return `scrypt$${SCRYPT_PARAMS.N}$${SCRYPT_PARAMS.r}$${SCRYPT_PARAMS.p}$${salt}$${hash}`;
}

export function verifyPassword(password: string, storedHash: string | null | undefined) {
  if (!storedHash) return false;
  if (!storedHash.startsWith('scrypt$')) {
    return legacyHashPassword(password) === storedHash;
  }

  const [, n, r, p, salt, expectedHash] = storedHash.split('$');
  if (!n || !r || !p || !salt || !expectedHash) return false;

  const actual = crypto.scryptSync(password, salt, SCRYPT_KEY_LENGTH, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
    maxmem: SCRYPT_PARAMS.maxmem,
  }).toString('base64url');

  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expectedHash);
  return actualBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}

export function passwordNeedsRehash(storedHash: string | null | undefined) {
  return Boolean(storedHash && !storedHash.startsWith('scrypt$'));
}

export function validatePasswordStrength(password: string) {
  const weakPasswords = new Set([
    'password',
    'password123',
    '123456',
    '123456789',
    'qwerty123',
    'admin123',
    'bear2026',
  ]);

  const normalized = password.trim().toLowerCase();
  if (password.length < 10) return '密码至少10个字符';
  if (weakPasswords.has(normalized)) return '密码过于简单，请更换更强的密码';
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    return '密码需同时包含字母和数字';
  }
  return null;
}
