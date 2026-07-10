import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { canAccessRecipe, canAccessRecipeStep, isAuthResponse, requireUser } from '@/lib/server/auth';
import { normalizeStepParameters } from '@/lib/task-context-contract';

/** Recalculate and update problem_count for a recipe based on its steps */
async function updateRecipeProblemCount(client: ReturnType<typeof getSupabaseClient>, recipeId: string) {
  const { data: steps } = await client.from('recipe_steps').select('problem_point, problem_points').eq('recipe_id', recipeId);
  let count = 0;
  for (const s of (steps || [])) {
    // Count from problem_points array (new) or fallback to problem_point (legacy)
    const pp = s.problem_points;
    if (Array.isArray(pp) && pp.length > 0) {
      count += pp.filter((p: { text: string }) => p.text && p.text.trim() !== '').length;
    } else if (s.problem_point && s.problem_point.trim() !== '') {
      count += 1;
    }
  }
  await client.from('recipes').update({ problem_count: count, updated_at: new Date().toISOString() }).eq('id', recipeId);
}

export async function GET(request: NextRequest) {
  const client = getSupabaseClient();
  const user = await requireUser(request, client);
  if (isAuthResponse(user)) return user;

  const { searchParams } = new URL(request.url);
  const recipe_id = searchParams.get('recipe_id');
  if (!recipe_id) return NextResponse.json({ code: 1, message: '缺少 recipe_id' }, { status: 400 });

  if (!(await canAccessRecipe(client, user, recipe_id))) {
    return NextResponse.json({ code: 1, message: '无权访问该食谱步骤' }, { status: 403 });
  }

  const { data, error } = await client
    .from('recipe_steps')
    .select('*')
    .eq('recipe_id', recipe_id)
    .order('step_number', { ascending: true });

  if (error) return NextResponse.json({ code: 1, message: error.message }, { status: 500 });
  return NextResponse.json({ code: 0, message: 'success', data });
}

export async function POST(request: NextRequest) {
  const client = getSupabaseClient();
  const user = await requireUser(request, client);
  if (isAuthResponse(user)) return user;

  const body = await request.json();
  if (!body.recipe_id || !(await canAccessRecipe(client, user, String(body.recipe_id)))) {
    return NextResponse.json({ code: 1, message: '无权创建该食谱步骤' }, { status: 403 });
  }

  const { data, error } = await client.from('recipe_steps').insert({
    recipe_id: body.recipe_id,
    step_number: body.step_number || 1,
    operation: body.operation,
    problem_point: body.problem_point || null,
    problem_points: body.problem_points || [],
    sort_order: body.sort_order || 0,
    parameters: normalizeStepParameters(body.parameters),
  }).select().single();

  if (!error && data) await updateRecipeProblemCount(client, body.recipe_id);
  if (error) return NextResponse.json({ code: 1, message: error.message }, { status: 500 });
  return NextResponse.json({ code: 0, message: '创建成功', data });
}

/** Batch reorder steps */
export async function PUT(request: NextRequest) {
  const client = getSupabaseClient();
  const user = await requireUser(request, client);
  if (isAuthResponse(user)) return user;

  const body = await request.json();
  const { steps } = body as { steps: Array<{ id: string; step_number: number }> };
  if (!steps || !Array.isArray(steps)) return NextResponse.json({ code: 1, message: '参数不完整' }, { status: 400 });

  for (const step of steps) {
    if (!step?.id || !(await canAccessRecipeStep(client, user, String(step.id)))) {
      return NextResponse.json({ code: 1, message: '无权更新该食谱步骤' }, { status: 403 });
    }
  }

  for (const step of steps) {
    await client.from('recipe_steps').update({ step_number: step.step_number, updated_at: new Date().toISOString() }).eq('id', step.id);
  }
  return NextResponse.json({ code: 0, message: '排序已更新' });
}
