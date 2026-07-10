type ProblemPoint = { text?: unknown };

type RecipeStatisticsInput = {
  recipe_steps?: Array<{
    problem_points?: unknown;
    problem_point?: unknown;
  }>;
  effect_problem_points?: unknown;
  effect_problem_point?: unknown;
};

function countProblemPoints(value: unknown): number {
  if (Array.isArray(value)) {
    return value.filter((point): point is { text: string } => {
      if (typeof point !== 'object' || point === null) return false;
      const text = (point as ProblemPoint).text;
      return typeof text === 'string' && text.trim().length > 0;
    }).length;
  }

  if (typeof value !== 'string') return 0;
  const normalized = value.trim();
  if (!normalized) return 0;

  try {
    return countProblemPoints(JSON.parse(normalized));
  } catch {
    return 1;
  }
}

export function getRecipeStatistics(recipe: RecipeStatisticsInput) {
  const steps = Array.isArray(recipe.recipe_steps) ? recipe.recipe_steps : [];
  const stepProblemCount = steps.reduce((count, step) => {
    const structuredCount = countProblemPoints(step.problem_points);
    return count + (structuredCount || countProblemPoints(step.problem_point));
  }, 0);
  const effectProblemCount = countProblemPoints(
    recipe.effect_problem_points ?? recipe.effect_problem_point,
  );

  return {
    stepCount: steps.length,
    problemCount: stepProblemCount + effectProblemCount,
  };
}
