/**
 * POST /api/v1/matrices/{id}/hierarchy-nodes
 * PRD V3.1.2.4 §7.3-7.5 / §13.3-13.4 — Create a hierarchy node.
 *
 * Body: { level: 1|2, parentId?: string, nodeLabel: string }
 *
 * Auto-creation rules (PRD §7.3.2, §7.4.3):
 *   - level_1: also creates a default level_2 node + a leaf_row so the user can
 *     immediately input data.
 *   - level_2 creates a leaf_row below a level_1 parent.
 *
 * visible_row_index is computed as max(existing)+1 within the matrix.
 */
import { NextRequest } from 'next/server';
import { getDb } from '@/storage/database/pg-db';
import { and, eq, inArray, sql } from 'drizzle-orm';
import {
  materialLinks,
  matrixCellValues,
  matrixHierarchyNodes,
  matrixIssuePoints,
  matrixLeafRows,
} from '@/storage/database/shared/schema';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { canAccessMatrix, requireUser, isAuthResponse } from '@/lib/server/auth';
import { ok, fail } from '@/lib/server/api-v1/response';
import { resolveTraceId } from '@/lib/server/api-v1/trace';
import { decideHierarchyDeletion } from '@/lib/matrix/hierarchy-lifecycle';
import { recomputeMatrixFormulas } from '@/lib/matrix/recompute-v3';

export const dynamic = 'force-dynamic';

