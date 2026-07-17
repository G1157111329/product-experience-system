import { NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';
import { getDb } from '@/storage/database/pg-db';
import { matrixIssuePoints } from '@/storage/database/shared/schema';
import { syncMatrixIssuePointToIssue } from '@/lib/matrix/issue-point-sync';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { canAccessMatrix, requireUser, isAuthResponse } from '@/lib/server/auth';
import { ok, fail } from '@/lib/server/api-v1/response';
import { resolveTraceId } from '@/lib/server/api-v1/trace';

export const dynamic = 'force-dynamic';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; issuePointId: string }> },
) {
  const traceId = resolveTraceId(req.headers);
  const { id: matrixId, issuePointId } = await params;
  const client = getSupabaseClient();
  const user = await requireUser(req, client);
  if (isAuthResponse(user)) return fail(traceId, { message: '未认证', status: 401 });
  if (!(await canAccessMatrix(client, user, matrixId))) return fail(traceId, { message: '无权访问该矩阵', status: 403 });

  let body: { issueText?: string };
  try {
    body = await req.json();
  } catch {
    return fail(traceId, { message: '请求体不是合法 JSON', status: 400 });
  }
  if (typeof body.issueText !== 'string') return fail(traceId, { message: 'issueText 必填', status: 400 });

  try {
    const db = await getDb();
    const [current] = await db
      .select()
      .from(matrixIssuePoints)
      .where(eq(matrixIssuePoints.id, issuePointId))
      .limit(1)
      .execute();
    if (!current || current.matrixId !== matrixId) return fail(traceId, { message: '问题点不存在', status: 404 });

    const [point] = await db
      .update(matrixIssuePoints)
      .set({ issueText: body.issueText.trim() })
      .where(eq(matrixIssuePoints.id, issuePointId))
      .returning()
      .execute();
    const linkedIssueId = point ? await syncMatrixIssuePointToIssue(db, point) : null;
    return ok({ ...point, linkedIssueId, status: linkedIssueId ? 'converted' : point?.status }, traceId);
  } catch (err) {
    const message = err instanceof Error ? err.message : '保存问题点失败';
    return fail(traceId, { message, status: 500 });
  }
}
