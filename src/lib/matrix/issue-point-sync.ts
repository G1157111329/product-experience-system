import { and, eq, sql } from 'drizzle-orm';
import type { getDb } from '@/storage/database/pg-db';
import { issues, matrixIssuePoints, taskMatrices } from '@/storage/database/shared/schema';

type MatrixDb = Awaited<ReturnType<typeof getDb>>;
type MatrixIssuePoint = typeof matrixIssuePoints.$inferSelect;

export async function syncMatrixIssuePointToIssue(
  db: MatrixDb,
  point: MatrixIssuePoint,
): Promise<string | null> {
  const description = point.issueText.trim();
  if (!description) return point.linkedIssueId ?? null;

  const matrixRows = await db
    .select({ taskId: taskMatrices.taskId })
    .from(taskMatrices)
    .where(eq(taskMatrices.id, point.matrixId))
    .limit(1)
    .execute();
  const taskId = matrixRows[0]?.taskId;
  if (!taskId) throw new Error('矩阵未关联任务');

  const title = description.slice(0, 200);
  if (point.linkedIssueId) {
    await db
      .update(issues)
      .set({ title, description, updatedAt: sql`NOW()` })
      .where(eq(issues.id, point.linkedIssueId))
      .execute();
    return point.linkedIssueId;
  }

  let issueId: string | null = null;
  try {
    const [created] = await db
      .insert(issues)
      .values({
        taskId,
        title,
        description,
        level: '二类',
        status: 'open',
        sourceType: 'matrix_issue',
        source: '数据矩阵',
        sourceReportId: point.id,
      })
      .returning({ id: issues.id })
      .execute();
    issueId = created?.id ?? null;
  } catch {
    const existing = await db
      .select({ id: issues.id })
      .from(issues)
      .where(and(
        eq(issues.taskId, taskId),
        eq(issues.sourceType, 'matrix_issue'),
        eq(issues.sourceReportId, point.id),
      ))
      .limit(1)
      .execute();
    issueId = existing[0]?.id ?? null;
  }
  if (!issueId) throw new Error('创建问题失败');

  await db
    .update(matrixIssuePoints)
    .set({ linkedIssueId: issueId, status: 'converted', updatedAt: sql`NOW()` })
    .where(eq(matrixIssuePoints.id, point.id))
    .execute();
  return issueId;
}
