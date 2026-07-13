import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { canReadReport, forbidden, isAuthResponse, requireUser } from '@/lib/server/auth';
import { loadAnchoredReportSnapshot } from '@/lib/server/report-snapshots';

function pickConclusionLevel(stats: { failCount: number; issueCount: number; totalCheckItems: number }): string {
  if (stats.failCount === 0 && stats.issueCount === 0) return 'positive';
  if (stats.failCount >= stats.totalCheckItems * 0.3 || stats.issueCount >= 10) return 'blocking';
  if (stats.failCount > 0 || stats.issueCount > 0) return 'risk';
  return 'neutral';
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const client = getSupabaseClient();
  const user = await requireUser(request, client);
  if (isAuthResponse(user)) return user;
  if (!(await canReadReport(client, user, id))) return forbidden();

  const { data: report, error } = await client.from('reports').select('*').eq('id', id).single();
  if (error || !report) {
    return NextResponse.json({ code: 1, message: '报告不存在' }, { status: 404 });
  }

  const content = (report.content ?? {}) as Record<string, unknown>;
  let aiSummary = content.ai_summary as Record<string, unknown> | null | undefined;
  // 对比报告 content 为 null，AI 总结存在 platform_settings，回退读取
  if (!aiSummary && report.task_id) {
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
  const records = (content.records ?? []) as Array<Record<string, unknown>>;
  const recipes = (content.recipes ?? []) as Array<Record<string, unknown>>;

  const totalCheckItems = records.length;
  const passCount = records.filter((r) => r.evaluation_result === '合格').length;
  const failCount = records.filter((r) => r.evaluation_result === '不合格').length;

  // 按 source_type 分类统计问题点：record_fail=五感、recipe_problem(无assembly)=功能、recipe_problem(有assembly)=对比
  const taskId = report.task_id ? String(report.task_id) : null;
  const sourceIssuesQuery = client.from('issues').select('*').eq('source_report_id', id);
  const taskIssuesQuery = taskId ? client.from('issues').select('*').eq('task_id', taskId) : null;
  const [{ data: sourceIssues }, taskIssuesResult] = await Promise.all([
    sourceIssuesQuery,
    taskIssuesQuery ? taskIssuesQuery : Promise.resolve({ data: [] }),
  ]);
  const issueMap = new Map<string, Record<string, unknown>>();
  for (const issue of [...(sourceIssues || []), ...(taskIssuesResult?.data || [])]) {
    if (!issueMap.has(String(issue.id))) issueMap.set(String(issue.id), issue as Record<string, unknown>);
  }
  const allIssues = Array.from(issueMap.values());
  const issueCount = allIssues.length;
  const recipeCount = recipes.length;

  const sensoryIssueCount = allIssues.filter((i) => i.source_type === 'record_fail').length;
  const functionIssueCount = allIssues.filter((i) => i.source_type === 'recipe_problem' && !i.source_assembly_id).length;
  const comparisonIssueCount = allIssues.filter((i) => i.source_type === 'recipe_problem' && i.source_assembly_id).length;
  // 整改率：已整改(verified_closed/已验证) / 总数
  const rectifiedCount = allIssues.filter((i) => {
    const st = String(i.status || '');
    return st === 'verified_closed' || st === '已验证' || st === '已整改';
  }).length;
  const rectificationRate = issueCount > 0 ? Math.round((rectifiedCount / issueCount) * 100) : 0;

  const stats = {
    totalCheckItems, passCount, failCount, issueCount, recipeCount,
    sensoryIssueCount, functionIssueCount, comparisonIssueCount, rectificationRate,
  };
  const level = pickConclusionLevel(stats);
  const levelTextMap: Record<string, string> = {
    positive: '整体达标',
    neutral: '基本正常',
    risk: '存在风险',
    blocking: '阻断风险',
  };

  let taskInfo: Record<string, unknown> | null = null;
  if (report.task_id) {
    const { data: task } = await client
      .from('experience_tasks')
      .select('*')
      .eq('id', String(report.task_id))
      .maybeSingle();
    taskInfo = task ?? null;
  }

  let matrixType: 'multi_matrix' | 'single_waterfall' | null = null;
  try {
    const { snapshot } = await loadAnchoredReportSnapshot(client, report);
    const snapshotJson = snapshot?.snapshot_json as Record<string, unknown> | undefined;
    const hasComparisonMatrix = Boolean(
      snapshotJson?.objects || snapshotJson?.comparison_objects || (Array.isArray(snapshotJson?.matrix_cells) && snapshotJson.matrix_cells.length > 0),
    );
    matrixType = hasComparisonMatrix ? 'multi_matrix' : recipes.length > 0 ? 'single_waterfall' : null;
  } catch (snapshotError) {
    if (report.snapshot_id) throw snapshotError;
    matrixType = recipes.length > 0 ? 'single_waterfall' : null;
  }

  return NextResponse.json({
    code: 0,
    message: 'success',
    data: {
      aiSummary: aiSummary ?? null,
      taskInfo,
      stats,
      conclusion: {
        level,
        text: levelTextMap[level],
      },
      matrixType,
      generatedAt: content.generated_at ?? report.created_at,
    },
  });
}
