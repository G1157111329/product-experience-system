import { and, eq, sql } from 'drizzle-orm';
import { getDb } from '@/storage/database/pg-db';
import {
  materialCleanupJobs,
  frozenMaterialReferences,
  materialLinks,
  materials,
  platformUsers,
  reportSnapshots,
} from '@/storage/database/shared/schema';

export type MaterialDeletionRecord = { id: string; createdBy: string | null; fileKey: string; hasLegacyReference: boolean };

export interface FrozenMediaRetentionRepository {
  transaction<T>(work: (tx: FrozenMediaRetentionRepository) => Promise<T>): Promise<T>;
  findMaterial(materialId: string): Promise<MaterialDeletionRecord | null>;
  isAdmin?(actorId: string): Promise<boolean>;
  countActiveLinks(materialId: string): Promise<number>;
  hasFrozenSnapshotReference(materialId: string): Promise<boolean>;
  deleteMaterialRow(materialId: string): Promise<void>;
  createCleanupJob(input: { materialId: string; actorId: string; fileKey: string }): Promise<void>;
  completeCleanupJob(input: { materialId: string; actorId: string; fileKey: string }): Promise<void>;
  recordCleanupFailure(input: { materialId: string; actorId: string; fileKey: string; error: string }): Promise<void>;
}

export async function assertMaterialMayBePhysicallyDeletedWithRepository(
  input: { materialId: string; actorId: string },
  repository: FrozenMediaRetentionRepository,
): Promise<{ fileKey: string }> {
  const material = await repository.findMaterial(input.materialId);
  if (!material) throw new Error('material_not_found');
  const admin = repository.isAdmin ? await repository.isAdmin(input.actorId) : false;
  if (material.createdBy !== input.actorId && !admin) throw new Error('material_not_owner');
  if (material.hasLegacyReference) throw new Error('material_has_legacy_reference');
  if (await repository.countActiveLinks(input.materialId) > 0) throw new Error('material_has_active_links');
  if (await repository.hasFrozenSnapshotReference(input.materialId)) throw new Error('material_has_frozen_snapshot_reference');
  return { fileKey: material.fileKey };
}

export async function deleteMaterialAssetWithRepository(
  input: { materialId: string; actorId: string },
  repository: FrozenMediaRetentionRepository,
  deletePhysicalFile: (fileKey: string) => Promise<void>,
): Promise<{ cleanupQueued: boolean }> {
  const deletion = await repository.transaction(async (tx) => {
    const allowed = await assertMaterialMayBePhysicallyDeletedWithRepository(input, tx);
    await tx.createCleanupJob({ ...input, fileKey: allowed.fileKey });
    await tx.deleteMaterialRow(input.materialId);
    return allowed;
  });
  try {
    await deletePhysicalFile(deletion.fileKey);
    await repository.completeCleanupJob({ ...input, fileKey: deletion.fileKey });
    return { cleanupQueued: false };
  } catch (error) {
    await repository.recordCleanupFailure({
      ...input, fileKey: deletion.fileKey,
      error: error instanceof Error ? error.message : 'physical_file_delete_failed',
    });
    return { cleanupQueued: true };
  }
}

type Db = Awaited<ReturnType<typeof getDb>>;
type DbTransaction = Parameters<Parameters<Db['transaction']>[0]>[0];

