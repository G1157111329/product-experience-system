import { getPool } from '@/storage/database/pg-db';
import { projectDeleteGraphImpact } from '@/lib/server/content-delete-graph';

export type DeletionImpactKind = 'record' | 'comparison_section' | 'comparison_item' | 'recipe';

export interface DeletionImpact {
  records: number;
  childNodes: number;
  cells: number;
  materialLinks: number;
  issues: number;
}

export type DeletionImpactSnapshot =
  | { state: 'authorized'; impact: DeletionImpact }
  | { state: 'missing' | 'forbidden' | 'kind_mismatch'; impact: null };

export interface DeletionImpactRepository {
  /** Authorization and all counts must come from the same database snapshot. */
  readSnapshot(input: {
    kind: DeletionImpactKind;
    id: string;
    actorId: string;
  }): Promise<DeletionImpactSnapshot>;
}

export interface ContentDeleteGraphFixture {
  kind: 'record' | 'recipe';
  rootId: string;
  stepIds: string[];
  affectedRecordIds: string[];
  issueIds: string[];
  reEvaluationIds: string[];
  links: Array<{ materialId: string; targetType: string; targetId: string }>;
  legacyMaterials: Array<{
    id: string;
    recordId?: string | null;
    recipeId?: string | null;
    recipeStepId?: string | null;
    issueId?: string | null;
    reEvaluationId?: string | null;
  }>;
}

/** Executable contract mirroring content-delete-service's target/material graph. */
export function projectContentDeleteGraphImpact(fixture: ContentDeleteGraphFixture): DeletionImpact {
  const targets = new Set<string>([
    `${fixture.kind}:${fixture.rootId}`,
    ...fixture.stepIds.map((id) => `recipe_step:${id}`),
    ...fixture.issueIds.map((id) => `issue:${id}`),
    ...fixture.reEvaluationIds.map((id) => `re_evaluation:${id}`),
  ]);
  const materialIds = new Set(fixture.links
    .filter((link) => targets.has(`${link.targetType}:${link.targetId}`))
    .map((link) => link.materialId));
  for (const material of fixture.legacyMaterials) {
    const affected = fixture.kind === 'record'
      ? material.recordId === fixture.rootId
      : material.recipeId === fixture.rootId || Boolean(material.recipeStepId && fixture.stepIds.includes(material.recipeStepId));
    if (affected
      || Boolean(material.issueId && fixture.issueIds.includes(material.issueId))
      || Boolean(material.reEvaluationId && fixture.reEvaluationIds.includes(material.reEvaluationId))) {
      materialIds.add(material.id);
    }
  }
  return projectDeleteGraphImpact({
    kind: fixture.kind,
    id: fixture.rootId,
    actorId: 'deletion-impact-projection',
    stepIds: fixture.stepIds,
    affectedRecordIds: fixture.affectedRecordIds,
    issueIds: fixture.issueIds,
    reEvaluationIds: fixture.reEvaluationIds,
    targets: [],
    materialIds: [...materialIds],
  });
}

export class DeletionImpactAccessError extends Error {
  constructor(public readonly code: 'forbidden' | 'not_found') {
    super(code === 'forbidden' ? 'forbidden' : 'deletion target not found');
    this.name = 'DeletionImpactAccessError';
  }
}

type ImpactRow = {
  state: 'authorized' | 'missing' | 'forbidden' | 'kind_mismatch';
  records: string | number | null;
  child_nodes: string | number | null;
  cells: string | number | null;
  material_links: string | number | null;
  issues: string | number | null;
};

function number(value: string | number | null): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function snapshot(row: ImpactRow | undefined): DeletionImpactSnapshot {
  if (!row) return { state: 'missing', impact: null };
  if (row.state === 'missing') return { state: 'missing', impact: null };
  if (row.state === 'forbidden') return { state: 'forbidden', impact: null };
  if (row.state === 'kind_mismatch') return { state: 'kind_mismatch', impact: null };
  return {
    state: 'authorized',
    impact: {
      records: number(row.records),
      childNodes: number(row.child_nodes),
      cells: number(row.cells),
      materialLinks: number(row.material_links),
      issues: number(row.issues),
    },
  };
}

