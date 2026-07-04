/**
 * V3.1 §17 — Unified v1 response envelope.
 *
 * All v1 endpoints return `{ code, message, data, trace_id }`. `code: 0` means
 * success; non-zero codes are reserved for business errors (with HTTP status
 * reflecting transport-level result). `trace_id` is always present so clients
 * can quote it when reporting issues.
 */

import { NextResponse } from "next/server";
import { resolveTraceId, setCurrentTraceId } from "./trace";

export type ApiV1Envelope<T> = {
  code: number;
  message: string;
  data: T | null;
  trace_id: string;
};

export function ok<T>(data: T, traceId: string, message = "success"): NextResponse<ApiV1Envelope<T>> {
  return NextResponse.json(
    { code: 0, message, data, trace_id: traceId },
    { status: 200 },
  );
}

export function created<T>(data: T, traceId: string, message = "created"): NextResponse<ApiV1Envelope<T>> {
  return NextResponse.json(
    { code: 0, message, data, trace_id: traceId },
    { status: 201 },
  );
}

export function fail(
  traceId: string,
  opts: { code?: number; message: string; status?: number; details?: unknown },
): NextResponse<ApiV1Envelope<null>> {
  const { code = 1, message, status = 400, details } = opts;
  const body: ApiV1Envelope<null> = { code, message, data: null, trace_id: traceId };
  if (details !== undefined) (body as Record<string, unknown>).details = details;
  return NextResponse.json(body, { status });
}

export function notFound(traceId: string, message = "not found"): NextResponse<ApiV1Envelope<null>> {
  return fail(traceId, { message, status: 404 });
}

export function forbidden(traceId: string, message = "forbidden"): NextResponse<ApiV1Envelope<null>> {
  return fail(traceId, { message, status: 403 });
}

export function unauthorized(traceId: string, message = "unauthorized"): NextResponse<ApiV1Envelope<null>> {
  return fail(traceId, { message, status: 401 });
}

export function conflict(traceId: string, message = "conflict"): NextResponse<ApiV1Envelope<null>> {
  return fail(traceId, { message, status: 409 });
}

/**
 * Wrap an async route handler so every response carries a trace_id and uncaught
 * errors are turned into 500s with the trace attached. Logs the error to stderr
 * with the trace so operators can grep.
 *
 * The handler may return any ApiV1Envelope-shaped NextResponse — success and
 * error responses both flow through. Type is intentionally loose on the data
 * slot because real handlers mix `ok<T>` and `fail(...)` returns.
 */
export function withTrace<TArgs extends [Request, ...unknown[]]>(
  handler: (traceId: string, ...args: TArgs) => Promise<NextResponse>,
): (...args: TArgs) => Promise<NextResponse<ApiV1Envelope<unknown>>> {
  return async (...args) => {
    const request = args[0];
    const traceId = resolveTraceIdFromRequest(request);
    setCurrentTraceId(traceId);
    try {
      return (await handler(traceId, ...args)) as NextResponse<ApiV1Envelope<unknown>>;
    } catch (err) {
      const message = err instanceof Error ? err.message : "internal error";
      console.error(`[v1] trace=${traceId} error=${message}`, err);
      return fail(traceId, { message: "internal error", status: 500 });
    } finally {
      setCurrentTraceId("");
    }
  };
}

function resolveTraceIdFromRequest(request: Request): string {
  // Headers is standard on both Request and NextRequest.
  return resolveTraceId(request.headers as unknown as Headers);
}