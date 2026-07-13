import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { isAuthResponse, requireUser } from '@/lib/server/auth';
import { getPool } from '@/storage/database/pg-db';

type DashboardRow = {
  id: string;
  status?: string | null;
  level?: string | null;
  source_report_id?: string | null;
  task_id?: string | null;
  title?: string | null;
  created_at: string;
};

export async function GET(request: NextRequest) {
  const client = getSupabaseClient();
  const user = await requireUser(request, client);
  if (isAuthResponse(user)) return user;
  const requestedCreatedBy = request.nextUrl.searchParams.get('created_by');
  const created_by = user.role === 'admin' ? requestedCreatedBy : user.id;

  const params: unknown[] = [];
  const ownerWhere = created_by ? `WHERE created_by = $${params.push(created_by)}` : '';
  const issueOwnerWhere = created_by ? `WHERE t.created_by = $${params.length}` : '';
  const pool = getPool();

  const { rows: metricRows } = await pool.query<{
    total_tasks: string;
    completed_tasks: string;
    total_issues: string;
    resolved_issues: string;
  }>(
    `
    WITH task_metrics AS (
      SELECT
        count(*)::text AS total_tasks,
        count(*) FILTER (WHERE status = '已完成')::text AS completed_tasks
      FROM experience_tasks
      ${ownerWhere}
    ),
    issue_metrics AS (
      SELECT
        count(i.id)::text AS total_issues,
        count(i.id) FILTER (WHERE i.status IN ('verified_closed', '已验证', '已验证关闭', '已整改', '整改完成'))::text AS resolved_issues
      FROM issues i
      JOIN experience_tasks t ON t.id = i.task_id
      ${issueOwnerWhere}
    )
    SELECT *
    FROM task_metrics
    CROSS JOIN issue_metrics
    `,
    params,
  );
  const metrics = metricRows[0] || { total_tasks: '0', completed_tasks: '0', total_issues: '0', resolved_issues: '0' };
  const totalTasks = Number(metrics.total_tasks);
  const completedTasks = Number(metrics.completed_tasks);
  const totalIssues = Number(metrics.total_issues);
  const resolvedIssues = Number(metrics.resolved_issues);

  // 最近任务
  let recentQuery = client
    .from('experience_tasks')
    .select('id, task_name, product_category, product, status, created_at')
    .order('created_at', { ascending: false })
    .limit(5);
  if (created_by) recentQuery = recentQuery.eq('created_by', created_by);
  const { data: recentTasks } = await recentQuery;

  // 最近问题
  const { rows: recentIssueRows } = await pool.query<DashboardRow>(
    `
    SELECT i.id, i.title,
      CASE
        WHEN i.status IN ('verified_closed', '已验证', '已验证关闭', '已整改', '整改完成') THEN 'verified_closed'
        WHEN i.status IN ('waived', '不整改') THEN 'waived'
        WHEN i.status IN ('rectifying', 'pending_verification', 'reopened', '整改中', '待验证', '已重开') THEN 'rectifying'
        ELSE 'open'
      END AS status,
      i.level, i.created_at
    FROM issues i
    JOIN experience_tasks t ON t.id = i.task_id
    ${issueOwnerWhere}
    ORDER BY i.created_at DESC
    LIMIT 5
    `,
    params,
  );
  const recentIssues = recentIssueRows.map((i) => ({
    id: i.id,
    title: i.title || '',
    status: i.status || '',
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
