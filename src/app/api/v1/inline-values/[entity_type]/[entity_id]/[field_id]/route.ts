/**
 * PATCH /api/v1/inline-values/{entity_type}/{entity_id}/{field_id}
 * PRD V3.1.2.4 §13.7 — Unified Inline Save endpoint.
 *
 * Drives the platform-wide InlineEditable autosave (PRD §5). Accepts a single
 * field update with optimistic locking (If-Match / ETag) and returns the new
 * version so the client can detect 409 conflicts.
 *
 * Entity types (PRD §13.7):
 *   record_item, issue, issue_occurrence, rectification_action, verification,
 *   report_summary, function_effect_record, sensory_record,
 *   comparison_matrix_cell, dynamic_matrix_cell_value,
 *   dynamic_matrix_column_definition, dynamic_matrix_hierarchy_node,
 *   dynamic_matrix_narrative_block, matrix_issue_point
 *
 * Wave 0: routing skeleton + dispatch map. Concrete field-writers are wired
 * incrementally per Wave 1 (records/recipes/comparison) and Wave 2 (matrix V3).
 * Unknown / unwired entity_types return 501 Not Implemented so the frontend
 * can fall back to the legacy full-object PUT.
 *
 * Request body: { value: string | number | null }
 * Headers: If-Match: "<version>" (optional; enables 409 conflict detection)
 * Response: 200 { version } + ETag header, or 409 on version mismatch.
 */
import { NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';
import { getDb } from '@/storage/database/pg-db';
import {
  matrixCellValues,
  matrixColumnDefinitions,
  matrixHierarchyNodes,
  matrixIssuePoints,
  matrixNarrativeBlocks,
} from '@/storage/database/shared/schema';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { canAccessMatrix, requireUser, isAuthResponse } from '@/lib/server/auth';
import { ok, fail } from '@/lib/server/api-v1/response';
import { resolveTraceId } from '@/lib/server/api-v1/trace';
import { handleInlineValueUpdate, type InlineEntityType } from '@/lib/server/inline-values';

export const dynamic = 'force-dynamic';

const SUPPORTED_ENTITY_TYPES = new Set<InlineEntityType>([
  'record_item',
  'issue',
  'issue_occurrence',
  'rectification_action',
  'verification',
  'report_summary',
  'function_effect_record',
  'sensory_record',
  'comparison_matrix_cell',
  'dynamic_matrix_cell_value',
  'dynamic_matrix_column_definition',
  'dynamic_matrix_hierarchy_node',
  'dynamic_matrix_narrative_block',
  'matrix_issue_point',
]);

async function resolveMatrixIdForInlineEntity(entityType: InlineEntityType, entityId: string): Promise<string | null | undefined> {
  const db = await getDb();
  if (entityType === 'dynamic_matrix_cell_value') {
    const rows = await db
      .select({ matrixId: matrixCellValues.matrixId })
      .from(matrixCellValues)
      .where(eq(matrixCellValues.id, entityId))
      .limit(1)
      .execute();
    return rows[0]?.matrixId ?? null;
  }
  if (entityType === 'dynamic_matrix_column_definition') {
    const rows = await db
      .select({ matrixId: matrixColumnDefinitions.matrixId })
      .from(matrixColumnDefinitions)
      .where(eq(matrixColumnDefinitions.id, entityId))
      .limit(1)
      .execute();
    return rows[0]?.matrixId ?? null;
  }
  if (entityType === 'dynamic_matrix_hierarchy_node') {
    const rows = await db
      .select({ matrixId: matrixHierarchyNodes.matrixId })
      .from(matrixHierarchyNodes)
      .where(eq(matrixHierarchyNodes.id, entityId))
      .limit(1)
      .execute();
    return rows[0]?.matrixId ?? null;
  }
  if (entityType === 'dynamic_matrix_narrative_block') {
    const rows = await db
      .select({ matrixId: matrixNarrativeBlocks.matrixId })
      .from(matrixNarrativeBlocks)
      .where(eq(matrixNarrativeBlocks.id, entityId))
      .limit(1)
      .execute();
    return rows[0]?.matrixId ?? null;
  }
  if (entityType === 'matrix_issue_point') {
    const rows = await db
      .select({ matrixId: matrixIssuePoints.matrixId })
      .from(matrixIssuePoints)
      .where(eq(matrixIssuePoints.id, entityId))
      .limit(1)
      .execute();
    return rows[0]?.matrixId ?? null;
  }
  return undefined;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ entity_type: string; entity_id: string; field_id: string }> },
) {
  const traceId = resolveTraceId(req.headers);
  const { entity_type, entity_id, field_id } = await params;

  // Auth gate.
  const client = getSupabaseClient();
  const user = await requireUser(req, client);
  if (isAuthResponse(user)) {
    return fail(traceId, { message: '未认证', status: 401 });
  }

  if (!SUPPORTED_ENTITY_TYPES.has(entity_type as InlineEntityType)) {
    return fail(traceId, {
      message: `不支持的实体类型: ${entity_type}`,
      status: 501,
      code: 1,
    });
  }

  const matrixId = await resolveMatrixIdForInlineEntity(entity_type as InlineEntityType, entity_id);
  if (matrixId === null) {
    return fail(traceId, { message: '目标不存在', status: 404 });
  }
  if (matrixId && !(await canAccessMatrix(client, user, matrixId))) {
    return fail(traceId, { message: '无权访问该矩阵', status: 403 });
  }

  // Parse body.
  let body: { value?: unknown; ifMatch?: unknown };
  try {
    body = await req.json();
  } catch {
    return fail(traceId, { message: '请求体不是合法 JSON', status: 400 });
  }

  if (body.value === undefined) {
    return fail(traceId, { message: '缺少 value 字段', status: 400 });
  }

  const ifMatchHeader = req.headers.get('if-match');
  const ifMatchBody = typeof body.ifMatch === 'string' ? body.ifMatch : undefined;
  const ifMatch = ifMatchHeader ?? ifMatchBody;

  try {
    const result = await handleInlineValueUpdate({
      entityType: entity_type as InlineEntityType,
      entityId: entity_id,
      fieldId: field_id,
      value: body.value,
      ifMatch: ifMatch ?? undefined,
      userId: user.id,
      isAdmin: user.role === 'admin',
    });

    if (result.kind === 'not_found') {
      return fail(traceId, { message: '目标不存在', status: 404 });
    }
    if (result.kind === 'conflict') {
      return fail(traceId, {
        message: '内容冲突，请刷新后重试',
        status: 409,
        code: 409,
        details: { serverVersion: result.serverVersion },
      });
    }
    if (result.kind === 'forbidden') {
      return fail(traceId, { message: '无权修改', status: 403 });
    }
    if (result.kind === 'unsupported') {
      return fail(traceId, {
        message: `该字段暂不支持 inline 更新: ${entity_type}.${field_id}`,
        status: 501,
      });
    }

    // success
    const response = ok(
      { version: result.version, appliedValue: result.appliedValue },
      traceId,
    );
    response.headers.set('ETag', `"${result.version}"`);
    return response;
  } catch (err) {
    const message = err instanceof Error ? err.message : '保存失败';
    return fail(traceId, { message, status: 500, code: 1 });
  }
}
