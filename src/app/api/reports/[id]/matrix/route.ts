import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { canReadReport, forbidden, isAuthResponse, requireUser } from '@/lib/server/auth';
import { loadAnchoredReportSnapshot } from '@/lib/server/report-snapshots';
import { type MatrixReadProjection } from '@/lib/matrix/projection';
import { hasMeaningfulComparisonCell, hasMeaningfulV2Projection, hasMeaningfulV3Projection } from '@/lib/matrix/meaningful-content';
import {
  isFrozenV3MatrixProjection,
  type ReportV3MatrixProjection,
} from '@/lib/matrix/report-projection-v3-adapter';

type Row = Record<string, unknown>;

function pickFrozenProjection(
  snapshotJson: Row | undefined,
  content: Row | null,
): unknown | null {
  if (isRecordLike(snapshotJson?.matrix_projection)) return snapshotJson!.matrix_projection;
  if (isRecordLike(content?.data_matrix_projection)) return content!.data_matrix_projection;
  return null;
}

/**
 * Resolve a data-matrix projection for a report (Sub-task D).
 * Prefers the frozen snapshot (`snapshot_json.matrix_projection`, §11.3 no-drift);
 * falls back to content. It never reads the current task matrix or assembly.
 */
async function resolveDataMatrixProjection(
  snapshotJson: Row | undefined,
  content: Row | null,
): Promise<
  | { kind: 'v3'; projection: ReportV3MatrixProjection }
  | { kind: 'v2'; projection: MatrixReadProjection }
  | null
> {
  const frozen = pickFrozenProjection(snapshotJson, content);
  if (isFrozenV3MatrixProjection(frozen)) {
    return { kind: 'v3', projection: frozen };
  }
  if (frozen && Array.isArray((frozen as MatrixReadProjection).groups)) {
    return { kind: 'v2', projection: frozen as MatrixReadProjection };
  }
  return null;
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

  const { data: report, error } = await client.from('reports').select('id, task_id, content, report_type, snapshot_id').eq('id', id).single();
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
    const { snapshot } = await loadAnchoredReportSnapshot(client, report);
    snapshotJson = snapshot?.snapshot_json as Row | undefined;
  } catch (err) {
    if (report.snapshot_id) throw err;
    snapshotJson = undefined;
    snapshotLoadError = err instanceof Error ? err.message : String(err);
  }

  if (isComparisonReport && snapshotJson && Array.isArray(snapshotJson.objects) && Array.isArray(snapshotJson.item_nodes)) {
    const cells = (snapshotJson.cells ?? snapshotJson.matrix_cells ?? []) as unknown[];
    const hasCellMedia = cells.some((cell) => isRecordLike(cell) && ['inline_media', 'appendix_media', 'media'].some((key) => Array.isArray(cell[key]) && (cell[key] as unknown[]).length > 0));
    const hasMeaningfulMatrix = snapshotJson.objects.length > 0 && snapshotJson.item_nodes.length > 0
      && cells.some((cell) => hasMeaningfulComparisonCell(cell) || hasCellMedia);
    return NextResponse.json({
      code: 0,
      message: 'success',
      data: {
        matrixType: 'multi_matrix',
        matrix: hasMeaningfulMatrix ? snapshotJson : { objects: [], item_nodes: [], cells: [] },
      },
    });
  }

  // ── 数据矩阵分支（Task 12 / Wave 6）──
  // 优先返回冻结快照中的投影；否则从组装即时构建。仅当任务确实关联 data_matrix
  // 组装、且快照/内容中存在投影时触发；既有对比/单报告不受影响。
  const frozenCandidate = pickFrozenProjection(snapshotJson, content);
  const hasFrozenV3 = isFrozenV3MatrixProjection(frozenCandidate) && hasMeaningfulV3Projection(frozenCandidate);
  const hasFrozenV2 = isRecordLike(frozenCandidate) && Array.isArray((frozenCandidate as Row).groups) && hasMeaningfulV2Projection(frozenCandidate);
  if (hasFrozenV3 || hasFrozenV2) {
    const resolved = await resolveDataMatrixProjection(snapshotJson, content);
    if (resolved?.kind === 'v3') {
      return NextResponse.json({
        code: 0,
        message: 'success',
        data: {
          matrixType: 'data_matrix_v3',
          dataMatrixV3: resolved.projection,
        },
      });
    }
    if (resolved?.kind === 'v2') {
      return NextResponse.json({
        code: 0,
        message: 'success',
        data: {
          matrixType: 'data_matrix',
          dataMatrix: resolved.projection,
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
