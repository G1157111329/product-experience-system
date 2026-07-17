import { NextRequest } from 'next/server';
import { createMatrix, getTaskMatrices } from '@/lib/matrix/design-service';
import { ensureV3ViewForMatrix } from '@/lib/matrix/bootstrap-v3';
import {
  fail,
  mapErrorStatus,
  ok,
  readIdempotentEnvelope,
  requireTaskContext,
  resolveMatrixMeta,
  writeIdempotentEnvelope,
} from '@/lib/server/api-v1/matrix-api';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const meta = resolveMatrixMeta(request);
  const { id: taskId } = await params;

  const ctx = await requireTaskContext(request, meta, taskId);
  if (ctx instanceof Response) return ctx;

  try {
    const matrices = await getTaskMatrices(taskId, ctx.user.id);
    return ok(meta, matrices);
  } catch (err) {
    const e = err as Error & { code?: string };
    return fail(meta, mapErrorStatus(e.code), e.code || 'MATRIX_LIST_FAILED', e.message || 'list failed');
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const meta = resolveMatrixMeta(request);
  const { id: taskId } = await params;

  const ctx = await requireTaskContext(request, meta, taskId);
  if (ctx instanceof Response) return ctx;

  const idem = readIdempotentEnvelope(request);
  if (idem.response) return idem.response;

  const body = (await request.json().catch(() => ({}))) as { name?: string; description?: string };
  const name = (body.name || '').trim();
  if (!name) {
    return fail(meta, 400, 'MX-DESIGN-001', '矩阵名称不能为空');
  }

  try {
    const matrix = await createMatrix(taskId, ctx.user.id, {
      name,
      description: typeof body.description === 'string' ? body.description.trim() : undefined,
    });
    await ensureV3ViewForMatrix({ matrixId: matrix.id, userId: ctx.user.id });
    writeIdempotentEnvelope(idem.key, 201, {
      trace_id: meta.traceId,
      request_id: meta.requestId,
      data: matrix,
      error: null,
    });
    return ok(meta, matrix, 201);
  } catch (err) {
    const e = err as Error & { code?: string };
    return fail(meta, mapErrorStatus(e.code), e.code || 'MATRIX_CREATE_FAILED', e.message || 'create failed');
  }
}
