/**
 * GET /api/v1/projects/{projectId}/material-library
 * PRD V3.1.2.4 §9.2 — Project material library (library_ready + bound).
 *
 * Note: projectId currently maps to experience_tasks.id (task-scoped library)
 * until a dedicated projects table is introduced.
 */
import { NextRequest } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { requireUser, isAuthResponse } from '@/lib/server/auth';
import { ok, fail } from '@/lib/server/api-v1/response';
import { resolveTraceId } from '@/lib/server/api-v1/trace';
import { getProjectMaterials, getStagingMaterials } from '@/lib/server/material-asset-service';
import { getDb } from '@/storage/database/pg-db';
import { materials } from '@/storage/database/shared/schema';
import { and, eq, inArray, sql } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const traceId = resolveTraceId(req.headers);
  const { projectId } = await params;

  const client = getSupabaseClient();
  const user = await requireUser(req, client);
  if (isAuthResponse(user)) return fail(traceId, { message: '未认证', status: 401 });

  try {
    // Prefer project_id scoped library; fall back to task_id bound materials.
    let items = await getProjectMaterials(projectId);
    if (items.length === 0) {
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
            eq(materials.taskId, projectId),
            inArray(materials.status, ['library_ready', 'bound'] as unknown as string[]),
          ),
        )
        .orderBy(sql`${materials.createdAt} DESC`)
        .execute();
      items = rows.map((r) => ({
        id: r.id,
        materialType: r.materialType,
        fileName: r.fileName,
        fileUrl: r.fileUrl,
        thumbnailUrl: r.thumbnailUrl,
        status: r.status,
        projectId: r.projectId,
        createdAt: r.createdAt,
      }));
    }

    // Also expose staging count for the same task for UI badges.
    const staging = await getStagingMaterials(projectId);

    return ok({ items, stagingCount: staging.length }, traceId);
  } catch (err) {
    const message = err instanceof Error ? err.message : '查询失败';
    return fail(traceId, { message, status: 500 });
  }
}
