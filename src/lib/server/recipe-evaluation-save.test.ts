import assert from 'node:assert/strict';
import { classifyRecipeEvaluationSaveError, saveRecipeEvaluation } from './recipe-evaluation-save';

async function run() {
  let command: Record<string, unknown> | null = null;
  const result = await saveRecipeEvaluation({
    rpc: async (name, args) => {
      assert.equal(name, 'save_recipe_evaluation');
      command = args.p_command as Record<string, unknown>;
      return { data: { recipe: { id: 'recipe-a', effect_status: 'pending' }, materials: [] }, error: null };
    },
  }, { recipeId: 'recipe-a', status: 'pending', description: 'draft', materialIds: [] });
  assert.equal((command as unknown as Record<string, unknown>).recipe_id, 'recipe-a');
  assert.equal(result.recipe.id, 'recipe-a');
  await saveRecipeEvaluation({
    rpc: async (_name, args) => {
      const partial = args.p_command as Record<string, unknown>;
      assert.deepEqual(partial, { recipe_id: 'recipe-a', effect_description: 'only description' });
      return { data: { recipe: { id: 'recipe-a', effect_status: 'pending' }, materials: [] }, error: null };
    },
  }, { recipeId: 'recipe-a', description: 'only description' });
  await saveRecipeEvaluation({
    rpc: async (_name, args) => {
      assert.deepEqual(args.p_command, {
        recipe_id: 'recipe-a',
        effect_status: 'qualified',
        name: 'mixed name',
        ingredients: 'mixed ingredients',
        recipe_type: '功能',
        problem_count: 2,
        ingredient_items: [{ name: 'water', amount: '1L' }],
      });
      return { data: { recipe: { id: 'recipe-a', effect_status: 'qualified' }, materials: [] }, error: null };
    },
  }, {
    recipeId: 'recipe-a',
    status: 'qualified',
    name: 'mixed name',
    ingredients: 'mixed ingredients',
    recipeType: '功能',
    problemCount: 2,
    ingredientItems: [{ name: 'water', amount: '1L' }],
  });
  assert.deepEqual(classifyRecipeEvaluationSaveError(new Error('recipe not found')), { status: 404, message: '食谱不存在', log: false });
  assert.deepEqual(classifyRecipeEvaluationSaveError(new Error('invalid evaluation status')), { status: 400, message: '评价状态格式错误', log: false });
  assert.deepEqual(classifyRecipeEvaluationSaveError(new Error('invalid or occupied recipe material')), { status: 409, message: '所选素材不可用于当前食谱，请刷新后重试', log: false });
  assert.deepEqual(classifyRecipeEvaluationSaveError(new Error('secret database detail')), { status: 500, message: '效果评价保存失败', log: true });
  console.log('recipe evaluation atomic save tests passed');
}

void run();
