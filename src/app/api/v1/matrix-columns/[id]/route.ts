/**
 * PATCH / DELETE /api/v1/matrix-columns/{id}
 * PRD V3.1.2.4 §7.8.2 — Update or soft-archive a column definition.
 *
 * PATCH body (all optional):
 *   columnLabel, unitText, desktopWidthPx, isRequired, showInReport,
 *   decimalPlaces, dataType, maxMediaCount, resultFormat
 *
 * DELETE: soft-archive (sets archived_at); does not hard-delete cells.
 */
import { NextRequest } from 'next/server';
import { getDb } from '@/storage/database/pg-db';
import { eq, sql } from 'drizzle-orm';
import { matrixColumnDefinitions } from '@/storage/database/shared/schema';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { requireUser, isAuthResponse } from '@/lib/server/auth';
import { ok, fail, notFound } from '@/lib/server/api-v1/response';
import { resolveTraceId } from '@/lib/server/api-v1/trace';

export const dynamic = 'force-dynamic';

const VALID_DATA_TYPES = new Set([
  'text', 'long_text', 'number', 'duration', 'percentage', 'temperature',
  'volume', 'image_slot', 'media_slot', 'formula', 'issue_point',
]);

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const traceId = resolveTraceId(req.headers);
  const { id: columnId } = await params;

  const client = getSupabaseClient();
  const user = await requireUser(req, client);
  if (isAuthResponse(user)) return fail(traceId, { message: '未认证', status: 401 });
  void user;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return fail(traceId, { message: '请求体不是合法 JSON', status: 400 });
  }

  if (body.dataType !== undefined && !VALID_DATA_TYPES.has(String(body.dataType))) {
    return fail(traceId, { message: `dataType 无效: ${body.dataType}`, status: 400 });
  }
  if (body.columnLabel !== undefined && !String(body.columnLabel).trim()) {
    return fail(traceId, { message: 'columnLabel 不能为空', status: 400 });
  }
  if (
    body.desktopWidthPx !== undefined &&
    (typeof body.desktopWidthPx !== 'number' || body.desktopWidthPx < 40 || body.desktopWidthPx > 800)
  ) {
    return fail(traceId, { message: 'desktopWidthPx 须在 40–800 之间', status: 400 });
  }

  try {
    const db = await getDb();
    const existing = await db
      .select({ id: matrixColumnDefinitions.id })
      .from(matrixColumnDefinitions)
      .where(eq(matrixColumnDefinitions.id, columnId))
      .limit(1)
      .execute();
    if (existing.length === 0) return notFound(traceId, '列不存在');

    const set: Record<string, unknown> = { updatedAt: sql`NOW()` };
    if (body.columnLabel !== undefined) set.columnLabel = String(body.columnLabel).trim();
    if (body.unitText !== undefined) set.unitText = body.unitText === null || body.unitText === '' ? null : String(body.unitText);
    if (body.desktopWidthPx !== undefined) set.desktopWidthPx = body.desktopWidthPx;
    if (body.isRequired !== undefined) set.isRequired = body.isRequired === true;
    if (body.showInReport !== undefined) set.showInReport = body.showInReport !== false;
    if (body.decimalPlaces !== undefined && typeof body.decimalPlaces === 'number') {
      set.decimalPlaces = body.decimalPlaces;
    }
    if (body.dataType !== undefined) set.dataType = String(body.dataType);
    if (body.maxMediaCount !== undefined) {
      set.maxMediaCount = typeof body.maxMediaCount === 'number' ? body.maxMediaCount : null;
    }
    if (body.resultFormat !== undefined) {
      set.resultFormat = body.resultFormat === null || body.resultFormat === '' ? null : String(body.resultFormat);
    }

    const [updated] = await db
      .update(matrixColumnDefinitions)
      .set(set)
      .where(eq(matrixColumnDefinitions.id, columnId))
      .returning()
      .execute();

    return ok(updated, traceId);
  } catch (err) {
    const message = err instanceof Error ? err.message : '更新失败';
    return fail(traceId, { message, status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const traceId = resolveTraceId(req.headers);
  const { id: columnId } = await params;

  const client = getSupabaseClient();
  const user = await requireUser(req, client);
  if (isAuthResponse(user)) return fail(traceId, { message: '未认证', status: 401 });
  void user;

  try {
    const db = await getDb();
    const [updated] = await db
      .update(matrixColumnDefinitions)
      .set({ archivedAt: sql`NOW()`, updatedAt: sql`NOW()` })
      .where(eq(matrixColumnDefinitions.id, columnId))
      .returning()
      .execute();

    if (!updated) return notFound(traceId, '列不存在');
    return ok(updated, traceId, 'archived');
  } catch (err) {
    const message = err instanceof Error ? err.message : '归档失败';
    return fail(traceId, { message, status: 500 });
  }
}
