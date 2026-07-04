import assert from 'node:assert/strict';
import {
  PERSISTENT_SESSION_MAX_AGE_SECONDS,
  SESSION_COOKIE_NAME,
  checkRateLimit,
  shouldUseSecureSessionCookie,
  signSessionToken,
  verifySessionToken,
  verifySessionTokenClaims,
  type AuthUser,
} from './auth';
import { hashPassword, passwordNeedsRehash, verifyPassword } from './password';

const user: AuthUser = {
  id: 'user-1',
  account: 'bear2026',
  name: 'Admin',
  role: 'admin',
};

const secret = 'test-secret-with-enough-length';
const now = new Date('2026-06-11T09:00:00.000Z').getTime();

const token = signSessionToken(user, { secret, now, maxAgeSeconds: 60 });
const verified = verifySessionToken(token, { secret, now: now + 1000 });
const claims = verifySessionTokenClaims(token, { secret, now: now + 1000 });
const persistentToken = signSessionToken(user, {
  secret,
  now,
  maxAgeSeconds: PERSISTENT_SESSION_MAX_AGE_SECONDS,
  persistent: true,
});
const persistentClaims = verifySessionTokenClaims(persistentToken, { secret, now: now + 1000 });

assert.equal(SESSION_COOKIE_NAME, 'xp_session');
assert.deepEqual(verified, user);
assert.equal(claims?.expiresAt, Math.floor(now / 1000) + 60);
assert.equal(claims?.persistent, false);
assert.equal(persistentClaims?.expiresAt, Math.floor(now / 1000) + PERSISTENT_SESSION_MAX_AGE_SECONDS);
assert.equal(persistentClaims?.persistent, true);
assert.equal(verifySessionToken(`${token.slice(0, -1)}x`, { secret, now: now + 1000 }), null);
assert.equal(verifySessionToken(token, { secret, now: now + 61_000 }), null);

const limitKey = 'test-login:127.0.0.1:bear2026';
assert.equal(checkRateLimit({ key: limitKey, limit: 2, windowMs: 1000, now }), null);
assert.equal(checkRateLimit({ key: limitKey, limit: 2, windowMs: 1000, now: now + 100 }), null);
assert.equal(checkRateLimit({ key: limitKey, limit: 2, windowMs: 1000, now: now + 200 })?.status, 429);
assert.equal(checkRateLimit({ key: limitKey, limit: 2, windowMs: 1000, now: now + 1100 }), null);

const hashedPassword = hashPassword('strong-password');
assert.equal(verifyPassword('strong-password', hashedPassword), true);
assert.equal(verifyPassword('wrong-password', hashedPassword), false);
assert.equal(passwordNeedsRehash(hashedPassword), false);
assert.equal(passwordNeedsRehash('719c8bb11f2bc01f0e6d3b15f03a3800070bc87f108a31312bebc8a3d44ae5bb'), true);

const originalNodeEnv = process.env.NODE_ENV;
const originalAuthCookieSecure = process.env.AUTH_COOKIE_SECURE;
const originalPublicMediaBaseUrl = process.env.PUBLIC_MEDIA_BASE_URL;
const mutableEnv = process.env as Record<string, string | undefined>;

mutableEnv.NODE_ENV = 'production';
delete mutableEnv.AUTH_COOKIE_SECURE;
mutableEnv.PUBLIC_MEDIA_BASE_URL = 'http://118.25.178.78:5000';
assert.equal(shouldUseSecureSessionCookie(), false);

mutableEnv.PUBLIC_MEDIA_BASE_URL = 'https://example.com';
assert.equal(shouldUseSecureSessionCookie(), true);

mutableEnv.AUTH_COOKIE_SECURE = 'false';
assert.equal(shouldUseSecureSessionCookie(), false);

if (originalNodeEnv === undefined) delete mutableEnv.NODE_ENV;
else mutableEnv.NODE_ENV = originalNodeEnv;
if (originalAuthCookieSecure === undefined) delete mutableEnv.AUTH_COOKIE_SECURE;
else mutableEnv.AUTH_COOKIE_SECURE = originalAuthCookieSecure;
if (originalPublicMediaBaseUrl === undefined) delete mutableEnv.PUBLIC_MEDIA_BASE_URL;
else mutableEnv.PUBLIC_MEDIA_BASE_URL = originalPublicMediaBaseUrl;

console.log('server auth tests passed');