const RECORD_IMPACT_SQL = `
WITH actor AS (
  SELECT role FROM platform_users WHERE id = $2 AND status = 'approved'
), resource AS (
  SELECT record.id, record.task_id, task.created_by, task.owner_id
  FROM check_records record
  JOIN experience_tasks task ON task.id = record.task_id
  WHERE record.id = $1
), assessed AS (
  SELECT resource.*,
    EXISTS (SELECT 1 FROM actor) AND (
      (SELECT role FROM actor) IN ('admin', 'task_owner')
      OR ((SELECT role FROM actor) IN ('executor', 'user')
        AND (resource.created_by = $2 OR resource.owner_id = $2))
    ) AS authorized
  FROM resource
), affected_issues AS (
  SELECT id FROM issues WHERE record_id = $1
), affected_re_evaluations AS (
  SELECT id FROM issue_re_evaluations WHERE issue_id IN (SELECT id FROM affected_issues)
), impact AS (
  SELECT
    1::bigint AS records,
    0::bigint AS child_nodes,
    0::bigint AS cells,
    (SELECT count(*) FROM (
      SELECT material_id FROM material_links
      WHERE (target_type = 'record' AND target_id = $1)
         OR (target_type = 'issue' AND target_id IN (SELECT id FROM affected_issues))
         OR (target_type = 're_evaluation' AND target_id IN (SELECT id FROM affected_re_evaluations))
      UNION SELECT id FROM materials
      WHERE record_id = $1
         OR issue_id IN (SELECT id FROM affected_issues)
         OR re_evaluation_id IN (SELECT id FROM affected_re_evaluations)
    ) linked_materials)::bigint AS material_links,
    (SELECT count(*) FROM affected_issues)::bigint AS issues
)
SELECT
  CASE
    WHEN NOT EXISTS (SELECT 1 FROM resource) THEN 'missing'
    WHEN NOT COALESCE((SELECT authorized FROM assessed), false) THEN 'forbidden'
    ELSE 'authorized'
  END AS state,
  CASE WHEN COALESCE((SELECT authorized FROM assessed), false) THEN impact.records END AS records,
  CASE WHEN COALESCE((SELECT authorized FROM assessed), false) THEN impact.child_nodes END AS child_nodes,
  CASE WHEN COALESCE((SELECT authorized FROM assessed), false) THEN impact.cells END AS cells,
  CASE WHEN COALESCE((SELECT authorized FROM assessed), false) THEN impact.material_links END AS material_links,
  CASE WHEN COALESCE((SELECT authorized FROM assessed), false) THEN impact.issues END AS issues
FROM impact`;

const RECIPE_IMPACT_SQL = `
WITH actor AS (
  SELECT role FROM platform_users WHERE id = $2 AND status = 'approved'
), resource AS (
  SELECT recipe.id, recipe.task_id, task.created_by, task.owner_id
  FROM recipes recipe
  JOIN experience_tasks task ON task.id = recipe.task_id
  WHERE recipe.id = $1
), assessed AS (
  SELECT resource.*,
    EXISTS (SELECT 1 FROM actor) AND (
      (SELECT role FROM actor) IN ('admin', 'task_owner')
      OR ((SELECT role FROM actor) IN ('executor', 'user')
        AND (resource.created_by = $2 OR resource.owner_id = $2))
    ) AS authorized
  FROM resource
), steps AS (
  SELECT id FROM recipe_steps WHERE recipe_id = $1
), affected_records AS (
  SELECT id FROM check_records
  WHERE recipe_id = $1 OR recipe_step_id IN (SELECT id FROM steps)
), affected_issues AS (
  SELECT id FROM issues
  WHERE recipe_id = $1 OR recipe_step_id IN (SELECT id FROM steps)
), affected_re_evaluations AS (
  SELECT id FROM issue_re_evaluations WHERE issue_id IN (SELECT id FROM affected_issues)
), impact AS (
  SELECT
    (SELECT count(*) FROM affected_records)::bigint AS records,
    (SELECT count(*) FROM steps)::bigint AS child_nodes,
    0::bigint AS cells,
    (SELECT count(*) FROM (
      SELECT material_id FROM material_links
      WHERE (target_type = 'recipe' AND target_id = $1)
         OR (target_type = 'recipe_step' AND target_id IN (SELECT id FROM steps))
         OR (target_type = 'issue' AND target_id IN (SELECT id FROM affected_issues))
         OR (target_type = 're_evaluation' AND target_id IN (SELECT id FROM affected_re_evaluations))
      UNION SELECT id FROM materials
      WHERE recipe_id = $1
         OR recipe_step_id IN (SELECT id FROM steps)
         OR issue_id IN (SELECT id FROM affected_issues)
         OR re_evaluation_id IN (SELECT id FROM affected_re_evaluations)
    ) linked_materials)::bigint AS material_links,
    (SELECT count(*) FROM affected_issues)::bigint AS issues
)
SELECT
  CASE
    WHEN NOT EXISTS (SELECT 1 FROM resource) THEN 'missing'
    WHEN NOT COALESCE((SELECT authorized FROM assessed), false) THEN 'forbidden'
    ELSE 'authorized'
  END AS state,
  CASE WHEN COALESCE((SELECT authorized FROM assessed), false) THEN impact.records END AS records,
  CASE WHEN COALESCE((SELECT authorized FROM assessed), false) THEN impact.child_nodes END AS child_nodes,
  CASE WHEN COALESCE((SELECT authorized FROM assessed), false) THEN impact.cells END AS cells,
  CASE WHEN COALESCE((SELECT authorized FROM assessed), false) THEN impact.material_links END AS material_links,
  CASE WHEN COALESCE((SELECT authorized FROM assessed), false) THEN impact.issues END AS issues
FROM impact`;

