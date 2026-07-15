/**
 * MaterialAsset staging pool + material_links binding service.
 * PRD V3.1.2.4 §9 (ADR-04).
 *
 * The `materials` table carries a `status` state machine
 * (uploaded/scanning/.../unassigned/suggested/library_ready/bound/archived).
 * The `material_links` polymorphic binding table allows one asset to bind to
 * multiple targets (matrix cell, recipe step, issue, etc.) without rewriting
 * legacy FK columns on `materials`.
 *
 * Legacy FK columns (record_id/task_id/recipe_step_id/...) are retained for
 * read fallback; new bindings go through material_links. `status` is the
 * authoritative lifecycle state.
 */

import { getDb } from '@/storage/database/pg-db';
import {
  checkRecords,
  comparisonMatrixCells,
  issueReEvaluations,
  issues,
  materials,
  materialLinks,
  matrixCellValues,
  matrixColumnDefinitions,
  matrixLeafRows,
  platformUsers,
  recipes,
  recipeSteps,
  taskMatrices,
  comparisonAssemblies,
  experienceTasks,
} from '@/storage/database/shared/schema';
import { roleForIndex } from '@/lib/comparison-media-role';
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';

export type MaterialStatus =
  | 'uploaded'
  | 'scanning'
  | 'scan_failed'
  | 'processing'
  | 'process_failed'
  | 'unassigned'
  | 'suggested'
  | 'library_ready'
  | 'bound'
  | 'archived';

export type BindingMethod =
  | 'click_select'
  | 'drag_attach'
  | 'upload_at_slot'
  | 'wecom_ingest'
  | 'agent_suggested';

/**
 * New writes are intentionally limited to concrete, authorised application
 * targets.  Historical rows keep their original polymorphic value so report
 * readers can continue to resolve legacy bindings.
 */
export const MATERIAL_LINK_TARGET_TYPES = [
  'record',
  'recipe',
  'recipe_step',
  'issue',
  're_evaluation',
  'comparison_cell',
  'dynamic_matrix_cell_value',
] as const;

export type MaterialLinkTargetType = (typeof MATERIAL_LINK_TARGET_TYPES)[number];

export type MaterialLinkWriteInput = {
  materialId: string;
  targetType: string;
  targetId: string;
  bindingMethod: BindingMethod;
  boundBy: string;
};

export type MaterialLinkWrite = Omit<MaterialLinkWriteInput, 'targetType'> & {
  targetType: MaterialLinkTargetType;
};

export function isMaterialLinkTargetType(value: string): value is MaterialLinkTargetType {
  return (MATERIAL_LINK_TARGET_TYPES as readonly string[]).includes(value);
}

/**
 * The link tuple, not the asset, is unique.  Keeping this normalisation pure
 * makes the same idempotence rule available to SQL-backed and API callers.
 */
export function createMaterialLinkWritePlan(inputs: readonly MaterialLinkWriteInput[]): MaterialLinkWrite[] {
  const byTarget = new Map<string, MaterialLinkWrite>();
  for (const input of inputs) {
    if (!isMaterialLinkTargetType(input.targetType)) {
      throw new Error(`unsupported material link target type: ${input.targetType}`);
    }
    if (!input.materialId || !input.targetId) throw new Error('material link requires materialId and targetId');
    const write: MaterialLinkWrite = { ...input, targetType: input.targetType };
    // A repeated click on the same target is an update of the binding metadata,
    // never a second asset relationship.
    byTarget.set(`${write.materialId}:${write.targetType}:${write.targetId}`, write);
  }
  return [...byTarget.values()];
}

export type MaterialLinkTargetResource =
  | { kind: 'task'; id: string }
  | { kind: 'assembly'; id: string }
  | { kind: 'matrix'; id: string };

/**
 * Resolve a closed target to the resource that owns it. Routes use this before
 * writing or deleting a relation so target existence and authorisation cannot
 * be bypassed with a polymorphic id.
 */
