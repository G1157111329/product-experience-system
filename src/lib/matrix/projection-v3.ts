/**
 * Read projection for the V3 dynamic data matrix model (PRD V3.1.2.4 §8).
 *
 * Produces V3MatrixProjection: a nested hierarchy tree + ordered columns +
 * flat leaf rows + keyed cells/styles + narratives + issue points + formulas.
 *
 * Queries all V3 tables in parallel, then assembles the projection in memory.
 * Hierarchy nesting: flat matrix_hierarchy_nodes → tree by parent_id.
 */

import { eq, asc, and, isNull, sql, inArray } from 'drizzle-orm';
import { getDb } from '@/storage/database/pg-db';
import {
  taskMatrices,
  matrixViewDefinitions,
  matrixHierarchyNodes,
  matrixLeafRows,
  matrixColumnDefinitions,
  matrixCellValues,
  matrixCellStyles,
  matrixNarrativeBlocks,
  matrixIssuePoints,
  matrixFormulaDefinitionsV3,
  materialLinks,
  materials,
} from '@/storage/database/shared/schema';
import type {
  V3MatrixProjection,
  V3HierarchyNode,
  V3Column,
  V3LeafRow,
  V3CellValue,
  V3CellStyle,
  V3NarrativeBlock,
  V3IssuePoint,
  V3FormulaDefinition,
  V3ViewDefinition,
  V3MatrixSummary,
  V3CellMedia,
} from './v3-types';
import { cellKey, styleKey } from './v3-types';
import { generatePresignedUrl } from '@/lib/server/storage';
import { orderRowsByHierarchy } from './hierarchy-row-order';

// ---------------------------------------------------------------------------
// Hierarchy tree assembly
// ---------------------------------------------------------------------------

interface RawHierarchyRow {
  id: string;
  matrixId: string;
  parentId: string | null;
  level: number;
  nodeLabel: string;
  nodeType: string;
  sortOrder: number;
  rowspanCache: number | null;
  archivedAt: string | null;
}

/**
 * Build a nested hierarchy tree from flat rows.
 * Only non-archived nodes are included. Children sorted by sortOrder.
 */
