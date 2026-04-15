import { NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

export async function GET() {
  const client = getSupabaseClient();

  // 任务统计
  const { data: tasks } = await client.from('experience_tasks').select('status');
  const taskStats = {
    total: tasks?.length || 0,
    pending: tasks?.filter(t => t.status === '待执行').length || 0,
    inProgress: tasks?.filter(t => t.status === '进行中').length || 0,
    review: tasks?.filter(t => t.status === '待审核').length || 0,
    completed: tasks?.filter(t => t.status === '已完成').length || 0,
    rejected: tasks?.filter(t => t.status === '已驳回').length || 0,
  };

  // 问题统计
  const { data: issues } = await client.from('issues').select('status, severity');
  const issueStats = {
    total: issues?.length || 0,
    pending: issues?.filter(i => i.status === '待整改').length || 0,
    inProgress: issues?.filter(i => i.status === '整改中').length || 0,
    verified: issues?.filter(i => i.status === '已验证').length || 0,
    noImprove: issues?.filter(i => i.status === '不整改').length || 0,
    bySeverity: {
      fatal: issues?.filter(i => i.severity === '致命').length || 0,
      serious: issues?.filter(i => i.severity === '严重').length || 0,
      normal: issues?.filter(i => i.severity === '一般').length || 0,
      minor: issues?.filter(i => i.severity === '轻微').length || 0,
    },
  };

  // 最近任务
  const { data: recentTasks } = await client
    .from('experience_tasks')
    .select('id, task_name, product_model, status, created_at')
    .order('created_at', { ascending: false })
    .limit(5);

  return NextResponse.json({
    code: 0,
    message: 'success',
    data: { taskStats, issueStats, recentTasks: recentTasks || [] },
  });
}
