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
} from '@/storage/database/shared/schema';

/**
 * Remove user-entered matrix content while retaining the matrix and its
 * hierarchy/design metadata for audit and possible restoration.
 */
export async function clearTaskMatrixContent(matrixId: string): Promise<void> {
  const db = await getDb();

  await db.transaction(async (tx) => {
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
  });
}
