import assert from 'node:assert/strict';
import {
  SESSION_COOKIE_NAME,
  checkRateLimit,
  signSessionToken,
  verifySessionToken,
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

assert.equal(SESSION_COOKIE_NAME, 'xp_session');
assert.deepEqual(verified, user);
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

console.log('server auth tests passed');