export async function resolveMaterialLinkTarget(
  targetType: MaterialLinkTargetType,
  targetId: string,
): Promise<MaterialLinkTargetResource | null> {
  const db = await getDb();
  if (targetType === 'record') {
    const row = await db.select({ taskId: checkRecords.taskId }).from(checkRecords).where(eq(checkRecords.id, targetId)).limit(1).execute();
    return row[0]?.taskId ? { kind: 'task', id: row[0].taskId } : null;
  }
  if (targetType === 'recipe') {
    const row = await db.select({ taskId: recipes.taskId }).from(recipes).where(eq(recipes.id, targetId)).limit(1).execute();
    return row[0]?.taskId ? { kind: 'task', id: row[0].taskId } : null;
  }
  if (targetType === 'recipe_step') {
    const step = await db.select({ recipeId: recipeSteps.recipeId }).from(recipeSteps).where(eq(recipeSteps.id, targetId)).limit(1).execute();
    if (!step[0]?.recipeId) return null;
    const recipe = await db.select({ taskId: recipes.taskId }).from(recipes).where(eq(recipes.id, step[0].recipeId)).limit(1).execute();
    return recipe[0]?.taskId ? { kind: 'task', id: recipe[0].taskId } : null;
  }
  if (targetType === 'issue') {
    const row = await db.select({ taskId: issues.taskId }).from(issues).where(eq(issues.id, targetId)).limit(1).execute();
    return row[0]?.taskId ? { kind: 'task', id: row[0].taskId } : null;
  }
  if (targetType === 're_evaluation') {
    const retest = await db.select({ issueId: issueReEvaluations.issueId }).from(issueReEvaluations).where(eq(issueReEvaluations.id, targetId)).limit(1).execute();
    if (!retest[0]?.issueId) return null;
    const issue = await db.select({ taskId: issues.taskId }).from(issues).where(eq(issues.id, retest[0].issueId)).limit(1).execute();
    return issue[0]?.taskId ? { kind: 'task', id: issue[0].taskId } : null;
  }
  if (targetType === 'comparison_cell') {
    const row = await db.select({ assemblyId: comparisonMatrixCells.assemblyId }).from(comparisonMatrixCells).where(eq(comparisonMatrixCells.id, targetId)).limit(1).execute();
    return row[0]?.assemblyId ? { kind: 'assembly', id: row[0].assemblyId } : null;
  }
  const row = await db.select({ matrixId: matrixCellValues.matrixId }).from(matrixCellValues).where(eq(matrixCellValues.id, targetId)).limit(1).execute();
  return row[0]?.matrixId ? { kind: 'matrix', id: row[0].matrixId } : null;
}

export interface MaterialAsset {
  id: string;
  materialType: string;
  fileName: string | null;
  fileUrl: string | null;
  thumbnailUrl: string | null;
  status: string;
  projectId: string | null;
  createdAt: string;
  createdBy?: string | null;
}

/** Statuses considered part of the staging pool (not yet in a project library). */
const STAGING_STATUSES: MaterialStatus[] = [
  'uploaded',
  'scanning',
  'processing',
  'unassigned',
  'suggested',
];

/**
 * Map a raw materials row (which may carry legacy column names) to the
 * MaterialAsset interface. Keeps the SELECT list explicit and stable.
 */
function toMaterialAsset(row: {
  id: string;
  materialType: string;
  fileName: string | null;
  fileUrl: string | null;
  thumbnailUrl: string | null;
  status: string;
  projectId: string | null;
  createdAt: string;
  createdBy: string | null;
}): MaterialAsset {
  return {
    id: row.id,
    materialType: row.materialType,
    fileName: row.fileName,
    fileUrl: row.fileUrl,
    thumbnailUrl: row.thumbnailUrl,
    status: row.status,
    projectId: row.projectId,
    createdAt: row.createdAt,
    createdBy: row.createdBy,
  };
}

/**
 * Get materials in the staging pool (uploaded/scanning/processing/unassigned/
 * suggested). Optionally filtered by task_id (legacy column still populated by
 * the upload flow) so the staging UI can scope to a task's uploads.
 */
export async function getStagingMaterials(taskId?: string): Promise<MaterialAsset[]> {
  const db = await getDb();

  const statusFilter = inArray(materials.status, STAGING_STATUSES as unknown as string[]);
  const where = taskId
    ? and(eq(materials.taskId, taskId), statusFilter)
    : statusFilter;

  const rows = await db
    .select({
      id: materials.id,
      materialType: materials.materialType,
      fileName: materials.fileName,
      fileUrl: materials.fileUrl,
      thumbnailUrl: materials.thumbnailUrl,
      status: materials.status,
      projectId: materials.projectId,
      createdAt: materials.createdAt,
      createdBy: materials.createdBy,
    })
    .from(materials)
    .where(where)
    .orderBy(sql`${materials.createdAt} DESC`);

  return rows.map(toMaterialAsset);
}

/**
 * Get unassigned materials (待归属池). These have status='unassigned' and no
 * project_id. A user sees the global unassigned pool; access control is
 * expected to be applied at the route layer (admin sees all).
 */
export interface UnassignedMaterialRepository {
  find(scope: UnassignedMaterialScope): Promise<MaterialAsset[]>;
}

const databaseUnassignedMaterialRepository: UnassignedMaterialRepository = {
  async find(scope) {
    const db = await getDb();
    const ownership = scope.includeGlobal ? undefined : eq(materials.createdBy, scope.ownerId!);
    const rows = await db
      .select({
        id: materials.id,
        materialType: materials.materialType,
        fileName: materials.fileName,
        fileUrl: materials.fileUrl,
        thumbnailUrl: materials.thumbnailUrl,
        status: materials.status,
        projectId: materials.projectId,
        createdAt: materials.createdAt,
        createdBy: materials.createdBy,
      })
      .from(materials)
      .where(and(eq(materials.status, 'unassigned'), isNull(materials.projectId), ownership))
      .orderBy(sql`${materials.createdAt} DESC`);
    return rows.map(toMaterialAsset);
  },
};

