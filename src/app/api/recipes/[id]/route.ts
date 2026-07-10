import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { canAccessRecipe, isAuthResponse, requireUser } from '@/lib/server/auth';
import { normalizeIngredientItems } from '@/lib/task-context-contract';

function collectProblemPointMaterialIds(value: unknown): string[] {
  if (!value) return [];
  try {
    const parsed: unknown = typeof value === 'string' ? JSON.parse(value) : value;
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((item) => {
      if (!item || typeof item !== 'object') return [];
      const materialIds = (item as Record<string, unknown>).material_ids;
      return Array.isArray(materialIds)
        ? materialIds.filter((id): id is string => typeof id === 'string' && id.trim() !== '')
        : [];
    });
  } catch {
    return [];
  }
}

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

  // Fetch effect materials (linked via recipe_id)
  const { data: effectMaterials } = await client
    .from('materials')
    .select('*')
    .eq('recipe_id', id);

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

  // Update recipe basic fields + effect fields
  const updateData: Record<string, unknown> = {
    name: body.name,
    ingredients: body.ingredients,
    recipe_type: body.recipe_type,
    problem_count: body.problem_count,
    updated_at: new Date().toISOString(),
  };
  if (body.ingredient_items !== undefined) {
    updateData.ingredient_items = normalizeIngredientItems(body.ingredient_items);
  }

  // Effect evaluation fields
  if (body.effect_description !== undefined) updateData.effect_description = body.effect_description;
  if (body.effect_score !== undefined) updateData.effect_score = body.effect_score;
  if (body.effect_problem_point !== undefined) updateData.effect_problem_point = body.effect_problem_point;
  if (body.effect_ai_result !== undefined) updateData.effect_ai_result = body.effect_ai_result;

  const { data, error } = await client.from('recipes').update(updateData).eq('id', id).select().single();

  if (error) return NextResponse.json({ code: 1, message: error.message }, { status: 500 });

  // Handle effect material linking/unlinking
  if (body.effect_material_ids !== undefined) {
    const effectMaterialIds = Array.isArray(body.effect_material_ids)
      ? body.effect_material_ids.filter((matId: unknown): matId is string => typeof matId === 'string' && matId.trim() !== '')
      : [];
    const problemPointMaterialIds = collectProblemPointMaterialIds(body.effect_problem_point);
    const materialIdsToLink = [...new Set([...effectMaterialIds, ...problemPointMaterialIds])];

    // First, unlink all current effect materials for this recipe
    await client.from('materials').update({ recipe_id: null }).eq('recipe_id', id);

    // Then link the new ones
    if (materialIdsToLink.length > 0) {
      for (const matId of materialIdsToLink) {
        await client.from('materials').update({ recipe_id: id }).eq('id', matId);
      }
    }
  }

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

  // Unlink effect materials first
  await client.from('materials').update({ recipe_id: null }).eq('recipe_id', id);

  // Unlink all step materials for this recipe's steps
  const { data: steps } = await client.from('recipe_steps').select('id').eq('recipe_id', id);
  const stepIds = ((steps || []) as Array<{ id: string }>).map((s) => s.id);
  if (stepIds.length > 0) {
    await client.from('materials').update({ recipe_step_id: null }).in('recipe_step_id', stepIds);
  }

  const { error } = await client.from('recipes').delete().eq('id', id);
  if (error) return NextResponse.json({ code: 1, message: error.message }, { status: 500 });
  return NextResponse.json({ code: 0, message: '删除成功' });
}
