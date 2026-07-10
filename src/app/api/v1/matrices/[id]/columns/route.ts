/**
 * POST /api/v1/matrices/{id}/columns
 * PRD V3.1.2.4 §7.8.2 / §13.5-13.6 — Create a column definition.
 *
 * Body: {
 *   columnZone, columnLabel, dataType, unitText?, displayOrder?,
 *   isRequired?, showInReport?, maxMediaCount?, resultFormat?, decimalPlaces?,
 *   desktopWidthPx?
 * }
 *
 * display_order defaults to max(existing)+1.
 */
import { NextRequest } from 'next/server';
import { getDb } from '@/storage/database/pg-db';
import { eq, sql } from 'drizzle-orm';
import { matrixColumnDefinitions } from '@/storage/database/shared/schema';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { canAccessMatrix, requireUser, isAuthResponse } from '@/lib/server/auth';
import { ok, fail } from '@/lib/server/api-v1/response';
import { resolveTraceId } from '@/lib/server/api-v1/trace';

export const dynamic = 'force-dynamic';

const VALID_ZONES = new Set([
  'hierarchy', 'primary_media', 'comparison_category', 'detail_dimension',
  'calculation_dimension', 'effect_media', 'evaluation', 'issue_point',
]);

const VALID_DATA_TYPES = new Set([
  'text', 'long_text', 'number', 'duration', 'percentage', 'temperature',
  'volume', 'image_slot', 'media_slot', 'formula', 'issue_point',
]);

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const traceId = resolveTraceId(req.headers);
  const { id: matrixId } = await params;

  const client = getSupabaseClient();
  const user = await requireUser(req, client);
  if (isAuthResponse(user)) return fail(traceId, { message: '未认证', status: 401 });
  if (!(await canAccessMatrix(client, user, matrixId))) {
    return fail(traceId, { message: '无权访问该矩阵', status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return fail(traceId, { message: '请求体不是合法 JSON', status: 400 });
  }

  const columnZone = body.columnZone as string;
  const columnLabel = body.columnLabel as string;
  const dataType = body.dataType as string;

  if (!VALID_ZONES.has(columnZone)) {
    return fail(traceId, { message: `columnZone 无效: ${columnZone}`, status: 400 });
  }
  if (!columnLabel?.trim()) {
    return fail(traceId, { message: 'columnLabel 不能为空', status: 400 });
  }
  if (!VALID_DATA_TYPES.has(dataType)) {
    return fail(traceId, { message: `dataType 无效: ${dataType}`, status: 400 });
  }

  try {
    const db = await getDb();

    // Compute display_order if not provided.
    let displayOrder = typeof body.displayOrder === 'number' ? body.displayOrder : undefined;
    if (displayOrder === undefined) {
      const maxOrderResult = await db
        .select({ maxOrder: sql<number>`COALESCE(MAX(${matrixColumnDefinitions.displayOrder}), 0) + 10` })
        .from(matrixColumnDefinitions)
        .where(eq(matrixColumnDefinitions.matrixId, matrixId))
        .execute();
      displayOrder = maxOrderResult[0]?.maxOrder ?? 10;
    }

    const [column] = await db
      .insert(matrixColumnDefinitions)
      .values({
        matrixId,
        columnZone,
        zoneRole: (body.zoneRole as string) ?? 'A',
        columnLabel: columnLabel.trim(),
        dataType,
        unitText: (body.unitText as string) ?? null,
        displayOrder,
        desktopWidthPx: typeof body.desktopWidthPx === 'number' ? body.desktopWidthPx : 140,
        isPinned: false,
        isRequired: body.isRequired === true,
        showInReport: body.showInReport !== false,
        maxMediaCount: typeof body.maxMediaCount === 'number' ? body.maxMediaCount : null,
        resultFormat: (body.resultFormat as string) ?? null,
        decimalPlaces: typeof body.decimalPlaces === 'number' ? body.decimalPlaces : 2,
        createdBy: user.id,
      })
      .returning()
      .execute();

    return ok(column, traceId, 'created');
  } catch (err) {
    const message = err instanceof Error ? err.message : '创建失败';
    return fail(traceId, { message, status: 500 });
  }
}