export async function getUnassignedMaterialsWithRepository(
  input: { userId: string; isAdmin: boolean; globalRequested: boolean },
  repository: UnassignedMaterialRepository,
): Promise<MaterialAsset[]> {
  const scope = resolveUnassignedMaterialScope(input);
  return repository.find(scope);
}

export async function getUnassignedMaterials(input: {
  userId: string;
  isAdmin: boolean;
  globalRequested?: boolean;
}): Promise<MaterialAsset[]> {
  return getUnassignedMaterialsWithRepository(
    { ...input, globalRequested: input.globalRequested ?? false },
    databaseUnassignedMaterialRepository,
  );
}

export function resolveUnassignedMaterialScope(input: { userId: string; isAdmin: boolean; globalRequested: boolean }) {
  if (input.globalRequested && !input.isAdmin) throw new Error('forbidden_global_material_pool');
  return input.globalRequested ? { includeGlobal: true, ownerId: null } : { includeGlobal: false, ownerId: input.userId };
}

export type UnassignedMaterialScope = ReturnType<typeof resolveUnassignedMaterialScope>;

/** Pure mirror of the SQL ownership predicate, used by repository contract tests. */
export function filterUnassignedMaterialsForScope<T extends {
  status: string;
  projectId: string | null;
  createdBy: string | null;
}>(rows: readonly T[], scope: UnassignedMaterialScope): T[] {
  return rows.filter((row) => row.status === 'unassigned'
    && row.projectId === null
    && (scope.includeGlobal || row.createdBy === scope.ownerId));
}

/**
 * Get a project's material library: materials with status library_ready or
 * bound, scoped to the given project_id.
 */
export async function getProjectMaterials(projectId: string): Promise<MaterialAsset[]> {
  const db = await getDb();

  const rows = await db
    .select({
      id: materials.id,
      materialType: materials.materialType,
      fileName: materials.fileName,
      fileUrl: materials.fileUrl,
      thumbnailUrl: materials.thumbnailUrl,
      status: materials.status,
      projectId: materials.projectId,
      createdAt: materials.createdAt,
      createdBy: materials.createdBy,
    })
    .from(materials)
    .where(
      and(
        eq(materials.projectId, projectId),
        inArray(materials.status, ['library_ready', 'bound'] as unknown as string[]),
      ),
    )
    .orderBy(sql`${materials.createdAt} DESC`);

  return rows.map(toMaterialAsset);
}

/**
 * Bind a material to a target. Creates a material_links row (idempotent via the
 * unique (material_id, target_type, target_id) constraint) and transitions the
 * material to 'bound'.
 *
 * Returns the link id (existing row if the binding already exists).
 */
export async function bindMaterial(input: {
  materialId: string;
  targetType: MaterialLinkTargetType;
  targetId: string;
  bindingMethod: BindingMethod;
  boundBy: string;
}): Promise<{ linkId: string }> {
  const [write] = createMaterialLinkWritePlan([input]);
  const db = await getDb();
  return db.transaction(async (tx) => {
  await lockMaterialTargetsForTransaction(tx, [{ targetType: write.targetType, targetId: write.targetId }]);
  const orderRows = await tx
    .select({ nextOrder: sql<number>`COALESCE(MAX(${materialLinks.bindingOrder}), 0) + 1` })
    .from(materialLinks)
    .where(and(
      eq(materialLinks.targetType, write.targetType),
      eq(materialLinks.targetId, write.targetId),
    ))
    .execute();
  const bindingOrder = orderRows[0]?.nextOrder ?? 1;

  // Insert the link; on conflict (same material+target), do nothing and return
  // the existing row id. Returning the id in both branches keeps the contract
  // uniform for callers.
  const inserted = await tx
    .insert(materialLinks)
    .values({
      materialId: write.materialId,
      targetType: write.targetType,
      targetId: write.targetId,
      bindingMethod: write.bindingMethod,
      bindingOrder,
      boundBy: write.boundBy,
    })
    .onConflictDoUpdate({
      target: [materialLinks.materialId, materialLinks.targetType, materialLinks.targetId],
      set: {
        bindingMethod: write.bindingMethod,
        boundBy: write.boundBy,
        boundAt: sql`NOW()`,
        version: sql`${materialLinks.version} + 1`,
      },
    })
    .returning({ id: materialLinks.id })
    .execute();

  const linkId = inserted[0]?.id;
  if (!linkId) {
    throw new Error('Failed to bind material: no link id returned');
  }

  // Transition the material to 'bound'. We update unconditionally; the state
  // machine layer (transitionStatus) could enforce legality, but binding always
  // moves a material into 'bound'.
  await tx
    .update(materials)
    .set({ status: 'bound' })
    .where(eq(materials.id, write.materialId))
    .execute();

  return { linkId };
  });
}

