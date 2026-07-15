import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertMaterialMayBePhysicallyDeletedWithRepository,
  deleteMaterialAssetWithRepository,
  type FrozenMediaRetentionRepository,
} from './frozen-media-retention';

function repo(input: { owner?: string; links?: number; frozen?: boolean } = {}) {
  const events: string[] = [];
  const repository: FrozenMediaRetentionRepository = {
    async transaction(work) { return work(repository); },
    async findMaterial() {
      return { id: 'material-1', createdBy: input.owner ?? 'user-1', fileKey: 'task/file.jpg', hasLegacyReference: false };
    },
    async countActiveLinks() { return input.links ?? 0; },
    async hasFrozenSnapshotReference() { return input.frozen ?? false; },
    async createCleanupJob(value) { events.push(`cleanup-create:${value.fileKey}`); },
    async completeCleanupJob(value) { events.push(`cleanup-complete:${value.fileKey}`); },
    async recordCleanupFailure(value) { events.push(`cleanup-failed:${value.fileKey}:${value.error}`); },
    async deleteMaterialRow() { events.push('db-delete'); },
  };
  return { repository, events };
}

test('blocks physical deletion while an active business link exists', async () => {
  const memory = repo({ links: 1 });
  await assert.rejects(() => assertMaterialMayBePhysicallyDeletedWithRepository({ materialId: 'material-1', actorId: 'user-1' }, memory.repository), /active_links/);
});

test('legacy-only record/recipe/step/issue/retest/comparison references block deletion', async () => {
  for (const legacyField of ['record_id', 'recipe_id', 'recipe_step_id', 'issue_id', 're_evaluation_id', 'comparison_cell_id']) {
    const memory = repo();
    memory.repository.findMaterial = async () => ({ id: 'material-1', createdBy: 'user-1', fileKey: 'file', hasLegacyReference: true });
    await assert.rejects(() => assertMaterialMayBePhysicallyDeletedWithRepository({ materialId: 'material-1', actorId: 'user-1' }, memory.repository), /legacy_reference/, legacyField);
  }
});

test('blocks physical deletion when any immutable report snapshot references the asset', async () => {
  const memory = repo({ frozen: true });
  await assert.rejects(() => assertMaterialMayBePhysicallyDeletedWithRepository({ materialId: 'material-1', actorId: 'user-1' }, memory.repository), /frozen_snapshot/);
});

test('blocks another user from deleting the asset', async () => {
  const memory = repo({ owner: 'user-2' });
  await assert.rejects(() => assertMaterialMayBePhysicallyDeletedWithRepository({ materialId: 'material-1', actorId: 'user-1' }, memory.repository), /not_owner/);
});

test('allows an owned and wholly unreferenced asset', async () => {
  const memory = repo();
  assert.deepEqual(await assertMaterialMayBePhysicallyDeletedWithRepository({ materialId: 'material-1', actorId: 'user-1' }, memory.repository), { fileKey: 'task/file.jpg' });
});

test('commits database deletion before physical deletion and audits file cleanup failure', async () => {
  const memory = repo();
  await deleteMaterialAssetWithRepository(
    { materialId: 'material-1', actorId: 'user-1' },
    memory.repository,
    async () => { memory.events.push('file-delete'); throw new Error('storage down'); },
  );
  assert.deepEqual(memory.events, ['cleanup-create:task/file.jpg', 'db-delete', 'file-delete', 'cleanup-failed:task/file.jpg:storage down']);
});

test('cleanup job creation failure rolls back and never deletes the material row', async () => {
  const memory = repo();
  memory.repository.createCleanupJob = async () => { throw new Error('cleanup store down'); };
  await assert.rejects(() => deleteMaterialAssetWithRepository(
    { materialId: 'material-1', actorId: 'user-1' }, memory.repository, async () => undefined,
  ), /cleanup store down/);
  assert.deepEqual(memory.events, []);
});

test('successful physical deletion completes the pre-created cleanup job', async () => {
  const memory = repo();
  await deleteMaterialAssetWithRepository(
    { materialId: 'material-1', actorId: 'user-1' }, memory.repository,
    async () => { memory.events.push('file-delete'); },
  );
  assert.deepEqual(memory.events, ['cleanup-create:task/file.jpg', 'db-delete', 'file-delete', 'cleanup-complete:task/file.jpg']);
});
