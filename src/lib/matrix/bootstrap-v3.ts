/**
 * Bootstrap a blank Excel-like V3 matrix view for a task_matrix.
 *
 * PRD V3.1.2.4 §6.2 / §7 / §13.2:
 *   - Creates matrix_view_definitions (confirmed)
 *   - Seeds default A/B / E / O / P / Q structural columns (no business field presets)
 *   - Points task_matrices.current_view_definition_id at the new view
 *   - Sets status to `active` so the user can enter data immediately
 *
 * Default columns are structural zones only — labels are generic and editable.
 * Example business names like「出汁率」are NEVER seeded (S-01).
 */
import { getDb } from '@/storage/database/pg-db';
import { sql } from 'drizzle-orm';
import {
  matrixViewDefinitions,
  matrixColumnDefinitions,
  matrixHierarchyNodes,
  matrixLeafRows,
} from '@/storage/database/shared/schema';

type DefaultColumn = {
  columnZone: string;
  zoneRole: string;
  columnLabel: string;
  dataType: string;
  displayOrder: number;
  desktopWidthPx: number;
  isPinned: boolean;
  maxMediaCount?: number;
};

/** Structural skeleton matching PRD §7 zones — labels are editable placeholders. */
const DEFAULT_COLUMNS: DefaultColumn[] = [
  { columnZone: 'hierarchy', zoneRole: 'A', columnLabel: '一级大类', dataType: 'text', displayOrder: 10, desktopWidthPx: 120, isPinned: true },
  { columnZone: 'hierarchy', zoneRole: 'B', columnLabel: '二级细项', dataType: 'text', displayOrder: 20, desktopWidthPx: 220, isPinned: false },
  { columnZone: 'comparison_category', zoneRole: 'E', columnLabel: '一级对比类目', dataType: 'text', displayOrder: 50, desktopWidthPx: 140, isPinned: true },
  { columnZone: 'effect_media', zoneRole: 'O', columnLabel: '效果素材', dataType: 'media_slot', displayOrder: 200, desktopWidthPx: 120, isPinned: false, maxMediaCount: 12 },
  { columnZone: 'evaluation', zoneRole: 'P', columnLabel: '效果评价', dataType: 'long_text', displayOrder: 210, desktopWidthPx: 180, isPinned: false },
  { columnZone: 'issue_point', zoneRole: 'Q', columnLabel: '问题点', dataType: 'issue_point', displayOrder: 220, desktopWidthPx: 160, isPinned: false },
];

export async function bootstrapV3MatrixView(opts: {
  matrixId: string;
  userId: string;
}): Promise<{ viewDefinitionId: string }> {
  const db = await getDb();
  const { matrixId, userId } = opts;

  const [view] = await db
    .insert(matrixViewDefinitions)
    .values({
      matrixId,
      versionNo: 1,
      maxHierarchyLevel: 2,
      leftFrozenColumnCount: 0,
      formulaMode: 'relative_cell_reference',
      styleMode: 'basic_text_style',
      status: 'confirmed',
      confirmedBy: userId,
      confirmedAt: sql`NOW()`,
    })
    .returning({ id: matrixViewDefinitions.id })
    .execute();

  await db
    .insert(matrixColumnDefinitions)
    .values(
      DEFAULT_COLUMNS.map((col) => ({
        matrixId,
        columnZone: col.columnZone,
        zoneRole: col.zoneRole,
        columnLabel: col.columnLabel,
        dataType: col.dataType,
        displayOrder: col.displayOrder,
        desktopWidthPx: col.desktopWidthPx,
        isPinned: col.isPinned,
        isRequired: false,
        showInReport: true,
        maxMediaCount: col.maxMediaCount ?? null,
        createdBy: userId,
      })),
    )
    .execute();

  const [level1] = await db
    .insert(matrixHierarchyNodes)
    .values({
      matrixId,
      parentId: null,
      level: 1,
      nodeLabel: '默认大类',
      nodeType: 'level_1',
      sortOrder: 1,
      createdBy: userId,
    })
    .returning()
    .execute();
  const [level2] = await db
    .insert(matrixHierarchyNodes)
    .values({
      matrixId,
      parentId: level1.id,
      level: 2,
      nodeLabel: '默认细项',
      nodeType: 'level_2',
      sortOrder: 1,
      createdBy: userId,
    })
    .returning()
    .execute();
  await db.insert(matrixLeafRows).values({
    matrixId,
    level1NodeId: level1.id,
    level2NodeId: level2.id,
    level3NodeId: null,
    visibleRowIndex: 1,
    groupRowIndex: 1,
    status: 'active',
  }).execute();

  // current_view_definition_id is added by migration 0004 and may not be on
  // the Drizzle taskMatrices table definition — update via raw SQL.
  await db.execute(sql`
    UPDATE task_matrices
    SET current_view_definition_id = ${view.id},
        status = 'active',
        updated_at = NOW()
    WHERE id = ${matrixId}
  `);

  return { viewDefinitionId: view.id };
}

/** True when the matrix already has a V3 view definition attached. */
export async function hasV3ViewDefinition(matrixId: string): Promise<boolean> {
  const db = await getDb();
  const result = await db.execute(
    sql`SELECT current_view_definition_id FROM task_matrices WHERE id = ${matrixId} LIMIT 1`,
  );
  if (result.rows.length === 0) return false;
  const id = (result.rows[0] as Record<string, unknown>).current_view_definition_id;
  return typeof id === 'string' && id.length > 0;
}

/**
 * Ensure an existing matrix has a V3 view. Used when opening a legacy V2
 * matrix under the excel-like flag — migrates structure in place without
 * copying cell data (Wave 6 handles full V2→V3 data migration).
 */
export async function ensureV3ViewForMatrix(opts: {
  matrixId: string;
  userId: string;
}): Promise<{ viewDefinitionId: string; created: boolean }> {
  if (await hasV3ViewDefinition(opts.matrixId)) {
    const db = await getDb();
    const result = await db.execute(
      sql`SELECT current_view_definition_id FROM task_matrices WHERE id = ${opts.matrixId} LIMIT 1`,
    );
    const id = String((result.rows[0] as Record<string, unknown>).current_view_definition_id);
    return { viewDefinitionId: id, created: false };
  }
  const { viewDefinitionId } = await bootstrapV3MatrixView(opts);
  return { viewDefinitionId, created: true };
}
