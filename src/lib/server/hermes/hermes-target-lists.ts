import { and, asc, eq, sql } from 'drizzle-orm';
import { getDb } from '@/storage/database/pg-db';
import {
  comparisonAssemblies,
  comparisonItemNodes,
  comparisonObjects,
  experienceTasks,
  materials,
  matrixHierarchyNodes,
  matrixLeafRows,
  recipes,
  taskMatrices,
} from '@/storage/database/shared/schema';

export async function listTaskRecipes(taskId: string) {
  const db = await getDb();
  return db.select({
    id: recipes.id,
    name: recipes.name,
  }).from(recipes).where(eq(recipes.taskId, taskId)).orderBy(asc(recipes.sortOrder), asc(recipes.createdAt)).execute();
}

export async function listComparisonTargets(taskId: string) {
  const db = await getDb();
  const assemblies = await db.select({
    id: comparisonAssemblies.id,
  }).from(comparisonAssemblies).where(and(
    eq(comparisonAssemblies.assemblyType, 'task_comparison'),
    sql`${comparisonAssemblies.sourceTaskIds}::jsonb @> ${JSON.stringify([taskId])}::jsonb`,
  )).orderBy(asc(comparisonAssemblies.createdAt)).limit(1).execute();
  const assemblyId = assemblies[0]?.id;
  if (!assemblyId) {
    return {
      objects: [] as Array<{ id: string; name: string }>,
      items: [] as Array<{ id: string; label: string }>,
    };
  }

  const objects = await db.select({
    id: comparisonObjects.id,
    name: comparisonObjects.objectName,
  }).from(comparisonObjects).where(eq(comparisonObjects.assemblyId, assemblyId))
    .orderBy(asc(comparisonObjects.sortOrder)).execute();

  const items = await db.select({
    id: comparisonItemNodes.id,
    label: comparisonItemNodes.nodeLabel,
  }).from(comparisonItemNodes).where(and(
    eq(comparisonItemNodes.assemblyId, assemblyId),
    eq(comparisonItemNodes.nodeType, 'item'),
  )).orderBy(asc(comparisonItemNodes.sortOrder)).execute();

  return {
    objects: objects.map((row) => ({ id: row.id, name: row.name || '未命名对象' })),
    items: items.map((row) => ({ id: row.id, label: row.label || '未命名细项' })),
  };
}

export async function listDataMatrixTargets(taskId: string) {
  const db = await getDb();
  const matrices = await db.select({
    id: taskMatrices.id,
  }).from(taskMatrices).where(eq(taskMatrices.taskId, taskId))
    .orderBy(asc(taskMatrices.createdAt)).limit(1).execute();
  const matrixId = matrices[0]?.id;
  if (!matrixId) {
    return {
      matrixId: null as string | null,
      categories: [] as Array<{ id: string; label: string }>,
      leaves: [] as Array<{ id: string; label: string; categoryId: string }>,
    };
  }

  const categories = await db.select({
    id: matrixHierarchyNodes.id,
    label: matrixHierarchyNodes.nodeLabel,
  }).from(matrixHierarchyNodes).where(and(
    eq(matrixHierarchyNodes.matrixId, matrixId),
    eq(matrixHierarchyNodes.level, 1),
  )).orderBy(asc(matrixHierarchyNodes.sortOrder)).execute();

  const leafRows = await db.select({
    id: matrixLeafRows.id,
    categoryId: matrixLeafRows.level1NodeId,
    level2NodeId: matrixLeafRows.level2NodeId,
    visibleRowIndex: matrixLeafRows.visibleRowIndex,
  }).from(matrixLeafRows).where(eq(matrixLeafRows.matrixId, matrixId))
    .orderBy(asc(matrixLeafRows.visibleRowIndex)).execute();

  const level2Ids = [...new Set(leafRows.map((row) => row.level2NodeId).filter(Boolean))] as string[];
  const level2Labels = new Map<string, string>();
  if (level2Ids.length > 0) {
    const nodes = await db.select({
      id: matrixHierarchyNodes.id,
      label: matrixHierarchyNodes.nodeLabel,
    }).from(matrixHierarchyNodes).where(eq(matrixHierarchyNodes.matrixId, matrixId)).execute();
    for (const node of nodes) level2Labels.set(node.id, node.label);
  }

  return {
    matrixId,
    categories: categories.map((row) => ({ id: row.id, label: row.label || '未命名大类' })),
    leaves: leafRows.map((row, index) => ({
      id: row.id,
      label: (row.level2NodeId && level2Labels.get(row.level2NodeId)) || `细项${index + 1}`,
      categoryId: row.categoryId,
    })),
  };
}

export async function claimMaterialsToTask(input: {
  materialIds: string[];
  taskId: string;
  platformUserId: string;
}) {
  if (input.materialIds.length === 0) return 0;
  const db = await getDb();
  let claimed = 0;
  for (const materialId of input.materialIds.slice(0, 40)) {
    const updated = await db.update(materials).set({
      taskId: input.taskId,
    }).where(and(
      eq(materials.id, materialId),
      eq(materials.createdBy, input.platformUserId),
    )).returning({ id: materials.id }).execute();
    if (updated[0]) claimed += 1;
  }
  return claimed;
}

export async function getTaskName(taskId: string) {
  const db = await getDb();
  const rows = await db.select({ taskName: experienceTasks.taskName })
    .from(experienceTasks).where(eq(experienceTasks.id, taskId)).limit(1).execute();
  return rows[0]?.taskName || null;
}
