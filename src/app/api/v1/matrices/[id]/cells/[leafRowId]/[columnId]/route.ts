/**
 * PUT /api/v1/matrices/{id}/cells/{leafRowId}/{columnId}
 * PRD V3.1.2.4 §8.7 — Upsert a cell value.
 *
 * Body: { valueText?, valueNumber?, valueDurationSeconds?, valuePercentage?, displayText? }
 * Uses ON CONFLICT (matrix_id, leaf_row_id, column_id) DO UPDATE.
 * Returns the cell with incremented version.
 */
import { NextRequest } from 'next/server';
import { getDb } from '@/storage/database/pg-db';
import { sql } from 'drizzle-orm';
import { matrixCellValues, matrixColumnDefinitions, matrixLeafRows } from '@/storage/database/shared/schema';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { canAccessMatrix, requireUser, isAuthResponse } from '@/lib/server/auth';
import { ok, fail } from '@/lib/server/api-v1/response';
import { resolveTraceId } from '@/lib/server/api-v1/trace';

export const dynamic = 'force-dynamic';

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; leafRowId: string; columnId: string }> },
) {
  const traceId = resolveTraceId(req.headers);
  const { id: matrixId, leafRowId, columnId } = await params;

  const client = getSupabaseClient();
  const user = await requireUser(req, client);
  if (isAuthResponse(user)) return fail(traceId, { message: '未认证', status: 401 });
  if (!(await canAccessMatrix(client, user, matrixId))) {
    return fail(traceId, { message: '无权访问该矩阵', status: 403 });
  }

  let body: {
    valueText?: string;
    valueNumber?: string | number;
    valueDurationSeconds?: number;
    valuePercentage?: string | number;
    displayText?: string;
  };
  try {
    body = await req.json();
  } catch {
    return fail(traceId, { message: '请求体不是合法 JSON', status: 400 });
  }

  const hasValue =
    body.valueText !== undefined ||
    body.valueNumber !== undefined ||
    body.valueDurationSeconds !== undefined ||
    body.valuePercentage !== undefined;
  const isEmpty =
    (body.valueText === undefined || body.valueText === '') &&
    body.valueNumber === undefined &&
    body.valueDurationSeconds === undefined &&
    body.valuePercentage === undefined;

  try {
    const db = await getDb();
    const [leafRow, column] = await Promise.all([
      db
        .select({ id: matrixLeafRows.id })
        .from(matrixLeafRows)
        .where(sql`${matrixLeafRows.id} = ${leafRowId} AND ${matrixLeafRows.matrixId} = ${matrixId}`)
        .limit(1)
        .execute(),
      db
        .select({ id: matrixColumnDefinitions.id })
        .from(matrixColumnDefinitions)
        .where(sql`${matrixColumnDefinitions.id} = ${columnId} AND ${matrixColumnDefinitions.matrixId} = ${matrixId}`)
        .limit(1)
        .execute(),
    ]);
    if (leafRow.length === 0 || column.length === 0) {
      return fail(traceId, { message: '行或列不属于该矩阵', status: 404 });
    }

    const valueNumberStr =
      body.valueNumber !== undefined && body.valueNumber !== null
        ? String(body.valueNumber)
        : null;
    const valuePercentageStr =
      body.valuePercentage !== undefined && body.valuePercentage !== null
        ? String(body.valuePercentage)
        : null;

    const [cell] = await db
      .insert(matrixCellValues)
      .values({
        matrixId,
        leafRowId,
        columnId,
        valueText: body.valueText ?? null,
        valueNumber: valueNumberStr,
        valueDurationSeconds: body.valueDurationSeconds ?? null,
        valuePercentage: valuePercentageStr,
        displayText: body.displayText ?? null,
        valueState: isEmpty ? 'empty' : 'filled',
        version: 1,
        updatedBy: user.id,
      })
      .onConflictDoUpdate({
        target: [matrixCellValues.matrixId, matrixCellValues.leafRowId, matrixCellValues.columnId],
        set: {
          valueText: body.valueText ?? null,
          valueNumber: valueNumberStr,
          valueDurationSeconds: body.valueDurationSeconds ?? null,
          valuePercentage: valuePercentageStr,
          displayText: body.displayText ?? null,
          valueState: sql`CASE WHEN ${isEmpty ? sql`true` : sql`false`} THEN 'empty'::varchar ELSE 'filled'::varchar END`,
          version: sql`${matrixCellValues.version} + 1`,
          updatedBy: user.id,
          updatedAt: sql`NOW()`,
        },
      })
      .returning()
      .execute();

    void hasValue;
    return ok(cell, traceId);
  } catch (err) {
    const message = err instanceof Error ? err.message : '保存失败';
    return fail(traceId, { message, status: 500 });
  }
}
