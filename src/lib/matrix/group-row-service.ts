/**
 * Group & Row service — CRUD for matrix groups, rows, and narratives.
 * PRD V3.1 §3.3, §5.5, §7.3.
 */

import { eq, and, asc } from 'drizzle-orm';
import { getDb } from '@/storage/database/pg-db';
import {
  matrixGroups,
  matrixRows,
  matrixNarratives,
} from '@/storage/database/shared/schema';
import type { MatrixGroup, MatrixRow, MatrixNarrative, CompletionStatus } from './task-matrix-types';

// ---------------------------------------------------------------------------
// Groups
// ---------------------------------------------------------------------------

export async function getGroupsByMatrix(matrixId: string): Promise<MatrixGroup[]> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(matrixGroups)
    .where(and(
      eq(matrixGroups.matrixId, matrixId),
      eq(matrixGroups.isArchived, false),
    ))
    .orderBy(asc(matrixGroups.sortOrder));
  return rows as unknown as MatrixGroup[];
}

export async function getGroupById(groupId: string): Promise<MatrixGroup | null> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(matrixGroups)
    .where(eq(matrixGroups.id, groupId))
    .limit(1);
  return (rows[0] as unknown as MatrixGroup) ?? null;
}

export async function createGroup(
  matrixId: string,
  groupLabel: string,
  description?: string,
): Promise<MatrixGroup> {
  const db = await getDb();

  // Check for duplicate label within matrix
  const existing = await db
    .select({ id: matrixGroups.id })
    .from(matrixGroups)
    .where(and(eq(matrixGroups.matrixId, matrixId), eq(matrixGroups.groupLabel, groupLabel)))
    .limit(1);

  if (existing.length > 0) {
    throw Object.assign(new Error('ROW_001'), { code: 'ROW_001' });
  }

  const maxSort = await getMaxGroupSortOrder(matrixId);

  const [row] = await db
    .insert(matrixGroups)
    .values({
      matrixId,
      groupLabel,
      description: description ?? null,
      sortOrder: maxSort + 1,
    })
    .returning();

  return row as unknown as MatrixGroup;
}

export async function updateGroup(
  groupId: string,
  updates: { groupLabel?: string; description?: string; sortOrder?: number },
): Promise<MatrixGroup> {
  const db = await getDb();
  const [row] = await db
    .update(matrixGroups)
    .set({ ...updates, updatedAt: new Date().toISOString() })
    .where(eq(matrixGroups.id, groupId))
    .returning();
  return row as unknown as MatrixGroup;
}

export async function archiveGroup(groupId: string): Promise<void> {
  const db = await getDb();
  await db
    .update(matrixGroups)
    .set({ isArchived: true, updatedAt: new Date().toISOString() })
    .where(eq(matrixGroups.id, groupId));
}

async function getMaxGroupSortOrder(matrixId: string): Promise<number> {
  const db = await getDb();
  const rows = await db
    .select({ sortOrder: matrixGroups.sortOrder })
    .from(matrixGroups)
    .where(eq(matrixGroups.matrixId, matrixId))
    .orderBy(asc(matrixGroups.sortOrder));
  if (rows.length === 0) return -1;
  return (rows[rows.length - 1] as unknown as { sortOrder: number }).sortOrder;
}

// ---------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------

export async function getRowsByGroup(groupId: string): Promise<MatrixRow[]> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(matrixRows)
    .where(and(
      eq(matrixRows.groupId, groupId),
      eq(matrixRows.isArchived, false),
    ))
    .orderBy(asc(matrixRows.sortOrder));
  return rows as unknown as MatrixRow[];
}

export async function getRowsByMatrix(matrixId: string): Promise<MatrixRow[]> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(matrixRows)
    .where(and(
      eq(matrixRows.matrixId, matrixId),
      eq(matrixRows.isArchived, false),
    ))
    .orderBy(asc(matrixRows.sortOrder));
  return rows as unknown as MatrixRow[];
}

export async function getRowById(rowId: string): Promise<MatrixRow | null> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(matrixRows)
    .where(eq(matrixRows.id, rowId))
    .limit(1);
  return (rows[0] as unknown as MatrixRow) ?? null;
}

