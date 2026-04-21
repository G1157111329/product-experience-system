import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

export async function GET(request: NextRequest) {
  const client = getSupabaseClient();
  const { searchParams } = new URL(request.url);
  const task_id = searchParams.get('task_id');
  const created_by = searchParams.get('created_by'); // filter by user's tasks

  // Step 1: If created_by filter, get user's task IDs first
  let userTaskIds: string[] = [];
  if (created_by) {
    const { data: userTasks } = await client.from('experience_tasks').select('id').eq('created_by', created_by);
    userTaskIds = (userTasks || []).map((t: { id: string }) => t.id);
  }

  let query = client.from('reports').select('*');
  if (task_id) query = query.eq('task_id', task_id);

  const { data, error } = await query.order('created_at', { ascending: false });
  if (error) return NextResponse.json({ code: 1, message: error.message }, { status: 500 });

  let reports = data || [];

  // If created_by filter, filter reports by user's task IDs
  if (created_by && userTaskIds.length > 0) {
    reports = reports.filter((r: { task_id: string }) => userTaskIds.includes(r.task_id));
  } else if (created_by) {
    reports = []; // user has no tasks
  }

  // Enrich with task info for grouping
  const taskIds = [...new Set(reports.map((r: { task_id: string }) => r.task_id))];
  const { data: tasks } = await client.from('experience_tasks').select('id, task_name, product_category, product, project_type, project_phase, created_by').in('id', taskIds);
  const taskMap: Record<string, Record<string, unknown>> = Object.fromEntries((tasks || []).map((t: Record<string, unknown>) => [t.id as string, t]));

  const enriched = reports.map((r: Record<string, unknown>) => {
    const taskInfo = taskMap[r.task_id as string] || {};
    return {
      ...r,
      task_name: taskInfo.task_name || '',
      product_category: taskInfo.product_category || null,
      product: taskInfo.product || null,
      project_type: taskInfo.project_type || null,
      project_phase: taskInfo.project_phase || null,
      task_created_by: taskInfo.created_by || null,
    };
  });

  return NextResponse.json({ code: 0, message: 'success', data: enriched });
}

export async function POST(request: NextRequest) {
  const client = getSupabaseClient();
  const body = await request.json();

  // 自动生成报告 - 从任务和记录中填充内容
  const { data: task } = await client.from('experience_tasks').select('*').eq('id', body.task_id).single();
  const { data: rawRecords } = await client.from('check_records').select('*').eq('task_id', body.task_id);
  const { data: issues } = await client.from('issues').select('*').eq('task_id', body.task_id);
  const { data: materials } = await client.from('materials').select('*').eq('task_id', body.task_id);

  // Enrich records with their associated materials
  const recordsWithMaterials = await Promise.all(
    (rawRecords || []).map(async (record: Record<string, unknown>) => {
      const { data: recordMaterials } = await client.from('materials').select('*').eq('record_id', record.id);
      return { ...record, materials: recordMaterials || [] };
    })
  );

  // 查询食谱/功能及其步骤
  const { data: recipes } = await client.from('recipes').select('*').eq('task_id', body.task_id);
  const recipesWithSteps = await Promise.all(
    (recipes || []).map(async (recipe: Record<string, unknown>) => {
      const { data: steps } = await client.from('recipe_steps').select('*').eq('recipe_id', recipe.id).order('step_number', { ascending: true });
      const stepsWithMaterials = await Promise.all(
        (steps || []).map(async (step: Record<string, unknown>) => {
          const { data: stepMaterials } = await client.from('materials').select('*').eq('recipe_step_id', step.id);
          return { ...step, materials: stepMaterials || [] };
        })
      );
      return { ...recipe, recipe_steps: stepsWithMaterials };
    })
  );

  const recipesWithCount = (recipesWithSteps || []).map((recipe: Record<string, unknown>) => {
    const steps = (recipe.recipe_steps || []) as Array<Record<string, unknown>>;
    let computedProblemCount = 0;
    for (const s of steps) {
      const pp = s.problem_points;
      if (Array.isArray(pp) && pp.length > 0) {
        computedProblemCount += pp.filter((p: { text: string }) => p.text && p.text.trim() !== '').length;
      } else if (s.problem_point && String(s.problem_point).trim() !== '') {
        computedProblemCount += 1;
      }
    }
    return { ...recipe, problem_count: computedProblemCount };
  });

  const reportContent = {
    task: task,
    records: recordsWithMaterials || [],
    issues: issues || [],
    recipes: recipesWithCount || [],
    materials: materials || [],
    generatedAt: new Date().toISOString(),
  };

  const { data, error } = await client.from('reports').insert({
    task_id: body.task_id,
    template_id: body.template_id || null,
    title: body.title || `${task?.task_name || '体验'}报告`,
    product_model: task?.product_model || null,
    content: reportContent,
    status: '草稿',
  }).select().single();

  if (error) return NextResponse.json({ code: 1, message: error.message }, { status: 500 });
  return NextResponse.json({ code: 0, message: '报告生成成功', data });
}
