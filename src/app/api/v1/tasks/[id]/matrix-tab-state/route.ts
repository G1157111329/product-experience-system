/**
 * GET /api/v1/tasks/{taskId}/matrix-tab-state
 * PRD V3.1.2.4 §13.1 — Tab state endpoint.
 *
 * Returns the resolved matrix-tab state so the frontend can render the
 * correct status page instead of a blank screen. Resolves flags + permission
 * + matrix existence, per PRD §14.
 *
 * Response state values (PRD §13.1):
 *   feature_disabled — matrix_tab_state_enabled=false
 *   forbidden        — user not authenticated
 *   api_error        — internal error resolving state
 *   empty            — tab enabled but no matrices yet (or task_matrix_enabled=false)
 *   ready            — tab enabled + ≥1 matrix exists
 */
import { NextRequest } from 'next/server';
import { getDb } from '@/storage/database/pg-db';
import { eq } from 'drizzle-orm';
import { taskMatrices } from '@/storage/database/shared/schema';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { requireUser, isAuthResponse } from '@/lib/server/auth';
import { getV3FeatureFlags, resolveMatrixTabStateFromFlags } from '@/lib/feature-flags-v3';
import { ok } from '@/lib/server/api-v1/response';
import { resolveTraceId } from '@/lib/server/api-v1/trace';

export const dynamic = 'force-dynamic';

interface MatrixListItem {
  id: string;
  name: string;
  status: string;
  updatedAt: string;
}

interface MatrixTabStateResponse {
  enabled: boolean;
  permission: 'editable' | 'none';
  state: 'feature_disabled' | 'forbidden' | 'api_error' | 'empty' | 'ready';
  matrices: MatrixListItem[];
  cta: { primary: 'create_matrix' | null };
  flags: {
    taskMatrixEnabled: boolean;
    dynamicMatrixExcelLikeViewEnabled: boolean;
    dynamicMatrixFormulaEnabled: boolean;
    inlineEditEnabled: boolean;
  };
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const traceId = resolveTraceId(req.headers);
  const { id: taskId } = await params;

  try {
    // Auth gate — unauthenticated users see "forbidden".
    const client = getSupabaseClient();
    const user = await requireUser(req, client);
    if (isAuthResponse(user)) {
      return ok<MatrixTabStateResponse>(
        {
          enabled: false,
          permission: 'none',
          state: 'forbidden',
          matrices: [],
          cta: { primary: null },
          flags: {
            taskMatrixEnabled: false,
            dynamicMatrixExcelLikeViewEnabled: false,
            dynamicMatrixFormulaEnabled: false,
            inlineEditEnabled: false,
          },
        },
        traceId,
      );
    }
    void user;

    const flags = await getV3FeatureFlags();
    const flagState = resolveMatrixTabStateFromFlags(flags);
    const flagPayload = {
      taskMatrixEnabled: flags.taskMatrixEnabled,
      dynamicMatrixExcelLikeViewEnabled: flags.dynamicMatrixExcelLikeViewEnabled,
      dynamicMatrixFormulaEnabled: flags.dynamicMatrixFormulaEnabled,
      inlineEditEnabled: flags.inlineEditEnabled,
    };

    // Feature fully disabled.
    if (flagState.state === 'feature_disabled') {
      return ok<MatrixTabStateResponse>(
        {
          enabled: false,
          permission: 'none',
          state: 'feature_disabled',
          matrices: [],
          cta: { primary: null },
          flags: flagPayload,
        },
        traceId,
      );
    }

    // List matrices for this task (minimal projection for the list view).
    const db = await getDb();
    const rows = await db
      .select({
        id: taskMatrices.id,
        name: taskMatrices.name,
        status: taskMatrices.status,
        updatedAt: taskMatrices.updatedAt,
      })
      .from(taskMatrices)
      .where(eq(taskMatrices.taskId, taskId))
      .execute()
      .catch(() => []);

    const matrices: MatrixListItem[] = rows.map((r) => ({
      id: r.id,
      name: r.name,
      status: r.status,
      updatedAt: r.updatedAt,
    }));

    const hasMatrices = matrices.length > 0;
    // When task_matrix_enabled=false, keep empty + no create CTA even if rows exist.
    const state: 'empty' | 'ready' =
      !flags.taskMatrixEnabled ? 'empty' : hasMatrices ? 'ready' : 'empty';

    return ok<MatrixTabStateResponse>(
      {
        enabled: true,
        permission: 'editable',
        state,
        matrices: flags.taskMatrixEnabled ? matrices : [],
        cta: { primary: flagState.canCreate ? 'create_matrix' : null },
        flags: flagPayload,
      },
      traceId,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    return ok<MatrixTabStateResponse & { error: string }>(
      {
        enabled: true,
        permission: 'none',
        state: 'api_error',
        matrices: [],
        cta: { primary: null },
        flags: {
          taskMatrixEnabled: false,
          dynamicMatrixExcelLikeViewEnabled: false,
          dynamicMatrixFormulaEnabled: false,
          inlineEditEnabled: false,
        },
        error: message,
      },
      traceId,
    );
  }
}
