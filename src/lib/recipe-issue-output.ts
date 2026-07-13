import type { ProblemPoint } from '@/app/(main)/tasks/[id]/types';

export type RecipeIssueSummary = {
  id: string;
  title: string;
  recipe_id?: string | null;
  source_type?: string | null;
  status?: string | null;
};

export function normalizeRecipeIssueTitle(value: string) {
  return value.trim().slice(0, 200);
}

export function findRecipeIssue(
  issues: RecipeIssueSummary[],
  recipeId: string,
  _problemText: string,
) {
  void _problemText;
  return issues.find((issue) => (
    issue.recipe_id === recipeId
    && issue.source_type === 'recipe_problem'
  ));
}

export function buildRecipeIssuePayload({
  taskId,
  productModel,
  recipe,
  problem,
}: {
  taskId: string;
  productModel?: string | null;
  recipe: { id: string; name: string };
  problem: ProblemPoint;
}) {
  return {
    task_id: taskId,
    recipe_id: recipe.id,
    title: normalizeRecipeIssueTitle(problem.text),
    product_model: productModel || null,
    level: '二类',
    source: `${recipe.name} - 效果评价`,
    source_type: 'recipe_problem',
    description: `功能/食谱：${recipe.name}\n来源：效果评价问题点`,
    evidence_refs: problem.material_ids || [],
  };
}
