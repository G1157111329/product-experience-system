import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { canAccessRecipe, canAccessRecipeStep, isAuthResponse, requireUser } from '@/lib/server/auth';
import { normalizeStepParameters } from '@/lib/task-context-contract';

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
    sort_order: body.sort_order || 0,
    parameters: normalizeStepParameters(body.parameters),
  }).select().single();

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