function buildHierarchyTree(
  rows: RawHierarchyRow[],
  leafRowCounts: Map<string, number>,
): V3HierarchyNode[] {
  const byId = new Map<string, V3HierarchyNode>();
  const active = rows.filter((r) => r.archivedAt === null);

  // First pass: create node objects.
  for (const r of active) {
    byId.set(r.id, {
      id: r.id,
      matrixId: r.matrixId,
      parentId: r.parentId,
      level: r.level as 1 | 2 | 3,
      nodeLabel: r.nodeLabel,
      nodeType: r.nodeType as V3HierarchyNode['nodeType'],
      sortOrder: r.sortOrder,
      rowspanCache: r.rowspanCache,
      archivedAt: r.archivedAt,
      children: [],
      leafRowCount: leafRowCounts.get(r.id) ?? 0,
    });
  }

  // Second pass: nest by parent.
  const roots: V3HierarchyNode[] = [];
  for (const node of byId.values()) {
    if (node.parentId && byId.has(node.parentId)) {
      byId.get(node.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  // Sort each level by sortOrder.
  const sortRecursive = (nodes: V3HierarchyNode[]) => {
    nodes.sort((a, b) => a.sortOrder - b.sortOrder);
    for (const n of nodes) sortRecursive(n.children);
  };
  sortRecursive(roots);

  return roots;
}

// ---------------------------------------------------------------------------
// Full read projection
// ---------------------------------------------------------------------------

export async function getV3MatrixProjection(
  matrixId: string,
): Promise<V3MatrixProjection | null> {
  const db = await getDb();

  // Matrix record. current_view_definition_id was added via ALTER TABLE (not
  // declared in the Drizzle taskMatrices table), so read it via raw SQL.
  const matrixRows = await db
    .select({
      id: taskMatrices.id,
      name: taskMatrices.name,
      status: taskMatrices.status,
    })
    .from(taskMatrices)
    .where(eq(taskMatrices.id, matrixId))
    .limit(1);

  if (matrixRows.length === 0) return null;
  const matrixRow = matrixRows[0];

  // Fetch the view definition id via raw SQL (column added post-Drizzle).
  const vdIdRows = await db.execute(
    sql`SELECT current_view_definition_id FROM task_matrices WHERE id = ${matrixId}`,
  );
  const currentViewDefinitionId =
    vdIdRows.rows.length > 0
      ? ((vdIdRows.rows[0] as Record<string, unknown>).current_view_definition_id as string) ?? null
      : null;
  const matrix = { ...matrixRow, currentViewDefinitionId };

  // View definition.
  let viewDefinition: V3ViewDefinition | null = null;
  if (matrix.currentViewDefinitionId) {
    const vdRows = await db
      .select()
      .from(matrixViewDefinitions)
      .where(eq(matrixViewDefinitions.id, matrix.currentViewDefinitionId))
      .limit(1);
    if (vdRows.length > 0) {
      const vd = vdRows[0];
      viewDefinition = {
        id: vd.id,
        matrixId: vd.matrixId,
        versionNo: vd.versionNo,
        maxHierarchyLevel: vd.maxHierarchyLevel,
        leftFrozenColumnCount: vd.leftFrozenColumnCount,
        formulaMode: vd.formulaMode,
        styleMode: vd.styleMode,
        status: vd.status,
        designHash: vd.designHash,
      };
    }
  }

  // Parallel-fetch all V3 data for this matrix.
  const [hierarchyRows, leafRowsRaw, columnsRaw, cellsRaw, stylesRaw, narrativesRaw, issuePointsRaw, formulasRaw] =
    await Promise.all([
      db.select().from(matrixHierarchyNodes).where(eq(matrixHierarchyNodes.matrixId, matrixId)).execute(),
      db.select().from(matrixLeafRows).where(eq(matrixLeafRows.matrixId, matrixId)).execute(),
      db.select().from(matrixColumnDefinitions).where(eq(matrixColumnDefinitions.matrixId, matrixId)).execute(),
      db.select().from(matrixCellValues).where(eq(matrixCellValues.matrixId, matrixId)).execute(),
      db.select().from(matrixCellStyles).where(eq(matrixCellStyles.matrixId, matrixId)).execute(),
      db.select().from(matrixNarrativeBlocks).where(eq(matrixNarrativeBlocks.matrixId, matrixId)).execute(),
      db.select().from(matrixIssuePoints).where(eq(matrixIssuePoints.matrixId, matrixId)).execute(),
      db.select().from(matrixFormulaDefinitionsV3).where(eq(matrixFormulaDefinitionsV3.matrixId, matrixId)).execute(),
    ]);

  // Leaf rows: active only.  Creation order is not display order once a later
  // level-3 child is inserted under an earlier level-2 node.
  const rowCandidates: V3LeafRow[] = leafRowsRaw
    .filter((r) => r.status === 'active')
    .map((r) => ({
      id: r.id,
      matrixId: r.matrixId,
      level1NodeId: r.level1NodeId,
      level2NodeId: r.level2NodeId,
      level3NodeId: r.level3NodeId,
      visibleRowIndex: r.visibleRowIndex,
      groupRowIndex: r.groupRowIndex,
      status: r.status as 'active' | 'archived',
      archivedAt: r.archivedAt,
    }));
  const hierarchySortOrderById = new Map(hierarchyRows.map((node) => [node.id, node.sortOrder]));
  const rows = orderRowsByHierarchy(rowCandidates, hierarchySortOrderById);

  // Leaf-row count per hierarchy node (for rowspan + merged-header rendering).
  const leafRowCounts = new Map<string, number>();
  for (const r of rows) {
    leafRowCounts.set(r.level1NodeId, (leafRowCounts.get(r.level1NodeId) ?? 0) + 1);
    if (r.level2NodeId) leafRowCounts.set(r.level2NodeId, (leafRowCounts.get(r.level2NodeId) ?? 0) + 1);
    if (r.level3NodeId) leafRowCounts.set(r.level3NodeId, (leafRowCounts.get(r.level3NodeId) ?? 0) + 1);
  }

  // Hierarchy tree.
  const hierarchyRaw: RawHierarchyRow[] = hierarchyRows.map((r) => ({
    id: r.id,
    matrixId: r.matrixId,
    parentId: r.parentId,
    level: r.level,
    nodeLabel: r.nodeLabel,
    nodeType: r.nodeType,
    sortOrder: r.sortOrder,
    rowspanCache: r.rowspanCache,
    archivedAt: r.archivedAt,
  }));
  const hierarchy = buildHierarchyTree(hierarchyRaw, leafRowCounts);

  // Columns: active only (archivedAt null), ordered by display_order.
  const columns: V3Column[] = columnsRaw
    .filter((c) => c.archivedAt === null)
    .map((c) => ({
      id: c.id,
      matrixId: c.matrixId,
      columnZone: c.columnZone as V3Column['columnZone'],
      zoneRole: c.zoneRole,
      columnLabel: c.columnLabel,
      dataType: c.dataType as V3Column['dataType'],
      unitText: c.unitText,
      displayOrder: c.displayOrder,
      desktopWidthPx: c.desktopWidthPx,
      minWidthPx: c.minWidthPx,
      maxWidthPx: c.maxWidthPx,
      isPinned: c.isPinned,
      isRequired: c.isRequired,
      showInReport: c.showInReport,
      maxMediaCount: c.maxMediaCount,
      resultFormat: c.resultFormat,
      decimalPlaces: c.decimalPlaces,
      archivedAt: c.archivedAt,
    }))
    .sort((a, b) => a.displayOrder - b.displayOrder);

  // Cells keyed by `${leafRowId}:${columnId}`.
  const cells: Record<string, V3CellValue> = {};
  for (const c of cellsRaw) {
    cells[cellKey(c.leafRowId, c.columnId)] = {
      id: c.id,
      leafRowId: c.leafRowId,
      columnId: c.columnId,
      valueText: c.valueText,
      valueNumber: c.valueNumber,
      valueDurationSeconds: c.valueDurationSeconds,
      valuePercentage: c.valuePercentage,
      displayText: c.displayText,
      valueState: c.valueState as V3CellValue['valueState'],
      errorCode: c.errorCode,
      version: c.version,
    };
  }

  // Styles keyed by `${targetType}:${targetId}`.
  const styles: Record<string, V3CellStyle> = {};
  for (const s of stylesRaw) {
    styles[styleKey(s.targetType as V3CellStyle['targetType'], s.targetId)] = {
      id: s.id,
      matrixId: s.matrixId,
      targetType: s.targetType as V3CellStyle['targetType'],
      targetId: s.targetId,
      fontColorToken: s.fontColorToken,
      fontSizeToken: s.fontSizeToken as V3CellStyle['fontSizeToken'],
      bold: s.bold,
      italic: s.italic,
    };
  }

  // Narratives.
  const narratives: V3NarrativeBlock[] = narrativesRaw.map((n) => ({
    id: n.id,
    matrixId: n.matrixId,
    blockType: n.blockType as V3NarrativeBlock['blockType'],
    scope: n.scope as V3NarrativeBlock['scope'],
    scopeNodeId: n.scopeNodeId,
    content: n.content,
    aiSuggestionId: n.aiSuggestionId,
    showInReport: n.showInReport,
    sortOrder: n.sortOrder,
  }));

  // Issue points.
  const issuePoints: V3IssuePoint[] = issuePointsRaw.map((i) => ({
    id: i.id,
    matrixId: i.matrixId,
    leafRowId: i.leafRowId,
    columnId: i.columnId,
    issueText: i.issueText,
    linkedIssueId: i.linkedIssueId,
    status: i.status as V3IssuePoint['status'],
  }));

  // Formulas (display metadata only; AST evaluation is Wave 3).
  const formulas: V3FormulaDefinition[] = formulasRaw.map((f) => ({
    id: f.id,
    matrixId: f.matrixId,
    columnId: f.columnId,
    expressionDisplay: f.expressionDisplay,
    referenceMode: f.referenceMode,
    applyScope: f.applyScope as V3FormulaDefinition['applyScope'],
    resultFormat: f.resultFormat,
    decimalPlaces: f.decimalPlaces,
    status: f.status as V3FormulaDefinition['status'],
  }));

  // Cell media via material_links (target = matrix_cell_values.id).
  const cellMedia: Record<string, V3CellMedia[]> = {};
  const cellIds = cellsRaw.map((c) => c.id);
  if (cellIds.length > 0) {
    const mediaRows = await db
      .select({
        linkId: materialLinks.id,
        targetId: materialLinks.targetId,
        bindingMethod: materialLinks.bindingMethod,
        bindingOrder: materialLinks.bindingOrder,
        boundAt: materialLinks.boundAt,
        materialId: materials.id,
        materialType: materials.materialType,
        fileName: materials.fileName,
        fileUrl: materials.fileUrl,
        filePath: materials.filePath,
        thumbnailUrl: materials.thumbnailUrl,
      })
      .from(materialLinks)
      .innerJoin(materials, eq(materials.id, materialLinks.materialId))
      .where(
        and(
          eq(materialLinks.targetType, 'dynamic_matrix_cell_value'),
          inArray(materialLinks.targetId, cellIds),
        ),
      )
      .orderBy(asc(materialLinks.bindingOrder), asc(materialLinks.boundAt), asc(materialLinks.id))
      .execute();

    const cellIdToKey = new Map<string, string>();
    for (const c of cellsRaw) {
      cellIdToKey.set(c.id, cellKey(c.leafRowId, c.columnId));
    }

    for (const m of mediaRows) {
      const key = cellIdToKey.get(m.targetId);
      if (!key) continue;
      const rawPath = m.filePath || m.fileUrl || '';
      let fileUrl = m.fileUrl;
      try {
        if (rawPath && !rawPath.startsWith('http') && !rawPath.startsWith('data:')) {
          fileUrl = await generatePresignedUrl({
            key: rawPath,
            expireTime: 30 * 60,
            absoluteUrl: true,
          });
        }
      } catch {
        // keep original fileUrl on presign failure
      }
      const item: V3CellMedia = {
        linkId: m.linkId,
        materialId: m.materialId,
        materialType: m.materialType,
        fileName: m.fileName,
        fileUrl,
        thumbnailUrl: m.thumbnailUrl,
        bindingMethod: m.bindingMethod,
        boundAt: m.boundAt,
      };
      if (!cellMedia[key]) cellMedia[key] = [];
      cellMedia[key].push(item);
    }
  }

  // Summary stats.
  const filledCells = Object.values(cells).filter(
    (c) => c.valueState === 'filled',
  ).length;
  const summary: V3MatrixSummary = {
    totalLeafRows: leafRowsRaw.length,
    activeLeafRows: rows.length,
    totalColumns: columns.length,
    totalCells: Object.keys(cells).length,
    filledCells,
    totalIssues: issuePoints.length,
    hasSummary: narratives.some((n) => n.blockType === 'summary' && n.content),
    hasNotes: narratives.some((n) => n.blockType !== 'summary' && n.content),
  };

  return {
    matrix,
    viewDefinition,
    hierarchy,
    columns,
    rows,
    cells,
    styles,
    narratives,
    issuePoints,
    formulas,
    cellMedia,
    summary,
  };
}

// Re-export helpers for callers that build UI maps.
export { cellKey, styleKey };
// Suppress unused-import warnings (kept for future scoped queries).
void and;
void isNull;
void asc;
