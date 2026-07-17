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
import { and, eq, inArray, max, or, sql } from 'drizzle-orm';
import {
  materialLinks,
  matrixCellValues,
  matrixFieldValues,
  matrixGroups,
  matrixIssuePoints,
  matrixNarrativeBlocks,
  matrixNarratives,
  matrixRows,
  taskMatrices,
} from '@/storage/database/shared/schema';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { canAccessTask, requireUser, isAuthResponse } from '@/lib/server/auth';
import { getV3FeatureFlags, resolveMatrixTabStateFromFlags } from '@/lib/feature-flags-v3';
import { ok } from '@/lib/server/api-v1/response';
import { resolveTraceId } from '@/lib/server/api-v1/trace';

export const dynamic = 'force-dynamic';

interface MatrixListItem {
  id: string;
  name: string;
  status: string;
  updatedAt: string;
  meaningful: boolean;
  contentUpdatedAt: string | null;
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
    dynamicMatrixCellStyleEnabled: boolean;
    inlineEditEnabled: boolean;
    materialStagingEnabled: boolean;
    hermesAgentGatewayEnabled: boolean;
    wecomMaterialIngestEnabled: boolean;
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
            dynamicMatrixCellStyleEnabled: false,
            inlineEditEnabled: false,
            materialStagingEnabled: false,
            hermesAgentGatewayEnabled: false,
            wecomMaterialIngestEnabled: false,
          },
        },
        traceId,
      );
    }
    if (!(await canAccessTask(client, user, taskId))) {
      return ok<MatrixTabStateResponse>(
        {
          enabled: true,
          permission: 'none',
          state: 'forbidden',
          matrices: [],
          cta: { primary: null },
          flags: {
            taskMatrixEnabled: false,
            dynamicMatrixExcelLikeViewEnabled: false,
            dynamicMatrixFormulaEnabled: false,
            dynamicMatrixCellStyleEnabled: false,
            inlineEditEnabled: false,
            materialStagingEnabled: false,
            hermesAgentGatewayEnabled: false,
            wecomMaterialIngestEnabled: false,
          },
        },
        traceId,
      );
    }

    const flags = await getV3FeatureFlags();
    const flagState = resolveMatrixTabStateFromFlags(flags);
    const flagPayload = {
      taskMatrixEnabled: flags.taskMatrixEnabled,
      dynamicMatrixExcelLikeViewEnabled: flags.dynamicMatrixExcelLikeViewEnabled,
      dynamicMatrixFormulaEnabled: flags.dynamicMatrixFormulaEnabled,
      dynamicMatrixCellStyleEnabled: flags.dynamicMatrixCellStyleEnabled,
      inlineEditEnabled: flags.inlineEditEnabled,
      materialStagingEnabled: flags.materialStagingEnabled,
      hermesAgentGatewayEnabled: flags.hermesAgentGatewayEnabled,
      wecomMaterialIngestEnabled: flags.wecomMaterialIngestEnabled,
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
      meaningful: false,
      contentUpdatedAt: null,
    }));

    const matrixIds = matrices.map((matrix) => matrix.id);
    if (matrixIds.length > 0) {
      const [v3CellContent, v3NarrativeContent, v3IssueContent, v2ValueContent, v2NarrativeContent, v3MediaContent] = await Promise.all([
        db.select({ matrixId: matrixCellValues.matrixId, updatedAt: max(matrixCellValues.updatedAt) })
          .from(matrixCellValues)
          .where(and(
            inArray(matrixCellValues.matrixId, matrixIds),
            eq(matrixCellValues.valueState, 'filled'),
            sql`(
              btrim(coalesce(${matrixCellValues.valueText}, '')) <> ''
              OR ${matrixCellValues.valueNumber} IS NOT NULL
              OR ${matrixCellValues.valueDurationSeconds} IS NOT NULL
              OR ${matrixCellValues.valuePercentage} IS NOT NULL
              OR btrim(coalesce(${matrixCellValues.displayText}, '')) <> ''
            )`,
          )).groupBy(matrixCellValues.matrixId).execute(),
        db.select({ matrixId: matrixNarrativeBlocks.matrixId, updatedAt: max(matrixNarrativeBlocks.updatedAt) })
          .from(matrixNarrativeBlocks)
          .where(and(inArray(matrixNarrativeBlocks.matrixId, matrixIds), sql`btrim(coalesce(${matrixNarrativeBlocks.content}, '')) <> ''`))
          .groupBy(matrixNarrativeBlocks.matrixId).execute(),
        db.select({ matrixId: matrixIssuePoints.matrixId, updatedAt: max(matrixIssuePoints.updatedAt) })
          .from(matrixIssuePoints)
          .where(and(inArray(matrixIssuePoints.matrixId, matrixIds), sql`btrim(coalesce(${matrixIssuePoints.issueText}, '')) <> ''`))
          .groupBy(matrixIssuePoints.matrixId).execute(),
        db.select({ matrixId: matrixRows.matrixId, updatedAt: max(matrixFieldValues.updatedAt) })
          .from(matrixFieldValues).innerJoin(matrixRows, eq(matrixFieldValues.rowId, matrixRows.id))
          .where(and(
            inArray(matrixRows.matrixId, matrixIds),
            or(eq(matrixFieldValues.valueState, 'valid'), eq(matrixFieldValues.valueState, 'filled')),
            sql`(
              ${matrixFieldValues.numericValue} IS NOT NULL
              OR btrim(coalesce(${matrixFieldValues.textValue}, '')) <> ''
              OR ${matrixFieldValues.durationMs} IS NOT NULL
              OR ${matrixFieldValues.booleanValue} IS NOT NULL
              OR ${matrixFieldValues.dateTimeValue} IS NOT NULL
              OR btrim(coalesce(${matrixFieldValues.enumValue}, '')) <> ''
            )`,
          )).groupBy(matrixRows.matrixId).execute(),
        db.select({ matrixId: sql<string>`coalesce(${matrixNarratives.matrixId}, ${matrixGroups.matrixId})`, updatedAt: max(matrixNarratives.updatedAt) })
          .from(matrixNarratives).leftJoin(matrixGroups, eq(matrixNarratives.groupId, matrixGroups.id))
          .where(and(
            sql`btrim(coalesce(${matrixNarratives.content}, '')) <> ''`,
            or(inArray(matrixNarratives.matrixId, matrixIds), inArray(matrixGroups.matrixId, matrixIds)),
          )).groupBy(sql`coalesce(${matrixNarratives.matrixId}, ${matrixGroups.matrixId})`).execute(),
        db.select({ matrixId: matrixCellValues.matrixId, updatedAt: max(materialLinks.boundAt) })
          .from(materialLinks).innerJoin(matrixCellValues, eq(materialLinks.targetId, matrixCellValues.id))
          .where(and(
            eq(materialLinks.targetType, 'dynamic_matrix_cell_value'),
            inArray(matrixCellValues.matrixId, matrixIds),
          )).groupBy(matrixCellValues.matrixId).execute(),
      ]);
      const matrixById = new Map(matrices.map((matrix) => [matrix.id, matrix]));
      const mark = (matrixId: string | null, updatedAt: string | null) => {
        if (!matrixId) return;
        const matrix = matrixById.get(matrixId);
        if (!matrix) return;
        matrix.meaningful = true;
        if (!matrix.contentUpdatedAt || (updatedAt && updatedAt > matrix.contentUpdatedAt)) {
          matrix.contentUpdatedAt = updatedAt;
        }
      };
      for (const item of [...v3CellContent, ...v3NarrativeContent, ...v3IssueContent, ...v2ValueContent, ...v2NarrativeContent, ...v3MediaContent]) {
        mark(item.matrixId, item.updatedAt);
      }
    }

    const hasMeaningfulMatrices = matrices.some((matrix) => matrix.status !== 'archived' && matrix.meaningful);
    // When task_matrix_enabled=false, keep empty + no create CTA even if rows exist.
    const state: 'empty' | 'ready' =
      !flags.taskMatrixEnabled ? 'empty' : hasMeaningfulMatrices ? 'ready' : 'empty';

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
          dynamicMatrixCellStyleEnabled: false,
          inlineEditEnabled: false,
          materialStagingEnabled: false,
          hermesAgentGatewayEnabled: false,
          wecomMaterialIngestEnabled: false,
        },
        error: message,
      },
      traceId,
    );
  }
}
