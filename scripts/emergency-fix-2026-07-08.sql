-- ============================================================
-- Emergency Fix Migration: 2026-07-08
-- Fixes:
--   1. Add V2.3 media standardization columns to materials table
--   2. Add V2 Data Matrix tables (task_matrices etc.)
--   3. Feature flag for data matrix
-- Idempotent: safe to re-run (all IF NOT EXISTS)
-- ============================================================

-- ============================================================
-- Fix 2: V2.3 对比组装与媒体标准化字段
-- ============================================================
ALTER TABLE materials ADD COLUMN IF NOT EXISTS comparison_cell_id VARCHAR(36);
ALTER TABLE materials ADD COLUMN IF NOT EXISTS comparison_assembly_id VARCHAR(36);
ALTER TABLE materials ADD COLUMN IF NOT EXISTS normalized_thumb_path TEXT;
ALTER TABLE materials ADD COLUMN IF NOT EXISTS video_cover_path TEXT;
ALTER TABLE materials ADD COLUMN IF NOT EXISTS media_display_order INTEGER DEFAULT 0;
ALTER TABLE materials ADD COLUMN IF NOT EXISTS media_role VARCHAR(40);

-- ============================================================
-- Fix 3: Data Matrix V2 任务级用户自设计模型 (PRD V3.1 §3.4–3.8)
-- ============================================================

