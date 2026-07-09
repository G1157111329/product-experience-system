/**
 * POST /api/v1/matrices/{id}/hierarchy-nodes
 * PRD V3.1.2.4 §7.3-7.5 / §13.3-13.4 — Create a hierarchy node.
 *
 * Body: { level: 1|2|3, parentId?: string, nodeLabel: string }
 *
 * Auto-creation rules (PRD §7.3.2, §7.4.3):
 *   - level_1: also creates a default level_2 node + a leaf_row so the user can
 *     immediately input data.
 *   - level_2 (no level_3 enabled): creates a leaf_row.
 *   - level_3: creates a leaf_row.
 *
 * visible_row_index is computed as max(existing)+1 within the matrix.
 */
import { NextRequest } from 'next/server';
import { getDb } from '@/storage/database/pg-db';
import { eq, sql } from 'drizzle-orm';
import {
  matrixHierarchyNodes,
  matrixLeafRows,
} from '@/storage/database/shared/schema';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { requireUser, isAuthResponse } from '@/lib/server/auth';
import { ok, fail } from '@/lib/server/api-v1/response';
import { resolveTraceId } from '@/lib/server/api-v1/trace';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const traceId = resolveTraceId(req.headers);
  const { id: matrixId } = await params;

  const client = getSupabaseClient();
  const user = await requireUser(req, client);
  if (isAuthResponse(user)) return fail(traceId, { message: '未认证', status: 401 });

  let body: { level?: number; parentId?: string; nodeLabel?: string };
  try {
    body = await req.json();
  } catch {
    return fail(traceId, { message: '请求体不是合法 JSON', status: 400 });
  }

  const level = body.level;
  if (level !== 1 && level !== 2 && level !== 3) {
    return fail(traceId, { message: 'level 必须是 1/2/3', status: 400 });
  }
  if (!body.nodeLabel?.trim()) {
    return fail(traceId, { message: 'nodeLabel 不能为空', status: 400 });
  }

  try {
    const db = await getDb();

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
    const nodeType = `level_${level}` as 'level_1' | 'level_2' | 'level_3';
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
      level1NodeId = node.parentId ?? node.id;
    } else {
      // level 3
      level2NodeId = node.parentId;
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
        level3NodeId: level === 3 ? node.id : null,
        visibleRowIndex: nextIdx,
        groupRowIndex: 1,
        status: 'active',
      })
      .returning()
      .execute();
    created.leafRow = leafRow;

    return ok(created, traceId, 'created');
  } catch (err) {
    const message = err instanceof Error ? err.message : '创建失败';
    return fail(traceId, { message, status: 500 });
  }
}