export async function createRow(
  groupId: string,
  matrixId: string,
  rowLabel: string,
  description?: string,
): Promise<MatrixRow> {
  const db = await getDb();

  // Check for duplicate label within group
  const existing = await db
    .select({ id: matrixRows.id })
    .from(matrixRows)
    .where(and(eq(matrixRows.groupId, groupId), eq(matrixRows.rowLabel, rowLabel)))
    .limit(1);

  if (existing.length > 0) {
    throw Object.assign(new Error('ROW_001'), { code: 'ROW_001' });
  }

  const maxSort = await getMaxRowSortOrder(groupId);

  const [row] = await db
    .insert(matrixRows)
    .values({
      groupId,
      matrixId,
      rowLabel,
      description: description ?? null,
      sortOrder: maxSort + 1,
      completionStatus: 'pending',
    })
    .returning();

  return row as unknown as MatrixRow;
}

export async function updateRow(
  rowId: string,
  updates: {
    rowLabel?: string;
    description?: string;
    sortOrder?: number;
    completionStatus?: CompletionStatus;
    testInvalidReason?: string;
    expectedVersion?: number;
  },
): Promise<MatrixRow> {
  const db = await getDb();

  const whereClause = updates.expectedVersion != null
    ? and(eq(matrixRows.id, rowId), eq(matrixRows.version, updates.expectedVersion))
    : eq(matrixRows.id, rowId);

  const [row] = await db
    .update(matrixRows)
    .set({
      rowLabel: updates.rowLabel,
      description: updates.description,
      sortOrder: updates.sortOrder,
      completionStatus: updates.completionStatus,
      testInvalidReason: updates.testInvalidReason,
      updatedAt: new Date().toISOString(),
      version: sql`${matrixRows.version} + 1`,
    } as any)
    .where(whereClause)
    .returning();

  if (!row) {
    throw Object.assign(new Error('SAVE_409'), { code: 'SAVE_409' });
  }

  return row as unknown as MatrixRow;
}

export async function archiveRow(rowId: string): Promise<void> {
  const db = await getDb();
  await db
    .update(matrixRows)
    .set({ isArchived: true, updatedAt: new Date().toISOString() })
    .where(eq(matrixRows.id, rowId));
}

async function getMaxRowSortOrder(groupId: string): Promise<number> {
  const db = await getDb();
  const rows = await db
    .select({ sortOrder: matrixRows.sortOrder })
    .from(matrixRows)
    .where(eq(matrixRows.groupId, groupId))
    .orderBy(asc(matrixRows.sortOrder));
  if (rows.length === 0) return -1;
  return (rows[rows.length - 1] as unknown as { sortOrder: number }).sortOrder;
}

// Need sql for version increment
import { sql } from 'drizzle-orm';

// ---------------------------------------------------------------------------
// Narratives (PRD §3.3)
// ---------------------------------------------------------------------------

export async function getNarratives(
  scope: 'matrix' | 'group',
  scopeId: string,
): Promise<MatrixNarrative[]> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(matrixNarratives)
    .where(
      scope === 'matrix'
        ? eq(matrixNarratives.matrixId!, scopeId)
        : eq(matrixNarratives.groupId!, scopeId),
    );
  return rows as unknown as MatrixNarrative[];
}

export async function upsertNarrative(
  scope: 'matrix' | 'group',
  scopeId: string,
  matrixId: string | null,
  narrativeKey: string,
  content: string,
): Promise<MatrixNarrative> {
  const db = await getDb();

  const existing = scope === 'matrix'
    ? await db.select().from(matrixNarratives).where(
        and(eq(matrixNarratives.matrixId!, scopeId), eq(matrixNarratives.narrativeKey, narrativeKey)),
      ).limit(1)
    : await db.select().from(matrixNarratives).where(
        and(eq(matrixNarratives.groupId!, scopeId), eq(matrixNarratives.narrativeKey, narrativeKey)),
      ).limit(1);

  if (existing.length > 0) {
    const [updated] = await db
      .update(matrixNarratives)
      .set({ content, updatedAt: new Date().toISOString() })
      .where(eq(matrixNarratives.id, (existing[0] as unknown as MatrixNarrative).id))
      .returning();
    return updated as unknown as MatrixNarrative;
  }

  const [row] = await db
    .insert(matrixNarratives)
    .values({
      scope,
      matrixId: scope === 'matrix' ? scopeId : matrixId,
      groupId: scope === 'group' ? scopeId : null,
      narrativeKey,
      content,
    })
    .returning();

  return row as unknown as MatrixNarrative;
}