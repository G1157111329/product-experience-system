import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { roleForIndex } from '@/lib/comparison-media-role';
import {
  replaceMaterialTargetsWithRepository,
  replaceMaterialTargetsBatchWithRepository,
  replaceComparisonCellMaterialSelectionWithRepository,
  type MaterialReplacementRepository,
  type ComparisonTargetReplacementRepository,
  type MaterialReplacementTarget,
  nextMaterialIdsForMatrixSelection,
} from './material-asset-service';

type State = {
  links: MaterialReplacementTarget[];
  legacy: Record<string, string | null>;
  status: string;
  fileName?: string | null;
};

function repository(initial: State, failAt?: 'after_add' | 'after_remove' | 'legacy_sync' | 'material_patch') {
  let state = structuredClone(initial);
  const events: string[] = [];
  const repo: MaterialReplacementRepository = {
    async transaction(work) {
      const before = structuredClone(state);
      try { return await work(repo); }
      catch (error) { state = before; throw error; }
    },
    async assertMaterialAccess(materialId, actorId) {
      events.push(`material:${materialId}:${actorId}`);
    },
    async assertTargetAccess(target, actorId) {
      events.push(`target:${target.targetType}:${target.targetId}:${actorId}`);
    },
    async lockMaterials(materialIds) { events.push(`lock:${materialIds.join(',')}`); },
    async addLinks(_materialId, targets) {
      state.links.push(...targets.filter((next) => !state.links.some((current) => current.targetType === next.targetType && current.targetId === next.targetId)));
      if (failAt === 'after_add') throw new Error('injected after additions');
    },
    async removeLinks(_materialId, targets) {
      state.links = state.links.filter((current) => !targets.some((removed) => removed.targetType === current.targetType && removed.targetId === current.targetId));
      if (failAt === 'after_remove') throw new Error('injected after removals');
    },
    async syncLegacyTargets() {
      if (failAt === 'legacy_sync') throw new Error('injected legacy sync');
      state.legacy.record_id = state.links.find((link) => link.targetType === 'record')?.targetId ?? null;
    },
    async listLinks() { return state.links.map((link, index) => ({ id: `link-${index}`, ...link })); },
    async updateDerivedStatus(_materialId, status) { state.status = status; },
    async patchMaterial(_materialId, patch) {
      if (patch.fileName !== undefined) state.fileName = patch.fileName;
      if (failAt === 'material_patch') throw new Error('injected material patch');
    },
  };
  return { repo, snapshot: () => structuredClone(state), events };
}

test('a failure in the second replacement command rolls back the first command', async () => {
  let command = 0;
  const memory = repository(original);
  const originalAdd = memory.repo.addLinks;
  memory.repo.addLinks = async (...args) => {
    command += 1;
    await originalAdd(...args);
    if (command === 2) throw new Error('second command failed');
  };
  await assert.rejects(() => replaceMaterialTargetsBatchWithRepository([
    { materialId: 'material-1', actorId: 'user-1', add: [{ targetType: 'issue', targetId: 'issue-1' }], remove: [] },
    { materialId: 'material-2', actorId: 'user-1', add: [{ targetType: 'record', targetId: 'record-2' }], remove: [] },
  ], memory.repo), /second command failed/);
  assert.deepEqual(memory.snapshot(), original);
});

const original: State = {
  links: [{ targetType: 'record', targetId: 'record-old' }],
  legacy: { record_id: 'record-old' },
  status: 'bound',
  fileName: 'before.jpg',
};

for (const failAt of ['after_add', 'after_remove', 'legacy_sync'] as const) {
  test(`atomic replacement rolls back the entire state on ${failAt}`, async () => {
    const memory = repository(original, failAt);
    await assert.rejects(() => replaceMaterialTargetsWithRepository({
      materialId: 'material-1', actorId: 'user-1',
      add: [{ targetType: 'issue', targetId: 'issue-1' }],
      remove: [{ targetType: 'record', targetId: 'record-old' }],
    }, memory.repo), /injected/);
    assert.deepEqual(memory.snapshot(), original);
  });
}

test('material field patch failure rolls back link, legacy FK and filename together', async () => {
  const memory = repository(original, 'material_patch');
  await assert.rejects(() => replaceMaterialTargetsWithRepository({
    materialId: 'material-1', actorId: 'user-1',
    add: [{ targetType: 'issue', targetId: 'issue-1' }],
    remove: [{ targetType: 'record', targetId: 'record-old' }],
    patch: { fileName: 'after.jpg' },
  }, memory.repo), /material patch/);
  assert.deepEqual(memory.snapshot(), original);
});

