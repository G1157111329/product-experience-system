import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { canAccessTask, forbidden, isAuthResponse, isRecipeContextInTask, requireUser } from '@/lib/server/auth';

export async function GET(request: NextRequest) {
  const client = getSupabaseClient();
  const user = await requireUser(request, client);
  if (isAuthResponse(user)) return user;

  const { searchParams } = new URL(request.url);
  const task_id = searchParams.get('task_id');
  if (task_id && !(await canAccessTask(client, user, task_id))) return forbidden();

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
  const user = await requireUser(request, client);
  if (isAuthResponse(user)) return user;

  const body = await request.json();
  const targetTaskId = Array.isArray(body) ? body[0]?.task_id : body.task_id;
  if (!targetTaskId || !(await canAccessTask(client, user, targetTaskId))) return forbidden();

  // 批量插入支持（从标准加载检查项时使用）
  if (Array.isArray(body)) {
    if (!body.every((row) => row?.task_id === targetTaskId)) return forbidden();
    const contextsAreValid = (await Promise.all(body.map((row) => isRecipeContextInTask(
      client,
      targetTaskId,
      row.recipe_id,
      row.recipe_step_id,
    )))).every(Boolean);
    if (!contextsAreValid) {
      return NextResponse.json({ code: 1, message: '食谱或步骤不属于当前体验计划' }, { status: 400 });
    }
    const rows = body.map((row) => ({ ...row, evaluation_result: row.evaluation_result || '待定' }));
    const { data, error } = await client.from('check_records').insert(rows).select();
    if (error) return NextResponse.json({ code: 1, message: error.message }, { status: 500 });
    return NextResponse.json({ code: 0, message: '批量创建成功', data });
  }

  if (!(await isRecipeContextInTask(client, body.task_id, body.recipe_id, body.recipe_step_id))) {
    return NextResponse.json({ code: 1, message: '食谱或步骤不属于当前体验计划' }, { status: 400 });
  }

  const { data, error } = await client.from('check_records').insert({
    task_id: body.task_id,
    standard_item_id: body.standard_item_id || null,
    standard_category: body.standard_category || null,
    sensory_dimension: body.sensory_dimension || null,
    test_phase: body.test_phase || null,
    experience_flow: body.experience_flow || null,
    touch_point: body.touch_point || null,
    check_dimension: body.check_dimension || null,
    sub_check_dimension: body.sub_check_dimension || null,
    check_item: body.check_item,
    check_requirement: body.check_requirement || null,
    check_standard: body.check_standard || null,
    experience_standard: body.experience_standard || null,
    evaluation_result: body.evaluation_result || '待定',
    problem_description: body.problem_description || null,
    measurement_position: body.measurement_position || null,
    measurement_value: body.measurement_value || null,
    tester: body.tester || null,
    recipe_id: body.recipe_id || null,
    recipe_step_id: body.recipe_step_id || null,
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