function databaseErrorCode(error: unknown): string {
  let current = error;
  const visited = new Set<object>();
  while (typeof current === 'object' && current !== null && !visited.has(current)) {
    visited.add(current);
    if ('code' in current && typeof (current as { code?: unknown }).code === 'string') {
      return (current as { code: string }).code;
    }
    current = 'cause' in current ? (current as { cause?: unknown }).cause : undefined;
  }
  return '';
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const traceId = resolveTraceId(req.headers);
  const { id: matrixId } = await params;

  const client = getSupabaseClient();
  const user = await requireUser(req, client);
  if (isAuthResponse(user)) return fail(traceId, { message: '未认证', status: 401 });
  if (!(await canAccessMatrix(client, user, matrixId))) {
    return fail(traceId, { message: '无权访问该矩阵', status: 403 });
  }

  let body: { level?: number; parentId?: string; nodeLabel?: string };
  try {
    body = await req.json();
  } catch {
    return fail(traceId, { message: '请求体不是合法 JSON', status: 400 });
  }

  const level = body.level;
  if (level === 3) {
    return fail(traceId, { message: '数据矩阵仅支持一级大类和二级细项，不能新增三级细项', status: 422 });
  }
  if (level !== 1 && level !== 2) {
    return fail(traceId, { message: 'level 必须是 1/2', status: 400 });
  }
  if (!body.nodeLabel?.trim()) {
    return fail(traceId, { message: 'nodeLabel 不能为空', status: 400 });
  }

  try {
    const db = await getDb();

    if (level === 1 && body.parentId) {
      return fail(traceId, { message: '一级大类不能指定父级', status: 400 });
    }
    if (level === 2 && !body.parentId) {
      return fail(traceId, { message: '二级细项必须隶属于一级大类', status: 400 });
    }

    let parent: typeof matrixHierarchyNodes.$inferSelect | null = null;
    if (level === 2 && body.parentId) {
      const [candidate] = await db
        .select()
        .from(matrixHierarchyNodes)
        .where(eq(matrixHierarchyNodes.id, body.parentId))
        .limit(1)
        .execute();
      parent = candidate ?? null;
      if (!parent || parent.matrixId !== matrixId || parent.nodeType !== 'level_1' || parent.archivedAt !== null) {
        return fail(traceId, { message: '二级细项必须隶属于当前矩阵的有效一级大类', status: 400 });
      }
    }

    // Compute next sort_order under the parent (or at root for level_1).
    const sortOrderResult = await db
      .select({ maxOrder: sql<number>`COALESCE(MAX(${matrixHierarchyNodes.sortOrder}), 0) + 1` })
      .from(matrixHierarchyNodes)
      .where(
        body.parentId
          ? eq(matrixHierarchyNodes.parentId, body.parentId)
          : sql`${matrixHierarchyNodes.matrixId} = ${matrixId} AND ${matrixHierarchyNodes.parentId} IS NULL`,
      )
      .execute();
    const sortOrder = sortOrderResult[0]?.maxOrder ?? 1;

    // Insert the node.
    const nodeType = `level_${level}` as 'level_1' | 'level_2';
    const [node] = await db
      .insert(matrixHierarchyNodes)
      .values({
        matrixId,
        parentId: body.parentId ?? null,
        level,
        nodeLabel: body.nodeLabel.trim(),
        nodeType,
        sortOrder,
        createdBy: user.id,
      })
      .returning()
      .execute();

    const created: { node: typeof node; leafRow?: typeof matrixLeafRows.$inferSelect; childNode?: typeof node } = { node };

    // Auto-create downstream structure for immediate input (PRD §7.3.2).
    let level1NodeId = node.id;
    let level2NodeId: string | null = null;

    if (level === 1) {
      // Create a default level_2 under this level_1.
      const [child] = await db
        .insert(matrixHierarchyNodes)
        .values({
          matrixId,
          parentId: node.id,
          level: 2,
          nodeLabel: '默认细项',
          nodeType: 'level_2',
          sortOrder: 1,
          createdBy: user.id,
        })
        .returning()
        .execute();
      created.childNode = child;
      level2NodeId = child.id;
    } else if (level === 2) {
      level2NodeId = node.id;
      level1NodeId = parent!.id;
    }

    // Compute next visible_row_index.
    const maxIdxResult = await db
      .select({ maxIdx: sql<number>`COALESCE(MAX(${matrixLeafRows.visibleRowIndex}), 0) + 1` })
      .from(matrixLeafRows)
      .where(eq(matrixLeafRows.matrixId, matrixId))
      .execute();
    const nextIdx = maxIdxResult[0]?.maxIdx ?? 1;

    // Create a leaf row.
    const [leafRow] = await db
      .insert(matrixLeafRows)
      .values({
        matrixId,
        level1NodeId,
        level2NodeId,
        level3NodeId: null,
        visibleRowIndex: nextIdx,
        groupRowIndex: 1,
        status: 'active',
      })
      .returning()
      .execute();
    created.leafRow = leafRow;

    return ok(created, traceId, 'created');
  } catch (err) {
    const code = databaseErrorCode(err);
    if (code === '23505') {
      return fail(traceId, { message: '同一层级下已存在该名称，请修改后再创建', status: 409 });
    }
    const message = err instanceof Error ? err.message : '创建失败';
    return fail(traceId, { message, status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const traceId = resolveTraceId(req.headers);
  const { id: matrixId } = await params;

  const client = getSupabaseClient();
  const user = await requireUser(req, client);
  if (isAuthResponse(user)) return fail(traceId, { message: '未认证', status: 401 });
  if (!(await canAccessMatrix(client, user, matrixId))) {
    return fail(traceId, { message: '无权访问该矩阵', status: 403 });
  }

  let body: { nodeId?: string; confirmArchive?: boolean };
  try {
    body = await req.json();
  } catch {
    return fail(traceId, { message: '请求体不是合法 JSON', status: 400 });
  }
  if (!body.nodeId) return fail(traceId, { message: 'nodeId 不能为空', status: 400 });

  try {
    const db = await getDb();
    const [nodes, rows] = await Promise.all([
      db.select().from(matrixHierarchyNodes).where(eq(matrixHierarchyNodes.matrixId, matrixId)).execute(),
      db.select().from(matrixLeafRows).where(eq(matrixLeafRows.matrixId, matrixId)).execute(),
    ]);
    const target = nodes.find((node) => node.id === body.nodeId && node.archivedAt === null);
    if (!target) return fail(traceId, { message: '层级节点不存在', status: 404 });

    const descendantIds = new Set<string>([target.id]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const node of nodes) {
        if (node.parentId && descendantIds.has(node.parentId) && !descendantIds.has(node.id)) {
          descendantIds.add(node.id);
          changed = true;
        }
      }
    }
    const affectedRows = rows.filter((row) =>
      descendantIds.has(row.level1NodeId)
      || Boolean(row.level2NodeId && descendantIds.has(row.level2NodeId))
      || Boolean(row.level3NodeId && descendantIds.has(row.level3NodeId)),
    );
    const rowIds = affectedRows.map((row) => row.id);
    const cells = rowIds.length > 0
      ? await db.select().from(matrixCellValues).where(inArray(matrixCellValues.leafRowId, rowIds)).execute()
      : [];
    const cellIds = cells.map((cell) => cell.id);
    const [issues, links] = await Promise.all([
      rowIds.length > 0
        ? db.select({ id: matrixIssuePoints.id }).from(matrixIssuePoints).where(inArray(matrixIssuePoints.leafRowId, rowIds)).execute()
        : Promise.resolve([]),
      cellIds.length > 0
        ? db.select({ id: materialLinks.id }).from(materialLinks).where(and(
          eq(materialLinks.targetType, 'dynamic_matrix_cell_value'),
          inArray(materialLinks.targetId, cellIds),
        )).execute()
        : Promise.resolve([]),
    ]);
    const meaningfulCells = cells.filter((cell) =>
      cell.valueState !== 'empty'
      || cell.valueText !== null
      || cell.valueNumber !== null
      || cell.valueDurationSeconds !== null
      || cell.valuePercentage !== null,
    );
    const decision = decideHierarchyDeletion({
      meaningfulCellCount: meaningfulCells.length,
      mediaLinkCount: links.length,
      issuePointCount: issues.length,
    });

    if (decision.requiresConfirmation && !body.confirmArchive) {
      return fail(traceId, {
        code: 31003,
        message: '该节点包含数据、素材或问题，删除将归档整个下级结构',
        status: 409,
        details: { errorCode: 'MX-HIER-003', mode: 'archive' },
      });
    }

    if (decision.mode === 'archive') {
      await db.transaction(async (tx) => {
        if (rowIds.length > 0) {
          await tx.update(matrixLeafRows).set({ status: 'archived', archivedAt: sql`NOW()` })
            .where(inArray(matrixLeafRows.id, rowIds)).execute();
        }
        await tx.update(matrixHierarchyNodes).set({ archivedAt: sql`NOW()`, updatedAt: sql`NOW()` })
          .where(inArray(matrixHierarchyNodes.id, Array.from(descendantIds))).execute();
      });
    } else {
      await db.transaction(async (tx) => {
        if (rowIds.length > 0) {
          await tx.delete(matrixLeafRows).where(inArray(matrixLeafRows.id, rowIds)).execute();
        }
        await tx.delete(matrixHierarchyNodes).where(eq(matrixHierarchyNodes.id, target.id)).execute();
      });
    }

    await recomputeMatrixFormulas(matrixId);
    return ok({ nodeId: target.id, mode: decision.mode, affectedRows: rowIds.length }, traceId);
  } catch (error) {
    const message = error instanceof Error ? error.message : '删除层级节点失败';
    return fail(traceId, { message, status: 500 });
  }
}
