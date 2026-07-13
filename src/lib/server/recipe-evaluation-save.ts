import type { EvaluationStatus } from '@/lib/evaluation-status';

type RpcClient = {
  rpc?: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error?: { message?: string } | null }>;
};

export type RecipeEvaluationSaveResult = {
  recipe: { id: string; effect_status: EvaluationStatus; effect_description: string | null; [key: string]: unknown };
  materials: Array<Record<string, unknown>>;
};

export type ClassifiedRecipeEvaluationSaveError = {
  status: 400 | 404 | 409 | 500;
  message: string;
  log: boolean;
};

class RecipeEvaluationSaveError extends Error {
  constructor(readonly classified: ClassifiedRecipeEvaluationSaveError, readonly causeValue: unknown) {
    super(classified.message);
  }
}

export function classifyRecipeEvaluationSaveError(error: unknown): ClassifiedRecipeEvaluationSaveError {
  if (error instanceof RecipeEvaluationSaveError) return error.classified;
  const message = error instanceof Error ? error.message.toLowerCase() : String(error || '').toLowerCase();
  if (message.includes('recipe not found') || message.includes('recipe update affected zero rows')) return { status: 404, message: '食谱不存在', log: false };
  if (message.includes('invalid evaluation status') || message.includes('material_ids must be an array')) return { status: 400, message: '评价状态格式错误', log: false };
  if (message.includes('invalid or occupied recipe material')) return { status: 409, message: '所选素材不可用于当前食谱，请刷新后重试', log: false };
  return { status: 500, message: '效果评价保存失败', log: true };
}

function stable(error: unknown) {
  return error instanceof RecipeEvaluationSaveError ? error : new RecipeEvaluationSaveError(classifyRecipeEvaluationSaveError(error), error);
}

export async function saveRecipeEvaluation(
  client: RpcClient,
  input: {
    recipeId: string;
    status?: EvaluationStatus;
    description?: string;
    materialIds?: string[];
    name?: string;
    ingredients?: string | null;
    recipeType?: string;
    problemCount?: number;
    ingredientItems?: unknown[];
  },
): Promise<RecipeEvaluationSaveResult> {
  const command: Record<string, unknown> = { recipe_id: input.recipeId };
  if (input.status !== undefined) command.effect_status = input.status;
  if (input.description !== undefined) command.effect_description = input.description;
  if (input.materialIds !== undefined) {
    command.material_ids = [...new Set(input.materialIds.map((id) => id.trim()).filter(Boolean))];
  }
  if (input.name !== undefined) command.name = input.name;
  if (input.ingredients !== undefined) command.ingredients = input.ingredients;
  if (input.recipeType !== undefined) command.recipe_type = input.recipeType;
  if (input.problemCount !== undefined) command.problem_count = input.problemCount;
  if (input.ingredientItems !== undefined) command.ingredient_items = input.ingredientItems;
  try {
    let data: unknown;
    let error: { message?: string } | null | undefined;
    if (typeof client.rpc === 'function') {
      ({ data, error } = await client.rpc('save_recipe_evaluation', { p_command: command }));
    } else {
      const { getPool } = await import('@/storage/database/pg-db');
      const result = await getPool().query<{ data: unknown }>('SELECT save_recipe_evaluation($1::jsonb) AS data', [JSON.stringify(command)]);
      data = result.rows[0]?.data;
    }
    if (error) throw new Error(error.message || 'save_recipe_evaluation failed');
    if (!data || typeof data !== 'object') throw new Error('save_recipe_evaluation returned no data');
    const parsed = data as Partial<RecipeEvaluationSaveResult>;
    if (!parsed.recipe || !Array.isArray(parsed.materials)) throw new Error('save_recipe_evaluation returned invalid data');
    return parsed as RecipeEvaluationSaveResult;
  } catch (error) {
    throw stable(error);
  }
}
