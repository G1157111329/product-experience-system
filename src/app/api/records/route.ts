import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

export async function GET(request: NextRequest) {
  const client = getSupabaseClient();
  const { searchParams } = new URL(request.url);
  const task_id = searchParams.get('task_id');

  if (!task_id) {
    return NextResponse.json({ code: 1, message: '缺少 task_id' }, { status: 400 });
  }

  const { data, error } = await client
    .from('check_records')
    .select('*, materials(*)')
    .eq('task_id', task_id)
    .order('sort_order', { ascending: true });

  if (error) return NextResponse.json({ code: 1, message: error.message }, { status: 500 });
  return NextResponse.json({ code: 0, message: 'success', data });
}

export async function POST(request: NextRequest) {
  const client = getSupabaseClient();
  const body = await request.json();

  // 批量插入支持（从标准加载检查项时使用）
  if (Array.isArray(body)) {
    const { data, error } = await client.from('check_records').insert(body).select();
    if (error) return NextResponse.json({ code: 1, message: error.message }, { status: 500 });
    return NextResponse.json({ code: 0, message: '批量创建成功', data });
  }

  const { data, error } = await client.from('check_records').insert({
    task_id: body.task_id,
    standard_item_id: body.standard_item_id || null,
    sensory_dimension: body.sensory_dimension,
    test_phase: body.test_phase,
    check_dimension: body.check_dimension,
    check_item: body.check_item,
    check_requirement: body.check_requirement || null,
    evaluation_result: body.evaluation_result || '待定',
    problem_description: body.problem_description || null,
    measurement_position: body.measurement_position || null,
    measurement_value: body.measurement_value || null,
    tester: body.tester || null,
    sort_order: body.sort_order || 0,
  }).select().single();

  if (error) return NextResponse.json({ code: 1, message: error.message }, { status: 500 });

  // 自动更新任务状态为"进行中"
  await client
    .from('experience_tasks')
    .update({ status: '进行中', updated_at: new Date().toISOString() })
    .eq('id', body.task_id)
    .eq('status', '待执行');

  return NextResponse.json({ code: 0, message: '创建成功', data });
}
