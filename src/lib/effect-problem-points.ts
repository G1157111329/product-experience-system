export interface EffectProblemPoint {
  text: string;
  material_ids?: string[];
}

export interface EffectProblemPointRecipe {
  id: string;
  effect_problem_points?: EffectProblemPoint[];
}

export type EffectProblemPointState = Record<string, EffectProblemPoint[]>;

function serverPoints(recipe: EffectProblemPointRecipe): EffectProblemPoint[] {
  return Array.isArray(recipe.effect_problem_points) ? recipe.effect_problem_points : [];
}

export function initializeEffectProblemPoints(
  current: EffectProblemPointState,
  recipes: EffectProblemPointRecipe[],
): EffectProblemPointState {
  const next = { ...current };
  for (const recipe of recipes) {
    if (!(recipe.id in next)) next[recipe.id] = serverPoints(recipe);
  }
  return next;
}

export function updateEffectProblemPoints(
  current: EffectProblemPointState,
  recipe: EffectProblemPointRecipe,
  update: (points: EffectProblemPoint[]) => EffectProblemPoint[],
): EffectProblemPointState {
  const points = current[recipe.id] ?? serverPoints(recipe);
  return {
    ...current,
    [recipe.id]: update(points),
  };
}
