-- ============================================================
-- Migration 0005: MaterialAsset state machine + material_links + matrix_issue_points
-- PRD V3.1.2.4 §9 (MaterialAsset), §7.12 (matrix issue points)
--
-- ADR-04: materials table gains a `status` state machine + `project_id`;
-- new polymorphic `material_links` table allows one asset to bind multiple targets.
-- Legacy FK columns (record_id/recipe_step_id/etc.) retained for read fallback.
-- New `matrix_issue_points` table for Q-column issue entries.
-- Idempotent.
-- ============================================================

-- Section 1: materials.status state machine (PRD §9.2)
ALTER TABLE materials
  ADD COLUMN IF NOT EXISTS status VARCHAR(30) DEFAULT 'uploaded';
ALTER TABLE materials
  ADD COLUMN IF NOT EXISTS project_id VARCHAR(36);
ALTER TABLE materials
  ADD COLUMN IF NOT EXISTS last_bind_suggestion JSONB;

-- Backfill existing rows: bound if any legacy FK is non-null, else unassigned.
-- Wrapped in DO to be re-runnable without error on already-migrated rows.
DO $$
BEGIN
  UPDATE materials SET status = 'bound'
  WHERE status = 'uploaded'
    AND (record_id IS NOT NULL OR task_id IS NOT NULL OR recipe_step_id IS NOT NULL
         OR recipe_library_step_id IS NOT NULL OR recipe_id IS NOT NULL
         OR issue_id IS NOT NULL OR re_evaluation_id IS NOT NULL
         OR comparison_cell_id IS NOT NULL OR comparison_assembly_id IS NOT NULL);

  UPDATE materials SET status = 'unassigned'
  WHERE status = 'uploaded'
    AND record_id IS NULL AND task_id IS NULL AND recipe_step_id IS NULL
    AND recipe_library_step_id IS NULL AND recipe_id IS NULL
    AND issue_id IS NULL AND re_evaluation_id IS NULL
    AND comparison_cell_id IS NULL AND comparison_assembly_id IS NULL;
END $$;

CREATE INDEX IF NOT EXISTS materials_status_idx ON materials (status);
CREATE INDEX IF NOT EXISTS materials_project_id_idx ON materials (project_id);

-- Section 2: material_links polymorphic binding table (PRD §9.3)
CREATE TABLE IF NOT EXISTS material_links (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  material_id VARCHAR(36) NOT NULL,
  target_type VARCHAR(40) NOT NULL,
  target_id VARCHAR(36) NOT NULL,
  binding_method VARCHAR(30) NOT NULL DEFAULT 'click_select' CHECK (binding_method IN (
    'click_select','drag_attach','upload_at_slot','wecom_ingest','agent_suggested'
  )),
  bound_by VARCHAR(36),
  bound_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT material_links_material_target_key UNIQUE (material_id, target_type, target_id)
);
CREATE INDEX IF NOT EXISTS ml_material_id_idx ON material_links (material_id);
CREATE INDEX IF NOT EXISTS ml_target_idx ON material_links (target_type, target_id);
CREATE INDEX IF NOT EXISTS ml_bound_by_idx ON material_links (bound_by);
ALTER TABLE material_links
  DROP CONSTRAINT IF EXISTS ml_material_id_fkey;
ALTER TABLE material_links
  ADD CONSTRAINT ml_material_id_fkey FOREIGN KEY (material_id) REFERENCES materials(id) ON DELETE CASCADE;

-- Section 3: matrix_issue_points (PRD §7.12) — Q column issue entries
CREATE TABLE IF NOT EXISTS matrix_issue_points (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  matrix_id VARCHAR(36) NOT NULL,
  leaf_row_id VARCHAR(36) NOT NULL,
  column_id VARCHAR(36) NOT NULL,
  issue_text TEXT NOT NULL,
  linked_issue_id VARCHAR(36),
  status VARCHAR(20) NOT NULL DEFAULT 'text' CHECK (status IN ('text','converted')),
  created_by VARCHAR(36),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS mip_matrix_id_idx ON matrix_issue_points (matrix_id);
CREATE INDEX IF NOT EXISTS mip_leaf_row_idx ON matrix_issue_points (leaf_row_id);
CREATE INDEX IF NOT EXISTS mip_linked_issue_idx ON matrix_issue_points (linked_issue_id);
ALTER TABLE matrix_issue_points
  DROP CONSTRAINT IF EXISTS mip_matrix_id_fkey;
ALTER TABLE matrix_issue_points
  ADD CONSTRAINT mip_matrix_id_fkey FOREIGN KEY (matrix_id) REFERENCES task_matrices(id) ON DELETE CASCADE;
ALTER TABLE matrix_issue_points
  DROP CONSTRAINT IF EXISTS mip_leaf_row_fkey;
ALTER TABLE matrix_issue_points
  ADD CONSTRAINT mip_leaf_row_fkey FOREIGN KEY (leaf_row_id) REFERENCES matrix_leaf_rows(id) ON DELETE CASCADE;
ALTER TABLE matrix_issue_points
  DROP CONSTRAINT IF EXISTS mip_column_fkey;
ALTER TABLE matrix_issue_points
  ADD CONSTRAINT mip_column_fkey FOREIGN KEY (column_id) REFERENCES matrix_column_definitions(id) ON DELETE CASCADE;
ALTER TABLE matrix_issue_points
  DROP CONSTRAINT IF EXISTS mip_linked_issue_fkey;
ALTER TABLE matrix_issue_points
  ADD CONSTRAINT mip_linked_issue_fkey FOREIGN KEY (linked_issue_id) REFERENCES issues(id) ON DELETE SET NULL;
