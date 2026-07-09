/**
 * POST /api/v1/matrices/{id}/cells/{leafRowId}/{columnId}/media
 * PRD V3.1.2.4 §9.3 / §8.7 — Upload or bind media to a matrix cell (D/O columns).
 *
 * Two modes:
 *   1. JSON body { materialId }        — bind an existing material to this cell.
 *   2. multipart/form-data (file field) — upload a new material + bind it.
 *
 * Enforces max_media_count from the column definition. Only image_slot /
 * media_slot columns accept media (the "D/O" detail/effect media columns).
 *
 * Binding target: targetType='dynamic_matrix_cell_value', targetId = the
 * matrix_cell_values.id for this (matrix, leafRow, column) triple. A cell value
 * row is upserted (state='filled' once media is attached) so the binding has a
 * stable target id.
 */
import { NextRequest } from 'next/server';
import { getDb } from '@/storage/database/pg-db';
import { eq, sql } from 'drizzle-orm';
import {
  matrixColumnDefinitions,
  matrixCellValues,
  materials,
  materialLinks,
  taskMatrices,
} from '@/storage/database/shared/schema';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { requireUser, isAuthResponse } from '@/lib/server/auth';
import { ok, fail } from '@/lib/server/api-v1/response';
import { resolveTraceId } from '@/lib/server/api-v1/trace';
import { bindMaterial } from '@/lib/server/material-asset-service';
import { uploadFile } from '@/lib/server/storage';

export const dynamic = 'force-dynamic';

const MEDIA_COLUMN_DATA_TYPES = new Set(['image_slot', 'media_slot']);
const TARGET_TYPE = 'dynamic_matrix_cell_value';
const DEFAULT_MAX_MEDIA = 10;

function inferMaterialType(fileName: string): string {
  const ext = fileName.toLowerCase().split('.').pop() ?? '';
  if (['mp4', 'webm', 'mov', 'avi', 'mkv'].includes(ext)) return 'video';
  return 'image';
}

