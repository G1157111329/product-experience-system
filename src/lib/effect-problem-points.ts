export interface EffectProblemPoint {
  text: string;
  material_ids?: string[];
}

export interface EffectProblemPointRecipe {
  id: string;
  name?: string;
  ingredients?: string | null;
  recipe_type?: string;
  problem_count?: number;
  effect_description?: string | null;
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

export function buildEffectAutosavePayload(
  recipe: EffectProblemPointRecipe,
  points: EffectProblemPoint[],
  effectMaterialIds: string[],
) {
  const normalizedPoints = points
    .map((point) => ({
      text: point.text.trim(),
      material_ids: [...new Set(point.material_ids || [])],
    }))
    .filter((point) => point.text);
  const problemMaterialIds = normalizedPoints.flatMap((point) => point.material_ids);

  return {
    name: recipe.name || '',
    ingredients: recipe.ingredients || '',
    recipe_type: recipe.recipe_type || '功能',
    problem_count: recipe.problem_count || 0,
    effect_description: recipe.effect_description || '',
    effect_problem_point: JSON.stringify(normalizedPoints),
    effect_material_ids: [...new Set([...effectMaterialIds, ...problemMaterialIds])],
  };
}
