import { NextRequest, NextResponse } from 'next/server';
import { asc, eq, ilike, inArray } from 'drizzle-orm';
import { getDb } from '@/storage/database/pg-db';
import { recipeSteps, recipes } from '@/storage/database/shared/schema';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { canAccessRecipe, canAccessTask, isAuthResponse, requireUser } from '@/lib/server/auth';
import { normalizeIngredientItems } from '@/lib/task-context-contract';

function toApiStep(step: typeof recipeSteps.$inferSelect) {
  return {
    id: step.id,
    recipe_id: step.recipeId,
    step_number: step.stepNumber,
    operation: step.operation,
    problem_point: step.problemPoint,
    sort_order: step.sortOrder,
    created_at: step.createdAt,
    updated_at: step.updatedAt,
    problem_points: step.problemPoints,
  };
}

function toApiRecipe(recipe: typeof recipes.$inferSelect, steps: Array<typeof recipeSteps.$inferSelect> = []) {
  return {
    id: recipe.id,
    task_id: recipe.taskId,
    name: recipe.name,
    ingredients: recipe.ingredients,
    ingredient_items: recipe.ingredientItems,
    recipe_type: recipe.recipeType,
    problem_count: recipe.problemCount,
    created_at: recipe.createdAt,
    updated_at: recipe.updatedAt,
    sort_order: recipe.sortOrder,
    effect_description: recipe.effectDescription,
    effect_score: recipe.effectScore,
    effect_problem_point: recipe.effectProblemPoint,
    effect_ai_result: recipe.effectAiResult,
    recipe_steps: steps.map(toApiStep),
  };
}

async function loadRecipesWithSteps(recipeRows: Array<typeof recipes.$inferSelect>) {
  if (recipeRows.length === 0) return [];

  const db = getDb();
  const recipeIds = recipeRows.map((recipe) => recipe.id);
  const steps = await db
    .select()
    .from(recipeSteps)
    .where(inArray(recipeSteps.recipeId, recipeIds))
    .orderBy(asc(recipeSteps.stepNumber), asc(recipeSteps.sortOrder));
  const stepsByRecipeId = new Map<string, Array<typeof recipeSteps.$inferSelect>>();
  for (const step of steps) {
    const bucket = stepsByRecipeId.get(step.recipeId) || [];
    bucket.push(step);
    stepsByRecipeId.set(step.recipeId, bucket);
  }
  return recipeRows.map((recipe) => toApiRecipe(recipe, stepsByRecipeId.get(recipe.id) || []));
}

export async function GET(request: NextRequest) {
  const db = getDb();
  const client = getSupabaseClient();
  const user = await requireUser(request, client);
  if (isAuthResponse(user)) return user;

  const { searchParams } = new URL(request.url);
  const taskId = searchParams.get('task_id');
  const keyword = searchParams.get('keyword')?.trim();
  const library = searchParams.get('library');

  if (library) {
    const recipeRows = keyword
      ? await db.select().from(recipes).where(ilike(recipes.name, `%${keyword}%`)).orderBy(asc(recipes.sortOrder))
      : await db.select().from(recipes).orderBy(asc(recipes.sortOrder));
    const data = await loadRecipesWithSteps(recipeRows.slice(0, 50));
    return NextResponse.json({ code: 0, message: 'success', data });
  }

  if (!taskId) return NextResponse.json({ code: 1, message: '缺少 task_id' }, { status: 400 });

  if (!(await canAccessTask(client, user, taskId))) {
    return NextResponse.json({ code: 1, message: '无权访问该任务' }, { status: 403 });
  }

  const recipeRows = await db
    .select()
    .from(recipes)
    .where(eq(recipes.taskId, taskId))
    .orderBy(asc(recipes.sortOrder), asc(recipes.createdAt));
  const data = await loadRecipesWithSteps(recipeRows);
  return NextResponse.json({ code: 0, message: 'success', data });
}

export async function POST(request: NextRequest) {
  const db = getDb();
  const client = getSupabaseClient();
  const user = await requireUser(request, client);
  if (isAuthResponse(user)) return user;

  const body = await request.json();
  if (!body.task_id || !(await canAccessTask(client, user, String(body.task_id)))) {
    return NextResponse.json({ code: 1, message: '无权访问该任务' }, { status: 403 });
  }

  const [recipe] = await db.insert(recipes).values({
    taskId: body.task_id,
    name: body.name,
    ingredients: body.ingredients || null,
    ingredientItems: normalizeIngredientItems(body.ingredient_items),
    recipeType: body.recipe_type || '食谱',
  }).returning();

  return NextResponse.json({ code: 0, message: '创建成功', data: toApiRecipe(recipe) });
}

export async function PUT(request: NextRequest) {
  const db = getDb();
  const client = getSupabaseClient();
  const user = await requireUser(request, client);
  if (isAuthResponse(user)) return user;

  const body = await request.json();

  if (body.recipes && Array.isArray(body.recipes)) {
    for (const item of body.recipes) {
      if (!item?.id || !(await canAccessRecipe(client, user, String(item.id)))) {
        return NextResponse.json({ code: 1, message: '无权更新该食谱排序' }, { status: 403 });
      }
    }
    await db.transaction(async (tx) => {
      for (const item of body.recipes) {
        await tx
          .update(recipes)
          .set({ sortOrder: item.sort_order })
          .where(eq(recipes.id, item.id));
      }
    });
    return NextResponse.json({ code: 0, message: '排序已更新' });
  }

  return NextResponse.json({ code: 1, message: '参数不完整' }, { status: 400 });
}