test('routes and matrix UI use one batch replacement boundary without sequential mutation loops', () => {
  const api = readFileSync('src/app/api/v1/material-links/route.ts', 'utf8');
  const ui = readFileSync('src/app/(main)/tasks/[id]/components/matrix-v3-media-cell.tsx', 'utf8');
  const materialsRoute = readFileSync('src/app/api/materials/route.ts', 'utf8');
  assert.match(api, /replaceMaterialTargetsBatch/);
  assert.match(api, /replaceMatrixCellMaterialSelection/);
  assert.match(ui, /matrixCell:\s*\{ matrixId, leafRowId, columnId: column\.id, materialIds \}/);
  assert.doesNotMatch(ui, /for \(const id of to(?:Add|Remove)\)/);
  assert.doesNotMatch(ui, /fetch\(mediaUrl[\s\S]*?method:\s*'POST'/);
  assert.doesNotMatch(ui, /fetch\(`\/api\/v1\/material-links\/\$\{linkId\}`[\s\S]*?method:\s*'DELETE'/);
  assert.match(ui, /handleDrop[\s\S]*?replaceSelection/);
  assert.match(ui, /handleRemove[\s\S]*?replaceSelection/);
  const putBody = materialsRoute.slice(materialsRoute.indexOf('export async function PUT'), materialsRoute.indexOf('export async function DELETE'));
  assert.doesNotMatch(putBody, /\.from\('materials'\)[\s\S]*?\.update\(/);
  assert.match(putBody, /patch:\s*file_name/);
});

test('matrix single-item add and remove compute the complete next material id set', () => {
  assert.deepEqual(nextMaterialIdsForMatrixSelection(['a', 'b'], { add: 'c' }), ['a', 'b', 'c']);
  assert.deepEqual(nextMaterialIdsForMatrixSelection(['a', 'b', 'c'], { remove: 'b' }), ['a', 'c']);
  assert.deepEqual(nextMaterialIdsForMatrixSelection(['a', 'b'], { add: 'b' }), ['a', 'b']);
});

test('validates every target before the first write and derives bound state', async () => {
  const memory = repository(original);
  const result = await replaceMaterialTargetsWithRepository({
    materialId: 'material-1', actorId: 'user-1',
    add: [{ targetType: 'issue', targetId: 'issue-1' }],
    remove: [{ targetType: 'record', targetId: 'record-old' }],
  }, memory.repo);
  assert.deepEqual(memory.events, [
    'lock:material-1',
    'material:material-1:user-1',
    'target:issue:issue-1:user-1',
    'target:record:record-old:user-1',
  ]);
  assert.equal(result.status, 'bound');
  assert.deepEqual(memory.snapshot().links, [{ targetType: 'issue', targetId: 'issue-1' }]);
});

test('batch locks material rows once in stable id order before applying commands', async () => {
  const memory = repository(original);
  await replaceMaterialTargetsBatchWithRepository([
    { materialId: 'z-material', actorId: 'user-1', add: [], remove: [] },
    { materialId: 'a-material', actorId: 'user-1', add: [], remove: [] },
  ], memory.repo);
  assert.equal(memory.events[0], 'lock:a-material,z-material');
});

test('comparison media route uses one checked batch replacement without legacy writes', () => {
  const source = readFileSync('src/app/api/comparison-cells/[id]/media/route.ts', 'utf8');
  assert.match(source, /replaceComparisonCellMaterialSelection/);
  assert.doesNotMatch(source, /bindMaterial|unbindMaterialFromTarget/);
  const post = source.slice(source.indexOf('export async function POST'));
  assert.doesNotMatch(post, /\.from\('materials'\)[\s\S]*?\.update\(/);
  assert.doesNotMatch(post, /oldMaterials|currentLinks|\.from\('material_links'\)/);
  const service = readFileSync('src/lib/server/material-asset-service.ts', 'utf8');
  assert.doesNotMatch(service, /set\(\{\s*\[column\.name\]/, 'Drizzle updates must never use SQL column names as object keys');
  assert.match(service, /comparisonCellId: targetId/, 'comparison legacy fallback uses the typed Drizzle property');
});

test('comparison roles keep five inline slots and expose the primary role to projection', () => {
  assert.deepEqual(Array.from({ length: 6 }, (_, index) => roleForIndex(index)), [
    'cell_primary', 'cell_secondary', 'cell_secondary', 'cell_secondary', 'cell_secondary', 'appendix',
  ]);
  const service = readFileSync('src/lib/server/material-asset-service.ts', 'utf8');
  const route = readFileSync('src/app/api/comparison-cells/[id]/media/route.ts', 'utf8');
  const projection = readFileSync('src/lib/matrix/projection.ts', 'utf8');
  assert.match(service, /mediaRole: roleForIndex\(index\)/);
  assert.match(route, /media_role: roleForIndex\(index\)/);
  assert.match(projection, /\.eq\('media_role', 'cell_primary'\)/);
});

test('agent comparison bind preserves zero order for the second item and makes the sixth appendix', () => {
  const nextPlacement = (latest: number | null | undefined) => {
    const displayOrder = Number(latest ?? -1) + 1;
    return { displayOrder, mediaRole: roleForIndex(displayOrder) };
  };
  assert.deepEqual(nextPlacement(0), { displayOrder: 1, mediaRole: 'cell_secondary' });
  assert.deepEqual(nextPlacement(4), { displayOrder: 5, mediaRole: 'appendix' });
  const agentRoute = readFileSync('src/app/api/tasks/[id]/agent-actions/route.ts', 'utf8');
  assert.match(agentRoute, /Number\(latest\?\.media_display_order \?\? -1\) \+ 1/);
  assert.doesNotMatch(agentRoute, /latest\?\.media_display_order \|\| -1/);
  assert.match(agentRoute, /const mediaRole = roleForIndex\(displayOrder\)/);
});

test('concurrent comparison full replacements serialize on target and leave only the last committed selection', async () => {
  const selected = new Set(['A']);
  let tail = Promise.resolve();
  const releases: Array<() => void> = [];
  const repo: ComparisonTargetReplacementRepository = {
    async transaction(work) {
      try { return await work(repo); }
      finally { releases.shift()?.(); }
    },
    async lockComparisonCell() {
      const previous = tail;
      let release!: () => void;
      tail = new Promise<void>((resolve) => { release = resolve; });
      await previous;
      releases.push(release);
    },
    async listComparisonCellMaterialIds() { return [...selected]; },
    async lockMaterials() {},
    async assertMaterialAccess() {},
    async assertTargetAccess() {},
    async addLinks(materialId, targets) { if (targets.length > 0) selected.add(materialId); },
    async removeLinks(materialId, targets) { if (targets.length > 0) selected.delete(materialId); },
    async syncLegacyTargets() {},
    async listLinks(materialId) {
      return selected.has(materialId) ? [{ id: `link-${materialId}`, targetType: 'comparison_cell', targetId: 'cell-1' }] : [];
    },
    async updateDerivedStatus() {},
    async patchMaterial() {},
  };
  const first = replaceComparisonCellMaterialSelectionWithRepository({
    cellId: 'cell-1', actorId: 'user-1', assemblyId: 'assembly-1', materialIds: ['B'],
  }, repo);
  const second = replaceComparisonCellMaterialSelectionWithRepository({
    cellId: 'cell-1', actorId: 'user-1', assemblyId: 'assembly-1', materialIds: ['C'],
  }, repo);
  await Promise.all([first, second]);
  assert.deepEqual([...selected], ['C']);
});

test('removing one target preserves other target uses and demotes only after the last link', async () => {
  const memory = repository({
    links: [
      { targetType: 'record', targetId: 'record-1' },
      { targetType: 'issue', targetId: 'issue-1' },
    ],
    legacy: { record_id: 'record-1' }, status: 'bound',
  });
  await replaceMaterialTargetsWithRepository({
    materialId: 'material-1', actorId: 'user-1', add: [],
    remove: [{ targetType: 'record', targetId: 'record-1' }],
  }, memory.repo);
  assert.deepEqual(memory.snapshot().links, [{ targetType: 'issue', targetId: 'issue-1' }]);
  assert.equal(memory.snapshot().status, 'bound');
});

test('binding and deletion share the same transaction-scoped target lock', () => {
  const materialSource = readFileSync('src/lib/server/material-asset-service.ts', 'utf8');
  const deleteSource = readFileSync('src/lib/server/content-delete-service.ts', 'utf8');
  assert.match(materialSource, /pg_advisory_xact_lock/);
  assert.match(materialSource, /lockMaterialTargetsForTransaction/);
  assert.match(deleteSource, /lockMaterialTargetsForTransaction/);
  assert.match(deleteSource, /\.sort\(\(left, right\) =>[\s\S]*?targetType/, 'delete locks targets in a stable order');
});
