-- ============================================================
-- V2.3 对比组装与统一报告体系
-- 详见 docs/PRD-v2.3-dev-roadmap.md 与 docs/product_experience_platform_technical_plan_v2_3_fused_comparison_group.md
-- 设计原则：旧表只新增可空字段，不破坏现有数据；新增表全部 IF NOT EXISTS 幂等
-- ============================================================

-- ------------------------------------------------------------
-- V2.3-A 旧表扩展
-- ------------------------------------------------------------

-- experience_tasks 新增 4 字段（V2.3 对比组装）
ALTER TABLE experience_tasks ADD COLUMN IF NOT EXISTS task_mode VARCHAR(20) NOT NULL DEFAULT 'single';
ALTER TABLE experience_tasks ADD COLUMN IF NOT EXISTS comparison_intent TEXT;
ALTER TABLE experience_tasks ADD COLUMN IF NOT EXISTS comparison_layout_type VARCHAR(40);
ALTER TABLE experience_tasks ADD COLUMN IF NOT EXISTS comparison_source VARCHAR(40);
CREATE INDEX IF NOT EXISTS experience_tasks_task_mode_idx ON experience_tasks(task_mode);

-- reports 新增 7 字段（V2.3 统一报告资产）
ALTER TABLE reports ADD COLUMN IF NOT EXISTS report_type VARCHAR(40) NOT NULL DEFAULT 'single_report';
ALTER TABLE reports ADD COLUMN IF NOT EXISTS source_task_ids JSONB DEFAULT '[]';
ALTER TABLE reports ADD COLUMN IF NOT EXISTS source_report_ids JSONB DEFAULT '[]';
ALTER TABLE reports ADD COLUMN IF NOT EXISTS assembly_id VARCHAR(36);
ALTER TABLE reports ADD COLUMN IF NOT EXISTS snapshot_id VARCHAR(36);
ALTER TABLE reports ADD COLUMN IF NOT EXISTS layout_profile VARCHAR(80);
ALTER TABLE reports ADD COLUMN IF NOT EXISTS ai_confirmation_status VARCHAR(20) DEFAULT 'pending';
CREATE INDEX IF NOT EXISTS reports_report_type_idx ON reports(report_type);
CREATE INDEX IF NOT EXISTS reports_assembly_id_idx ON reports(assembly_id);

-- materials 新增 6 字段（V2.3 对比单元格关联与媒体标准化）
ALTER TABLE materials ADD COLUMN IF NOT EXISTS comparison_cell_id VARCHAR(36);
ALTER TABLE materials ADD COLUMN IF NOT EXISTS comparison_assembly_id VARCHAR(36);
ALTER TABLE materials ADD COLUMN IF NOT EXISTS normalized_thumb_path TEXT;
ALTER TABLE materials ADD COLUMN IF NOT EXISTS video_cover_path TEXT;
ALTER TABLE materials ADD COLUMN IF NOT EXISTS media_display_order INTEGER DEFAULT 0;
ALTER TABLE materials ADD COLUMN IF NOT EXISTS media_role VARCHAR(40);
CREATE INDEX IF NOT EXISTS materials_comparison_cell_id_idx ON materials(comparison_cell_id);
CREATE INDEX IF NOT EXISTS materials_comparison_assembly_id_idx ON materials(comparison_assembly_id);

-- ------------------------------------------------------------
-- V2.3-B 对比组装新表（13 张）
-- ------------------------------------------------------------

