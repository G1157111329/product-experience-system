import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

export async function GET(request: NextRequest) {
  const client = getSupabaseClient();
  const created_by = request.nextUrl.searchParams.get('created_by');

  // 任务统计 - filter by user if created_by provided
  let taskQuery = client.from('experience_tasks').select('status');
  if (created_by) taskQuery = taskQuery.eq('created_by', created_by);
  const { data: tasks } = await taskQuery;

  const taskStats = {
    total: tasks?.length || 0,
    pending: tasks?.filter(t => t.status === '待执行').length || 0,
    inProgress: tasks?.filter(t => t.status === '进行中').length || 0,
    review: tasks?.filter(t => t.status === '待审核').length || 0,
    completed: tasks?.filter(t => t.status === '已完成').length || 0,
    rejected: tasks?.filter(t => t.status === '已驳回').length || 0,
  };

  // 问题统计 - only from user's tasks
  let userTaskIds: string[] = [];
  if (created_by) {
    const { data: userTasks } = await client.from('experience_tasks').select('id').eq('created_by', created_by);
    userTaskIds = (userTasks || []).map(t => t.id);
  }

  // Get reports for user's tasks to find related issues
  const { data: allReports } = await client.from('reports').select('id, task_id');
  const userReportIds = (allReports || [])
    .filter(r => !created_by || userTaskIds.includes(r.task_id))
    .map(r => r.id);

  const { data: issues } = await client.from('issues').select('status, severity, level, source_report_id');
  const userIssues = (issues || []).filter(i => !created_by || userReportIds.includes(i.source_report_id));

  const issueStats = {
    total: userIssues.length,
    pending: userIssues.filter(i => i.status === '待整改').length,
    inProgress: userIssues.filter(i => i.status === '整改中').length,
    verified: userIssues.filter(i => i.status === '已验证').length,
    noImprove: userIssues.filter(i => i.status === '不整改').length,
    bySeverity: {
      fatal: userIssues.filter(i => i.severity === '致命' || i.level === '一类').length,
      serious: userIssues.filter(i => i.severity === '严重' || i.level === '二类').length,
      normal: userIssues.filter(i => i.severity === '一般' || i.level === '三类').length,
      minor: userIssues.filter(i => i.severity === '轻微').length,
    },
  };

  // 最近任务 - filter by user
  let recentQuery = client
    .from('experience_tasks')
    .select('id, task_name, product_model, status, created_at')
    .order('created_at', { ascending: false })
    .limit(5);
  if (created_by) recentQuery = recentQuery.eq('created_by', created_by);
  const { data: recentTasks } = await recentQuery;

  return NextResponse.json({
    code: 0,
    message: 'success',
    data: { taskStats, issueStats, recentTasks: recentTasks || [] },
  });
}
