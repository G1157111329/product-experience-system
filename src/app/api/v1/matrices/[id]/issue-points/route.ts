/**
 * POST /api/v1/matrices/{id}/issue-points
 * PRD V3.1.2.4 §7.12 — Create a matrix issue point (Q column).
 *
 * Body: { leafRowId, columnId, issueText }
 */
import { NextRequest } from 'next/server';
import { getDb } from '@/storage/database/pg-db';
import { matrixIssuePoints } from '@/storage/database/shared/schema';
import { syncMatrixIssuePointToIssue } from '@/lib/matrix/issue-point-sync';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { canAccessMatrix, requireUser, isAuthResponse } from '@/lib/server/auth';
import { ok, fail } from '@/lib/server/api-v1/response';
import { resolveTraceId } from '@/lib/server/api-v1/trace';

export const dynamic = 'force-dynamic';

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

  let body: { leafRowId?: string; columnId?: string; issueText?: string };
  try {
    body = await req.json();
  } catch {
    return fail(traceId, { message: '请求体不是合法 JSON', status: 400 });
  }

  if (!body.leafRowId || !body.columnId || !body.issueText?.trim()) {
    return fail(traceId, { message: 'leafRowId/columnId/issueText 必填', status: 400 });
  }

  try {
    const db = await getDb();
    const [issuePoint] = await db
      .insert(matrixIssuePoints)
      .values({
        matrixId,
        leafRowId: body.leafRowId,
        columnId: body.columnId,
        issueText: body.issueText.trim(),
        status: 'text',
        createdBy: user.id,
      })
      .returning()
      .execute();

    const linkedIssueId = issuePoint ? await syncMatrixIssuePointToIssue(db, issuePoint) : null;
    return ok({ ...issuePoint, linkedIssueId, status: linkedIssueId ? 'converted' : issuePoint?.status }, traceId, 'created');
  } catch (err) {
    const message = err instanceof Error ? err.message : '创建失败';
    return fail(traceId, { message, status: 500 });
  }
}
