import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { canReadReport, forbidden, isAuthResponse, requireUser } from '@/lib/server/auth';
import { loadLatestReportSnapshot } from '@/lib/server/report-snapshots';
import { buildMatrixReadProjection, type MatrixReadProjection } from '@/lib/matrix/projection';
import { getMatrixReadProjection } from '@/lib/matrix/projection-v2';
import { adaptTaskMatrixProjectionForReport } from '@/lib/matrix/report-projection-adapter';

type Row = Record<string, unknown>;

function isComparisonSnapshot(snapshotJson: Row | undefined): boolean {
  if (!snapshotJson) return false;
  return Boolean(
    snapshotJson.objects ||
    snapshotJson.comparison_objects ||
    (Array.isArray(snapshotJson.matrix_cells) && snapshotJson.matrix_cells.length > 0) ||
    (Array.isArray(snapshotJson.rows) && snapshotJson.rows.length > 0),
  );
}

/**
 * Find a data_matrix assembly linked to a task via source_task_ids + matrix_role.
 * Returns null if none exists (or on query failure, since this is a best-effort branch).
 */
async function findDataMatrixAssemblyId(client: ReturnType<typeof getSupabaseClient>, taskId: string): Promise<string | null> {
  const { data: assemblies } = await client
    .from('comparison_assemblies')
    .select('id, source_task_ids')
    .eq('matrix_role', 'data_matrix');
  const rows = (assemblies || []) as Array<{ id: string; source_task_ids: unknown }>;
  const match = rows.find((assembly) => Array.isArray(assembly.source_task_ids) && assembly.source_task_ids.includes(taskId));
  return match?.id || null;
}

async function findTaskMatrixId(client: ReturnType<typeof getSupabaseClient>, taskId: string): Promise<string | null> {
  const { data: matrices } = await client
    .from('task_matrices')
    .select('id,status,updated_at')
    .eq('task_id', taskId)
    .neq('status', 'archived')
    .order('updated_at', { ascending: false })
    .limit(1);
  return matrices?.[0]?.id ? String(matrices[0].id) : null;
}

/**
 * Resolve a data-matrix projection for a report (Sub-task D).
 * Prefers the frozen snapshot (`snapshot_json.matrix_projection`, §11.3 no-drift);
 * falls back to building a fresh projection from the linked assembly.
 */
async function resolveDataMatrixProjection(
  client: ReturnType<typeof getSupabaseClient>,
  snapshotJson: Row | undefined,
  taskId: string,
): Promise<MatrixReadProjection | null> {
  const frozen = isRecordLike(snapshotJson?.matrix_projection) ? snapshotJson!.matrix_projection as unknown as MatrixReadProjection : null;
  if (frozen && Array.isArray(frozen.groups)) return frozen;
  if (!taskId) return null;
  try {
    const taskMatrixId = await findTaskMatrixId(client, taskId);
    if (taskMatrixId) {
      const taskMatrixProjection = await getMatrixReadProjection(taskMatrixId);
      if (taskMatrixProjection) return adaptTaskMatrixProjectionForReport(taskMatrixProjection);
    }
    const assemblyId = await findDataMatrixAssemblyId(client, taskId);
    if (!assemblyId) return null;
    return await buildMatrixReadProjection(client, assemblyId);
  } catch {
    return null;
  }
}

function isRecordLike(value: unknown): value is Row {
  return typeof value === 'object' && value !== null;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const client = getSupabaseClient();
  const user = await requireUser(request, client);
  if (isAuthResponse(user)) return user;
  if (!(await canReadReport(client, user, id))) return forbidden();

  const { data: report, error } = await client.from('reports').select('id, task_id, content, report_type').eq('id', id).single();
  if (error || !report) {
    return NextResponse.json({ code: 1, message: '报告不存在' }, { status: 404 });
  }

  const reportType = String(report.report_type ?? '');
  const isComparisonReport = reportType === 'comparison_report';
  const content = (report.content ?? null) as Record<string, unknown> | null;
  const recipes = (content?.recipes ?? []) as Row[];
  let snapshotJson: Row | undefined;
  let snapshotLoadError = '';
  try {
    const snapshot = await loadLatestReportSnapshot(client, id);
    snapshotJson = snapshot?.snapshot_json as Row | undefined;
  } catch (err) {
    snapshotJson = undefined;
    snapshotLoadError = err instanceof Error ? err.message : String(err);
  }

  if (isComparisonSnapshot(snapshotJson)) {
    return NextResponse.json({
      code: 0,
      message: 'success',
      data: {
        matrixType: 'multi_matrix',
        matrix: snapshotJson ?? {},
      },
    });
  }

  // ── 数据矩阵分支（Task 12, Sub-task D）──
  // 优先返回冻结快照中的投影；否则从组装即时构建。仅当任务确实关联 data_matrix
  // 组装、且快照/内容中存在投影时触发；既有对比/单报告不受影响。
  const taskId = report.task_id ? String(report.task_id) : '';
  const hasFrozenDataMatrix = isRecordLike(snapshotJson?.matrix_projection) && Array.isArray((snapshotJson!.matrix_projection as Row).groups);
  const hasContentDataMatrix = isRecordLike(content?.data_matrix_projection);
  if (hasFrozenDataMatrix || hasContentDataMatrix || (taskId && ((await findTaskMatrixId(client, taskId)) || (await findDataMatrixAssemblyId(client, taskId))))) {
    const dataMatrix = await resolveDataMatrixProjection(client, snapshotJson, taskId);
    if (dataMatrix) {
      return NextResponse.json({
        code: 0,
        message: 'success',
        data: {
          matrixType: 'data_matrix',
          dataMatrix,
        },
      });
    }
  }

  // 对比报告但缺少可渲染快照：返回明确的空状态，避免误入空瀑布
  if (isComparisonReport) {
    return NextResponse.json({
      code: 0,
      message: 'success',
      data: {
        matrixType: 'multi_matrix',
        matrix: { objects: [], item_nodes: [], cells: [] },
        emptyReason: snapshotLoadError
          ? `对比报告快照加载失败：${snapshotLoadError}`
          : '对比报告缺少可渲染快照，请重新生成报告。',
      },
    });
  }

  // 普通报告：单对象瀑布，返回 recipes with steps
  const { data: materials } = report.task_id
    ? await client.from('materials').select('*').eq('task_id', String(report.task_id))
    : { data: [] };
  const materialsByRecipe = new Map<string, Row[]>();
  for (const mat of (materials || []) as Row[]) {
    const key = String(mat.recipe_id || '');
    if (!key) continue;
    if (!materialsByRecipe.has(key)) materialsByRecipe.set(key, []);
    materialsByRecipe.get(key)?.push(mat);
  }

  return NextResponse.json({
    code: 0,
    message: 'success',
    data: {
      matrixType: 'single_waterfall',
      waterfall: recipes.map((recipe) => ({
        ...recipe,
        materials: materialsByRecipe.get(String(recipe.id)) || [],
      })),
    },
  });
}
