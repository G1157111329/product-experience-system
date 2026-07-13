/**
 * POST /api/v1/matrices/{id}/issue-points/{issuePointId}/convert
 * PRD V3.1.2.4 US-10 — Convert a matrix Q-column issue point into a platform Issue.
 */
import { NextRequest } from 'next/server';
import { eq, sql } from 'drizzle-orm';
import { getDb } from '@/storage/database/pg-db';
import {
  matrixIssuePoints,
  taskMatrices,
  issues,
} from '@/storage/database/shared/schema';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { canAccessMatrix, requireUser, isAuthResponse } from '@/lib/server/auth';
import { ok, fail } from '@/lib/server/api-v1/response';
import { resolveTraceId } from '@/lib/server/api-v1/trace';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; issuePointId: string }> },
) {
  const traceId = resolveTraceId(req.headers);
  const { id: matrixId, issuePointId } = await params;

  const client = getSupabaseClient();
  const user = await requireUser(req, client);
  if (isAuthResponse(user)) return fail(traceId, { message: '未认证', status: 401 });
  if (!(await canAccessMatrix(client, user, matrixId))) {
    return fail(traceId, { message: '无权访问该矩阵', status: 403 });
  }

  try {
    const db = await getDb();
    const rows = await db
      .select()
      .from(matrixIssuePoints)
      .where(eq(matrixIssuePoints.id, issuePointId))
      .limit(1)
      .execute();
    const point = rows[0];
    if (!point || point.matrixId !== matrixId) {
      return fail(traceId, { message: '问题点不存在', status: 404 });
    }
    if (point.linkedIssueId) {
      return ok({ issueId: point.linkedIssueId, alreadyConverted: true }, traceId);
    }
    if (!point.issueText?.trim()) {
      return fail(traceId, { message: '问题点文本为空，无法转换', status: 400 });
    }

    const matrixRows = await db
      .select({ taskId: taskMatrices.taskId })
      .from(taskMatrices)
      .where(eq(taskMatrices.id, matrixId))
      .limit(1)
      .execute();
    const taskId = matrixRows[0]?.taskId;
    if (!taskId) {
      return fail(traceId, { message: '矩阵未关联任务', status: 400 });
    }

    const title = point.issueText.trim().slice(0, 200);
    let issueId: string | null = null;
    try {
      const [created] = await db
        .insert(issues)
        .values({
          taskId,
          title,
          description: point.issueText.trim(),
          level: '二类',
          status: 'open',
          sourceType: 'matrix_issue',
          source: '数据矩阵',
        })
        .returning({ id: issues.id })
        .execute();
      issueId = created?.id ?? null;
    } catch {
      // Unique constraint may skip duplicate title — try find existing.
      const existing = await db
        .select({ id: issues.id })
        .from(issues)
        .where(
          sql`${issues.taskId} = ${taskId} AND ${issues.title} = ${title} AND ${issues.sourceType} = 'matrix_issue'`,
        )
        .limit(1)
        .execute();
      issueId = existing[0]?.id ?? null;
    }

    if (!issueId) {
      return fail(traceId, { message: '创建问题失败', status: 500 });
    }

    await db
      .update(matrixIssuePoints)
      .set({
        linkedIssueId: issueId,
        status: 'converted',
        updatedAt: sql`NOW()`,
      })
      .where(eq(matrixIssuePoints.id, issuePointId))
      .execute();

    return ok({ issueId, issuePointId }, traceId, 'converted');
  } catch (err) {
    const message = err instanceof Error ? err.message : '转换失败';
    return fail(traceId, { message, status: 500 });
  }
}
