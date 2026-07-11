import assert from 'node:assert/strict';
import { eq, sql } from 'drizzle-orm';
import { getDb, getPool } from '@/storage/database/pg-db';
import {
  comparisonAssemblies,
  materialLinks,
  materials,
  matrixCalculationRuns,
  metricThresholdRules,
  platformUsers,
} from '@/storage/database/shared/schema';
import { clearAndArchiveComparisonAssembly, COMPARISON_ASSEMBLY_TARGET_TYPE } from './comparison-assembly-deactivation';

const db = getDb();
const marker = `deactivation-test-${Date.now()}`;
let assemblyId = '';
let materialId = '';

void (async () => {
try {
  const [user] = await db.select({ id: platformUsers.id }).from(platformUsers).limit(1).execute();
  assert.ok(user, 'disposable test requires an approved platform user');

  const [assembly] = await db.insert(comparisonAssemblies).values({
    name: marker,
    assemblyType: 'custom_merge',
    sourceType: 'manual',
    createdBy: user.id,
    sourceTaskIds: [],
    sourceReportIds: [],
  }).returning({ id: comparisonAssemblies.id }).execute();
  assemblyId = assembly.id;

  const [material] = await db.insert(materials).values({
    materialType: 'image',
    fileName: `${marker}.png`,
    filePath: `test/${marker}.png`,
    comparisonAssemblyId: assemblyId,
    comparisonCellId: 'disposable-cell',
  }).returning({ id: materials.id }).execute();
  materialId = material.id;

  await db.insert(metricThresholdRules).values({
    assemblyId,
    metricKey: 'yield',
    operator: '>=',
    targetValue: '1',
  }).execute();
  await db.insert(matrixCalculationRuns).values({
    matrixInstanceId: assemblyId,
    triggerType: 'manual',
    inputVersionHash: marker,
    formulaVersionHash: marker,
    status: 'succeeded',
  }).execute();
  await db.insert(materialLinks).values({
    materialId,
    targetType: COMPARISON_ASSEMBLY_TARGET_TYPE,
    targetId: assemblyId,
  }).execute();

  const archived = await clearAndArchiveComparisonAssembly(assemblyId);
  assert.equal(archived?.status, 'archived');
  const [thresholds] = await db.select({ count: sql<number>`count(*)` }).from(metricThresholdRules).where(eq(metricThresholdRules.assemblyId, assemblyId)).execute();
  const [runs] = await db.select({ count: sql<number>`count(*)` }).from(matrixCalculationRuns).where(eq(matrixCalculationRuns.matrixInstanceId, assemblyId)).execute();
  const [links] = await db.select({ count: sql<number>`count(*)` }).from(materialLinks).where(eq(materialLinks.targetId, assemblyId)).execute();
  const [asset] = await db.select({ comparisonAssemblyId: materials.comparisonAssemblyId, comparisonCellId: materials.comparisonCellId }).from(materials).where(eq(materials.id, materialId)).execute();
  assert.equal(Number(thresholds.count), 0);
  assert.equal(Number(runs.count), 0);
  assert.equal(Number(links.count), 0);
  assert.deepEqual(asset, { comparisonAssemblyId: null, comparisonCellId: null });

  const second = await clearAndArchiveComparisonAssembly(assemblyId);
  assert.deepEqual(second, archived);
  console.log('comparison assembly deactivation integration test passed');
} finally {
  if (materialId) await db.delete(materials).where(eq(materials.id, materialId)).execute();
  if (assemblyId) await db.delete(comparisonAssemblies).where(eq(comparisonAssemblies.id, assemblyId)).execute();
}
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => getPool().end());
