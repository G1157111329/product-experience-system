import { sortMaterialsByBinding } from '@/lib/stable-display-order';

/**
 * Report snapshot media must retain the relationship that made an asset
 * reportable.  New bindings live in material_links while older rows still use
 * foreign keys on materials, so generation always reads both sources and puts
 * the resulting descriptors back at the owning record/recipe/step/issue slot.
 */
type Row = Record<string, unknown>;

function text(value: unknown) {
  return value === null || value === undefined ? '' : String(value).trim();
}

function numeric(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function materialId(material: Row) {
  return text(material.id ?? material.material_id ?? material.materialId);
}

function linkField(link: Row, snake: string, camel: string) {
  return text(link[snake] ?? link[camel]);
}

function orderedLegacy(materials: Row[]) {
  return sortMaterialsByBinding(materials.map((material) => {
    const displayOrder = material.media_display_order ?? material.mediaDisplayOrder;
    return {
      material,
      id: materialId(material),
      bindingOrder: displayOrder === null || displayOrder === undefined ? null : numeric(displayOrder),
      created_at: text(material.created_at ?? material.createdAt) || null,
    };
  })).map(({ material }) => ({ ...material }));
}

/** A JSON-safe descriptor retains the stable video preview fields for future renderers. */
export function freezeMaterialDescriptor(material: Row): Row {
  return {
    ...material,
    thumbnail_url: material.thumbnail_url ?? material.thumbnailUrl ?? null,
    duration_sec: material.duration_sec ?? material.durationSec ?? null,
  };
}

export function mergeTargetMaterials(input: {
  legacy: Row[];
  materials: Row[];
  materialLinks: Row[];
  targetType: string;
  targetId: string;
}): Row[] {
  const byId = new Map(input.materials.map((material) => [materialId(material), material]));
  const linked = sortMaterialsByBinding(input.materialLinks
    .filter((link) => linkField(link, 'target_type', 'targetType') === input.targetType && linkField(link, 'target_id', 'targetId') === input.targetId)
    .map((link, index) => ({
      link,
      id: linkField(link, 'material_id', 'materialId') || text(link.id) || `link:${index}`,
      bindingOrder: numeric(link.binding_order ?? link.bindingOrder),
      linkedAt: text(link.bound_at ?? link.boundAt ?? link.created_at ?? link.createdAt) || null,
      created_at: text(byId.get(linkField(link, 'material_id', 'materialId'))?.created_at) || null,
    })))
    .flatMap(({ link }) => {
      const material = byId.get(linkField(link, 'material_id', 'materialId'));
      return material ? [material] : [];
    });
  const linkedIds = new Set(linked.map(materialId));
  const seen = new Set<string>();
  return [...linked, ...orderedLegacy(input.legacy).filter((material) => !linkedIds.has(materialId(material)))]
    .flatMap((material) => {
      const id = materialId(material);
      if (!id || seen.has(id)) return [];
      seen.add(id);
      return [freezeMaterialDescriptor(material)];
    });
}

function legacyMaterialsFor(materials: Row[], field: string, id: string) {
  return materials.filter((material) => text(material[field]) === id);
}

export function freezeReportMediaAtSource(input: {
  records: Row[];
  recipes: Row[];
  issues: Row[];
  reEvaluations: Row[];
  materials: Row[];
  materialLinks: Row[];
}): { records: Row[]; recipes: Row[]; issues: Row[] } {
  const attach = (legacy: Row[], targetType: string, targetId: string) => mergeTargetMaterials({
    legacy, materials: input.materials, materialLinks: input.materialLinks, targetType, targetId,
  });
  const records = input.records.map((record) => {
    const id = text(record.id);
    return { ...record, materials: attach(legacyMaterialsFor(input.materials, 'record_id', id), 'record', id) };
  });
  const recipes = input.recipes.map((recipe) => {
    const recipeId = text(recipe.id);
    const recipeSteps = Array.isArray(recipe.recipe_steps) ? recipe.recipe_steps.filter((step): step is Row => Boolean(step) && typeof step === 'object' && !Array.isArray(step)) : [];
    return {
      ...recipe,
      effect_materials: attach(legacyMaterialsFor(input.materials, 'recipe_id', recipeId), 'recipe', recipeId),
      recipe_steps: recipeSteps.map((step) => {
        const stepId = text(step.id);
        return { ...step, materials: attach(legacyMaterialsFor(input.materials, 'recipe_step_id', stepId), 'recipe_step', stepId) };
      }),
    };
  });
  const retestsByIssue = new Map<string, Row[]>();
  for (const reEvaluation of input.reEvaluations) {
    const reEvaluationId = text(reEvaluation.id);
    const issueId = text(reEvaluation.issue_id ?? reEvaluation.issueId);
    if (!issueId) continue;
    const frozen = {
      ...reEvaluation,
      materials: attach(legacyMaterialsFor(input.materials, 're_evaluation_id', reEvaluationId), 're_evaluation', reEvaluationId),
    };
    retestsByIssue.set(issueId, [...(retestsByIssue.get(issueId) ?? []), frozen]);
  }
  const issues = input.issues.map((issue) => {
    const issueId = text(issue.id);
    return {
      ...issue,
      materials: attach(legacyMaterialsFor(input.materials, 'issue_id', issueId), 'issue', issueId),
      _reEvaluations: retestsByIssue.get(issueId) ?? [],
    };
  });
  return { records, recipes, issues };
}
