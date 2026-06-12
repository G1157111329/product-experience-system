import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/storage/database/pg-db';
import { checkRateLimit, rateLimitKey } from './auth';
import { isProductionRuntime } from './security-config';

interface SharedRateLimitOptions {
  scope: string;
  subject?: string;
  limit: number;
  windowMs: number;
}

function rateLimitResponse(resetAt: Date) {
  const retryAfter = Math.max(1, Math.ceil((resetAt.getTime() - Date.now()) / 1000));
  const response = NextResponse.json(
    { code: 1, message: '请求过于频繁，请稍后再试' },
    { status: 429 },
  );
  response.headers.set('Retry-After', String(retryAfter));
  return response;
}

export async function checkSharedRateLimit(request: NextRequest, options: SharedRateLimitOptions) {
  const key = rateLimitKey(request, options.scope, options.subject || 'anonymous');
  try {
    const { rows } = await getPool().query<{ count: number; reset_at: Date }>(
      `
      INSERT INTO security_rate_limits (rate_key, count, reset_at, updated_at)
      VALUES ($1, 1, now() + ($2::int * interval '1 millisecond'), now())
      ON CONFLICT (rate_key) DO UPDATE SET
        count = CASE
          WHEN security_rate_limits.reset_at <= now() THEN 1
          ELSE security_rate_limits.count + 1
        END,
        reset_at = CASE
          WHEN security_rate_limits.reset_at <= now() THEN now() + ($2::int * interval '1 millisecond')
          ELSE security_rate_limits.reset_at
        END,
        updated_at = now()
      RETURNING count, reset_at
      `,
      [key, options.windowMs],
    );

    const row = rows[0];
    if (row && Number(row.count) > options.limit) {
      return rateLimitResponse(new Date(row.reset_at));
    }
    return null;
  } catch (error) {
    console.warn('[rate-limit] shared limiter failed:', error);
    if (isProductionRuntime()) {
      return NextResponse.json(
        { code: 1, message: '限速服务不可用，请稍后再试' },
        { status: 503 },
      );
    }
    return checkRateLimit({
      key,
      limit: options.limit,
      windowMs: options.windowMs,
    });
  }
}