/** Remove exactly one target relation, preserving every other use of the asset. */
export async function unbindMaterialFromTarget(input: {
  materialId: string;
  targetType: MaterialLinkTargetType;
  targetId: string;
}): Promise<void> {
  const db = await getDb();
  const rows = await db
    .select({ id: materialLinks.id })
    .from(materialLinks)
    .where(and(
      eq(materialLinks.materialId, input.materialId),
      eq(materialLinks.targetType, input.targetType),
      eq(materialLinks.targetId, input.targetId),
    ))
    .limit(1)
    .execute();
  if (rows[0]?.id) await unbindMaterial(rows[0].id);
}

/**
 * Remove every asset relationship owned by one deleted target. This is kept
 * separate from deleting an asset: the same material can still be used by
 * other records, steps, issues, or matrix cells.
 */
export async function unbindAllMaterialsFromTarget(input: {
  targetType: MaterialLinkTargetType;
  targetId: string;
}): Promise<void> {
  const db = await getDb();
  const links = await db
    .select({ id: materialLinks.id })
    .from(materialLinks)
    .where(and(eq(materialLinks.targetType, input.targetType), eq(materialLinks.targetId, input.targetId)))
    .execute();
  for (const link of links) await unbindMaterial(link.id);
}

/** Used by legacy compatibility routes to require an unambiguous target on removal. */
export async function getMaterialLinkTargetIds(
  materialId: string,
  targetType: MaterialLinkTargetType,
): Promise<string[]> {
  const db = await getDb();
  const rows = await db
    .select({ targetId: materialLinks.targetId })
    .from(materialLinks)
    .where(and(eq(materialLinks.materialId, materialId), eq(materialLinks.targetType, targetType)))
    .execute();
  return rows.map((row) => row.targetId);
}

/**
 * Unbind: remove the material_links row. If the material has no remaining
 * links, transition it back to 'unassigned' (so it returns to the 待归属池).
 */
export async function unbindMaterial(linkId: string): Promise<void> {
  const db = await getDb();

  // Fetch the link first so we know which material to inspect after deletion.
  const links = await db
    .select({ materialId: materialLinks.materialId })
    .from(materialLinks)
    .where(eq(materialLinks.id, linkId))
    .execute();

  if (links.length === 0) return; // already gone — idempotent

  const materialId = links[0].materialId;

  await db.delete(materialLinks).where(eq(materialLinks.id, linkId)).execute();

  // Count remaining links for this material. If none, demote to 'unassigned'
  // (unless it was archived — archived is terminal).
  const remaining = await db
    .select({ id: materialLinks.id })
    .from(materialLinks)
    .where(eq(materialLinks.materialId, materialId))
    .execute();

  if (remaining.length === 0) {
    await db
      .update(materials)
      .set({ status: 'unassigned' })
      .where(
        and(
          eq(materials.id, materialId),
          // Don't resurrect archived materials.
          sql`${materials.status} <> 'archived'`,
        ),
      )
      .execute();
  }
}

/**
 * Transition a material's status. Enforces a minimal state-machine guard:
 * 'archived' is terminal (cannot transition out via this path).
 */
const TERMINAL_STATUSES: MaterialStatus[] = ['archived'];

export async function transitionStatus(
  materialId: string,
  newStatus: MaterialStatus,
): Promise<void> {
  if (TERMINAL_STATUSES.includes(newStatus)) {
    // Archived is allowed as a target (explicit archival), but the guard below
    // prevents leaving it.
  }

  const db = await getDb();

  if (newStatus === 'archived') {
    await db
      .update(materials)
      .set({ status: newStatus })
      .where(eq(materials.id, materialId))
      .execute();
    return;
  }

  // Non-terminal target: refuse to transition out of a terminal state.
  await db
    .update(materials)
    .set({ status: newStatus })
    .where(
      and(
        eq(materials.id, materialId),
        sql`${materials.status} <> 'archived'`,
      ),
    )
    .execute();
}

export type MaterialReplacementTarget = {
  targetType: MaterialLinkTargetType;
  targetId: string;
  bindingMethod?: BindingMethod;
};

export function nextMaterialIdsForMatrixSelection(
  current: readonly string[],
  action: { add: string } | { remove: string },
): string[] {
  if ('add' in action) return [...new Set([...current, action.add])];
  return current.filter((materialId) => materialId !== action.remove);
}

export type MaterialReplacementLink = MaterialReplacementTarget & { id: string };

export interface MaterialReplacementRepository {
  transaction<T>(work: (tx: MaterialReplacementRepository) => Promise<T>): Promise<T>;
  assertMaterialAccess(materialId: string, actorId: string): Promise<void>;
  lockMaterials(materialIds: readonly string[]): Promise<void>;
  assertTargetAccess(target: MaterialReplacementTarget, actorId: string): Promise<void>;
  addLinks(materialId: string, targets: readonly MaterialReplacementTarget[], actorId: string): Promise<void>;
  removeLinks(materialId: string, targets: readonly MaterialReplacementTarget[]): Promise<void>;
  syncLegacyTargets(materialId: string, targetTypes: readonly MaterialLinkTargetType[]): Promise<void>;
  listLinks(materialId: string): Promise<MaterialReplacementLink[]>;
  updateDerivedStatus(materialId: string, status: 'bound' | 'unassigned'): Promise<void>;
  patchMaterial?(materialId: string, patch: MaterialReplacementPatch): Promise<void>;
}

