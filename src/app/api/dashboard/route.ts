import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

export async function GET(request: NextRequest) {
  const client = getSupabaseClient();
  const created_by = request.nextUrl.searchParams.get('created_by');

  // 任务统计
  let taskQuery = client.from('experience_tasks').select('id, status, created_at');
  if (created_by) taskQuery = taskQuery.eq('created_by', created_by);
  const { data: tasks } = await taskQuery;

  const totalTasks = tasks?.length || 0;
  const completedTasks = tasks?.filter(t => t.status === '已完成').length || 0;

  // 问题统计 - from user's task reports
  let userTaskIds: string[] = [];
  if (created_by) {
    userTaskIds = (tasks || []).map(t => t.id);
  }

  const { data: allReports } = await client.from('reports').select('id, task_id');
  const userReportIds = (allReports || [])
    .filter(r => !created_by || userTaskIds.includes(r.task_id))
    .map(r => r.id);

  const { data: issues } = await client.from('issues').select('id, status, level, source_report_id, title, created_at');
  const userIssues = (issues || []).filter(i => !created_by || userReportIds.includes(i.source_report_id));

  const totalIssues = userIssues.length;
  const resolvedIssues = userIssues.filter(i => i.status === '已验证').length;

  // 最近任务
  let recentQuery = client
    .from('experience_tasks')
    .select('id, task_name, product_category, product, status, created_at')
    .order('created_at', { ascending: false })
    .limit(5);
  if (created_by) recentQuery = recentQuery.eq('created_by', created_by);
  const { data: recentTasks } = await recentQuery;

  // 最近问题
  const recentIssues = userIssues
    .sort((a: { created_at: string }, b: { created_at: string }) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 5)
    .map((i: { id: string; title: string; status: string; level: string | null; created_at: string }) => ({
      id: i.id,
      title: i.title,
      status: i.status,
      level: i.level || '',
      created_at: i.created_at,
    }));

  return NextResponse.json({
    code: 0,
    message: 'success',
    data: {
      totalTasks,
      completedTasks,
      totalIssues,
      resolvedIssues,
      recentTasks: recentTasks || [],
      recentIssues: recentIssues || [],
    },
  });
}
