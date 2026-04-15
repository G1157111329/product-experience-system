import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

export async function GET(request: NextRequest) {
  const client = getSupabaseClient();
  const { searchParams } = new URL(request.url);
  const task_id = searchParams.get('task_id');

  let query = client.from('reports').select('*');
  if (task_id) query = query.eq('task_id', task_id);

  const { data, error } = await query.order('created_at', { ascending: false });
  if (error) return NextResponse.json({ code: 1, message: error.message }, { status: 500 });
  return NextResponse.json({ code: 0, message: 'success', data });
}

export async function POST(request: NextRequest) {
  const client = getSupabaseClient();
  const body = await request.json();

  // 自动生成报告 - 从任务和记录中填充内容
  const { data: task } = await client.from('experience_tasks').select('*').eq('id', body.task_id).single();
  const { data: records } = await client.from('check_records').select('*').eq('task_id', body.task_id);
  const { data: issues } = await client.from('issues').select('*').eq('task_id', body.task_id);

  const reportContent = {
    task: task,
    records: records || [],
    issues: issues || [],
    generatedAt: new Date().toISOString(),
  };

  const { data, error } = await client.from('reports').insert({
    task_id: body.task_id,
    template_id: body.template_id || null,
    title: body.title || `${task?.task_name || '体验'}报告`,
    content: reportContent,
    status: '草稿',
  }).select().single();

  if (error) return NextResponse.json({ code: 1, message: error.message }, { status: 500 });
  return NextResponse.json({ code: 0, message: '报告生成成功', data });
}
