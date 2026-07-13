import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { canAccessRecipe, isAuthResponse, requireUser } from '@/lib/server/auth';
import { normalizeIngredientItems } from '@/lib/task-context-contract';
import { normalizeEvaluationStatus } from '@/lib/evaluation-status';
import { classifyRecipeEvaluationSaveError, saveRecipeEvaluation } from '@/lib/server/recipe-evaluation-save';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const client = getSupabaseClient();
  const user = await requireUser(request, client);
  if (isAuthResponse(user)) return user;
  if (!(await canAccessRecipe(client, user, id))) {
    return NextResponse.json({ code: 1, message: '无权访问该食谱' }, { status: 403 });
  }

  const { data, error } = await client
    .from('recipes')
    .select('*, recipe_steps(*)')
    .order('step_number', { referencedTable: 'recipe_steps', ascending: true })
    .eq('id', id)
    .single();
  if (error) return NextResponse.json({ code: 1, message: error.message }, { status: 404 });

  const { data: effectMaterials } = await client.from('materials').select('*').eq('recipe_id', id);
  return NextResponse.json({
    code: 0,
    message: 'success',
    data: { ...data, effect_materials: effectMaterials || [] },
  });
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const client = getSupabaseClient();
  const user = await requireUser(request, client);
  if (isAuthResponse(user)) return user;
  if (!(await canAccessRecipe(client, user, id))) {
    return NextResponse.json({ code: 1, message: '无权更新该食谱' }, { status: 403 });
  }

  const body = await request.json();
  const hasEvaluationUpdate = body.effect_description !== undefined
    || body.effect_status !== undefined
    || body.effect_material_ids !== undefined;

  if (hasEvaluationUpdate) {
    if (body.effect_material_ids !== undefined && !Array.isArray(body.effect_material_ids)) {
      return NextResponse.json({ code: 1, message: '素材列表格式错误' }, { status: 400 });
    }
    try {
      const saved = await saveRecipeEvaluation(client, {
        recipeId: id,
        status: body.effect_status === undefined ? undefined : normalizeEvaluationStatus(body.effect_status),
        description: body.effect_description === undefined ? undefined : String(body.effect_description || ''),
        materialIds: body.effect_material_ids === undefined
          ? undefined
          : body.effect_material_ids.filter((value: unknown): value is string => typeof value === 'string'),
        name: body.name === undefined ? undefined : String(body.name),
        ingredients: body.ingredients === undefined ? undefined : body.ingredients === null ? null : String(body.ingredients),
        recipeType: body.recipe_type === undefined ? undefined : String(body.recipe_type),
        problemCount: body.problem_count === undefined ? undefined : Number(body.problem_count),
        ingredientItems: body.ingredient_items === undefined ? undefined : normalizeIngredientItems(body.ingredient_items),
      });
      return NextResponse.json({
        code: 0,
        message: '更新成功',
        data: { ...saved.recipe, effect_materials: saved.materials },
      });
    } catch (saveError) {
      const classified = classifyRecipeEvaluationSaveError(saveError);
      if (classified.log) console.error('[recipes] atomic evaluation save failed', saveError);
      return NextResponse.json({ code: 1, message: classified.message }, { status: classified.status });
    }
  }

  const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.name !== undefined) updateData.name = body.name;
  if (body.ingredients !== undefined) updateData.ingredients = body.ingredients;
  if (body.recipe_type !== undefined) updateData.recipe_type = body.recipe_type;
  if (body.problem_count !== undefined) updateData.problem_count = body.problem_count;
  if (body.ingredient_items !== undefined) updateData.ingredient_items = normalizeIngredientItems(body.ingredient_items);

  const { data, error } = await client.from('recipes').update(updateData).eq('id', id).select().single();
  if (error) return NextResponse.json({ code: 1, message: error.message }, { status: 500 });
  return NextResponse.json({ code: 0, message: '更新成功', data });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const client = getSupabaseClient();
  const user = await requireUser(request, client);
  if (isAuthResponse(user)) return user;
  if (!(await canAccessRecipe(client, user, id))) {
    return NextResponse.json({ code: 1, message: '无权删除该食谱' }, { status: 403 });
  }

  await client.from('materials').update({ recipe_id: null }).eq('recipe_id', id);
  const { data: steps } = await client.from('recipe_steps').select('id').eq('recipe_id', id);
  const stepIds = ((steps || []) as Array<{ id: string }>).map((step) => step.id);
  if (stepIds.length > 0) {
    await client.from('materials').update({ recipe_step_id: null }).in('recipe_step_id', stepIds);
  }

  const { error } = await client.from('recipes').delete().eq('id', id);
  if (error) return NextResponse.json({ code: 1, message: error.message }, { status: 500 });
  return NextResponse.json({ code: 0, message: '删除成功' });
}
