import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { writeSecurityAudit } from './security-audit';

export const SESSION_COOKIE_NAME = 'xp_session';
export const SESSION_MAX_AGE_SECONDS = 8 * 60 * 60;

export type AuthRole = 'admin' | 'user';

export interface AuthUser {
  id: string;
  account: string;
  name: string;
  role: AuthRole;
}

type ClientLike = {
  from: (table: string) => {
    select: (fields?: string) => {
      eq: (field: string, value: unknown) => {
        maybeSingle: () => Promise<{ data: Record<string, unknown> | null; error?: unknown }>;
        single?: () => Promise<{ data: Record<string, unknown> | null; error?: unknown }>;
      };
    };
  };
};

interface TokenPayload {
  v: 1;
  sub: string;
  account: string;
  name: string;
  role: AuthRole;
  iat: number;
  exp: number;
}

interface TokenOptions {
  secret?: string;
  now?: number;
  maxAgeSeconds?: number;
}

interface RateLimitOptions {
  key: string;
  limit: number;
  windowMs: number;
  now?: number;
}

const rateLimitBuckets = new Map<string, { count: number; resetAt: number }>();

function getSessionSecret() {
  const secret = process.env.AUTH_SESSION_SECRET || process.env.SESSION_SECRET;
  if (secret) return secret;
  if (process.env.NODE_ENV !== 'production') return 'development-only-session-secret-change-me';
  throw new Error('AUTH_SESSION_SECRET is required in production');
}

function shouldUseSecureSessionCookie() {
  if (process.env.AUTH_COOKIE_SECURE === 'false') return false;
  return process.env.NODE_ENV === 'production';
}

function toBase64Url(value: string | Buffer) {
  return Buffer.from(value).toString('base64url');
}

function fromBase64Url(value: string) {
  return Buffer.from(value, 'base64url').toString('utf8');
}

function signatureFor(payload: string, secret: string) {
  return crypto.createHmac('sha256', secret).update(payload).digest('base64url');
}

function safeEqual(a: string, b: string) {
  const aBuffer = Buffer.from(a);
  const bBuffer = Buffer.from(b);
  return aBuffer.length === bBuffer.length && crypto.timingSafeEqual(aBuffer, bBuffer);
}

export function signSessionToken(user: AuthUser, options: TokenOptions = {}) {
  const now = options.now ?? Date.now();
  const maxAgeSeconds = options.maxAgeSeconds ?? SESSION_MAX_AGE_SECONDS;
  const payload: TokenPayload = {
    v: 1,
    sub: user.id,
    account: user.account,
    name: user.name,
    role: user.role,
    iat: Math.floor(now / 1000),
    exp: Math.floor(now / 1000) + maxAgeSeconds,
  };
  const encodedPayload = toBase64Url(JSON.stringify(payload));
  const signature = signatureFor(encodedPayload, options.secret ?? getSessionSecret());
  return `${encodedPayload}.${signature}`;
}

export function verifySessionToken(token: string | undefined | null, options: TokenOptions = {}): AuthUser | null {
  if (!token) return null;
  const [encodedPayload, signature] = token.split('.');
  if (!encodedPayload || !signature) return null;

  const expected = signatureFor(encodedPayload, options.secret ?? getSessionSecret());
  if (!safeEqual(signature, expected)) return null;

  try {
    const payload = JSON.parse(fromBase64Url(encodedPayload)) as Partial<TokenPayload>;
    const nowSeconds = Math.floor((options.now ?? Date.now()) / 1000);
    if (payload.v !== 1 || !payload.sub || !payload.account || !payload.name) return null;
    if (payload.role !== 'admin' && payload.role !== 'user') return null;
    if (!payload.exp || payload.exp <= nowSeconds) return null;
    return {
      id: payload.sub,
      account: payload.account,
      name: payload.name,
      role: payload.role,
    };
  } catch {
    return null;
  }
}

