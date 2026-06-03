import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

type CsvValue = string | number | boolean | null | undefined;

function csvEscape(value: CsvValue): string {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

export async function GET(request: NextRequest) {
  const client = getSupabaseClient();
  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status');
  const level = searchParams.get('level');
  const taskIdsParam = searchParams.get('task_ids');
  const limit = Math.min(parseInt(searchParams.get('limit') || '500', 10), 2000);

  let query = client.from('issues').select('*');
  if (status) query = query.eq('status', status);
  if (level) query = query.eq('level', level);
  if (taskIdsParam) {
    const taskIds = taskIdsParam.split(',').filter(Boolean);
    if (taskIds.length > 0) query = query.in('task_id', taskIds);
  }

  const { data: issues, error } = await query.order('created_at', { ascending: false }).limit(limit);
  if (error) return NextResponse.json({ code: 1, message: error.message }, { status: 500 });

  const issueRows = (issues || []) as Array<Record<string, CsvValue>>;
  const taskIds = [...new Set(issueRows.map((issue) => String(issue.task_id || '')).filter(Boolean))];
  const taskMap = new Map<string, Record<string, CsvValue>>();

  if (taskIds.length > 0) {
    const { data: tasks } = await client
      .from('experience_tasks')
      .select('id, task_name, product_category, product, product_model, project_number')
      .in('id', taskIds);
    for (const task of (tasks || []) as Array<Record<string, CsvValue>>) {
      taskMap.set(String(task.id), task);
    }
  }

  const headers = [
    '项目单号',
    '任务名称',
    '问题标题',
    '等级',
    '状态',
    '来源类型',
    '品类',
    '产品',
    '产品型号',
    '整改方案',
    '责任人',
    '创建时间',
  ];

  const rows = issueRows.map((issue) => {
    const task = taskMap.get(String(issue.task_id || '')) || {};
    return [
      task.project_number,
      task.task_name,
      issue.title,
      issue.level,
      issue.status,
      issue.source_type,
      task.product_category,
      task.product,
      issue.product_model || task.product_model,
      issue.improve_plan,
      issue.responsible_person,
      issue.created_at,
    ].map(csvEscape).join(',');
  });

  return NextResponse.json({
    code: 0,
    data: {
      csv: `${headers.join(',')}\n${rows.join('\n')}`,
      count: issueRows.length,
    },
  });
}
