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
import { materials, materialLinks } from '@/storage/database/shared/schema';
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

export interface MaterialAsset {
  id: string;
  materialType: string;
  fileName: string | null;
  fileUrl: string | null;
  thumbnailUrl: string | null;
  status: string;
  projectId: string | null;
  createdAt: string;
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
export async function getUnassignedMaterials(_userId: string): Promise<MaterialAsset[]> {
  void _userId; // reserved for future per-user scoping; unassigned is a shared pool
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
    })
    .from(materials)
    .where(and(eq(materials.status, 'unassigned'), isNull(materials.projectId)))
    .orderBy(sql`${materials.createdAt} DESC`);

  return rows.map(toMaterialAsset);
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
  targetType: string;
  targetId: string;
  bindingMethod: BindingMethod;
  boundBy: string;
}): Promise<{ linkId: string }> {
  const db = await getDb();

  const orderRows = await db
    .select({ nextOrder: sql<number>`COALESCE(MAX(${materialLinks.bindingOrder}), 0) + 1` })
    .from(materialLinks)
    .where(and(
      eq(materialLinks.targetType, input.targetType),
      eq(materialLinks.targetId, input.targetId),
    ))
    .execute();
  const bindingOrder = orderRows[0]?.nextOrder ?? 1;

  // Insert the link; on conflict (same material+target), do nothing and return
  // the existing row id. Returning the id in both branches keeps the contract
  // uniform for callers.
  const inserted = await db
    .insert(materialLinks)
    .values({
      materialId: input.materialId,
      targetType: input.targetType,
      targetId: input.targetId,
      bindingMethod: input.bindingMethod,
      bindingOrder,
      boundBy: input.boundBy,
    })
    .onConflictDoUpdate({
      target: [materialLinks.materialId, materialLinks.targetType, materialLinks.targetId],
      set: {
        bindingMethod: input.bindingMethod,
        boundBy: input.boundBy,
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
  await db
    .update(materials)
    .set({ status: 'bound' })
    .where(eq(materials.id, input.materialId))
    .execute();

  return { linkId };
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
