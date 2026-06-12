import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { canAccessRecipeStep, isAuthResponse, requireUser } from '@/lib/server/auth';

/** Recalculate and update problem_count for a recipe based on its steps */
async function updateRecipeProblemCount(client: ReturnType<typeof getSupabaseClient>, recipeId: string) {
  const { data: steps } = await client.from('recipe_steps').select('problem_point, problem_points').eq('recipe_id', recipeId);
  let count = 0;
  for (const s of (steps || [])) {
    const pp = s.problem_points;
    if (Array.isArray(pp) && pp.length > 0) {
      count += pp.filter((p: { text: string }) => p.text && p.text.trim() !== '').length;
    } else if (s.problem_point && s.problem_point.trim() !== '') {
      count += 1;
    }
  }
  await client.from('recipes').update({ problem_count: count, updated_at: new Date().toISOString() }).eq('id', recipeId);
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const client = getSupabaseClient();
  const user = await requireUser(request, client);
  if (isAuthResponse(user)) return user;
  if (!(await canAccessRecipeStep(client, user, id))) {
    return NextResponse.json({ code: 1, message: '无权更新该食谱步骤' }, { status: 403 });
  }

  const body = await request.json();

  const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.step_number !== undefined) updateData.step_number = body.step_number;
  if (body.operation !== undefined) updateData.operation = body.operation;
  if (body.problem_point !== undefined) updateData.problem_point = body.problem_point;
  if (body.problem_points !== undefined) updateData.problem_points = body.problem_points;
  if (body.sort_order !== undefined) updateData.sort_order = body.sort_order;

  const { data, error } = await client.from('recipe_steps').update(updateData).eq('id', id).select().single();

  // Update parent recipe's problem_count if step changed
  if (!error && data) {
    const recipeId = (data as Record<string, unknown>).recipe_id as string;
    if (recipeId) await updateRecipeProblemCount(client, recipeId);
  }

  if (error) return NextResponse.json({ code: 1, message: error.message }, { status: 500 });
  return NextResponse.json({ code: 0, message: '更新成功', data });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const client = getSupabaseClient();
  const user = await requireUser(request, client);
  if (isAuthResponse(user)) return user;
  if (!(await canAccessRecipeStep(client, user, id))) {
    return NextResponse.json({ code: 1, message: '无权删除该食谱步骤' }, { status: 403 });
  }

  // Get recipe_id before deleting, so we can update problem_count
  const { data: step } = await client.from('recipe_steps').select('recipe_id').eq('id', id).single();
  const recipeId = (step as Record<string, unknown> | null)?.recipe_id as string | null;

  // Unlink materials associated with this step (don't delete them, just remove the association)
  await client.from('materials').update({ recipe_step_id: null }).eq('recipe_step_id', id);

  const { error } = await client.from('recipe_steps').delete().eq('id', id);

  if (!error && recipeId) await updateRecipeProblemCount(client, recipeId);
  if (error) return NextResponse.json({ code: 1, message: error.message }, { status: 500 });
  return NextResponse.json({ code: 0, message: '删除成功' });
}
