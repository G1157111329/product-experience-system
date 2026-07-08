-- ============================================================
-- Migration 0004: Dynamic Data Matrix V3 Tables
-- PRD V3.1.2.4 §8 — Excel-like user-designed matrix model.
-- V2 tables (matrix_groups/matrix_rows/matrix_field_values etc.)
-- are cold-retained for read-only legacy compatibility; runtime
-- no longer writes to them. V3 introduces:
--   - 3-level hierarchy with merged row headers
--   - column_zone classification (A~Q regions)
--   - cell-level styles (safe token whitelist)
--   - A1 cell-reference formula model
--   - summary/note narrative blocks
-- All tables idempotent (CREATE IF NOT EXISTS).
-- ============================================================

-- Section 1: matrix_view_definitions (PRD §8.3)
CREATE TABLE IF NOT EXISTS matrix_view_definitions (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  matrix_id VARCHAR(36) NOT NULL,
  version_no INT NOT NULL,
  max_hierarchy_level INT NOT NULL DEFAULT 3,
  left_frozen_column_count INT NOT NULL DEFAULT 5,
  formula_mode VARCHAR(40) NOT NULL DEFAULT 'relative_cell_reference',
  style_mode VARCHAR(40) NOT NULL DEFAULT 'basic_text_style',
  status VARCHAR(20) NOT NULL DEFAULT 'draft',
  design_hash VARCHAR(128),
  confirmed_by VARCHAR(36),
  confirmed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT matrix_view_definitions_matrix_version_key UNIQUE (matrix_id, version_no)
);
CREATE INDEX IF NOT EXISTS matrix_view_definitions_matrix_id_idx ON matrix_view_definitions (matrix_id);
ALTER TABLE matrix_view_definitions
  DROP CONSTRAINT IF EXISTS mvd_matrix_id_fkey;
ALTER TABLE matrix_view_definitions
  ADD CONSTRAINT mvd_matrix_id_fkey FOREIGN KEY (matrix_id) REFERENCES task_matrices(id) ON DELETE CASCADE;
ALTER TABLE matrix_view_definitions
  DROP CONSTRAINT IF EXISTS mvd_confirmed_by_fkey;
ALTER TABLE matrix_view_definitions
  ADD CONSTRAINT mvd_confirmed_by_fkey FOREIGN KEY (confirmed_by) REFERENCES platform_users(id) ON DELETE SET NULL;