CREATE TABLE IF NOT EXISTS task_matrices (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id VARCHAR(36) NOT NULL REFERENCES experience_tasks(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  description VARCHAR(500),
  status VARCHAR(20) NOT NULL DEFAULT 'designing'
    CHECK (status IN ('designing','active','review_locked','completed','archived')),
  current_design_version_id VARCHAR(36),
  comparability_status VARCHAR(20) DEFAULT 'not_applicable'
    CHECK (comparability_status IN ('not_applicable','pending','comparable','partially_comparable','not_comparable')),
  comparability_statement TEXT,
  created_by VARCHAR(36) NOT NULL REFERENCES platform_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  version INTEGER DEFAULT 1 NOT NULL,
  archived_at TIMESTAMPTZ,
  archived_reason TEXT,
  UNIQUE (task_id, name)
);
CREATE INDEX IF NOT EXISTS task_matrices_task_id_idx ON task_matrices(task_id);
CREATE INDEX IF NOT EXISTS task_matrices_created_by_idx ON task_matrices(created_by);
CREATE INDEX IF NOT EXISTS task_matrices_status_idx ON task_matrices(status);

CREATE TABLE IF NOT EXISTS matrix_design_versions (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  matrix_id VARCHAR(36) NOT NULL REFERENCES task_matrices(id) ON DELETE CASCADE,
  version_no INTEGER NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','confirmed','superseded','retired')),
  design_hash VARCHAR(128),
  created_by VARCHAR(36) REFERENCES platform_users(id) ON DELETE SET NULL,
  confirmed_by VARCHAR(36) REFERENCES platform_users(id) ON DELETE SET NULL,
  confirmed_at TIMESTAMPTZ,
  change_type VARCHAR(30) NOT NULL DEFAULT 'initial'
    CHECK (change_type IN ('initial','safe_addition','safe_presentation_change')),
  change_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  UNIQUE (matrix_id, version_no)
);
CREATE INDEX IF NOT EXISTS matrix_design_versions_matrix_id_idx ON matrix_design_versions(matrix_id);

CREATE TABLE IF NOT EXISTS matrix_sections (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  design_version_id VARCHAR(36) NOT NULL REFERENCES matrix_design_versions(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  scope VARCHAR(10) NOT NULL CHECK (scope IN ('row','group','matrix')),
  description TEXT,
  sort_order INTEGER DEFAULT 0 NOT NULL,
  is_collapsible BOOLEAN DEFAULT TRUE,
  default_expanded BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  UNIQUE (design_version_id, scope, name)
);
CREATE INDEX IF NOT EXISTS matrix_sections_design_version_id_idx ON matrix_sections(design_version_id);

CREATE TABLE IF NOT EXISTS matrix_field_definitions (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  design_version_id VARCHAR(36) NOT NULL REFERENCES matrix_design_versions(id) ON DELETE CASCADE,
  section_id VARCHAR(36) NOT NULL REFERENCES matrix_sections(id) ON DELETE CASCADE,
  scope VARCHAR(10) NOT NULL CHECK (scope IN ('row','group','matrix')),
  label VARCHAR(100) NOT NULL,
  field_kind VARCHAR(20) NOT NULL
    CHECK (field_kind IN ('manual_value','formula','evidence_slot','issue_slot')),
  data_type VARCHAR(30) NOT NULL
    CHECK (data_type IN ('short_text','long_text','number','percentage','duration',
      'single_select','multi_select','boolean','date_time',
      'calculated_number','calculated_percentage','calculated_duration',
      'image_slot','video_slot','file_slot','issue_slot')),
  required_mode VARCHAR(30) DEFAULT 'optional'
    CHECK (required_mode IN ('optional','required','required_when_condition_met')),
  unit_text VARCHAR(40),
  decimal_places INTEGER DEFAULT 2,
  min_value NUMERIC(18,6),
  max_value NUMERIC(18,6),
  enum_options JSONB DEFAULT '[]',
  formula_expression TEXT,
  result_status_mapping JSONB DEFAULT '{}',
  evidence_max_count INTEGER DEFAULT 1,
  evidence_allowed_types JSONB DEFAULT '["image","video"]',
  visible_on_desktop BOOLEAN DEFAULT TRUE,
  visible_on_mobile BOOLEAN DEFAULT TRUE,
  visible_in_report BOOLEAN DEFAULT TRUE,
  sort_order INTEGER DEFAULT 0 NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  UNIQUE (design_version_id, scope, label)
);
CREATE INDEX IF NOT EXISTS matrix_field_definitions_dv_idx ON matrix_field_definitions(design_version_id);
CREATE INDEX IF NOT EXISTS matrix_field_definitions_section_idx ON matrix_field_definitions(section_id);

CREATE TABLE IF NOT EXISTS matrix_groups (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  matrix_id VARCHAR(36) NOT NULL REFERENCES task_matrices(id) ON DELETE CASCADE,
  name VARCHAR(200) NOT NULL,
  sort_order INTEGER DEFAULT 0 NOT NULL,
  completion_status VARCHAR(20) DEFAULT 'pending'
    CHECK (completion_status IN ('pending','in_progress','completed','skipped')),
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS matrix_groups_matrix_id_idx ON matrix_groups(matrix_id);

CREATE TABLE IF NOT EXISTS matrix_rows (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id VARCHAR(36) NOT NULL REFERENCES matrix_groups(id) ON DELETE CASCADE,
  matrix_id VARCHAR(36) NOT NULL REFERENCES task_matrices(id) ON DELETE CASCADE,
  label VARCHAR(300) NOT NULL,
  sort_order INTEGER DEFAULT 0 NOT NULL,
  completion_status VARCHAR(20) DEFAULT 'pending'
    CHECK (completion_status IN ('pending','in_progress','completed','skipped')),
  version INTEGER DEFAULT 1 NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS matrix_rows_group_id_idx ON matrix_rows(group_id);
CREATE INDEX IF NOT EXISTS matrix_rows_matrix_id_idx ON matrix_rows(matrix_id);

CREATE TABLE IF NOT EXISTS matrix_field_values (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  row_id VARCHAR(36) NOT NULL REFERENCES matrix_rows(id) ON DELETE CASCADE,
  field_definition_id VARCHAR(36) NOT NULL REFERENCES matrix_field_definitions(id) ON DELETE CASCADE,
  value_state VARCHAR(20) DEFAULT 'missing'
    CHECK (value_state IN ('missing','not_tested','not_applicable','pending_input','filled','calculation_failed')),
  numeric_value NUMERIC(18,6),
  text_value TEXT,
  duration_ms BIGINT,
  boolean_value BOOLEAN,
  date_time_value TIMESTAMPTZ,
  enum_value VARCHAR(200),
  unit_code VARCHAR(40),
  calculation_mode VARCHAR(20) CHECK (calculation_mode IN ('manual','computed')),
  formula_definition_id VARCHAR(36),
  formula_version VARCHAR(40),
  source_calculation_run_id VARCHAR(36),
  error_code VARCHAR(60),
  version INTEGER DEFAULT 1 NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  UNIQUE (row_id, field_definition_id)
);
CREATE INDEX IF NOT EXISTS matrix_field_values_row_id_idx ON matrix_field_values(row_id);
CREATE INDEX IF NOT EXISTS matrix_field_values_fd_idx ON matrix_field_values(field_definition_id);

CREATE TABLE IF NOT EXISTS matrix_narratives (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  scope VARCHAR(10) NOT NULL CHECK (scope IN ('group','matrix')),
  matrix_id VARCHAR(36) REFERENCES task_matrices(id) ON DELETE CASCADE,
  group_id VARCHAR(36) REFERENCES matrix_groups(id) ON DELETE CASCADE,
  narrative_key VARCHAR(50) NOT NULL DEFAULT 'summary',
  content TEXT,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS matrix_narratives_matrix_id_idx ON matrix_narratives(matrix_id);
CREATE INDEX IF NOT EXISTS matrix_narratives_group_id_idx ON matrix_narratives(group_id);
CREATE UNIQUE INDEX IF NOT EXISTS matrix_narratives_scope_key_idx
ON matrix_narratives (
  scope,
  COALESCE(matrix_id, '00000000-0000-0000-0000-000000000000'),
  COALESCE(group_id, '00000000-0000-0000-0000-000000000000'),
  narrative_key
);

-- Extend formula_definitions and calculation_runs for V2 model
ALTER TABLE matrix_formula_definitions ADD COLUMN IF NOT EXISTS field_definition_id VARCHAR(36) REFERENCES matrix_field_definitions(id) ON DELETE CASCADE;
ALTER TABLE matrix_formula_definitions ALTER COLUMN schema_version_id DROP NOT NULL;
ALTER TABLE matrix_calculation_runs ADD COLUMN IF NOT EXISTS task_matrix_id VARCHAR(36) REFERENCES task_matrices(id) ON DELETE CASCADE;
ALTER TABLE matrix_calculation_runs ALTER COLUMN matrix_instance_id DROP NOT NULL;

-- Feature flag for data matrix V2
INSERT INTO platform_settings (key, value)
VALUES ('feature_flag_task_matrix', '{"task_matrix_enabled":true,"matrix_runtime_designer_enabled":true,"matrix_formula_enabled":true,"matrix_mobile_enabled":true,"matrix_batch_paste_enabled":true,"matrix_report_projection_enabled":true,"matrix_structural_revision_enabled":true}'::jsonb)
ON CONFLICT (key) DO NOTHING;
