import crypto from 'crypto';
import { expect, type Page } from '@playwright/test';
import { Client } from 'pg';

type AuthUser = {
  id: string;
  account: string;
  name: string;
  role: 'admin' | 'user';
};

const SESSION_COOKIE_NAME = 'xp_session';
const SESSION_MAX_AGE_SECONDS = 8 * 60 * 60;
const DEFAULT_DOCKER_DATABASE_URL = 'postgresql://xp_user:xp_password_local_only@127.0.0.1:5433/xp_experience';
const DEFAULT_DOCKER_SESSION_SECRET = 'local-docker-session-secret-change-me-2026';

function toBase64Url(value: string | Buffer) {
  return Buffer.from(value).toString('base64url');
}

function signatureFor(payload: string, secret: string) {
  return crypto.createHmac('sha256', secret).update(payload).digest('base64url');
}

function signSessionToken(user: AuthUser, secret: string) {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const payload = {
    v: 1,
    sub: user.id,
    account: user.account,
    name: user.name,
    role: user.role,
    iat: nowSeconds,
    exp: nowSeconds + SESSION_MAX_AGE_SECONDS,
  };
  const encodedPayload = toBase64Url(JSON.stringify(payload));
  return `${encodedPayload}.${signatureFor(encodedPayload, secret)}`;
}

function cookieBaseUrl() {
  return process.env.E2E_BASE_URL || 'http://127.0.0.1:5000';
}

async function findApprovedUser(account: string) {
  const client = new Client({ connectionString: process.env.DATABASE_URL || DEFAULT_DOCKER_DATABASE_URL });
  await client.connect();
  try {
    const { rows } = await client.query<AuthUser>(
      `select id, account, name, role from platform_users where account = $1 and status = 'approved' limit 1`,
      [account],
    );
    return rows[0] ?? null;
  } finally {
    await client.end();
  }
}

async function loginWithApi(page: Page, account: string, password: string) {
  const response = await page.request.post('/api/auth/login', {
    data: { account, password },
  });
  expect(response.ok(), 'login API should return 2xx').toBeTruthy();
  const payload = await response.json();
  expect(payload.code, payload.message || 'login API should succeed').toBe(0);
}

export async function loginForE2E(page: Page, account: string, password: string) {
  if (process.env.E2E_AUTH_MODE === 'api') {
    await loginWithApi(page, account, password);
    return;
  }

  const user = await findApprovedUser(account);
  if (!user) {
    await loginWithApi(page, account, password);
    return;
  }

  const token = signSessionToken(
    user,
    process.env.E2E_AUTH_SESSION_SECRET || process.env.AUTH_SESSION_SECRET || DEFAULT_DOCKER_SESSION_SECRET,
  );
  await page.context().addCookies([{
    name: SESSION_COOKIE_NAME,
    value: token,
    url: cookieBaseUrl(),
    httpOnly: true,
    sameSite: 'Lax',
    expires: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SECONDS,
  }]);
}