-- Section 2: matrix_hierarchy_nodes (PRD §8.4)
-- 3-level tree: level_1 (大类) -> level_2 (二级细项) -> level_3 (三级细项)
CREATE TABLE IF NOT EXISTS matrix_hierarchy_nodes (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  matrix_id VARCHAR(36) NOT NULL,
  parent_id VARCHAR(36),
  level INT NOT NULL CHECK (level IN (1,2,3)),
  node_label VARCHAR(200) NOT NULL,
  node_type VARCHAR(20) NOT NULL CHECK (node_type IN ('level_1','level_2','level_3')),
  sort_order INT NOT NULL DEFAULT 0,
  rowspan_cache INT,
  created_by VARCHAR(36),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  archived_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS mhn_matrix_id_idx ON matrix_hierarchy_nodes (matrix_id);
CREATE INDEX IF NOT EXISTS mhn_parent_id_idx ON matrix_hierarchy_nodes (parent_id);
CREATE INDEX IF NOT EXISTS mhn_level_idx ON matrix_hierarchy_nodes (level);
-- Functional unique: only one non-archived node per (matrix, parent, level, label)
CREATE UNIQUE INDEX IF NOT EXISTS mhn_active_unique_idx
  ON matrix_hierarchy_nodes (matrix_id, COALESCE(parent_id,''), level, node_label)
  WHERE archived_at IS NULL;
ALTER TABLE matrix_hierarchy_nodes
  DROP CONSTRAINT IF EXISTS mhn_matrix_id_fkey;
ALTER TABLE matrix_hierarchy_nodes
  ADD CONSTRAINT mhn_matrix_id_fkey FOREIGN KEY (matrix_id) REFERENCES task_matrices(id) ON DELETE CASCADE;
ALTER TABLE matrix_hierarchy_nodes
  DROP CONSTRAINT IF EXISTS mhn_parent_self_fkey;
ALTER TABLE matrix_hierarchy_nodes
  ADD CONSTRAINT mhn_parent_self_fkey FOREIGN KEY (parent_id) REFERENCES matrix_hierarchy_nodes(id) ON DELETE CASCADE;

-- Section 3: matrix_leaf_rows (PRD §8.5)
-- Leaf rows are where D~Q cell values actually mount.
CREATE TABLE IF NOT EXISTS matrix_leaf_rows (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  matrix_id VARCHAR(36) NOT NULL,
  level_1_node_id VARCHAR(36) NOT NULL,
  level_2_node_id VARCHAR(36),
  level_3_node_id VARCHAR(36),
  visible_row_index INT NOT NULL DEFAULT 0,
  group_row_index INT NOT NULL DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  archived_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS mlr_matrix_id_idx ON matrix_leaf_rows (matrix_id);
CREATE INDEX IF NOT EXISTS mlr_l1_idx ON matrix_leaf_rows (level_1_node_id);
CREATE INDEX IF NOT EXISTS mlr_l2_idx ON matrix_leaf_rows (level_2_node_id);
CREATE INDEX IF NOT EXISTS mlr_l3_idx ON matrix_leaf_rows (level_3_node_id);
CREATE INDEX IF NOT EXISTS mlr_visible_idx ON matrix_leaf_rows (matrix_id, visible_row_index);
ALTER TABLE matrix_leaf_rows
  DROP CONSTRAINT IF EXISTS mlr_matrix_id_fkey;
ALTER TABLE matrix_leaf_rows
  ADD CONSTRAINT mlr_matrix_id_fkey FOREIGN KEY (matrix_id) REFERENCES task_matrices(id) ON DELETE CASCADE;
ALTER TABLE matrix_leaf_rows
  DROP CONSTRAINT IF EXISTS mlr_l1_fkey;
ALTER TABLE matrix_leaf_rows
  ADD CONSTRAINT mlr_l1_fkey FOREIGN KEY (level_1_node_id) REFERENCES matrix_hierarchy_nodes(id) ON DELETE CASCADE;
ALTER TABLE matrix_leaf_rows
  DROP CONSTRAINT IF EXISTS mlr_l2_fkey;
ALTER TABLE matrix_leaf_rows
  ADD CONSTRAINT mlr_l2_fkey FOREIGN KEY (level_2_node_id) REFERENCES matrix_hierarchy_nodes(id) ON DELETE SET NULL;
ALTER TABLE matrix_leaf_rows
  DROP CONSTRAINT IF EXISTS mlr_l3_fkey;
ALTER TABLE matrix_leaf_rows
  ADD CONSTRAINT mlr_l3_fkey FOREIGN KEY (level_3_node_id) REFERENCES matrix_hierarchy_nodes(id) ON DELETE SET NULL;

-- Section 4: matrix_column_definitions (PRD §8.6)
CREATE TABLE IF NOT EXISTS matrix_column_definitions (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  matrix_id VARCHAR(36) NOT NULL,
  column_zone VARCHAR(40) NOT NULL CHECK (column_zone IN (
    'hierarchy','primary_media','comparison_category','detail_dimension',
    'calculation_dimension','effect_media','evaluation','issue_point'
  )),
  zone_role VARCHAR(20) NOT NULL DEFAULT 'A',
  column_label VARCHAR(100) NOT NULL,
  data_type VARCHAR(30) NOT NULL CHECK (data_type IN (
    'text','long_text','number','duration','percentage','temperature','volume',
    'image_slot','media_slot','formula','issue_point'
  )),
  unit_text VARCHAR(30),
  display_order INT NOT NULL DEFAULT 0,
  desktop_width_px INT NOT NULL DEFAULT 140,
  min_width_px INT DEFAULT 80,
  max_width_px INT DEFAULT 480,
  is_pinned BOOLEAN NOT NULL DEFAULT false,
  is_required BOOLEAN NOT NULL DEFAULT false,
  show_in_report BOOLEAN NOT NULL DEFAULT true,
  max_media_count INT,
  result_format VARCHAR(20),
  decimal_places INT DEFAULT 2,
  created_by VARCHAR(36),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  archived_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS mcd_matrix_id_idx ON matrix_column_definitions (matrix_id);
CREATE INDEX IF NOT EXISTS mcd_zone_idx ON matrix_column_definitions (column_zone);
CREATE INDEX IF NOT EXISTS mcd_order_idx ON matrix_column_definitions (matrix_id, display_order);
ALTER TABLE matrix_column_definitions
  DROP CONSTRAINT IF EXISTS mcd_matrix_id_fkey;
ALTER TABLE matrix_column_definitions
  ADD CONSTRAINT mcd_matrix_id_fkey FOREIGN KEY (matrix_id) REFERENCES task_matrices(id) ON DELETE CASCADE;

-- Section 5: matrix_cell_values (PRD §8.7) — EAV + typed columns
CREATE TABLE IF NOT EXISTS matrix_cell_values (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  matrix_id VARCHAR(36) NOT NULL,
  leaf_row_id VARCHAR(36) NOT NULL,
  column_id VARCHAR(36) NOT NULL,
  value_text TEXT,
  value_number DECIMAL(18,6),
  value_duration_seconds INT,
  value_percentage DECIMAL(10,4),
  display_text TEXT,
  value_state VARCHAR(30) NOT NULL DEFAULT 'empty' CHECK (value_state IN (
    'empty','filled','invalid','calculation_pending','calculation_failed','archived'
  )),
  error_code VARCHAR(60),
  version INT NOT NULL DEFAULT 1,
  updated_by VARCHAR(36),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT matrix_cell_values_row_col_key UNIQUE (matrix_id, leaf_row_id, column_id)
);
CREATE INDEX IF NOT EXISTS mcv_matrix_row_idx ON matrix_cell_values (matrix_id, leaf_row_id);
CREATE INDEX IF NOT EXISTS mcv_column_idx ON matrix_cell_values (column_id);
CREATE INDEX IF NOT EXISTS mcv_state_idx ON matrix_cell_values (value_state);
ALTER TABLE matrix_cell_values
  DROP CONSTRAINT IF EXISTS mcv_matrix_id_fkey;
ALTER TABLE matrix_cell_values
  ADD CONSTRAINT mcv_matrix_id_fkey FOREIGN KEY (matrix_id) REFERENCES task_matrices(id) ON DELETE CASCADE;
ALTER TABLE matrix_cell_values
  DROP CONSTRAINT IF EXISTS mcv_leaf_row_fkey;
ALTER TABLE matrix_cell_values
  ADD CONSTRAINT mcv_leaf_row_fkey FOREIGN KEY (leaf_row_id) REFERENCES matrix_leaf_rows(id) ON DELETE CASCADE;
ALTER TABLE matrix_cell_values
  DROP CONSTRAINT IF EXISTS mcv_column_fkey;
ALTER TABLE matrix_cell_values
  ADD CONSTRAINT mcv_column_fkey FOREIGN KEY (column_id) REFERENCES matrix_column_definitions(id) ON DELETE CASCADE;

-- Section 6: matrix_cell_styles (PRD §8.8) — safe token whitelist
CREATE TABLE IF NOT EXISTS matrix_cell_styles (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  matrix_id VARCHAR(36) NOT NULL,
  target_type VARCHAR(30) NOT NULL CHECK (target_type IN ('column_header','cell','narrative_block')),
  target_id VARCHAR(36) NOT NULL,
  font_color_token VARCHAR(30),
  font_size_token VARCHAR(10) CHECK (font_size_token IS NULL OR font_size_token IN ('xs','sm','md','lg','xl')),
  bold BOOLEAN NOT NULL DEFAULT false,
  italic BOOLEAN NOT NULL DEFAULT false,
  updated_by VARCHAR(36),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT matrix_cell_styles_target_key UNIQUE (matrix_id, target_type, target_id)
);
CREATE INDEX IF NOT EXISTS mcs_matrix_target_idx ON matrix_cell_styles (matrix_id, target_type, target_id);
ALTER TABLE matrix_cell_styles
  DROP CONSTRAINT IF EXISTS mcs_matrix_id_fkey;
ALTER TABLE matrix_cell_styles
  ADD CONSTRAINT mcs_matrix_id_fkey FOREIGN KEY (matrix_id) REFERENCES task_matrices(id) ON DELETE CASCADE;

-- Section 7: matrix_formula_definitions (PRD §8.9) — V3 A1 formula model
-- Note: V2's existing matrix_formula_definitions table is renamed conceptually;
-- to avoid collision we use a NEW table matrix_formula_definitions_v3.
CREATE TABLE IF NOT EXISTS matrix_formula_definitions_v3 (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  matrix_id VARCHAR(36) NOT NULL,
  column_id VARCHAR(36) NOT NULL,
  expression_display TEXT NOT NULL,
  expression_ast JSONB NOT NULL,
  reference_mode VARCHAR(40) NOT NULL DEFAULT 'relative_by_visible_row',
  apply_scope VARCHAR(20) NOT NULL DEFAULT 'matrix' CHECK (apply_scope IN ('matrix','level_1_group')),
  result_format VARCHAR(20) NOT NULL DEFAULT 'number',
  decimal_places INT NOT NULL DEFAULT 2,
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active','invalid','archived')),
  created_by VARCHAR(36),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS mfd3_matrix_id_idx ON matrix_formula_definitions_v3 (matrix_id);
CREATE INDEX IF NOT EXISTS mfd3_column_id_idx ON matrix_formula_definitions_v3 (column_id);
ALTER TABLE matrix_formula_definitions_v3
  DROP CONSTRAINT IF EXISTS mfd3_matrix_id_fkey;
ALTER TABLE matrix_formula_definitions_v3
  ADD CONSTRAINT mfd3_matrix_id_fkey FOREIGN KEY (matrix_id) REFERENCES task_matrices(id) ON DELETE CASCADE;
ALTER TABLE matrix_formula_definitions_v3
  DROP CONSTRAINT IF EXISTS mfd3_column_id_fkey;
ALTER TABLE matrix_formula_definitions_v3
  ADD CONSTRAINT mfd3_column_id_fkey FOREIGN KEY (column_id) REFERENCES matrix_column_definitions(id) ON DELETE CASCADE;

-- Section 8: matrix_formula_runs (PRD §8.10) — audit per cell calculation
CREATE TABLE IF NOT EXISTS matrix_formula_runs_v3 (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  formula_id VARCHAR(36) NOT NULL,
  matrix_id VARCHAR(36) NOT NULL,
  leaf_row_id VARCHAR(36) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('success','pending','failed')),
  result_value DECIMAL(18,6),
  error_code VARCHAR(60),
  dependency_snapshot JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS mfr3_formula_id_idx ON matrix_formula_runs_v3 (formula_id);
CREATE INDEX IF NOT EXISTS mfr3_matrix_row_idx ON matrix_formula_runs_v3 (matrix_id, leaf_row_id);
ALTER TABLE matrix_formula_runs_v3
  DROP CONSTRAINT IF EXISTS mfr3_formula_id_fkey;
ALTER TABLE matrix_formula_runs_v3
  ADD CONSTRAINT mfr3_formula_id_fkey FOREIGN KEY (formula_id) REFERENCES matrix_formula_definitions_v3(id) ON DELETE CASCADE;

-- Section 9: matrix_narrative_blocks (PRD §8.11) — summary / notes
CREATE TABLE IF NOT EXISTS matrix_narrative_blocks (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  matrix_id VARCHAR(36) NOT NULL,
  block_type VARCHAR(30) NOT NULL CHECK (block_type IN (
    'summary','note','formula_note','method_note','limitation_note'
  )),
  scope VARCHAR(20) NOT NULL DEFAULT 'matrix' CHECK (scope IN ('matrix','level_1_group')),
  scope_node_id VARCHAR(36),
  content TEXT,
  ai_suggestion_id VARCHAR(36),
  show_in_report BOOLEAN NOT NULL DEFAULT true,
  sort_order INT NOT NULL DEFAULT 0,
  updated_by VARCHAR(36),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS mnb_matrix_scope_idx ON matrix_narrative_blocks (matrix_id, scope);
CREATE INDEX IF NOT EXISTS mnb_node_idx ON matrix_narrative_blocks (scope_node_id);
ALTER TABLE matrix_narrative_blocks
  DROP CONSTRAINT IF EXISTS mnb_matrix_id_fkey;
ALTER TABLE matrix_narrative_blocks
  ADD CONSTRAINT mnb_matrix_id_fkey FOREIGN KEY (matrix_id) REFERENCES task_matrices(id) ON DELETE CASCADE;
ALTER TABLE matrix_narrative_blocks
  DROP CONSTRAINT IF EXISTS mnb_node_fkey;
ALTER TABLE matrix_narrative_blocks
  ADD CONSTRAINT mnb_node_fkey FOREIGN KEY (scope_node_id) REFERENCES matrix_hierarchy_nodes(id) ON DELETE CASCADE;

-- Section 10: Extend task_matrices with current_view_definition_id
ALTER TABLE task_matrices
  ADD COLUMN IF NOT EXISTS current_view_definition_id VARCHAR(36);
ALTER TABLE task_matrices
  DROP CONSTRAINT IF EXISTS tm_view_def_fkey;
ALTER TABLE task_matrices
  ADD CONSTRAINT tm_view_def_fkey FOREIGN KEY (current_view_definition_id)
  REFERENCES matrix_view_definitions(id) ON DELETE SET NULL;