const COMPARISON_IMPACT_SQL = `
WITH RECURSIVE actor AS (
  SELECT role FROM platform_users WHERE id = $2 AND status = 'approved'
), resource AS (
  SELECT node.id, node.node_type, node.assembly_id,
    assembly.created_by, assembly.source_task_ids, assembly.source_report_ids
  FROM comparison_item_nodes node
  JOIN comparison_assemblies assembly ON assembly.id = node.assembly_id
  WHERE node.id = $1
), assessed AS (
  SELECT resource.*,
    EXISTS (SELECT 1 FROM actor) AND (
      (SELECT role FROM actor) IN ('admin', 'task_owner')
      OR resource.created_by = $2
      OR EXISTS (
        SELECT 1
        FROM jsonb_array_elements_text(COALESCE(resource.source_task_ids, '[]'::jsonb)) source(task_id)
        JOIN experience_tasks task ON task.id = source.task_id
        WHERE task.created_by = $2 OR task.owner_id = $2
      )
      OR EXISTS (
        SELECT 1
        FROM jsonb_array_elements_text(COALESCE(resource.source_report_ids, '[]'::jsonb)) source(report_id)
        JOIN reports report ON report.id = source.report_id
        JOIN experience_tasks task ON task.id = report.task_id
        WHERE task.created_by = $2 OR task.owner_id = $2
      )
    ) AS authorized
  FROM resource
), descendants AS (
  SELECT node.id
  FROM comparison_item_nodes node
  WHERE node.id = $1
  UNION
  SELECT child.id
  FROM comparison_item_nodes child
  JOIN descendants parent ON child.parent_id = parent.id
), affected_cells AS (
  SELECT cell.id
  FROM comparison_matrix_cells cell
  WHERE cell.item_node_id IN (SELECT id FROM descendants)
), impact AS (
  SELECT
    0::bigint AS records,
    GREATEST((SELECT count(*) FROM descendants) - 1, 0)::bigint AS child_nodes,
    (SELECT count(*) FROM affected_cells)::bigint AS cells,
    (SELECT count(*) FROM (
      SELECT material_id FROM material_links
      WHERE (target_type = 'comparison_item_node' AND target_id IN (SELECT id FROM descendants))
         OR (target_type = 'comparison_cell' AND target_id IN (SELECT id FROM affected_cells))
      UNION SELECT id FROM materials
      WHERE comparison_cell_id IN (SELECT id FROM affected_cells)
    ) linked_materials)::bigint AS material_links,
    (SELECT count(*) FROM issues
      WHERE source_item_node_id IN (SELECT id FROM descendants)
         OR source_cell_id IN (SELECT id FROM affected_cells))::bigint AS issues
)
SELECT
  CASE
    WHEN NOT EXISTS (SELECT 1 FROM resource) THEN 'missing'
    WHEN NOT COALESCE((SELECT authorized FROM assessed), false) THEN 'forbidden'
    WHEN ($3 = 'comparison_section' AND (SELECT node_type FROM resource) <> 'section')
      OR ($3 = 'comparison_item' AND (SELECT node_type FROM resource) = 'section') THEN 'kind_mismatch'
    ELSE 'authorized'
  END AS state,
  CASE WHEN COALESCE((SELECT authorized FROM assessed), false) THEN impact.records END AS records,
  CASE WHEN COALESCE((SELECT authorized FROM assessed), false) THEN impact.child_nodes END AS child_nodes,
  CASE WHEN COALESCE((SELECT authorized FROM assessed), false) THEN impact.cells END AS cells,
  CASE WHEN COALESCE((SELECT authorized FROM assessed), false) THEN impact.material_links END AS material_links,
  CASE WHEN COALESCE((SELECT authorized FROM assessed), false) THEN impact.issues END AS issues
FROM impact`;

const databaseRepository: DeletionImpactRepository = {
  async readSnapshot(input) {
    // One parameterized statement supplies both authorization and every count,
    // so PostgreSQL evaluates the projection against one MVCC statement snapshot.
    const statement = input.kind === 'record'
      ? RECORD_IMPACT_SQL
      : input.kind === 'recipe'
        ? RECIPE_IMPACT_SQL
        : COMPARISON_IMPACT_SQL;
    const values = input.kind === 'record' || input.kind === 'recipe'
      ? [input.id, input.actorId]
      : [input.id, input.actorId, input.kind];
    const result = await getPool().query<ImpactRow>(statement, values);
    return snapshot(result.rows[0]);
  },
};

export async function getDeletionImpactWithRepository(
  input: { kind: DeletionImpactKind; id: string; actorId: string },
  repository: DeletionImpactRepository,
): Promise<DeletionImpact> {
  const result = await repository.readSnapshot(input);
  if (result.state === 'forbidden') throw new DeletionImpactAccessError('forbidden');
  if (result.state !== 'authorized') throw new DeletionImpactAccessError('not_found');
  return result.impact;
}

export async function getDeletionImpact(input: {
  kind: DeletionImpactKind;
  id: string;
  actorId: string;
}): Promise<DeletionImpact> {
  const id = input.id.trim();
  const actorId = input.actorId.trim();
  if (!id || !actorId) throw new DeletionImpactAccessError('not_found');
  return getDeletionImpactWithRepository({ ...input, id, actorId }, databaseRepository);
}
