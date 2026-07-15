ALTER TABLE materials ADD COLUMN IF NOT EXISTS created_by VARCHAR(36);

WITH owner_candidates AS (
  SELECT audit.target_id AS material_id, audit.actor_user_id AS user_id, 1 AS priority
  FROM security_audit_logs audit
  WHERE audit.action = 'material.upload' AND audit.outcome = 'success' AND audit.actor_user_id IS NOT NULL
  UNION ALL SELECT material.id, COALESCE(task.owner_id, task.created_by), 10 FROM materials material JOIN experience_tasks task ON task.id = material.task_id
  UNION ALL SELECT material.id, COALESCE(task.owner_id, task.created_by), 20 FROM materials material JOIN check_records record ON record.id = material.record_id JOIN experience_tasks task ON task.id = record.task_id
  UNION ALL SELECT material.id, COALESCE(task.owner_id, task.created_by), 30 FROM materials material JOIN recipes recipe ON recipe.id = material.recipe_id JOIN experience_tasks task ON task.id = recipe.task_id
  UNION ALL SELECT material.id, COALESCE(task.owner_id, task.created_by), 31 FROM materials material JOIN recipe_steps step ON step.id = material.recipe_step_id JOIN recipes recipe ON recipe.id = step.recipe_id JOIN experience_tasks task ON task.id = recipe.task_id
  UNION ALL SELECT material.id, COALESCE(task.owner_id, task.created_by), 40 FROM materials material JOIN issues issue ON issue.id = material.issue_id JOIN experience_tasks task ON task.id = issue.task_id
  UNION ALL SELECT material.id, COALESCE(task.owner_id, task.created_by), 41 FROM materials material JOIN issue_re_evaluations retest ON retest.id = material.re_evaluation_id JOIN issues issue ON issue.id = retest.issue_id JOIN experience_tasks task ON task.id = issue.task_id
  UNION ALL SELECT material.id, assembly.created_by, 50 FROM materials material JOIN comparison_assemblies assembly ON assembly.id = material.comparison_assembly_id
  UNION ALL SELECT material.id, assembly.created_by, 51 FROM materials material JOIN comparison_matrix_cells cell ON cell.id = material.comparison_cell_id JOIN comparison_assemblies assembly ON assembly.id = cell.assembly_id
  UNION ALL SELECT link.material_id, COALESCE(task.owner_id, task.created_by), 60 FROM material_links link JOIN check_records record ON link.target_type='record' AND record.id=link.target_id JOIN experience_tasks task ON task.id=record.task_id
  UNION ALL SELECT link.material_id, COALESCE(task.owner_id, task.created_by), 61 FROM material_links link JOIN recipes recipe ON link.target_type='recipe' AND recipe.id=link.target_id JOIN experience_tasks task ON task.id=recipe.task_id
  UNION ALL SELECT link.material_id, COALESCE(task.owner_id, task.created_by), 62 FROM material_links link JOIN recipe_steps step ON link.target_type='recipe_step' AND step.id=link.target_id JOIN recipes recipe ON recipe.id=step.recipe_id JOIN experience_tasks task ON task.id=recipe.task_id
  UNION ALL SELECT link.material_id, COALESCE(task.owner_id, task.created_by), 63 FROM material_links link JOIN issues issue ON link.target_type='issue' AND issue.id=link.target_id JOIN experience_tasks task ON task.id=issue.task_id
  UNION ALL SELECT link.material_id, COALESCE(task.owner_id, task.created_by), 64 FROM material_links link JOIN issue_re_evaluations retest ON link.target_type='re_evaluation' AND retest.id=link.target_id JOIN issues issue ON issue.id=retest.issue_id JOIN experience_tasks task ON task.id=issue.task_id
  UNION ALL SELECT link.material_id, assembly.created_by, 65 FROM material_links link JOIN comparison_matrix_cells cell ON link.target_type='comparison_cell' AND cell.id=link.target_id JOIN comparison_assemblies assembly ON assembly.id=cell.assembly_id
  UNION ALL SELECT link.material_id, COALESCE(task.owner_id, task.created_by), 66 FROM material_links link JOIN matrix_cell_values cell ON link.target_type='dynamic_matrix_cell_value' AND cell.id=link.target_id JOIN task_matrices matrix ON matrix.id=cell.matrix_id JOIN experience_tasks task ON task.id=matrix.task_id
), best_priority AS (
  SELECT material_id, MIN(priority) AS priority
  FROM owner_candidates
  WHERE user_id IS NOT NULL
  GROUP BY material_id
), resolved_owner AS (
  SELECT candidate.material_id, MIN(candidate.user_id) AS user_id
  FROM owner_candidates candidate
  JOIN best_priority best
    ON candidate.material_id = best.material_id
   AND candidate.priority = best.priority
  WHERE candidate.user_id IS NOT NULL
  GROUP BY candidate.material_id
  HAVING COUNT(DISTINCT candidate.user_id) = 1
)
UPDATE materials material SET created_by = owner.user_id
FROM resolved_owner owner
WHERE material.id = owner.material_id AND material.created_by IS NULL;

CREATE INDEX IF NOT EXISTS materials_created_by_idx ON materials(created_by);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'materials_created_by_fkey' AND conrelid = 'materials'::regclass) THEN
    ALTER TABLE materials ADD CONSTRAINT materials_created_by_fkey FOREIGN KEY (created_by) REFERENCES platform_users(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS wecom_callback_replays (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id VARCHAR(100) NOT NULL,
  nonce VARCHAR(100) NOT NULL,
  corp_id VARCHAR(100) NOT NULL,
  message_timestamp TIMESTAMPTZ NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT wecom_callback_replays_message_id_key UNIQUE(message_id),
  CONSTRAINT wecom_callback_replays_corp_nonce_timestamp_key UNIQUE(corp_id, nonce, message_timestamp)
);
CREATE INDEX IF NOT EXISTS wecom_callback_replays_received_at_idx ON wecom_callback_replays(received_at);