function contentTypeFor(fileName: string): string {
  const ext = fileName.toLowerCase().split('.').pop() ?? '';
  switch (ext) {
    case 'jpg':
    case 'jpeg': return 'image/jpeg';
    case 'png': return 'image/png';
    case 'gif': return 'image/gif';
    case 'webp': return 'image/webp';
    case 'mp4': return 'video/mp4';
    case 'webm': return 'video/webm';
    case 'mov': return 'video/quicktime';
    default: return 'application/octet-stream';
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; leafRowId: string; columnId: string }> },
) {
  const traceId = resolveTraceId(req.headers);
  const { id: matrixId, leafRowId, columnId } = await params;

  const client = getSupabaseClient();
  const user = await requireUser(req, client);
  if (isAuthResponse(user)) return fail(traceId, { message: '未认证', status: 401 });

  try {
    const db = await getDb();
    const cellRows = await db
      .select({ id: matrixCellValues.id })
      .from(matrixCellValues)
      .where(
        sql`${matrixCellValues.matrixId} = ${matrixId}
          AND ${matrixCellValues.leafRowId} = ${leafRowId}
          AND ${matrixCellValues.columnId} = ${columnId}`,
      )
      .execute();

    const cellId = cellRows[0]?.id;
    if (!cellId) {
      return ok({ materials: [] }, traceId);
    }

    const rows = await db
      .select({
        linkId: materialLinks.id,
        materialId: materials.id,
        materialType: materials.materialType,
        fileName: materials.fileName,
        fileUrl: materials.fileUrl,
        filePath: materials.filePath,
        thumbnailUrl: materials.thumbnailUrl,
        bindingMethod: materialLinks.bindingMethod,
        boundAt: materialLinks.boundAt,
      })
      .from(materialLinks)
      .innerJoin(materials, eq(materials.id, materialLinks.materialId))
      .where(
        sql`${materialLinks.targetType} = ${TARGET_TYPE} AND ${materialLinks.targetId} = ${cellId}`,
      )
      .execute();

    const { generatePresignedUrl } = await import('@/lib/server/storage');
    const materialsOut = await Promise.all(
      rows.map(async (m) => {
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
          // keep original
        }
        return {
          linkId: m.linkId,
          materialId: m.materialId,
          materialType: m.materialType,
          fileName: m.fileName,
          fileUrl,
          thumbnailUrl: m.thumbnailUrl,
          bindingMethod: m.bindingMethod,
          boundAt: m.boundAt,
        };
      }),
    );

    return ok({ cellId, materials: materialsOut }, traceId);
  } catch (err) {
    const message = err instanceof Error ? err.message : '读取媒体失败';
    return fail(traceId, { message, status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; leafRowId: string; columnId: string }> },
) {
  const traceId = resolveTraceId(req.headers);
  const { id: matrixId, leafRowId, columnId } = await params;

  const client = getSupabaseClient();
  const user = await requireUser(req, client);
  if (isAuthResponse(user)) return fail(traceId, { message: '未认证', status: 401 });

  try {
    const db = await getDb();

    // 1. Load + validate the column is a media column.
    const colRows = await db
      .select({
        id: matrixColumnDefinitions.id,
        dataType: matrixColumnDefinitions.dataType,
        maxMediaCount: matrixColumnDefinitions.maxMediaCount,
      })
      .from(matrixColumnDefinitions)
      .where(eq(matrixColumnDefinitions.id, columnId))
      .execute();

    const column = colRows[0];
    if (!column) {
      return fail(traceId, { message: '列定义不存在', status: 404 });
    }
    if (!MEDIA_COLUMN_DATA_TYPES.has(column.dataType)) {
      return fail(traceId, {
        message: `该列不支持媒体绑定 (dataType=${column.dataType})`,
        status: 400,
      });
    }
    const maxMediaCount = column.maxMediaCount ?? DEFAULT_MAX_MEDIA;

    // 2. Ensure a cell value row exists so the binding has a stable target id.
    const cellRows = await db
      .select({ id: matrixCellValues.id })
      .from(matrixCellValues)
      .where(
        sql`${matrixCellValues.matrixId} = ${matrixId}
          AND ${matrixCellValues.leafRowId} = ${leafRowId}
          AND ${matrixCellValues.columnId} = ${columnId}`,
      )
      .execute();

    let cellId = cellRows[0]?.id;
    if (!cellId) {
      const [created] = await db
        .insert(matrixCellValues)
        .values({
          matrixId,
          leafRowId,
          columnId,
          valueState: 'empty',
          version: 1,
          updatedBy: user.id,
        })
        .onConflictDoUpdate({
          target: [matrixCellValues.matrixId, matrixCellValues.leafRowId, matrixCellValues.columnId],
          set: { updatedAt: sql`NOW()` },
        })
        .returning({ id: matrixCellValues.id })
        .execute();
      cellId = created?.id;
      if (!cellId) {
        return fail(traceId, { message: '无法创建单元格记录', status: 500 });
      }
    }

    // 3. Enforce max_media_count against existing bindings for this cell.
    const existingCountRows = await db
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(materialLinks)
      .where(
        sql`${materialLinks.targetType} = ${TARGET_TYPE} AND ${materialLinks.targetId} = ${cellId}`,
      )
      .execute();
    const existingCount = existingCountRows[0]?.count ?? 0;
    if (existingCount >= maxMediaCount) {
      return fail(traceId, {
        message: `该单元格媒体数量已达上限 (${maxMediaCount})`,
        status: 409,
      });
    }

    // 4. Resolve the material: either bind an existing one, or upload + create.
    let materialId: string;

    const contentType = req.headers.get('content-type') ?? '';
    if (contentType.includes('multipart/form-data')) {
      // --- Multipart upload path ---
      const formData = await req.formData();
      const file = formData.get('file') as File | null;
      if (!file || !(file instanceof File)) {
        return fail(traceId, { message: 'multipart 请求缺少 file 字段', status: 400 });
      }

      const buffer = Buffer.from(await file.arrayBuffer());
      const safeName = file.name || `upload-${Date.now()}`;
      const storageKey = `${matrixId}/${leafRowId}/${columnId}/${Date.now()}-${safeName}`;
      const storedKey = await uploadFile({
        fileContent: buffer,
        fileName: storageKey,
        contentType: file.type || contentTypeFor(safeName),
      });

      const matrixRows = await db
        .select({ taskId: taskMatrices.taskId })
        .from(taskMatrices)
        .where(eq(taskMatrices.id, matrixId))
        .limit(1)
        .execute();

      const [material] = await db
        .insert(materials)
        .values({
          taskId: matrixRows[0]?.taskId ?? null,
          materialType: inferMaterialType(safeName),
          fileName: safeName,
          filePath: storedKey,
          fileUrl: storedKey,
          fileSize: buffer.length,
          status: 'bound',
          mediaRole: 'data_matrix_evidence',
        })
        .returning({ id: materials.id })
        .execute();

      if (!material?.id) {
        return fail(traceId, { message: '素材记录创建失败', status: 500 });
      }
      materialId = material.id;
    } else {
      // --- JSON bind-existing path ---
      let body: { materialId?: string };
      try {
        body = await req.json();
      } catch {
        return fail(traceId, { message: '请求体不是合法 JSON，或使用 multipart 上传文件', status: 400 });
      }
      if (!body.materialId) {
        return fail(traceId, { message: 'materialId 必填', status: 400 });
      }

      // Verify the material exists.
      const matRows = await db
        .select({ id: materials.id })
        .from(materials)
        .where(eq(materials.id, body.materialId))
        .execute();
      if (matRows.length === 0) {
        return fail(traceId, { message: '素材不存在', status: 404 });
      }
      materialId = body.materialId;
    }

    // 5. Bind the material to the cell.
    const bindingMethod =
      contentType.includes('multipart/form-data') ? 'upload_at_slot' : 'click_select';
    const { linkId } = await bindMaterial({
      materialId,
      targetType: TARGET_TYPE,
      targetId: cellId,
      bindingMethod,
      boundBy: user.id,
    });

    return ok({ linkId, materialId, cellId }, traceId, 'created');
  } catch (err) {
    const message = err instanceof Error ? err.message : '媒体绑定失败';
    return fail(traceId, { message, status: 500 });
  }
}
