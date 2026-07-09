import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { canReadReport, forbidden, isAuthResponse, requireUser } from '@/lib/server/auth';
import { loadLatestReportSnapshot } from '@/lib/server/report-snapshots';

function isRecordLike(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const client = getSupabaseClient();
  const user = await requireUser(request, client);
  if (isAuthResponse(user)) return user;
  if (!(await canReadReport(client, user, id))) return forbidden();

  const { data: report, error } = await client
    .from('reports')
    .select('id, title, product_model, status, report_type, task_id, version, created_at, updated_at, content')
    .eq('id', id)
    .single();

  if (error || !report) {
    return NextResponse.json({ code: 1, message: '报告不存在' }, { status: 404 });
  }

  let projectPhase: string | null = null;
  let taskTitle: string | null = null;
  let projectType: string | null = null;
  if (report.task_id) {
    const { data: task } = await client
      .from('experience_tasks')
      .select('project_phase, task_name, project_type')
      .eq('id', String(report.task_id))
      .maybeSingle();
    projectPhase = task?.project_phase ?? null;
    taskTitle = task?.task_name ?? null;
    projectType = task?.project_type ?? null;
  }

  // 取 AI 总结（评分 + 关键要词）。普通报告从 content.ai_summary，对比报告从 platform_settings
  const headerContent = (report.content ?? null) as Record<string, unknown> | null;
  let aiSummary: Record<string, unknown> | null = null;
  const contentAi = headerContent?.ai_summary as Record<string, unknown> | null | undefined;
  if (contentAi) {
    aiSummary = contentAi;
  } else if (report.task_id) {
    const { data: aiSetting } = await client
      .from('platform_settings')
      .select('value')
      .eq('key', `ai_sum_${report.task_id}`)
      .maybeSingle();
    if (aiSetting?.value) {
      try { aiSummary = typeof aiSetting.value === 'string' ? JSON.parse(aiSetting.value) : aiSetting.value as Record<string, unknown>; }
      catch { aiSummary = null; }
    }
  }

  // 动态决定 Tab：summary/issues 始终显示；matrix 仅对比报告且有矩阵快照时；function_effect 仅有食谱时显示。
  const availableTabs = ['summary', 'issues'];
  const content = (report.content ?? null) as Record<string, unknown> | null;
  const recipes = (content?.recipes ?? []) as unknown[];
  const isComparison = report.report_type === 'comparison_report';

  // matrix：普通报告不再用食谱瀑布冒充矩阵，避免无矩阵录入仍显示矩阵 Tab。
  let hasMatrix = false;
  if (isComparison) {
    try {
      const snapshot = await loadLatestReportSnapshot(client, id);
      const snapshotJson = snapshot?.snapshot_json as Record<string, unknown> | undefined;
      const objects = (snapshotJson?.objects ?? []) as unknown[];
      const cells = (snapshotJson?.cells ?? snapshotJson?.matrix_cells ?? []) as unknown[];
      hasMatrix = objects.length > 0 && cells.length > 0;
    } catch {
      hasMatrix = false;
    }
  } else {
    const dataMatrixProjection = content?.data_matrix_projection;
    hasMatrix =
      isRecordLike(dataMatrixProjection) &&
      Array.isArray(dataMatrixProjection.groups) &&
      dataMatrixProjection.groups.length > 0;
  }
  if (hasMatrix) availableTabs.push('matrix');

  // function_effect：有食谱时才显示
  if (recipes.length > 0) availableTabs.push('function_effect');

  return NextResponse.json({
    code: 0,
    message: 'success',
    data: {
      id: report.id,
      title: report.title,
      productModel: report.product_model,
      status: report.status,
      reportType: report.report_type,
      taskId: report.task_id,
      taskTitle,
      projectPhase,
      projectType,
      aiSummary,
      version: report.version,
      availableTabs,
      createdAt: report.created_at,
      updatedAt: report.updated_at,
    },
  });
}
