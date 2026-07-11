import { and, eq, inArray } from 'drizzle-orm';
import { getDb } from '@/storage/database/pg-db';
import {
  materialLinks,
  materials,
  matrixCellValues,
  matrixFieldValues,
  matrixFormulaRunsV3,
  matrixIssuePoints,
  matrixNarrativeBlocks,
  matrixNarratives,
  matrixRows,
  taskMatrices,
} from '@/storage/database/shared/schema';

export function isClearAndArchiveNoop(status: string): boolean {
  return status === 'archived';
}

type DbTransaction = Parameters<Parameters<ReturnType<typeof getDb>['transaction']>[0]>[0];

/**
 * Remove user-entered matrix content while retaining the matrix and its
 * hierarchy/design metadata for audit and possible restoration.
 */
export async function clearTaskMatrixContent(matrixId: string): Promise<void> {
  const db = await getDb();

  await db.transaction(async (tx) => clearTaskMatrixContentInTransaction(tx, matrixId));
}

async function clearTaskMatrixContentInTransaction(tx: DbTransaction, matrixId: string): Promise<void> {
    const cells = await tx
      .select({ id: matrixCellValues.id })
      .from(matrixCellValues)
      .where(eq(matrixCellValues.matrixId, matrixId))
      .execute();
    const cellIds = cells.map((cell) => cell.id);

    if (cellIds.length > 0) {
      await tx
        .delete(materialLinks)
        .where(and(
          eq(materialLinks.targetType, 'dynamic_matrix_cell_value'),
          inArray(materialLinks.targetId, cellIds),
        ))
        .execute();
    }

    await tx.delete(matrixIssuePoints).where(eq(matrixIssuePoints.matrixId, matrixId)).execute();
    await tx.delete(matrixNarrativeBlocks).where(eq(matrixNarrativeBlocks.matrixId, matrixId)).execute();
    await tx.delete(matrixFormulaRunsV3).where(eq(matrixFormulaRunsV3.matrixId, matrixId)).execute();
    await tx.delete(matrixCellValues).where(eq(matrixCellValues.matrixId, matrixId)).execute();

    const rows = await tx
      .select({ id: matrixRows.id })
      .from(matrixRows)
      .where(eq(matrixRows.matrixId, matrixId))
      .execute();
    const rowIds = rows.map((row) => row.id);

    if (rowIds.length > 0) {
      await tx.delete(matrixFieldValues).where(inArray(matrixFieldValues.rowId, rowIds)).execute();
      await tx
        .update(materials)
        .set({ comparisonCellId: null })
        .where(inArray(materials.comparisonCellId, rowIds))
        .execute();
    }

    await tx.delete(matrixNarratives).where(eq(matrixNarratives.matrixId, matrixId)).execute();
}

export interface TaskMatrixLifecycleDTO {
  id: string;
  task_id: string;
  name: string;
  status: string;
  archived_at: string | null;
  archived_reason: string | null;
  updated_at: string | null;
}

function taskMatrixLifecycleDTO(row: typeof taskMatrices.$inferSelect): TaskMatrixLifecycleDTO {
  return {
    id: row.id,
    task_id: row.taskId,
    name: row.name,
    status: row.status,
    archived_at: row.archivedAt,
    archived_reason: row.archivedReason,
    updated_at: row.updatedAt,
  };
}

/** Clear user content and archive the matrix atomically. Archived matrices are idempotent no-ops. */
export async function clearAndArchiveTaskMatrix(
  matrixId: string,
  reason = 'user_clear',
): Promise<TaskMatrixLifecycleDTO | null> {
  const db = await getDb();
  return db.transaction(async (tx) => {
    const [matrix] = await tx.select().from(taskMatrices).where(eq(taskMatrices.id, matrixId)).limit(1).execute();
    if (!matrix) return null;
    if (isClearAndArchiveNoop(matrix.status)) return taskMatrixLifecycleDTO(matrix);

    await clearTaskMatrixContentInTransaction(tx, matrixId);
    const now = new Date().toISOString();
    const [updated] = await tx
      .update(taskMatrices)
      .set({ status: 'archived', archivedAt: now, archivedReason: reason || 'user_clear', updatedAt: now })
      .where(eq(taskMatrices.id, matrixId))
      .returning()
      .execute();
    return updated ? taskMatrixLifecycleDTO(updated) : null;
  });
}
