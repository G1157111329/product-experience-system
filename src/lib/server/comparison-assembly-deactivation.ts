import { and, eq, inArray, or } from 'drizzle-orm';
import { getDb } from '@/storage/database/pg-db';
import {
  comparisonAiResults,
  comparisonAssemblies,
  comparisonItemNodes,
  comparisonMatrixCells,
  comparisonObjects,
  materialLinks,
  matrixCalculationRuns,
  metricThresholdRules,
  materials,
} from '@/storage/database/shared/schema';

export const COMPARISON_ASSEMBLY_TARGET_TYPE = 'comparison_assembly';

export function comparisonAssemblyCleanupPlan() {
  return {
    unbindMaterialFields: ['comparisonCellId', 'comparisonAssemblyId'] as const,
    deleteTables: [
      'metricThresholdRules',
      'matrixCalculationRuns',
      'materialLinks',
      'comparisonAiResults',
      'comparisonMatrixCells',
      'comparisonItemNodes',
      'comparisonObjects',
    ] as const,
    materialLinkTargetType: COMPARISON_ASSEMBLY_TARGET_TYPE,
    archiveAssembly: true as const,
  };
}

export interface ComparisonAssemblyDeactivationDTO {
  id: string;
  status: string;
  updated_at: string | null;
}

/** Preserve uploaded assets, remove all report-readable assembly content, then archive the assembly atomically. */
export async function clearAndArchiveComparisonAssembly(
  assemblyId: string,
  reason = 'user_clear',
): Promise<ComparisonAssemblyDeactivationDTO | null> {
  void reason;
  const db = await getDb();
  return db.transaction(async (tx) => {
    const [assembly] = await tx
      .select({ id: comparisonAssemblies.id, status: comparisonAssemblies.status, updatedAt: comparisonAssemblies.updatedAt })
      .from(comparisonAssemblies)
      .where(eq(comparisonAssemblies.id, assemblyId))
      .limit(1)
      .execute();
    if (!assembly) return null;
    if (assembly.status === 'archived') {
      return { id: assembly.id, status: assembly.status, updated_at: assembly.updatedAt };
    }

    const cells = await tx.select({ id: comparisonMatrixCells.id })
      .from(comparisonMatrixCells)
      .where(eq(comparisonMatrixCells.assemblyId, assemblyId)).execute();
    const cellIds = cells.map((cell) => cell.id);
    await tx.update(materials).set({ comparisonCellId: null, comparisonAssemblyId: null })
      .where(cellIds.length > 0
        ? or(eq(materials.comparisonAssemblyId, assemblyId), inArray(materials.comparisonCellId, cellIds))
        : eq(materials.comparisonAssemblyId, assemblyId))
      .execute();
    await tx.delete(materialLinks).where(and(
      eq(materialLinks.targetType, COMPARISON_ASSEMBLY_TARGET_TYPE),
      eq(materialLinks.targetId, assemblyId),
    )).execute();
    await tx.delete(metricThresholdRules).where(eq(metricThresholdRules.assemblyId, assemblyId)).execute();
    await tx.delete(matrixCalculationRuns).where(eq(matrixCalculationRuns.matrixInstanceId, assemblyId)).execute();
    await tx.delete(comparisonAiResults).where(eq(comparisonAiResults.assemblyId, assemblyId)).execute();
    await tx.delete(comparisonMatrixCells).where(eq(comparisonMatrixCells.assemblyId, assemblyId)).execute();
    await tx.delete(comparisonItemNodes).where(eq(comparisonItemNodes.assemblyId, assemblyId)).execute();
    await tx.delete(comparisonObjects).where(eq(comparisonObjects.assemblyId, assemblyId)).execute();

    const now = new Date().toISOString();
    const [updated] = await tx.update(comparisonAssemblies)
      .set({ status: 'archived', updatedAt: now })
      .where(eq(comparisonAssemblies.id, assemblyId))
      .returning({ id: comparisonAssemblies.id, status: comparisonAssemblies.status, updatedAt: comparisonAssemblies.updatedAt })
      .execute();
    return updated ? { id: updated.id, status: updated.status, updated_at: updated.updatedAt } : null;
  });
}
