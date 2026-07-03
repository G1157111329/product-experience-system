-- Data Matrix Input View — schema registry, versioning, dimensions, formulas, calculation runs.
-- Idempotent: safe to re-run (all CREATE/ALTER use IF NOT EXISTS).

-- Matrix schema registry (admin-published, versioned, immutable once published)
CREATE TABLE IF NOT EXISTS matrix_schemas (
  id varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  schema_key varchar(100) NOT NULL UNIQUE,
  name varchar(200) NOT NULL,
  product_category varchar(100),
  experience_type_allowlist jsonb DEFAULT '[]',
  status varchar(20) NOT NULL DEFAULT 'draft',
  latest_published_version_id varchar(36),
  owner_id varchar(36) REFERENCES platform_users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS matrix_schema_versions (
  id varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  schema_id varchar(36) NOT NULL REFERENCES matrix_schemas(id) ON DELETE CASCADE,
  version_no integer NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'draft',
  schema_json jsonb NOT NULL,
  checksum varchar(80),
  published_at timestamptz,
  published_by varchar(36) REFERENCES platform_users(id) ON DELETE SET NULL,
  effective_from timestamptz,
  effective_to timestamptz,
  created_at timestamptz DEFAULT now(),
  UNIQUE (schema_id, version_no)
);

CREATE TABLE IF NOT EXISTS matrix_dimension_bindings (
  id varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  schema_version_id varchar(36) NOT NULL REFERENCES matrix_schema_versions(id) ON DELETE CASCADE,
  dimension_key varchar(100) NOT NULL,
  display_name varchar(200) NOT NULL,
  column_group varchar(20) NOT NULL,
  value_kind varchar(20) NOT NULL,
  unit_code varchar(40),
  metric_definition_id varchar(36) REFERENCES metric_definitions(id) ON DELETE SET NULL,
  required boolean DEFAULT false,
  editable boolean DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  display_format_json jsonb DEFAULT '{}',
  validation_rule_json jsonb DEFAULT '{}',
  UNIQUE (schema_version_id, dimension_key)
);

CREATE TABLE IF NOT EXISTS matrix_formula_definitions (
  id varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  schema_version_id varchar(36) NOT NULL REFERENCES matrix_schema_versions(id) ON DELETE CASCADE,
  output_dimension_key varchar(100) NOT NULL,
  formula_dsl text NOT NULL,
  compiled_ast jsonb,
  dependency_json jsonb,
  scope varchar(20) NOT NULL DEFAULT 'row',
  formula_version varchar(40) NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'draft',
  UNIQUE (schema_version_id, output_dimension_key)
);

CREATE TABLE IF NOT EXISTS matrix_calculation_runs (
  id varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  matrix_instance_id varchar(36) NOT NULL REFERENCES comparison_assemblies(id) ON DELETE CASCADE,
  trigger_type varchar(20) NOT NULL,
  input_version_hash varchar(80) NOT NULL,
  formula_version_hash varchar(80) NOT NULL,
  status varchar(20) NOT NULL,
  error_code varchar(60),
  error_detail_sanitized text,
  computed_at timestamptz DEFAULT now(),
  trace_id varchar(60)
);
CREATE INDEX IF NOT EXISTS matrix_calculation_runs_instance_idx ON matrix_calculation_runs(matrix_instance_id);

-- Mark comparison_assemblies that are data-matrix instances
ALTER TABLE comparison_assemblies
  ADD COLUMN IF NOT EXISTS matrix_schema_version_id varchar(36) REFERENCES matrix_schema_versions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS matrix_role varchar(20) DEFAULT 'comparison',
  ADD COLUMN IF NOT EXISTS comparability_status varchar(20) DEFAULT 'unknown';

-- Typed-value columns on metric_evaluations (raw + calculated)
ALTER TABLE metric_evaluations
  ADD COLUMN IF NOT EXISTS value_kind varchar(20),
  ADD COLUMN IF NOT EXISTS numeric_value numeric(18,6),
  ADD COLUMN IF NOT EXISTS text_value text,
  ADD COLUMN IF NOT EXISTS duration_ms bigint,
  ADD COLUMN IF NOT EXISTS unit_code varchar(40),
  ADD COLUMN IF NOT EXISTS input_state varchar(20) DEFAULT 'valid',
  ADD COLUMN IF NOT EXISTS calculation_mode varchar(20),
  ADD COLUMN IF NOT EXISTS formula_definition_id varchar(36),
  ADD COLUMN IF NOT EXISTS source_run_id varchar(36) REFERENCES matrix_calculation_runs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS error_code varchar(60),
  ADD COLUMN IF NOT EXISTS version integer DEFAULT 1;