-- 对比组装：底层组装对象
CREATE TABLE IF NOT EXISTS comparison_assemblies (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(200) NOT NULL,
  assembly_type VARCHAR(40) NOT NULL,
  source_type VARCHAR(40) NOT NULL,
  product_category VARCHAR(100),
  product VARCHAR(100),
  comparison_intent TEXT,
  layout_type VARCHAR(40) NOT NULL DEFAULT 'image_matrix',
  status VARCHAR(30) NOT NULL DEFAULT 'draft',
  source_task_ids JSONB DEFAULT '[]',
  source_report_ids JSONB DEFAULT '[]',
  created_by VARCHAR(36) NOT NULL REFERENCES platform_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS comparison_assemblies_created_by_idx ON comparison_assemblies(created_by);
CREATE INDEX IF NOT EXISTS comparison_assemblies_assembly_type_idx ON comparison_assemblies(assembly_type);
CREATE INDEX IF NOT EXISTS comparison_assemblies_status_idx ON comparison_assemblies(status);
ALTER TABLE comparison_assemblies ADD COLUMN IF NOT EXISTS source_task_ids JSONB DEFAULT '[]';
ALTER TABLE comparison_assemblies ADD COLUMN IF NOT EXISTS source_report_ids JSONB DEFAULT '[]';

-- 对比对象：被比较的实体（可绑定任务/报告，但不强制）
CREATE TABLE IF NOT EXISTS comparison_objects (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  assembly_id VARCHAR(36) NOT NULL REFERENCES comparison_assemblies(id) ON DELETE CASCADE,
  task_id VARCHAR(36) REFERENCES experience_tasks(id) ON DELETE SET NULL,
  report_id VARCHAR(36) REFERENCES reports(id) ON DELETE SET NULL,
  object_name VARCHAR(200) NOT NULL,
  object_type VARCHAR(60) NOT NULL,
  comparison_factor VARCHAR(100),
  brand VARCHAR(100),
  model VARCHAR(100),
  specification VARCHAR(200),
  material_structure VARCHAR(200),
  project_stage VARCHAR(100),
  sample_batch VARCHAR(100),
  object_source_type VARCHAR(100),
  is_competitor BOOLEAN DEFAULT FALSE,
  parent_product VARCHAR(200),
  cover_material_id VARCHAR(36),
  custom_fields JSONB DEFAULT '{}',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS comparison_objects_assembly_id_idx ON comparison_objects(assembly_id);
CREATE INDEX IF NOT EXISTS comparison_objects_sort_order_idx ON comparison_objects(assembly_id, sort_order);

-- 对比项目树：可变层级结构（自引用 parent_id）
CREATE TABLE IF NOT EXISTS comparison_item_nodes (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  assembly_id VARCHAR(36) NOT NULL REFERENCES comparison_assemblies(id) ON DELETE CASCADE,
  parent_id VARCHAR(36) REFERENCES comparison_item_nodes(id) ON DELETE CASCADE,
  node_type VARCHAR(40) NOT NULL,
  node_label VARCHAR(200) NOT NULL,
  shared_recipe JSONB DEFAULT '{}',
  config JSONB DEFAULT '{}',
  sort_order INTEGER NOT NULL DEFAULT 0,
  depth INTEGER NOT NULL DEFAULT 0,
  is_collapsed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS comparison_item_nodes_assembly_id_idx ON comparison_item_nodes(assembly_id);
CREATE INDEX IF NOT EXISTS comparison_item_nodes_parent_id_idx ON comparison_item_nodes(parent_id);
CREATE INDEX IF NOT EXISTS comparison_item_nodes_assembly_sort_idx ON comparison_item_nodes(assembly_id, sort_order);

-- 矩阵单元格：对比项目节点 x 对比对象的交叉数据单元
CREATE TABLE IF NOT EXISTS comparison_matrix_cells (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  assembly_id VARCHAR(36) NOT NULL REFERENCES comparison_assemblies(id) ON DELETE CASCADE,
  item_node_id VARCHAR(36) NOT NULL REFERENCES comparison_item_nodes(id) ON DELETE CASCADE,
  object_id VARCHAR(36) NOT NULL REFERENCES comparison_objects(id) ON DELETE CASCADE,
  params JSONB DEFAULT '{}',
  process_notes JSONB DEFAULT '[]',
  effect_summary TEXT,
  problem_points JSONB DEFAULT '[]',
  manual_score VARCHAR(10),
  ai_score VARCHAR(10),
  conclusion_tag VARCHAR(40),
  metric_values JSONB DEFAULT '{}',
  media_display_config JSONB DEFAULT '{}',
  ai_status VARCHAR(20) DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(item_node_id, object_id)
);
CREATE INDEX IF NOT EXISTS comparison_matrix_cells_assembly_id_idx ON comparison_matrix_cells(assembly_id);
CREATE INDEX IF NOT EXISTS comparison_matrix_cells_item_node_id_idx ON comparison_matrix_cells(item_node_id);
CREATE INDEX IF NOT EXISTS comparison_matrix_cells_object_id_idx ON comparison_matrix_cells(object_id);

-- 指标定义库
CREATE TABLE IF NOT EXISTS metric_definitions (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  product_category VARCHAR(100),
  product VARCHAR(100),
  metric_key VARCHAR(100) NOT NULL,
  metric_name VARCHAR(100) NOT NULL,
  metric_type VARCHAR(40) NOT NULL,
  unit VARCHAR(40),
  default_formula TEXT,
  display_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  created_by VARCHAR(36) REFERENCES platform_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(metric_key, product_category, product)
);
CREATE INDEX IF NOT EXISTS metric_definitions_key_idx ON metric_definitions(metric_key);
CREATE INDEX IF NOT EXISTS metric_definitions_product_idx ON metric_definitions(product_category, product);

-- 指标公式版本
CREATE TABLE IF NOT EXISTS metric_formula_versions (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_definition_id VARCHAR(36) NOT NULL REFERENCES metric_definitions(id) ON DELETE CASCADE,
  formula TEXT NOT NULL,
  formula_version VARCHAR(40) NOT NULL,
  description TEXT,
  created_by VARCHAR(36) REFERENCES platform_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_active BOOLEAN DEFAULT TRUE,
  UNIQUE(metric_definition_id, formula_version)
);
CREATE INDEX IF NOT EXISTS metric_formula_versions_definition_id_idx ON metric_formula_versions(metric_definition_id);

-- 阈值规则
CREATE TABLE IF NOT EXISTS metric_threshold_rules (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  assembly_id VARCHAR(36) REFERENCES comparison_assemblies(id) ON DELETE CASCADE,
  item_node_id VARCHAR(36) REFERENCES comparison_item_nodes(id) ON DELETE CASCADE,
  metric_key VARCHAR(100) NOT NULL,
  operator VARCHAR(20) NOT NULL,
  target_value VARCHAR(100),
  target_text TEXT,
  unit VARCHAR(40),
  severity VARCHAR(20) DEFAULT 'warning',
  source_text TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS metric_threshold_rules_assembly_idx ON metric_threshold_rules(assembly_id);
CREATE INDEX IF NOT EXISTS metric_threshold_rules_item_node_idx ON metric_threshold_rules(item_node_id);

-- 指标计算结果
CREATE TABLE IF NOT EXISTS metric_evaluations (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  cell_id VARCHAR(36) NOT NULL REFERENCES comparison_matrix_cells(id) ON DELETE CASCADE,
  metric_key VARCHAR(100) NOT NULL,
  raw_value JSONB,
  calculated_value VARCHAR(100),
  display_value VARCHAR(200),
  formula_version_id VARCHAR(36) REFERENCES metric_formula_versions(id) ON DELETE SET NULL,
  threshold_rule_id VARCHAR(36) REFERENCES metric_threshold_rules(id) ON DELETE SET NULL,
  pass_fail_status VARCHAR(30),
  evaluation_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(cell_id, metric_key)
);
CREATE INDEX IF NOT EXISTS metric_evaluations_cell_id_idx ON metric_evaluations(cell_id);

-- 三层 AI 结果
CREATE TABLE IF NOT EXISTS comparison_ai_results (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  assembly_id VARCHAR(36) NOT NULL REFERENCES comparison_assemblies(id) ON DELETE CASCADE,
  level VARCHAR(20) NOT NULL,
  target_id VARCHAR(36) NOT NULL,
  skill_key VARCHAR(100) NOT NULL,
  input_snapshot JSONB NOT NULL,
  output JSONB NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'generated',
  confirmed_by VARCHAR(36) REFERENCES platform_users(id) ON DELETE SET NULL,
  confirmed_at TIMESTAMPTZ,
  rejected_reason TEXT,
  model_config_id VARCHAR(36),
  created_by VARCHAR(36) REFERENCES platform_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS comparison_ai_results_assembly_id_idx ON comparison_ai_results(assembly_id);
CREATE INDEX IF NOT EXISTS comparison_ai_results_level_target_idx ON comparison_ai_results(level, target_id);
CREATE INDEX IF NOT EXISTS comparison_ai_results_status_idx ON comparison_ai_results(status);

-- 报告快照
CREATE TABLE IF NOT EXISTS report_snapshots (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id VARCHAR(36) NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  report_type VARCHAR(40) NOT NULL,
  version INTEGER NOT NULL,
  snapshot_json JSONB NOT NULL,
  layout_profile VARCHAR(80) NOT NULL,
  created_by VARCHAR(36) REFERENCES platform_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(report_id, version)
);
CREATE INDEX IF NOT EXISTS report_snapshots_report_id_idx ON report_snapshots(report_id);

-- PDF 生成任务
CREATE TABLE IF NOT EXISTS pdf_generation_jobs (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id VARCHAR(36) NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  snapshot_id VARCHAR(36) NOT NULL REFERENCES report_snapshots(id) ON DELETE CASCADE,
  layout_profile VARCHAR(80) NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'queued',
  preflight_result JSONB DEFAULT '{}',
  file_path TEXT,
  file_size INTEGER,
  error_message TEXT,
  created_by VARCHAR(36) REFERENCES platform_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS pdf_generation_jobs_report_id_idx ON pdf_generation_jobs(report_id);
CREATE INDEX IF NOT EXISTS pdf_generation_jobs_status_idx ON pdf_generation_jobs(status);

-- Excel 导入任务
CREATE TABLE IF NOT EXISTS excel_import_jobs (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  file_name VARCHAR(300) NOT NULL,
  file_path TEXT NOT NULL,
  parse_status VARCHAR(30) NOT NULL DEFAULT 'queued',
  detected_template_id VARCHAR(36),
  detected_report_type VARCHAR(60),
  parsed_structure JSONB DEFAULT '{}',
  mapping_result JSONB DEFAULT '{}',
  created_by VARCHAR(36) REFERENCES platform_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  error_message TEXT
);
CREATE INDEX IF NOT EXISTS excel_import_jobs_created_by_idx ON excel_import_jobs(created_by);
CREATE INDEX IF NOT EXISTS excel_import_jobs_parse_status_idx ON excel_import_jobs(parse_status);

-- Excel 导入模板
CREATE TABLE IF NOT EXISTS excel_import_templates (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  template_name VARCHAR(200) NOT NULL,
  template_type VARCHAR(40) NOT NULL,
  product_category VARCHAR(100),
  structure_rules JSONB NOT NULL,
  mapping_rules JSONB NOT NULL,
  is_recommended BOOLEAN DEFAULT FALSE,
  created_by VARCHAR(36) REFERENCES platform_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS excel_import_templates_type_idx ON excel_import_templates(template_type);
CREATE INDEX IF NOT EXISTS excel_import_templates_recommended_idx ON excel_import_templates(is_recommended);

-- ============================================================
-- V2.3 索引与外键结束
-- ============================================================
