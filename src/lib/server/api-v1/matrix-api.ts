import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { canAccessTask, isAuthResponse, requireUser } from '@/lib/server/auth';
import {
  parseIdempotencyKey,
  readIdempotentResult,
  type IdempotencyKey,
  writeIdempotentResult,
} from './idempotency';
import { resolveTraceId } from './trace';

export type MatrixRequestMeta = {
  traceId: string;
  requestId: string;
};

type MatrixEnvelope<T> = {
  trace_id: string;
  request_id: string;
  data: T | null;
  error: { code: string; message: string } | null;
};

function resolveRequestId(request: Request): string {
  const incoming = (request.headers.get('x-request-id') || '').trim();
  if (incoming && incoming.length <= 64 && /^[A-Za-z0-9_-]+$/.test(incoming)) {
    return incoming;
  }
  return randomUUID();
}

export function resolveMatrixMeta(request: Request): MatrixRequestMeta {
  return {
    traceId: resolveTraceId(request.headers),
    requestId: resolveRequestId(request),
  };
}

export function ok<T>(
  meta: MatrixRequestMeta,
  data: T,
  status = 200,
): NextResponse<MatrixEnvelope<T>> {
  return NextResponse.json(
    { trace_id: meta.traceId, request_id: meta.requestId, data, error: null },
    { status },
  );
}

export function fail(
  meta: MatrixRequestMeta,
  status: number,
  code: string,
  message: string,
): NextResponse<MatrixEnvelope<null>> {
  return NextResponse.json(
    {
      trace_id: meta.traceId,
      request_id: meta.requestId,
      data: null,
      error: { code, message },
    },
    { status },
  );
}

export function mapErrorStatus(code?: string): number {
  if (!code) return 500;
  if (code.endsWith('_404') || code === 'NOT_FOUND') return 404;
  if (
    code.endsWith('_409')
    || code.includes('CONFLICT')
    || code.includes('DUPLICATE')
    || code === 'DESIGN_002'
  ) return 409;
  if (code.startsWith('DESIGN_') || code.startsWith('MX-DESIGN-')) return 400;
  return 500;
}

export async function requireTaskContext(
  request: NextRequest,
  meta: MatrixRequestMeta,
  taskId: string,
) {
  const client = getSupabaseClient();
  const user = await requireUser(request, client);
  if (isAuthResponse(user)) {
    return fail(meta, user.status || 401, user.status === 403 ? 'FORBIDDEN' : 'UNAUTHORIZED', user.status === 403 ? '无权访问该任务' : '未认证');
  }
  if (!(await canAccessTask(client, user, taskId))) {
    return fail(meta, 403, 'FORBIDDEN', '无权访问该任务');
  }
  return { client, user };
}

export function readIdempotentEnvelope(request: Request): {
  key: IdempotencyKey | null;
  response: NextResponse | null;
} {
  const key = parseIdempotencyKey(request.headers);
  if (!key) return { key: null, response: null };

  const cached = readIdempotentResult(key);
  return {
    key,
    response: cached ? NextResponse.json(cached.body, { status: cached.status }) : null,
  };
}

export function writeIdempotentEnvelope(
  key: IdempotencyKey | null,
  status: number,
  body: unknown,
): void {
  if (key) writeIdempotentResult(key, status, body);
}
