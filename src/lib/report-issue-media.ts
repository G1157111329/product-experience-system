type Row = Record<string, unknown>;

function text(value: unknown) {
  return String(value ?? '').trim();
}

function materialKey(material: Row) {
  return text(material.id)
    || text(material.file_path)
    || text(material.file_url)
    || JSON.stringify(material);
}

function uniqueRows(materials: Row[]) {
  const seen = new Set<string>();
  return materials.filter((material) => {
    const key = materialKey(material);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function problemPoints(value: unknown): Array<{ text: string; materialIds: string[] }> {
  let source = value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return [];
    try {
      source = JSON.parse(trimmed);
    } catch {
      return [{ text: trimmed, materialIds: [] }];
    }
  }
  if (!Array.isArray(source)) return [];
  return source.map((item) => {
    if (typeof item === 'string') return { text: item.trim(), materialIds: [] };
    if (!item || typeof item !== 'object') return null;
    const point = item as Row;
    return {
      text: text(point.text),
      materialIds: Array.isArray(point.material_ids)
        ? point.material_ids.map(text).filter(Boolean)
        : [],
    };
  }).filter((item): item is { text: string; materialIds: string[] } => Boolean(item?.text));
}

export function issueMaterialRows(issue: Row, allMaterials: Row[]) {
  const issueId = text(issue.id);
  const recordId = text(issue.record_id);
  const sourceCellId = text(issue.source_cell_id);
  const seen = new Set<string>();

  return allMaterials.filter((material) => {
    const matches = (
      (issueId !== '' && text(material.issue_id) === issueId)
      || (recordId !== '' && text(material.record_id) === recordId)
      || (sourceCellId !== '' && text(material.comparison_cell_id) === sourceCellId)
    );
    if (!matches) return false;
    const key = materialKey(material);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function recipeIssueMaterialRows(issue: Row, recipes: Row[], allMaterials: Row[]) {
  if (text(issue.source_type) !== 'recipe_problem') return [];
  const issueTitle = text(issue.title);
  if (!issueTitle) return [];
  const source = text(issue.source);
  const materialById = new Map(allMaterials.map((material) => [text(material.id), material]));
  const matched: Row[] = [];

  for (const recipe of recipes) {
    const recipeId = text(recipe.id);
    const recipeName = text(recipe.name);
    if (source && recipeName && !source.includes(recipeName)) continue;

    const steps = Array.isArray(recipe.recipe_steps) ? recipe.recipe_steps.filter(Boolean) as Row[] : [];
    for (const step of steps) {
      const points = problemPoints(step.problem_points).length > 0
        ? problemPoints(step.problem_points)
        : problemPoints(step.problem_point);
      for (const point of points) {
        if (point.text !== issueTitle) continue;
        matched.push(...allMaterials.filter((material) => text(material.recipe_step_id) === text(step.id)));
        matched.push(...point.materialIds.map((id) => materialById.get(id)).filter((item): item is Row => Boolean(item)));
      }
    }

    for (const point of problemPoints(recipe.effect_problem_point)) {
      if (point.text !== issueTitle) continue;
      matched.push(...allMaterials.filter((material) => text(material.recipe_id) === recipeId));
      matched.push(...point.materialIds.map((id) => materialById.get(id)).filter((item): item is Row => Boolean(item)));
    }
  }

  return uniqueRows(matched);
}