export function setSessionCookie(response: NextResponse, user: AuthUser) {
  response.cookies.set(SESSION_COOKIE_NAME, signSessionToken(user), {
    httpOnly: true,
    secure: shouldUseSecureSessionCookie(),
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

export function clearSessionCookie(response: NextResponse) {
  response.cookies.set(SESSION_COOKIE_NAME, '', {
    httpOnly: true,
    secure: shouldUseSecureSessionCookie(),
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
}

export function checkRateLimit(options: RateLimitOptions) {
  const now = options.now ?? Date.now();
  const current = rateLimitBuckets.get(options.key);
  if (!current || current.resetAt <= now) {
    rateLimitBuckets.set(options.key, { count: 1, resetAt: now + options.windowMs });
    return null;
  }

  current.count += 1;
  if (current.count <= options.limit) return null;

  const retryAfter = Math.max(1, Math.ceil((current.resetAt - now) / 1000));
  const response = NextResponse.json(
    { code: 1, message: '请求过于频繁，请稍后再试' },
    { status: 429 },
  );
  response.headers.set('Retry-After', String(retryAfter));
  return response;
}

export function rateLimitKey(request: NextRequest, scope: string, subject = 'anonymous') {
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  const ip = forwarded || request.headers.get('x-real-ip') || 'unknown';
  return `${scope}:${ip}:${subject.toLowerCase()}`;
}

export function unauthorized(message = '未登录') {
  return NextResponse.json({ code: 1, message }, { status: 401 });
}

export function forbidden(message = '无权限') {
  return NextResponse.json({ code: 1, message }, { status: 403 });
}

export async function getCurrentUser(request: NextRequest, client: ClientLike): Promise<AuthUser | null> {
  const tokenUser = verifySessionToken(request.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (!tokenUser) return null;

  const { data: user } = await client
    .from('platform_users')
    .select('id, account, name, role, status')
    .eq('id', tokenUser.id)
    .maybeSingle();

  if (!user || user.status !== 'approved') return null;
  if (user.role !== 'admin' && user.role !== 'user') return null;

  return {
    id: String(user.id),
    account: String(user.account),
    name: String(user.name),
    role: user.role,
  };
}

export async function requireUser(request: NextRequest, client: ClientLike): Promise<AuthUser | NextResponse> {
  const user = await getCurrentUser(request, client);
  if (!user) {
    await writeSecurityAudit(client, {
      request,
      action: 'auth.unauthorized',
      outcome: 'denied',
      metadata: { reason: 'missing_or_invalid_session' },
    });
    return unauthorized();
  }
  return user;
}

export async function requireAdmin(request: NextRequest, client: ClientLike): Promise<AuthUser | NextResponse> {
  const user = await getCurrentUser(request, client);
  if (!user) {
    await writeSecurityAudit(client, {
      request,
      action: 'auth.unauthorized',
      outcome: 'denied',
      metadata: { reason: 'missing_or_invalid_session', requiredRole: 'admin' },
    });
    return unauthorized();
  }
  if (user.role !== 'admin') {
    await writeSecurityAudit(client, {
      request,
      actor: user,
      action: 'auth.forbidden',
      outcome: 'denied',
      metadata: { requiredRole: 'admin' },
    });
    return forbidden();
  }
  return user;
}

export async function canAccessTask(client: ClientLike, user: AuthUser, taskId: string) {
  if (user.role === 'admin') return true;
  const { data: task } = await client
    .from('experience_tasks')
    .select('id, created_by')
    .eq('id', taskId)
    .maybeSingle();
  return Boolean(task && task.created_by === user.id);
}

export async function getTaskOwnerId(client: ClientLike, taskId: string) {
  const { data: task } = await client
    .from('experience_tasks')
    .select('id, created_by')
    .eq('id', taskId)
    .maybeSingle();
  return task?.created_by ? String(task.created_by) : null;
}

export async function canAccessReport(client: ClientLike, user: AuthUser, reportId: string) {
  if (user.role === 'admin') return true;
  const { data: report } = await client
    .from('reports')
    .select('id, task_id')
    .eq('id', reportId)
    .maybeSingle();
  if (!report?.task_id) return false;
  return canAccessTask(client, user, String(report.task_id));
}

export async function canReadReport(client: ClientLike, user: AuthUser, reportId: string) {
  if (user.role === 'admin') return true;
  const { data: report } = await client
    .from('reports')
    .select('id')
    .eq('id', reportId)
    .maybeSingle();
  return Boolean(report);
}

export async function canAccessMaterial(client: ClientLike, user: AuthUser, materialId: string) {
  if (user.role === 'admin') return true;
  const { data: material } = await client
    .from('materials')
    .select('id, task_id')
    .eq('id', materialId)
    .maybeSingle();
  if (!material?.task_id) return false;
  return canAccessTask(client, user, String(material.task_id));
}

export async function canAccessRecipe(client: ClientLike, user: AuthUser, recipeId: string) {
  if (user.role === 'admin') return true;
  const { data: recipe } = await client
    .from('recipes')
    .select('id, task_id')
    .eq('id', recipeId)
    .maybeSingle();
  if (!recipe?.task_id) return false;
  return canAccessTask(client, user, String(recipe.task_id));
}

export async function canAccessRecipeStep(client: ClientLike, user: AuthUser, stepId: string) {
  if (user.role === 'admin') return true;
  const { data: step } = await client
    .from('recipe_steps')
    .select('id, recipe_id')
    .eq('id', stepId)
    .maybeSingle();
  if (!step?.recipe_id) return false;
  return canAccessRecipe(client, user, String(step.recipe_id));
}

export async function canAccessIssue(client: ClientLike, user: AuthUser, issueId: string) {
  if (user.role === 'admin') return true;
  const { data: issue } = await client
    .from('issues')
    .select('id, task_id')
    .eq('id', issueId)
    .maybeSingle();
  if (!issue?.task_id) return false;
  return canAccessTask(client, user, String(issue.task_id));
}

export async function canReadIssue(client: ClientLike, user: AuthUser, issueId: string) {
  if (await canAccessIssue(client, user, issueId)) return true;
  const { data: issue } = await client
    .from('issues')
    .select('id, source_report_id')
    .eq('id', issueId)
    .maybeSingle();
  if (!issue?.source_report_id) return false;
  return canReadReport(client, user, String(issue.source_report_id));
}

export async function canAccessIssueReEvaluation(client: ClientLike, user: AuthUser, reEvaluationId: string) {
  if (user.role === 'admin') return true;
  const { data: reEvaluation } = await client
    .from('issue_re_evaluations')
    .select('id, issue_id')
    .eq('id', reEvaluationId)
    .maybeSingle();
  if (!reEvaluation?.issue_id) return false;
  return canAccessIssue(client, user, String(reEvaluation.issue_id));
}

export function isAuthResponse(value: unknown): value is NextResponse {
  return value instanceof NextResponse;
}