export interface ComparisonTargetReplacementRepository extends MaterialReplacementRepository {
  lockComparisonCell(cellId: string): Promise<void>;
  listComparisonCellMaterialIds(cellId: string): Promise<string[]>;
}

export type MaterialReplacementPatch = {
  fileName?: string | null;
  comparisonAssemblyId?: string | null;
  mediaDisplayOrder?: number;
  mediaRole?: string | null;
};

export type ReplaceMaterialTargetsInput = {
  materialId: string;
  actorId: string;
  add: MaterialReplacementTarget[];
  remove: MaterialReplacementTarget[];
  patch?: MaterialReplacementPatch;
};

function uniqueReplacementTargets(targets: readonly MaterialReplacementTarget[]) {
  const uniqueTargets = new Map<string, MaterialReplacementTarget>();
  for (const target of targets) {
    if (!isMaterialLinkTargetType(target.targetType) || !target.targetId) {
      throw new Error('invalid_material_replacement_target');
    }
    uniqueTargets.set(`${target.targetType}:${target.targetId}`, target);
  }
  return [...uniqueTargets.values()];
}

/**
 * Transaction boundary shared by API routes and failure-injection tests.
 * Every authorization/existence check happens before the first write; links
 * are inserted before obsolete links are removed so a failed replacement can
 * never temporarily orphan a reusable asset outside the transaction.
 */
async function applyMaterialReplacement(
  input: ReplaceMaterialTargetsInput,
  tx: MaterialReplacementRepository,
): Promise<{ links: MaterialReplacementLink[]; status: 'bound' | 'unassigned' }> {
  const add = uniqueReplacementTargets(input.add);
  const remove = uniqueReplacementTargets(input.remove);
  await tx.assertMaterialAccess(input.materialId, input.actorId);
  const orderedTargets = [...add, ...remove].sort((left, right) =>
    `${left.targetType}:${left.targetId}`.localeCompare(`${right.targetType}:${right.targetId}`));
  for (const target of orderedTargets) await tx.assertTargetAccess(target, input.actorId);
  await tx.addLinks(input.materialId, add, input.actorId);
  await tx.removeLinks(input.materialId, remove);
  await tx.syncLegacyTargets(input.materialId, [...new Set([...add, ...remove].map((target) => target.targetType))]);
  if (input.patch && tx.patchMaterial) await tx.patchMaterial(input.materialId, input.patch);
  const links = await tx.listLinks(input.materialId);
  const status = links.length > 0 ? 'bound' : 'unassigned';
  await tx.updateDerivedStatus(input.materialId, status);
  return { links, status };
}

export async function replaceMaterialTargetsWithRepository(input: ReplaceMaterialTargetsInput, repository: MaterialReplacementRepository) {
  return (await replaceMaterialTargetsBatchWithRepository([input], repository))[0];
}

export async function replaceMaterialTargetsBatchWithRepository(inputs: ReplaceMaterialTargetsInput[], repository: MaterialReplacementRepository) {
  return repository.transaction(async (tx) => {
    const ordered = [...inputs].sort((left, right) => left.materialId.localeCompare(right.materialId));
    await tx.lockMaterials([...new Set(ordered.map((input) => input.materialId))]);
    const results = [];
    for (const input of ordered) results.push(await applyMaterialReplacement(input, tx));
    return results;
  });
}

export async function replaceComparisonCellMaterialSelectionWithRepository(input: {
  cellId: string;
  actorId: string;
  assemblyId: string | null;
  materialIds: string[];
}, repository: ComparisonTargetReplacementRepository) {
  return repository.transaction(async (rawTx) => {
    const tx = rawTx as ComparisonTargetReplacementRepository;
    await tx.lockComparisonCell(input.cellId);
    await tx.assertTargetAccess({ targetType: 'comparison_cell', targetId: input.cellId }, input.actorId);
    const previousIds = await tx.listComparisonCellMaterialIds(input.cellId);
    const nextIds = [...new Set(input.materialIds)];
    const allIds = [...new Set([...previousIds, ...nextIds])].sort((left, right) => left.localeCompare(right));
    await tx.lockMaterials(allIds);
    const nextSet = new Set(nextIds);
    const commands: ReplaceMaterialTargetsInput[] = nextIds.map((materialId, index) => ({
      materialId,
      actorId: input.actorId,
      add: [{ targetType: 'comparison_cell', targetId: input.cellId, bindingMethod: 'click_select' }],
      remove: [],
      patch: {
        comparisonAssemblyId: input.assemblyId,
        mediaDisplayOrder: index,
        mediaRole: roleForIndex(index),
      },
    }));
    for (const materialId of previousIds) {
      if (!nextSet.has(materialId)) commands.push({
        materialId,
        actorId: input.actorId,
        add: [],
        remove: [{ targetType: 'comparison_cell', targetId: input.cellId }],
        patch: { comparisonAssemblyId: null, mediaDisplayOrder: 0, mediaRole: null },
      });
    }
    const byId = [...commands].sort((left, right) => left.materialId.localeCompare(right.materialId));
    const results = [];
    for (const command of byId) results.push(await applyMaterialReplacement(command, tx));
    return results;
  });
}

