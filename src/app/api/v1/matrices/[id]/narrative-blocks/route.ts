/**
 * POST /api/v1/matrices/{id}/narrative-blocks
 * PRD V3.1.2.4 §8.11 / §7.13-7.14 — Create a narrative block (summary/note).
 *
 * Body: { blockType, scope, scopeNodeId?, content, showInReport?, sortOrder? }
 */
import { NextRequest } from 'next/server';
import { getDb } from '@/storage/database/pg-db';
import { matrixNarrativeBlocks } from '@/storage/database/shared/schema';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { canAccessMatrix, requireUser, isAuthResponse } from '@/lib/server/auth';
import { ok, fail } from '@/lib/server/api-v1/response';
import { resolveTraceId } from '@/lib/server/api-v1/trace';

export const dynamic = 'force-dynamic';

const VALID_TYPES = new Set(['summary', 'note', 'formula_note', 'method_note', 'limitation_note']);
const VALID_SCOPES = new Set(['matrix', 'level_1_group']);

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

  let body: { blockType?: string; scope?: string; scopeNodeId?: string; content?: string; showInReport?: boolean; sortOrder?: number };
  try {
    body = await req.json();
  } catch {
    return fail(traceId, { message: '请求体不是合法 JSON', status: 400 });
  }

  if (!VALID_TYPES.has(body.blockType ?? '')) {
    return fail(traceId, { message: `blockType 无效`, status: 400 });
  }
  if (!VALID_SCOPES.has(body.scope ?? '')) {
    return fail(traceId, { message: `scope 无效`, status: 400 });
  }

  try {
    const db = await getDb();
    const [block] = await db
      .insert(matrixNarrativeBlocks)
      .values({
        matrixId,
        blockType: body.blockType!,
        scope: body.scope as 'matrix' | 'level_1_group',
        scopeNodeId: body.scopeNodeId ?? null,
        content: body.content ?? null,
        showInReport: body.showInReport !== false,
        sortOrder: typeof body.sortOrder === 'number' ? body.sortOrder : 0,
        updatedBy: user.id,
      })
      .returning()
      .execute();

    return ok(block, traceId, 'created');
  } catch (err) {
    const message = err instanceof Error ? err.message : '创建失败';
    return fail(traceId, { message, status: 500 });
  }
}
