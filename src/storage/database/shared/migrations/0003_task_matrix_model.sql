-- Data Matrix V2: task_matrices user-designed model (PRD V3.1 §3.4–3.8)
-- Replaces the schema-registry model (matrix_schemas/matrix_dimension_bindings)
-- for runtime task-matrix instances. Schema-registry tables remain for Wave 2
-- reusable-design-library, but runtime instances use these new tables.
-- Idempotent: safe to re-run (all CREATE/ALTER use IF NOT EXISTS).

-- ============================================================
-- 1. Main table: one matrix per task (PRD §3.4)
-- ============================================================
CREATE TABLE IF NOT EXISTS task_matrices (
  id varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id varchar(36) NOT NULL REFERENCES experience_tasks(id) ON DELETE CASCADE,
  name varchar(100) NOT NULL,
  description varchar(500),
  status varchar(20) NOT NULL DEFAULT 'designing'
    CHECK (status IN ('designing','active','review_locked','completed','archived')),
  current_design_version_id varchar(36),
  comparability_status varchar(20) DEFAULT 'not_applicable'
    CHECK (comparability_status IN ('not_applicable','pending','comparable','partially_comparable','not_comparable')),
  comparability_statement text,
  created_by varchar(36) NOT NULL REFERENCES platform_users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  version integer DEFAULT 1 NOT NULL,
  archived_at timestamptz,
  archived_reason text,
  UNIQUE (task_id, name)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS task_matrices_task_id_idx ON task_matrices(task_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS task_matrices_created_by_idx ON task_matrices(created_by);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS task_matrices_status_idx ON task_matrices(status);

-- ============================================================
-- 2. Design versions (PRD §3.5)
-- ============================================================
CREATE TABLE IF NOT EXISTS matrix_design_versions (
  id varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  matrix_id varchar(36) NOT NULL REFERENCES task_matrices(id) ON DELETE CASCADE,
  version_no integer NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','confirmed','superseded','retired')),
  design_hash varchar(128),
  created_by varchar(36) REFERENCES platform_users(id) ON DELETE SET NULL,
  confirmed_by varchar(36) REFERENCES platform_users(id) ON DELETE SET NULL,
  confirmed_at timestamptz,
  change_type varchar(30) NOT NULL DEFAULT 'initial'
    CHECK (change_type IN ('initial','safe_addition','safe_presentation_change')),
  change_reason text,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE (matrix_id, version_no)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS matrix_design_versions_matrix_id_idx ON matrix_design_versions(matrix_id);

-- ============================================================
-- 3. Field sections / partitions (PRD §3.6.1)
-- ============================================================
CREATE TABLE IF NOT EXISTS matrix_sections (
  id varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  design_version_id varchar(36) NOT NULL REFERENCES matrix_design_versions(id) ON DELETE CASCADE,
  name varchar(100) NOT NULL,
  scope varchar(10) NOT NULL CHECK (scope IN ('row','group','matrix')),
  description text,
  sort_order integer DEFAULT 0 NOT NULL,
  is_collapsible boolean DEFAULT true,
  default_expanded boolean DEFAULT true,
  created_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE (design_version_id, scope, name)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS matrix_sections_design_version_id_idx ON matrix_sections(design_version_id);

-- ============================================================
-- 4. Field definitions (PRD §3.7)
-- ============================================================
CREATE TABLE IF NOT EXISTS matrix_field_definitions (
  id varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  design_version_id varchar(36) NOT NULL REFERENCES matrix_design_versions(id) ON DELETE CASCADE,
  section_id varchar(36) NOT NULL REFERENCES matrix_sections(id) ON DELETE CASCADE,
  scope varchar(10) NOT NULL CHECK (scope IN ('row','group','matrix')),
  label varchar(100) NOT NULL,
  field_kind varchar(20) NOT NULL
    CHECK (field_kind IN ('manual_value','formula','evidence_slot','issue_slot')),
  data_type varchar(30) NOT NULL
    CHECK (data_type IN ('short_text','long_text','number','percentage','duration',
      'single_select','multi_select','boolean','date_time',
      'calculated_number','calculated_percentage','calculated_duration',
      'image_slot','video_slot','file_slot','issue_slot')),
  required_mode varchar(30) DEFAULT 'optional'
    CHECK (required_mode IN ('optional','required','required_when_condition_met')),
  unit_text varchar(30),
  display_format varchar(20) DEFAULT 'plain_number',
  decimal_places smallint DEFAULT 1,
  min_value numeric(18,4),
  max_value numeric(18,4),
  allow_not_tested boolean DEFAULT true,
  allow_not_applicable boolean DEFAULT true,
  show_in_desktop_grid boolean DEFAULT true,
  show_in_mobile_card boolean DEFAULT false,
  show_in_report boolean DEFAULT true,
  report_priority varchar(10) DEFAULT 'secondary'
    CHECK (report_priority IN ('primary','secondary','hidden')),
  -- For enum types: JSON array of option values
  enum_options jsonb,
  -- For result-status mapping (PRD §5.3.5 result status mapping)
  is_result_status_field boolean DEFAULT false,
  result_status_mapping jsonb,
  -- Conditional required: {"depends_on_field_id": "...", "when_value": "..."}
  required_condition jsonb,
  -- Evidence slot config
  max_media_count smallint DEFAULT 10,
  allowed_media_types jsonb DEFAULT '["image","video"]'::jsonb,
  is_critical_evidence boolean DEFAULT false,
  upload_instructions text,
  -- Track usage
  sort_order integer DEFAULT 0 NOT NULL,
  is_archived boolean DEFAULT false,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS matrix_field_definitions_dv_idx ON matrix_field_definitions(design_version_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS matrix_field_definitions_section_idx ON matrix_field_definitions(section_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS matrix_field_definitions_kind_idx ON matrix_field_definitions(field_kind);

-- ============================================================
-- 5. Groups within a matrix (PRD §3.3 entity diagram)
-- ============================================================
CREATE TABLE IF NOT EXISTS matrix_groups (
  id varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  matrix_id varchar(36) NOT NULL REFERENCES task_matrices(id) ON DELETE CASCADE,
  group_label varchar(200) NOT NULL,
  description text,
  sort_order integer DEFAULT 0 NOT NULL,
  is_archived boolean DEFAULT false,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE (matrix_id, group_label)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS matrix_groups_matrix_id_idx ON matrix_groups(matrix_id);

-- ============================================================
-- 6. Rows within groups (PRD §3.3 entity diagram)
-- ============================================================
CREATE TABLE IF NOT EXISTS matrix_rows (
  id varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id varchar(36) NOT NULL REFERENCES matrix_groups(id) ON DELETE CASCADE,
  matrix_id varchar(36) NOT NULL REFERENCES task_matrices(id) ON DELETE CASCADE,
  row_label varchar(200) NOT NULL,
  description text,
  sort_order integer DEFAULT 0 NOT NULL,
  completion_status varchar(20) DEFAULT 'pending'
    CHECK (completion_status IN ('pending','in_progress','completed','not_applicable','test_invalid')),
  test_invalid_reason text,
  is_archived boolean DEFAULT false,
  version integer DEFAULT 1 NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE (group_id, row_label)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS matrix_rows_group_id_idx ON matrix_rows(group_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS matrix_rows_matrix_id_idx ON matrix_rows(matrix_id);

-- ============================================================
-- 7. Field values per row (PRD §3.8 value states)
-- ============================================================
CREATE TABLE IF NOT EXISTS matrix_field_values (
  id varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  row_id varchar(36) NOT NULL REFERENCES matrix_rows(id) ON DELETE CASCADE,
  field_definition_id varchar(36) NOT NULL REFERENCES matrix_field_definitions(id) ON DELETE CASCADE,
  value_state varchar(20) DEFAULT 'missing'
    CHECK (value_state IN ('missing','not_tested','not_applicable','pending_input','filled','calculation_failed')),
  -- Typed value columns
  numeric_value numeric(18,6),
  text_value text,
  duration_ms bigint,
  boolean_value boolean,
  date_time_value timestamptz,
  enum_value varchar(200),
  unit_code varchar(40),
  -- Calculation metadata
  calculation_mode varchar(20) CHECK (calculation_mode IN ('manual','computed')),
  formula_definition_id varchar(36),
  formula_version varchar(40),
  source_calculation_run_id varchar(36),
  error_code varchar(60),
  -- Concurrency
  version integer DEFAULT 1 NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE (row_id, field_definition_id)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS matrix_field_values_row_id_idx ON matrix_field_values(row_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS matrix_field_values_fd_idx ON matrix_field_values(field_definition_id);

-- ============================================================
-- 8. Narratives: group-level and matrix-level text (PRD §3.3)
-- ============================================================
CREATE TABLE IF NOT EXISTS matrix_narratives (
  id varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  scope varchar(10) NOT NULL CHECK (scope IN ('group','matrix')),
  -- If scope='group': group_id is set; if scope='matrix': matrix_id is set
  matrix_id varchar(36) REFERENCES task_matrices(id) ON DELETE CASCADE,
  group_id varchar(36) REFERENCES matrix_groups(id) ON DELETE CASCADE,
  narrative_key varchar(50) NOT NULL DEFAULT 'summary',
  content text,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS matrix_narratives_matrix_id_idx ON matrix_narratives(matrix_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS matrix_narratives_group_id_idx ON matrix_narratives(group_id);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS matrix_narratives_scope_key_idx
ON matrix_narratives (
  scope,
  COALESCE(matrix_id, '00000000-0000-0000-0000-000000000000'),
  COALESCE(group_id, '00000000-0000-0000-0000-000000000000'),
  narrative_key
);

-- ============================================================
-- 9. Extend formula definitions to also reference task-matrix field definitions
-- ============================================================
ALTER TABLE matrix_formula_definitions
  ADD COLUMN IF NOT EXISTS field_definition_id varchar(36) REFERENCES matrix_field_definitions(id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE matrix_formula_definitions
  DROP CONSTRAINT IF EXISTS matrix_formula_definitions_version_output_key;
--> statement-breakpoint
-- Allow either schema-version-based OR field-definition-based formulas
ALTER TABLE matrix_formula_definitions
  ALTER COLUMN schema_version_id DROP NOT NULL;
--> statement-breakpoint
-- New unique: either schema_version_id+output_dimension_key OR field_definition_id
-- (Enforced at application layer since partial unique indexes can be complex)

-- ============================================================
-- 10. Extend calculation runs to reference task_matrices
-- ============================================================
ALTER TABLE matrix_calculation_runs
  ADD COLUMN IF NOT EXISTS task_matrix_id varchar(36) REFERENCES task_matrices(id) ON DELETE CASCADE;
--> statement-breakpoint
-- Allow either comparison_assembly-based OR task_matrix-based runs
ALTER TABLE matrix_calculation_runs
  ALTER COLUMN matrix_instance_id DROP NOT NULL;

-- ============================================================
-- 11. Feature flags (PRD §16.1) — stored in platform_settings
-- ============================================================
INSERT INTO platform_settings (key, value)
VALUES ('feature_flag_task_matrix', '{"task_matrix_enabled":true,"matrix_runtime_designer_enabled":true,"matrix_formula_enabled":true,"matrix_mobile_enabled":true,"matrix_batch_paste_enabled":true,"matrix_report_projection_enabled":true,"matrix_structural_revision_enabled":true}'::jsonb)
ON CONFLICT (key) DO NOTHING;