type Db = Awaited<ReturnType<typeof getDb>>;
type DbTransaction = Parameters<Parameters<Db['transaction']>[0]>[0];

/** Serialize bind/unbind/delete for a polymorphic target without requiring a target FK. */
export async function lockMaterialTargetsForTransaction(
  tx: DbTransaction,
  targets: readonly MaterialReplacementTarget[],
): Promise<void> {
  const keys = [...new Set(targets.map((target) => `${target.targetType}:${target.targetId}`))].sort();
  for (const key of keys) {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`);
  }
}

async function actorIsAdmin(tx: DbTransaction, actorId: string) {
  const rows = await tx.select({ role: platformUsers.role }).from(platformUsers).where(eq(platformUsers.id, actorId)).limit(1).execute();
  return rows[0]?.role === 'admin';
}

async function assertActorOwnsResource(tx: DbTransaction, actorId: string, resource: MaterialLinkTargetResource) {
  if (await actorIsAdmin(tx, actorId)) return;
  if (resource.kind === 'task') {
    const rows = await tx.select({ ownerId: experienceTasks.ownerId, createdBy: experienceTasks.createdBy })
      .from(experienceTasks).where(eq(experienceTasks.id, resource.id)).limit(1).execute();
    if (rows[0] && (rows[0].ownerId === actorId || rows[0].createdBy === actorId)) return;
  } else if (resource.kind === 'assembly') {
    const rows = await tx.select({ createdBy: comparisonAssemblies.createdBy }).from(comparisonAssemblies)
      .where(eq(comparisonAssemblies.id, resource.id)).limit(1).execute();
    if (rows[0]?.createdBy === actorId) return;
  } else {
    const rows = await tx.select({ createdBy: taskMatrices.createdBy, taskId: taskMatrices.taskId }).from(taskMatrices)
      .where(eq(taskMatrices.id, resource.id)).limit(1).execute();
    if (rows[0]?.createdBy === actorId) return;
    if (rows[0]?.taskId) return assertActorOwnsResource(tx, actorId, { kind: 'task', id: rows[0].taskId });
  }
  throw new Error('material_target_forbidden');
}

async function resolveTargetWithTransaction(
  tx: DbTransaction,
  targetType: MaterialLinkTargetType,
  targetId: string,
): Promise<MaterialLinkTargetResource | null> {
  if (targetType === 'record') {
    const rows = await tx.select({ taskId: checkRecords.taskId }).from(checkRecords).where(eq(checkRecords.id, targetId)).limit(1).execute();
    return rows[0]?.taskId ? { kind: 'task', id: rows[0].taskId } : null;
  }
  if (targetType === 'recipe') {
    const rows = await tx.select({ taskId: recipes.taskId }).from(recipes).where(eq(recipes.id, targetId)).limit(1).execute();
    return rows[0]?.taskId ? { kind: 'task', id: rows[0].taskId } : null;
  }
  if (targetType === 'recipe_step') {
    const rows = await tx.select({ taskId: recipes.taskId }).from(recipeSteps).innerJoin(recipes, eq(recipes.id, recipeSteps.recipeId))
      .where(eq(recipeSteps.id, targetId)).limit(1).execute();
    return rows[0]?.taskId ? { kind: 'task', id: rows[0].taskId } : null;
  }
  if (targetType === 'issue') {
    const rows = await tx.select({ taskId: issues.taskId }).from(issues).where(eq(issues.id, targetId)).limit(1).execute();
    return rows[0]?.taskId ? { kind: 'task', id: rows[0].taskId } : null;
  }
  if (targetType === 're_evaluation') {
    const rows = await tx.select({ taskId: issues.taskId }).from(issueReEvaluations).innerJoin(issues, eq(issues.id, issueReEvaluations.issueId))
      .where(eq(issueReEvaluations.id, targetId)).limit(1).execute();
    return rows[0]?.taskId ? { kind: 'task', id: rows[0].taskId } : null;
  }
  if (targetType === 'comparison_cell') {
    const rows = await tx.select({ assemblyId: comparisonMatrixCells.assemblyId }).from(comparisonMatrixCells)
      .where(eq(comparisonMatrixCells.id, targetId)).limit(1).execute();
    return rows[0]?.assemblyId ? { kind: 'assembly', id: rows[0].assemblyId } : null;
  }
  const rows = await tx.select({ matrixId: matrixCellValues.matrixId }).from(matrixCellValues)
    .where(eq(matrixCellValues.id, targetId)).limit(1).execute();
  return rows[0]?.matrixId ? { kind: 'matrix', id: rows[0].matrixId } : null;
}

function legacyColumn(targetType: MaterialLinkTargetType) {
  switch (targetType) {
    case 'record': return materials.recordId;
    case 'recipe': return materials.recipeId;
    case 'recipe_step': return materials.recipeStepId;
    case 'issue': return materials.issueId;
    case 're_evaluation': return materials.reEvaluationId;
    case 'comparison_cell': return materials.comparisonCellId;
    default: return null;
  }
}

function createDatabaseReplacementRepository(tx: DbTransaction): ComparisonTargetReplacementRepository {
  return {
    transaction: async (work) => work(createDatabaseReplacementRepository(tx)),
    async lockComparisonCell(cellId) {
      const rows = await tx.select({ id: comparisonMatrixCells.id }).from(comparisonMatrixCells)
        .where(eq(comparisonMatrixCells.id, cellId)).for('update').execute();
      if (!rows[0]) throw new Error('material_target_not_found');
    },
    async listComparisonCellMaterialIds(cellId) {
      const [legacyRows, linkRows] = await Promise.all([
        tx.select({ id: materials.id }).from(materials).where(eq(materials.comparisonCellId, cellId)).execute(),
        tx.select({ id: materialLinks.materialId }).from(materialLinks)
          .where(and(eq(materialLinks.targetType, 'comparison_cell'), eq(materialLinks.targetId, cellId))).execute(),
      ]);
      return [...new Set([...legacyRows.map((row) => row.id), ...linkRows.map((row) => row.id)])];
    },
    async lockMaterials(materialIds) {
      if (materialIds.length === 0) return;
      await tx.select({ id: materials.id }).from(materials).where(inArray(materials.id, [...materialIds])).orderBy(materials.id).for('update').execute();
    },
    async assertMaterialAccess(materialId, actorId) {
      const rows = await tx.select({ createdBy: materials.createdBy }).from(materials).where(eq(materials.id, materialId)).limit(1).execute();
      if (!rows[0]) throw new Error('material_not_found');
      if (rows[0].createdBy !== actorId && !(await actorIsAdmin(tx, actorId))) throw new Error('material_forbidden');
    },
    async assertTargetAccess(target, actorId) {
      await lockMaterialTargetsForTransaction(tx, [target]);
      const resource = await resolveTargetWithTransaction(tx, target.targetType, target.targetId);
      if (!resource) throw new Error('material_target_not_found');
      await assertActorOwnsResource(tx, actorId, resource);
    },
    async addLinks(materialId, targets, actorId) {
      for (const target of targets) {
        const orderRows = await tx.select({ nextOrder: sql<number>`COALESCE(MAX(${materialLinks.bindingOrder}), 0) + 1` })
          .from(materialLinks).where(and(eq(materialLinks.targetType, target.targetType), eq(materialLinks.targetId, target.targetId))).execute();
        await tx.insert(materialLinks).values({
          materialId, targetType: target.targetType, targetId: target.targetId,
          bindingMethod: target.bindingMethod ?? 'click_select', bindingOrder: orderRows[0]?.nextOrder ?? 1, boundBy: actorId,
        }).onConflictDoUpdate({
          target: [materialLinks.materialId, materialLinks.targetType, materialLinks.targetId],
          set: { bindingMethod: target.bindingMethod ?? 'click_select', boundBy: actorId, boundAt: sql`NOW()`, version: sql`${materialLinks.version} + 1` },
        }).execute();
      }
    },
    async removeLinks(materialId, targets) {
      for (const target of targets) {
        await tx.delete(materialLinks).where(and(eq(materialLinks.materialId, materialId), eq(materialLinks.targetType, target.targetType), eq(materialLinks.targetId, target.targetId))).execute();
      }
    },
    async syncLegacyTargets(materialId, targetTypes) {
      for (const targetType of targetTypes) {
        const column = legacyColumn(targetType);
        if (!column) continue;
        const rows = await tx.select({ targetId: materialLinks.targetId }).from(materialLinks)
          .where(and(eq(materialLinks.materialId, materialId), eq(materialLinks.targetType, targetType)))
          .orderBy(materialLinks.bindingOrder, materialLinks.boundAt, materialLinks.id).limit(1).execute();
        await tx.update(materials).set({ [column.name]: rows[0]?.targetId ?? null }).where(eq(materials.id, materialId)).execute();
      }
    },
    async listLinks(materialId) {
      const rows = await tx.select({ id: materialLinks.id, targetType: materialLinks.targetType, targetId: materialLinks.targetId, bindingMethod: materialLinks.bindingMethod })
        .from(materialLinks).where(eq(materialLinks.materialId, materialId)).orderBy(materialLinks.bindingOrder, materialLinks.boundAt, materialLinks.id).execute();
      return rows.flatMap((row) => isMaterialLinkTargetType(row.targetType) ? [{ ...row, targetType: row.targetType, bindingMethod: row.bindingMethod as BindingMethod }] : []);
    },
    async updateDerivedStatus(materialId, status) {
      await tx.update(materials).set({ status }).where(and(eq(materials.id, materialId), sql`${materials.status} <> 'archived'`)).execute();
    },
    async patchMaterial(materialId, patch) {
      await tx.update(materials).set({
        ...(patch.fileName !== undefined ? { fileName: patch.fileName } : {}),
        ...(patch.comparisonAssemblyId !== undefined ? { comparisonAssemblyId: patch.comparisonAssemblyId } : {}),
        ...(patch.mediaDisplayOrder !== undefined ? { mediaDisplayOrder: patch.mediaDisplayOrder } : {}),
        ...(patch.mediaRole !== undefined ? { mediaRole: patch.mediaRole } : {}),
      }).where(eq(materials.id, materialId)).execute();
    },
  };
}

export async function replaceMaterialTargets(input: ReplaceMaterialTargetsInput) {
  return (await replaceMaterialTargetsBatch([input]))[0];
}

export async function replaceMaterialTargetsBatch(inputs: ReplaceMaterialTargetsInput[]) {
  const db = await getDb();
  return db.transaction(async (tx) => {
    const repository = createDatabaseReplacementRepository(tx);
    const ordered = [...inputs].sort((left, right) => left.materialId.localeCompare(right.materialId));
    await repository.lockMaterials([...new Set(ordered.map((input) => input.materialId))]);
    const results = [];
    for (const input of ordered) results.push(await applyMaterialReplacement(input, repository));
    return results;
  });
}

export async function replaceComparisonCellMaterialSelection(input: {
  cellId: string;
  actorId: string;
  assemblyId: string | null;
  materialIds: string[];
}) {
  const db = await getDb();
  return db.transaction(async (tx) => replaceComparisonCellMaterialSelectionWithRepository(
    input,
    createDatabaseReplacementRepository(tx),
  ));
}

export async function replaceMatrixCellMaterialSelection(input: {
  matrixId: string; leafRowId: string; columnId: string; actorId: string; materialIds: string[];
}) {
  const db = await getDb();
  return db.transaction(async (tx) => {
    await assertActorOwnsResource(tx, input.actorId, { kind: 'matrix', id: input.matrixId });
    const [rows, columns] = await Promise.all([
      tx.select({ id: matrixLeafRows.id }).from(matrixLeafRows).where(and(eq(matrixLeafRows.id, input.leafRowId), eq(matrixLeafRows.matrixId, input.matrixId))).limit(1).execute(),
      tx.select({ id: matrixColumnDefinitions.id, dataType: matrixColumnDefinitions.dataType, maxMediaCount: matrixColumnDefinitions.maxMediaCount })
        .from(matrixColumnDefinitions).where(and(eq(matrixColumnDefinitions.id, input.columnId), eq(matrixColumnDefinitions.matrixId, input.matrixId))).limit(1).execute(),
    ]);
    if (!rows[0] || !columns[0]) throw new Error('matrix_cell_target_not_found');
    if (!['image_slot', 'media_slot'].includes(columns[0].dataType)) throw new Error('matrix_column_not_media');
    const materialIds = [...new Set(input.materialIds)];
    if (materialIds.length > (columns[0].maxMediaCount ?? 10)) throw new Error('matrix_media_limit_exceeded');
    const inserted = await tx.insert(matrixCellValues).values({
      matrixId: input.matrixId, leafRowId: input.leafRowId, columnId: input.columnId,
      valueState: 'empty', version: 1, updatedBy: input.actorId,
    }).onConflictDoUpdate({
      target: [matrixCellValues.matrixId, matrixCellValues.leafRowId, matrixCellValues.columnId],
      set: { updatedAt: sql`NOW()` },
    }).returning({ id: matrixCellValues.id }).execute();
    const cellId = inserted[0]?.id;
    if (!cellId) throw new Error('matrix_cell_target_not_found');
    const existing = await tx.select({ materialId: materialLinks.materialId }).from(materialLinks)
      .where(and(eq(materialLinks.targetType, 'dynamic_matrix_cell_value'), eq(materialLinks.targetId, cellId))).execute();
    const current = new Set(existing.map((row) => row.materialId));
    const next = new Set(materialIds);
    const commands: ReplaceMaterialTargetsInput[] = [
      ...materialIds.filter((id) => !current.has(id)).map((materialId) => ({ materialId, actorId: input.actorId, add: [{ targetType: 'dynamic_matrix_cell_value' as const, targetId: cellId }], remove: [] })),
      ...[...current].filter((id) => !next.has(id)).map((materialId) => ({ materialId, actorId: input.actorId, add: [], remove: [{ targetType: 'dynamic_matrix_cell_value' as const, targetId: cellId }] })),
    ];
    const repository = createDatabaseReplacementRepository(tx);
    await repository.lockMaterials([...new Set(commands.map((command) => command.materialId))].sort());
    const results = [];
    for (const command of commands) results.push(await applyMaterialReplacement(command, repository));
    return { cellId, results };
  });
}