function repositoryFor(tx: DbTransaction): FrozenMediaRetentionRepository {
  return {
    transaction: async (work) => work(repositoryFor(tx)),
    async findMaterial(materialId) {
      const rows = await tx.select({
        id: materials.id, createdBy: materials.createdBy, filePath: materials.filePath, fileUrl: materials.fileUrl,
        recordId: materials.recordId, recipeId: materials.recipeId, recipeStepId: materials.recipeStepId,
        issueId: materials.issueId, reEvaluationId: materials.reEvaluationId, comparisonCellId: materials.comparisonCellId,
      })
        .from(materials).where(eq(materials.id, materialId)).limit(1).execute();
      const row = rows[0];
      if (!row) return null;
      return {
        id: row.id, createdBy: row.createdBy, fileKey: row.filePath || row.fileUrl || '',
        hasLegacyReference: Boolean(row.recordId || row.recipeId || row.recipeStepId || row.issueId || row.reEvaluationId || row.comparisonCellId),
      };
    },
    async isAdmin(actorId) {
      const rows = await tx.select({ role: platformUsers.role }).from(platformUsers).where(eq(platformUsers.id, actorId)).limit(1).execute();
      return rows[0]?.role === 'admin';
    },
    async countActiveLinks(materialId) {
      const rows = await tx.select({ count: sql<number>`COUNT(*)::int` }).from(materialLinks).where(eq(materialLinks.materialId, materialId)).execute();
      return rows[0]?.count ?? 0;
    },
    async hasFrozenSnapshotReference(materialId) {
      // Frozen payloads have evolved across releases. A JSON text containment
      // check is deliberately conservative: false positives retain a file;
      // false negatives would irreversibly break an immutable report.
      const refs = await tx.select({ materialId: frozenMaterialReferences.materialId }).from(frozenMaterialReferences)
        .where(eq(frozenMaterialReferences.materialId, materialId)).limit(1).execute();
      if (refs.length > 0) return true;
      const rows = await tx.select({ id: reportSnapshots.id }).from(reportSnapshots)
        .where(sql`${reportSnapshots.snapshotJson}::text LIKE ${`%${materialId}%`}`).limit(1).execute();
      return rows.length > 0;
    },
    async deleteMaterialRow(materialId) {
      await tx.delete(materials).where(eq(materials.id, materialId)).execute();
    },
    async createCleanupJob(input) {
      await tx.insert(materialCleanupJobs).values({
        materialId: input.materialId,
        fileKey: input.fileKey,
        requestedBy: input.actorId,
        actorSnapshot: input.actorId,
      }).onConflictDoUpdate({
        target: [materialCleanupJobs.materialId, materialCleanupJobs.fileKey],
        set: { status: 'pending', updatedAt: sql`NOW()` },
      }).execute();
    },
    async completeCleanupJob(input) {
      await tx.update(materialCleanupJobs).set({ status: 'completed', updatedAt: sql`NOW()` })
        .where(and(eq(materialCleanupJobs.materialId, input.materialId), eq(materialCleanupJobs.fileKey, input.fileKey))).execute();
    },
    async recordCleanupFailure(input) {
      await tx.update(materialCleanupJobs).set({
        status: 'pending', attempts: sql`${materialCleanupJobs.attempts} + 1`,
        lastError: input.error.slice(0, 2000), updatedAt: sql`NOW()`,
      }).where(and(eq(materialCleanupJobs.materialId, input.materialId), eq(materialCleanupJobs.fileKey, input.fileKey))).execute();
    },
  };
}

const databaseRepository: FrozenMediaRetentionRepository = {
  async transaction(work) {
    const db = await getDb();
    return db.transaction((tx) => work(repositoryFor(tx)));
  },
  async findMaterial(materialId) {
    const db = await getDb();
    return repositoryFor(db as unknown as DbTransaction).findMaterial(materialId);
  },
  async isAdmin(actorId) {
    const db = await getDb();
    return repositoryFor(db as unknown as DbTransaction).isAdmin!(actorId);
  },
  async countActiveLinks(materialId) {
    const db = await getDb();
    return repositoryFor(db as unknown as DbTransaction).countActiveLinks(materialId);
  },
  async hasFrozenSnapshotReference(materialId) {
    const db = await getDb();
    return repositoryFor(db as unknown as DbTransaction).hasFrozenSnapshotReference(materialId);
  },
  async deleteMaterialRow(materialId) {
    const db = await getDb();
    return repositoryFor(db as unknown as DbTransaction).deleteMaterialRow(materialId);
  },
  async createCleanupJob(input) {
    const db = await getDb();
    return db.transaction((tx) => repositoryFor(tx).createCleanupJob(input));
  },
  async completeCleanupJob(input) {
    const db = await getDb();
    return db.transaction((tx) => repositoryFor(tx).completeCleanupJob(input));
  },
  async recordCleanupFailure(input) {
    const db = await getDb();
    return db.transaction((tx) => repositoryFor(tx).recordCleanupFailure(input));
  },
};

export async function assertMaterialMayBePhysicallyDeleted(input: { materialId: string; actorId: string }) {
  return assertMaterialMayBePhysicallyDeletedWithRepository(input, databaseRepository);
}

export async function deleteMaterialAsset(
  input: { materialId: string; actorId: string },
  deletePhysicalFile: (fileKey: string) => Promise<void>,
) {
  return deleteMaterialAssetWithRepository(input, databaseRepository, deletePhysicalFile);
}
