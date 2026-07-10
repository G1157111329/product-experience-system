-- ============================================================
-- 产品体验管理平台 - 数据库初始化脚本
-- 适用于 PostgreSQL 14+
-- 执行顺序：按此文件从上到下执行
-- ============================================================

-- ============================================================
-- 1. 用户账号表
-- ============================================================
CREATE TABLE IF NOT EXISTS platform_users (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  account VARCHAR(50) NOT NULL UNIQUE,
  password_hash VARCHAR(200) NOT NULL,
  name VARCHAR(50),
  role VARCHAR(20) NOT NULL DEFAULT 'user',       -- admin / user
  status VARCHAR(20) NOT NULL DEFAULT 'pending',   -- pending / approved / rejected
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS platform_users_account_idx ON platform_users(account);
CREATE INDEX IF NOT EXISTS platform_users_status_idx ON platform_users(status);

-- ============================================================
-- 2. 用户审核请求表
-- ============================================================
CREATE TABLE IF NOT EXISTS platform_audit_requests (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR(36) NOT NULL REFERENCES platform_users(id) ON DELETE CASCADE,
  request_type VARCHAR(30) NOT NULL,               -- register / password_reset / name_change / role_upgrade
  status VARCHAR(20) NOT NULL DEFAULT 'pending',   -- pending / approved / rejected
  old_value TEXT,
  new_value TEXT,
  target_user_id VARCHAR(36),
  reviewed_by VARCHAR(36) REFERENCES platform_users(id),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS platform_audit_requests_user_id_idx ON platform_audit_requests(user_id);
CREATE INDEX IF NOT EXISTS platform_audit_requests_status_idx ON platform_audit_requests(status);

-- ============================================================
-- 3. 品类配置表
-- ============================================================
CREATE TABLE IF NOT EXISTS platform_categories (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL UNIQUE,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 4. 产品配置表
-- ============================================================
CREATE TABLE IF NOT EXISTS platform_products (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  category_id VARCHAR(36) NOT NULL,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(name, category_id)
);
CREATE INDEX IF NOT EXISTS platform_products_category_id_idx ON platform_products(category_id);

-- ============================================================
-- 5. 标准库表
-- ============================================================
CREATE TABLE IF NOT EXISTS standards (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  standard_name VARCHAR(200) NOT NULL,
  category VARCHAR(50) NOT NULL,                   -- 通用标准/品类标准/感官评价标准/食谱功能标准
  product_category VARCHAR(50),
  product VARCHAR(200),
  version VARCHAR(20) DEFAULT 'V1.0',
  is_active BOOLEAN NOT NULL DEFAULT true,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS standards_category_idx ON standards(category);
CREATE INDEX IF NOT EXISTS standards_product_category_idx ON standards(product_category);

-- ============================================================
-- 6. 标准检查项表
-- ============================================================
CREATE TABLE IF NOT EXISTS standard_items (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  standard_id VARCHAR(36) NOT NULL REFERENCES standards(id) ON DELETE CASCADE,
  sort_order INTEGER DEFAULT 0,
  sensory_dimension VARCHAR(20),                    -- 视觉/听觉/触觉/嗅觉/味觉
  test_phase VARCHAR(50),                           -- 开箱/首次安装/产品使用/清洁收纳
  experience_flow VARCHAR(100),                     -- 体验流程（通用标准）
  touch_point VARCHAR(200),                         -- 触点（通用标准）
  check_dimension VARCHAR(50),                      -- 检查维度（品类标准）
  sub_check_dimension VARCHAR(100),                 -- 细分检查维度（品类标准）
  check_item VARCHAR(200) NOT NULL,
  check_requirement TEXT,
  experience_standard TEXT,                         -- 体验标准（通用标准）
  check_standard TEXT,                              -- 检查标准（品类标准）
  measurement_position VARCHAR(200),
  check_tool VARCHAR(100),
  standard_a VARCHAR(200),
  standard_b VARCHAR(200),
  standard_c VARCHAR(200),
  problem_level VARCHAR(20),                        -- 一类/二类/三类
  evaluation_prep TEXT,                             -- 感官评价准备（感官评价标准）
  subjective_score INTEGER,                         -- 主观满意度分值（感官评价标准）
  subjective_rating TEXT,                           -- 主观满意度描述（感官评价标准）
  reference_images JSONB,                           -- 参考图片
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS standard_items_standard_id_idx ON standard_items(standard_id);
CREATE INDEX IF NOT EXISTS standard_items_sensory_idx ON standard_items(sensory_dimension);

-- ============================================================
-- 7. 体验任务表
-- ============================================================
CREATE TABLE IF NOT EXISTS experience_tasks (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  task_name VARCHAR(200) NOT NULL,
  product_category VARCHAR(50) NOT NULL,            -- 品类
  product VARCHAR(200),                             -- 产品
  product_model VARCHAR(50),                        -- 产品型号（自研/改型降本优化时必填，其他类型可选）
  project_number VARCHAR(100),                      -- 项目单号
  project_type VARCHAR(50),                         -- ODM/OEM/竞品研究/自研/前期研究/改型降本优化/海外产品
  project_phase VARCHAR(50),                        -- 手板研究/试制阶段/试产阶段/量产阶段
  test_date DATE,
  organizer VARCHAR(50),
  created_by VARCHAR(36),                           -- 创建者用户ID（数据隔离）
  target_user TEXT,
  test_purpose TEXT,
  test_method TEXT,
  status VARCHAR(20) NOT NULL DEFAULT '待执行',     -- 待执行/进行中/已完成
  assigned_to VARCHAR(200),
  selected_standards JSONB,
  owner_id VARCHAR(36),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS experience_tasks_status_idx ON experience_tasks(status);
CREATE INDEX IF NOT EXISTS experience_tasks_product_category_idx ON experience_tasks(product_category);
CREATE INDEX IF NOT EXISTS experience_tasks_created_at_idx ON experience_tasks(created_at);

-- ============================================================
-- 8. 检查记录表
-- ============================================================
CREATE TABLE IF NOT EXISTS check_records (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id VARCHAR(36) NOT NULL REFERENCES experience_tasks(id) ON DELETE CASCADE,
  standard_item_id VARCHAR(36),
  standard_category VARCHAR(50),                    -- 通用标准/品类标准/感官评价标准/非标准
  sensory_dimension VARCHAR(20),
  test_phase VARCHAR(50),
  experience_flow VARCHAR(100),
  touch_point VARCHAR(200),
  check_dimension VARCHAR(50),
  sub_check_dimension VARCHAR(100),
  check_item VARCHAR(200) NOT NULL,
  check_requirement TEXT,
  check_standard TEXT,
  experience_standard TEXT,
  evaluation_result VARCHAR(20),                    -- 合格/不合格/待定
  problem_description TEXT,
  measurement_position VARCHAR(200),
  measurement_value VARCHAR(100),
  check_tool TEXT,
  problem_level TEXT,                               -- 一类/二类/三类
  tester VARCHAR(50),
  recipe_id VARCHAR(36),
  recipe_step_id VARCHAR(36),
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS check_records_task_id_idx ON check_records(task_id);
CREATE INDEX IF NOT EXISTS check_records_standard_item_id_idx ON check_records(standard_item_id);
CREATE INDEX IF NOT EXISTS check_records_recipe_id_idx ON check_records(recipe_id);
CREATE INDEX IF NOT EXISTS check_records_recipe_step_id_idx ON check_records(recipe_step_id);

-- ============================================================
-- 9. 问题整改表
-- ============================================================
CREATE TABLE IF NOT EXISTS issues (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id VARCHAR(36) NOT NULL REFERENCES experience_tasks(id) ON DELETE CASCADE,
  record_id VARCHAR(36) REFERENCES check_records(id) ON DELETE SET NULL,
  title VARCHAR(200) NOT NULL,
  product_model VARCHAR(50),
  category VARCHAR(50),
  sub_category VARCHAR(50),
  severity VARCHAR(20),                             -- 兼容旧数据
  priority VARCHAR(20),                             -- 兼容旧数据
  level VARCHAR(20),                                -- 一类/二类/三类
  source VARCHAR(50),
  source_report_id VARCHAR(36),
  source_type VARCHAR(20),                          -- record_fail / recipe_problem
  severity_code VARCHAR(40),
  module_code VARCHAR(80),
  due_at TIMESTAMPTZ,
  first_seen_at TIMESTAMPTZ,
  last_seen_at TIMESTAMPTZ,
  version INTEGER NOT NULL DEFAULT 1,
  source_assembly_id VARCHAR(36),
  source_cell_id VARCHAR(36),
  source_item_node_id VARCHAR(36),
  source_object_id VARCHAR(36),
  description TEXT,
  is_improve BOOLEAN,
  no_improve_reason TEXT,
  improve_plan TEXT,
  responsible_dept VARCHAR(50),
  responsible_person VARCHAR(50),
  plan_complete_date DATE,
  actual_complete_date DATE,
  is_closed BOOLEAN DEFAULT false,
  status VARCHAR(20) NOT NULL DEFAULT '待整改',
  verification_note TEXT,
  -- 食谱表在本初始化脚本的后面创建；外键由增量迁移补齐，避免全新库建表顺序失败。
  recipe_id VARCHAR(36),
  recipe_step_id VARCHAR(36),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(title, source_type, task_id)
);
CREATE INDEX IF NOT EXISTS issues_task_id_idx ON issues(task_id);
CREATE INDEX IF NOT EXISTS issues_status_idx ON issues(status);
CREATE INDEX IF NOT EXISTS issues_severity_idx ON issues(severity);
CREATE INDEX IF NOT EXISTS issues_source_type_idx ON issues(source_type);
CREATE INDEX IF NOT EXISTS issues_severity_code_idx ON issues(severity_code);
CREATE INDEX IF NOT EXISTS issues_due_at_idx ON issues(due_at);
CREATE INDEX IF NOT EXISTS issues_source_assembly_id_idx ON issues(source_assembly_id);
CREATE INDEX IF NOT EXISTS issues_created_at_idx ON issues(created_at);
CREATE INDEX IF NOT EXISTS issues_recipe_id_idx ON issues(recipe_id);
CREATE INDEX IF NOT EXISTS issues_recipe_step_id_idx ON issues(recipe_step_id);

-- 对比矩阵溯源字段：将矩阵单元格问题点关联回矩阵（幂等迁移）
ALTER TABLE issues ADD COLUMN IF NOT EXISTS source_assembly_id VARCHAR(36);
ALTER TABLE issues ADD COLUMN IF NOT EXISTS source_cell_id VARCHAR(36);
ALTER TABLE issues ADD COLUMN IF NOT EXISTS source_item_node_id VARCHAR(36);
ALTER TABLE issues ADD COLUMN IF NOT EXISTS source_object_id VARCHAR(36);
CREATE INDEX IF NOT EXISTS issues_source_assembly_id_idx ON issues(source_assembly_id);

-- ============================================================
-- 10. 问题复评估表
-- ============================================================
CREATE TABLE IF NOT EXISTS issue_re_evaluations (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_id VARCHAR(36) NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  description TEXT,
  ai_result JSONB,                                  -- AI四维评价结果
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by VARCHAR(36)
);
CREATE INDEX IF NOT EXISTS issue_re_evaluations_issue_id_idx ON issue_re_evaluations(issue_id);
CREATE INDEX IF NOT EXISTS issue_re_evaluations_created_at_idx ON issue_re_evaluations(created_at);

-- ============================================================
-- 11. 食谱/功能表
-- ============================================================
CREATE TABLE IF NOT EXISTS recipes (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id VARCHAR(36) NOT NULL REFERENCES experience_tasks(id) ON DELETE CASCADE,
  name VARCHAR(200) NOT NULL,
  ingredients TEXT,
  ingredient_items JSONB NOT NULL DEFAULT '[]'::jsonb,
  recipe_type VARCHAR(20) DEFAULT '食谱',           -- 食谱 / 功能
  problem_count INTEGER DEFAULT 0,
  sort_order INTEGER DEFAULT 0,
  effect_description TEXT,                           -- 效果评价描述
  effect_score VARCHAR(20),                          -- AI综合评分
  effect_problem_point TEXT,                         -- 效果问题点（JSON数组格式）
  effect_ai_result JSONB,                           -- AI四维评价完整结果
  effect_status VARCHAR(20),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS recipes_task_id_idx ON recipes(task_id);

-- ============================================================
-- 12. 食谱步骤表
-- ============================================================
CREATE TABLE IF NOT EXISTS recipe_steps (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id VARCHAR(36) NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  step_number INTEGER NOT NULL DEFAULT 1,
  operation TEXT NOT NULL,
  problem_point TEXT,
  problem_points JSONB DEFAULT '[]',
  parameters JSONB NOT NULL DEFAULT '{}'::jsonb,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS recipe_steps_recipe_id_idx ON recipe_steps(recipe_id);

-- ============================================================
-- 13. 素材表
-- ============================================================
CREATE TABLE IF NOT EXISTS materials (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  record_id VARCHAR(36) REFERENCES check_records(id) ON DELETE SET NULL,
  recipe_step_id VARCHAR(36),
  recipe_library_step_id VARCHAR(36),
  recipe_id VARCHAR(36),
  issue_id VARCHAR(36) REFERENCES issues(id) ON DELETE SET NULL,
  re_evaluation_id VARCHAR(36) REFERENCES issue_re_evaluations(id) ON DELETE SET NULL,
  task_id VARCHAR(36) REFERENCES experience_tasks(id) ON DELETE SET NULL,
  material_type VARCHAR(10) NOT NULL,               -- image / video
  file_name VARCHAR(200),
  file_path VARCHAR(500),                           -- S3 Key（存储用）
  file_size INTEGER,
  file_url TEXT,                                    -- 同 file_path（兼容字段）
  duration_sec INTEGER,
  thumbnail_url TEXT,
  ai_analysis_status VARCHAR(20) DEFAULT 'pending',
  ai_result JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS materials_record_id_idx ON materials(record_id);
CREATE INDEX IF NOT EXISTS materials_task_id_idx ON materials(task_id);
CREATE INDEX IF NOT EXISTS materials_type_idx ON materials(material_type);
CREATE INDEX IF NOT EXISTS materials_recipe_step_id_idx ON materials(recipe_step_id);
CREATE INDEX IF NOT EXISTS materials_recipe_library_step_id_idx ON materials(recipe_library_step_id);
CREATE INDEX IF NOT EXISTS materials_recipe_id_idx ON materials(recipe_id);
CREATE INDEX IF NOT EXISTS materials_issue_id_idx ON materials(issue_id);
CREATE INDEX IF NOT EXISTS materials_re_evaluation_id_idx ON materials(re_evaluation_id);

-- V2.3 对比组装与媒体标准化字段（向下兼容）
ALTER TABLE materials ADD COLUMN IF NOT EXISTS comparison_cell_id VARCHAR(36);
ALTER TABLE materials ADD COLUMN IF NOT EXISTS comparison_assembly_id VARCHAR(36);
ALTER TABLE materials ADD COLUMN IF NOT EXISTS normalized_thumb_path TEXT;
ALTER TABLE materials ADD COLUMN IF NOT EXISTS video_cover_path TEXT;
ALTER TABLE materials ADD COLUMN IF NOT EXISTS media_display_order INTEGER DEFAULT 0;
ALTER TABLE materials ADD COLUMN IF NOT EXISTS media_role VARCHAR(40);

-- ============================================================
-- 14. 报告模板表
-- ============================================================
CREATE TABLE IF NOT EXISTS report_templates (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  template_name VARCHAR(200) NOT NULL,
  template_type VARCHAR(50),
  content JSONB,
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 15. 报告表
-- ============================================================
CREATE TABLE IF NOT EXISTS reports (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id VARCHAR(36) NOT NULL REFERENCES experience_tasks(id) ON DELETE CASCADE,
  template_id VARCHAR(36) REFERENCES report_templates(id),
  title VARCHAR(200),
  content JSONB,
  product_model VARCHAR(50),
  organizer VARCHAR(50),
  project_type VARCHAR(50),
  project_phase VARCHAR(50),
  status VARCHAR(20) NOT NULL DEFAULT '已完成',
  version INTEGER DEFAULT 1,
  created_by VARCHAR(36),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS reports_task_id_idx ON reports(task_id);
CREATE INDEX IF NOT EXISTS reports_created_at_idx ON reports(created_at);
CREATE INDEX IF NOT EXISTS reports_product_model_idx ON reports(product_model);
CREATE INDEX IF NOT EXISTS reports_product_model_created_at_idx ON reports(product_model, created_at);
CREATE INDEX IF NOT EXISTS reports_status_created_at_idx ON reports(status, created_at);

-- ============================================================
-- 16. 报告分享表
-- ============================================================
CREATE TABLE IF NOT EXISTS report_shares (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id VARCHAR(36) NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  share_token VARCHAR(64) NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ,
  created_by VARCHAR(36) REFERENCES platform_users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS report_shares_report_id_idx ON report_shares(report_id);
CREATE INDEX IF NOT EXISTS report_shares_share_token_idx ON report_shares(share_token);

-- ============================================================
-- 17. 食谱库表
-- ============================================================
CREATE TABLE IF NOT EXISTS recipe_library (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(200) NOT NULL UNIQUE,
  product_category VARCHAR(100),
  product VARCHAR(100),
  ingredients TEXT,
  recipe_type VARCHAR(20) DEFAULT '食谱',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS recipe_library_product_idx ON recipe_library(product_category, product);

-- ============================================================
-- 18. 食谱库步骤表
-- ============================================================
CREATE TABLE IF NOT EXISTS recipe_library_steps (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_library_id VARCHAR(36) NOT NULL REFERENCES recipe_library(id) ON DELETE CASCADE,
  step_number INTEGER NOT NULL DEFAULT 1,
  operation TEXT NOT NULL,
  problem_point TEXT,
  problem_points JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS recipe_library_steps_recipe_library_id_idx ON recipe_library_steps(recipe_library_id);

-- ============================================================
-- 19. 健康检查表（系统内部使用）
-- ============================================================
CREATE TABLE IF NOT EXISTS health_check (
  id SERIAL NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 20. 平台设置表
-- ============================================================
CREATE TABLE IF NOT EXISTS platform_settings (
  key VARCHAR(100) PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 21. 安全审计日志表
-- ============================================================
CREATE TABLE IF NOT EXISTS security_audit_logs (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  action VARCHAR(80) NOT NULL,
  actor_user_id VARCHAR(36) REFERENCES platform_users(id) ON DELETE SET NULL,
  actor_account VARCHAR(100),
  target_type VARCHAR(50),
  target_id VARCHAR(100),
  outcome VARCHAR(20) NOT NULL,
  ip_address VARCHAR(80),
  user_agent TEXT,
  request_path TEXT,
  request_method VARCHAR(10),
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS security_audit_logs_action_idx ON security_audit_logs(action);
CREATE INDEX IF NOT EXISTS security_audit_logs_actor_user_id_idx ON security_audit_logs(actor_user_id);
CREATE INDEX IF NOT EXISTS security_audit_logs_target_idx ON security_audit_logs(target_type, target_id);
CREATE INDEX IF NOT EXISTS security_audit_logs_created_at_idx ON security_audit_logs(created_at);

-- ============================================================
-- 22. 共享限速状态表
-- ============================================================
CREATE TABLE IF NOT EXISTS security_rate_limits (
  rate_key VARCHAR(240) PRIMARY KEY,
  count INTEGER NOT NULL DEFAULT 0,
  reset_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 23. AI模型配置表
-- ============================================================
CREATE TABLE IF NOT EXISTS ai_model_configs (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  provider VARCHAR(20) NOT NULL DEFAULT 'custom',  -- custom
  model VARCHAR(100) NOT NULL,
  temperature INTEGER NOT NULL DEFAULT 5,
  max_tokens INTEGER NOT NULL DEFAULT 2400,
  supports_vision BOOLEAN NOT NULL DEFAULT false,
  custom_api_url TEXT,
  custom_api_key_encrypted TEXT,
  is_active BOOLEAN NOT NULL DEFAULT false,
  created_by VARCHAR(36) REFERENCES platform_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_model_configs_active_idx ON ai_model_configs(is_active);

-- ============================================================
-- 22. AI Agent Prompt模板表
-- ============================================================
CREATE TABLE IF NOT EXISTS agent_skill_templates (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  skill_key VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  active_version_id VARCHAR(36),
  model_config_id VARCHAR(36) REFERENCES ai_model_configs(id) ON DELETE SET NULL,
  created_by VARCHAR(36) REFERENCES platform_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agent_skill_templates_key_idx ON agent_skill_templates(skill_key);

-- ============================================================
-- 23. AI Agent Prompt版本表
-- ============================================================
CREATE TABLE IF NOT EXISTS agent_skill_versions (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id VARCHAR(36) NOT NULL REFERENCES agent_skill_templates(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  system_prompt TEXT NOT NULL,
  user_prompt_template TEXT NOT NULL,
  output_schema JSONB NOT NULL DEFAULT '{}',
  notes TEXT,
  created_by VARCHAR(36) REFERENCES platform_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(template_id, version)
);
CREATE INDEX IF NOT EXISTS agent_skill_versions_template_id_idx ON agent_skill_versions(template_id);

-- ============================================================
-- 24. AI Agent审计日志表
-- ============================================================
CREATE TABLE IF NOT EXISTS agent_skill_audit_logs (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  skill_key VARCHAR(50) NOT NULL,
  template_id VARCHAR(36) REFERENCES agent_skill_templates(id) ON DELETE SET NULL,
  version_id VARCHAR(36) REFERENCES agent_skill_versions(id) ON DELETE SET NULL,
  action VARCHAR(50) NOT NULL,
  actor_user_id VARCHAR(36) REFERENCES platform_users(id) ON DELETE SET NULL,
  task_id VARCHAR(36) REFERENCES experience_tasks(id) ON DELETE SET NULL,
  request_snapshot JSONB DEFAULT '{}',
  response_snapshot JSONB DEFAULT '{}',
  status VARCHAR(20) NOT NULL DEFAULT 'success',
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agent_skill_audit_logs_skill_key_idx ON agent_skill_audit_logs(skill_key);
CREATE INDEX IF NOT EXISTS agent_skill_audit_logs_task_id_idx ON agent_skill_audit_logs(task_id);

-- ============================================================
-- 种子数据：品类 + 产品
-- ============================================================
INSERT INTO platform_categories (id, name, sort_order) VALUES
  ('cat-dian dong', '电动', 1),
  ('cat-hu lei', '壶类', 2),
  ('cat-yin shui', '饮水', 3),
  ('cat-zhong shi', '中式', 4),
  ('cat-xi shi', '西式', 5),
  ('cat-sheng huo', '生活', 6),
  ('cat-ge hu', '个护', 7),
  ('cat-jian kang', '健康', 8),
  ('cat-mu ying', '母婴', 9),
  ('cat-jia ju', '家居', 10),
  ('cat-chong wu', '宠物', 11)
ON CONFLICT (name) DO NOTHING;

INSERT INTO platform_products (name, category_id, sort_order) VALUES
  ('破壁机', 'cat-dian dong', 1),
  ('电水壶', 'cat-hu lei', 1),
  ('电饭煲', 'cat-zhong shi', 1),
  ('电火锅', 'cat-zhong shi', 2),
  ('空气炸锅', 'cat-xi shi', 1),
  ('挂烫机', 'cat-sheng huo', 1),
  ('电动牙刷', 'cat-ge hu', 1),
  ('电动按摩器', 'cat-jian kang', 1),
  ('吸奶器', 'cat-mu ying', 1),
  ('菜刀', 'cat-jia ju', 1),
  ('喂食机', 'cat-chong wu', 1)
ON CONFLICT DO NOTHING;

-- ============================================================
-- 种子数据：平台默认设置
-- ============================================================
INSERT INTO platform_settings (key, value) VALUES
  ('standard_options', '{"usage_phases":["开箱","首次安装","产品使用","清洁收纳","其他"],"experience_flows":{"开箱":["拿取外包装","拆开内包装"],"首次安装":["配件梳理","外观美观","外观缺陷","标识文字","首次安装"],"产品使用":["放置及组装","操作交互","产品运行"],"清洁收纳":["冲水","擦拭","晾干","收纳"],"其他":["其他"]},"sensory_dimensions":["视觉","听觉","触觉","嗅觉","味觉"]}'),
  ('ai_config', '{"provider":"custom","model":"","temperature":5,"custom_api_url":"","custom_api_key":""}')
ON CONFLICT (key) DO NOTHING;

-- ============================================================
-- 安全策略（Supabase 必需，自建 PostgreSQL 可跳过）
-- 生产环境禁止 allow_all。服务端应使用 service role 或自建 PostgreSQL 受控账号访问。
-- ============================================================
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOR tbl IN
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename IN (
        'platform_users', 'platform_audit_requests', 'platform_categories', 'platform_products',
        'platform_settings', 'security_audit_logs', 'security_rate_limits',
        'standards', 'standard_items', 'experience_tasks', 'check_records',
        'materials', 'issues', 'issue_re_evaluations', 'report_templates', 'reports', 'report_shares',
        'recipes', 'recipe_steps', 'recipe_library', 'recipe_library_steps',
        'health_check', 'ai_model_configs', 'agent_skill_templates', 'agent_skill_versions',
        'agent_skill_audit_logs'
      )
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format('DROP POLICY IF EXISTS allow_all ON %I', tbl);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION prevent_security_audit_log_mutation()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'UPDATE'
    AND OLD.actor_user_id IS NOT NULL
    AND NEW.actor_user_id IS NULL
    AND NEW.id IS NOT DISTINCT FROM OLD.id
    AND NEW.action IS NOT DISTINCT FROM OLD.action
    AND NEW.actor_account IS NOT DISTINCT FROM OLD.actor_account
    AND NEW.target_type IS NOT DISTINCT FROM OLD.target_type
    AND NEW.target_id IS NOT DISTINCT FROM OLD.target_id
    AND NEW.outcome IS NOT DISTINCT FROM OLD.outcome
    AND NEW.ip_address IS NOT DISTINCT FROM OLD.ip_address
    AND NEW.user_agent IS NOT DISTINCT FROM OLD.user_agent
    AND NEW.request_path IS NOT DISTINCT FROM OLD.request_path
    AND NEW.request_method IS NOT DISTINCT FROM OLD.request_method
    AND NEW.metadata IS NOT DISTINCT FROM OLD.metadata
    AND NEW.created_at IS NOT DISTINCT FROM OLD.created_at THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'security_audit_logs is append-only';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS security_audit_logs_append_only ON security_audit_logs;
CREATE TRIGGER security_audit_logs_append_only
BEFORE UPDATE OR DELETE ON security_audit_logs
FOR EACH ROW EXECUTE FUNCTION prevent_security_audit_log_mutation();
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
ALTER TABLE experience_tasks ADD COLUMN IF NOT EXISTS task_no VARCHAR(60);
ALTER TABLE experience_tasks ADD COLUMN IF NOT EXISTS source_task_ids JSONB DEFAULT '[]';
ALTER TABLE experience_tasks ADD COLUMN IF NOT EXISTS source_report_ids JSONB DEFAULT '[]';
ALTER TABLE experience_tasks ADD COLUMN IF NOT EXISTS reviewer_id VARCHAR(36);
ALTER TABLE experience_tasks ADD COLUMN IF NOT EXISTS owner_id VARCHAR(36);
ALTER TABLE experience_tasks ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;
CREATE INDEX IF NOT EXISTS experience_tasks_task_mode_idx ON experience_tasks(task_mode);
CREATE INDEX IF NOT EXISTS experience_tasks_task_no_idx ON experience_tasks(task_no);

-- reports 新增 7 字段（V2.3 统一报告资产）
ALTER TABLE reports ADD COLUMN IF NOT EXISTS report_type VARCHAR(40) NOT NULL DEFAULT 'single_report';
ALTER TABLE reports ADD COLUMN IF NOT EXISTS source_task_ids JSONB DEFAULT '[]';
ALTER TABLE reports ADD COLUMN IF NOT EXISTS source_report_ids JSONB DEFAULT '[]';
ALTER TABLE reports ADD COLUMN IF NOT EXISTS assembly_id VARCHAR(36);
ALTER TABLE reports ADD COLUMN IF NOT EXISTS snapshot_id VARCHAR(36);
ALTER TABLE reports ADD COLUMN IF NOT EXISTS layout_profile VARCHAR(80);
ALTER TABLE reports ADD COLUMN IF NOT EXISTS ai_confirmation_status VARCHAR(20) DEFAULT 'pending';
ALTER TABLE reports ADD COLUMN IF NOT EXISTS report_no VARCHAR(80);
ALTER TABLE reports ADD COLUMN IF NOT EXISTS report_scope_type VARCHAR(60);
ALTER TABLE reports ADD COLUMN IF NOT EXISTS owner_id VARCHAR(36);
ALTER TABLE reports ADD COLUMN IF NOT EXISTS reviewer_id VARCHAR(36);
ALTER TABLE reports ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS reports_report_type_idx ON reports(report_type);
CREATE INDEX IF NOT EXISTS reports_assembly_id_idx ON reports(assembly_id);
CREATE INDEX IF NOT EXISTS reports_report_no_idx ON reports(report_no);

-- materials 新增 6 字段（V2.3 对比单元格关联与媒体标准化）
ALTER TABLE materials ADD COLUMN IF NOT EXISTS comparison_cell_id VARCHAR(36);
ALTER TABLE materials ADD COLUMN IF NOT EXISTS comparison_assembly_id VARCHAR(36);
ALTER TABLE materials ADD COLUMN IF NOT EXISTS normalized_thumb_path TEXT;
ALTER TABLE materials ADD COLUMN IF NOT EXISTS video_cover_path TEXT;
ALTER TABLE materials ADD COLUMN IF NOT EXISTS media_display_order INTEGER DEFAULT 0;
ALTER TABLE materials ADD COLUMN IF NOT EXISTS media_role VARCHAR(40);
CREATE INDEX IF NOT EXISTS materials_comparison_cell_id_idx ON materials(comparison_cell_id);
CREATE INDEX IF NOT EXISTS materials_comparison_assembly_id_idx ON materials(comparison_assembly_id);

ALTER TABLE recipes ADD COLUMN IF NOT EXISTS effect_status VARCHAR(20);

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

-- 问题生命周期过程表（报告问题 Tab 依赖）
CREATE TABLE IF NOT EXISTS issue_occurrences (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_id VARCHAR(36) NOT NULL,
  report_id VARCHAR(36),
  task_id VARCHAR(36),
  project_phase VARCHAR(40),
  occurred_on DATE,
  occurrence_note TEXT,
  evidence_refs JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS issue_occurrences_issue_idx ON issue_occurrences(issue_id, created_at DESC);
CREATE INDEX IF NOT EXISTS issue_occurrences_report_idx ON issue_occurrences(report_id);
CREATE INDEX IF NOT EXISTS issue_occurrences_phase_idx ON issue_occurrences(project_phase);

CREATE TABLE IF NOT EXISTS rectification_actions (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_id VARCHAR(36) NOT NULL,
  action_plan TEXT NOT NULL,
  responsible_person VARCHAR(80),
  responsible_dept VARCHAR(80),
  plan_complete_date DATE,
  actual_complete_date DATE,
  status VARCHAR(20) NOT NULL DEFAULT 'planned',
  note TEXT,
  created_by VARCHAR(36),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS rectification_actions_issue_idx ON rectification_actions(issue_id, created_at DESC);
CREATE INDEX IF NOT EXISTS rectification_actions_status_idx ON rectification_actions(status);

CREATE TABLE IF NOT EXISTS verifications (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  rectification_action_id VARCHAR(36) NOT NULL REFERENCES rectification_actions(id) ON DELETE CASCADE,
  issue_id VARCHAR(36) NOT NULL,
  result VARCHAR(20) NOT NULL,
  note TEXT,
  verified_by VARCHAR(36),
  verified_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  evidence_refs JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS verifications_action_idx ON verifications(rectification_action_id, verified_at DESC);
CREATE INDEX IF NOT EXISTS verifications_issue_idx ON verifications(issue_id);

-- 数据矩阵输入视图：schema 注册、版本、维度、公式、计算审计
CREATE TABLE IF NOT EXISTS matrix_schemas (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  schema_key VARCHAR(100) NOT NULL UNIQUE,
  name VARCHAR(200) NOT NULL,
  product_category VARCHAR(100),
  experience_type_allowlist JSONB DEFAULT '[]',
  status VARCHAR(20) NOT NULL DEFAULT 'draft',
  latest_published_version_id VARCHAR(36),
  owner_id VARCHAR(36) REFERENCES platform_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS matrix_schema_versions (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  schema_id VARCHAR(36) NOT NULL REFERENCES matrix_schemas(id) ON DELETE CASCADE,
  version_no INTEGER NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'draft',
  schema_json JSONB NOT NULL,
  checksum VARCHAR(80),
  published_at TIMESTAMPTZ,
  published_by VARCHAR(36) REFERENCES platform_users(id) ON DELETE SET NULL,
  effective_from TIMESTAMPTZ,
  effective_to TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(schema_id, version_no)
);

CREATE TABLE IF NOT EXISTS matrix_dimension_bindings (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  schema_version_id VARCHAR(36) NOT NULL REFERENCES matrix_schema_versions(id) ON DELETE CASCADE,
  dimension_key VARCHAR(100) NOT NULL,
  display_name VARCHAR(200) NOT NULL,
  column_group VARCHAR(20) NOT NULL,
  value_kind VARCHAR(20) NOT NULL,
  unit_code VARCHAR(40),
  metric_definition_id VARCHAR(36) REFERENCES metric_definitions(id) ON DELETE SET NULL,
  required BOOLEAN DEFAULT FALSE,
  editable BOOLEAN DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  display_format_json JSONB DEFAULT '{}',
  validation_rule_json JSONB DEFAULT '{}',
  UNIQUE(schema_version_id, dimension_key)
);

CREATE TABLE IF NOT EXISTS matrix_formula_definitions (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  schema_version_id VARCHAR(36) NOT NULL REFERENCES matrix_schema_versions(id) ON DELETE CASCADE,
  output_dimension_key VARCHAR(100) NOT NULL,
  formula_dsl TEXT NOT NULL,
  compiled_ast JSONB,
  dependency_json JSONB,
  scope VARCHAR(20) NOT NULL DEFAULT 'row',
  formula_version VARCHAR(40) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'draft',
  UNIQUE(schema_version_id, output_dimension_key)
);

CREATE TABLE IF NOT EXISTS matrix_calculation_runs (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  matrix_instance_id VARCHAR(36) NOT NULL REFERENCES comparison_assemblies(id) ON DELETE CASCADE,
  trigger_type VARCHAR(20) NOT NULL,
  input_version_hash VARCHAR(80) NOT NULL,
  formula_version_hash VARCHAR(80) NOT NULL,
  status VARCHAR(20) NOT NULL,
  error_code VARCHAR(60),
  error_detail_sanitized TEXT,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  trace_id VARCHAR(60)
);
CREATE INDEX IF NOT EXISTS matrix_calculation_runs_instance_idx ON matrix_calculation_runs(matrix_instance_id);

ALTER TABLE comparison_assemblies
  ADD COLUMN IF NOT EXISTS matrix_schema_version_id VARCHAR(36) REFERENCES matrix_schema_versions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS matrix_role VARCHAR(20) NOT NULL DEFAULT 'comparison',
  ADD COLUMN IF NOT EXISTS comparability_status VARCHAR(20) DEFAULT 'unknown';

ALTER TABLE metric_evaluations
  ADD COLUMN IF NOT EXISTS value_kind VARCHAR(20),
  ADD COLUMN IF NOT EXISTS numeric_value NUMERIC(18,6),
  ADD COLUMN IF NOT EXISTS text_value TEXT,
  ADD COLUMN IF NOT EXISTS duration_ms BIGINT,
  ADD COLUMN IF NOT EXISTS unit_code VARCHAR(40),
  ADD COLUMN IF NOT EXISTS input_state VARCHAR(20) DEFAULT 'valid',
  ADD COLUMN IF NOT EXISTS calculation_mode VARCHAR(20),
  ADD COLUMN IF NOT EXISTS formula_definition_id VARCHAR(36),
  ADD COLUMN IF NOT EXISTS source_run_id VARCHAR(36) REFERENCES matrix_calculation_runs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS error_code VARCHAR(60),
  ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1;


-- ============================================================
-- Data Matrix V2: 任务级用户自设计模型 (PRD V3.1 §3.4–3.8)
-- 新增 V2 运行时实例表（当前 UI 使用），替代 V1 schema 注册表用于运行时
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
ALTER TABLE matrix_formula_definitions
  ADD COLUMN IF NOT EXISTS field_definition_id VARCHAR(36) REFERENCES matrix_field_definitions(id) ON DELETE CASCADE;
ALTER TABLE matrix_formula_definitions
  ALTER COLUMN schema_version_id DROP NOT NULL;
ALTER TABLE matrix_calculation_runs
  ADD COLUMN IF NOT EXISTS task_matrix_id VARCHAR(36) REFERENCES task_matrices(id) ON DELETE CASCADE;
ALTER TABLE matrix_calculation_runs
  ALTER COLUMN matrix_instance_id DROP NOT NULL;

-- Feature flag for data matrix V2
INSERT INTO platform_settings (key, value)
VALUES ('feature_flag_task_matrix', '{"task_matrix_enabled":true,"matrix_runtime_designer_enabled":true,"matrix_formula_enabled":true,"matrix_mobile_enabled":true,"matrix_batch_paste_enabled":true,"matrix_report_projection_enabled":true,"matrix_structural_revision_enabled":true}'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- ============================================================
-- V2.3 索引与外键结束
-- ============================================================

-- ============================================================
-- PRD V3.1.2.4 — Dynamic Matrix V3 + MaterialAsset + Hermes Agent
-- Migrations 0004-0007 consolidated. All tables idempotent.
-- ADR-01: V3 matrix model (9 tables); V2 cold-retained.
-- ADR-03: Full Hermes Agent + WeCom (企微).
-- ADR-04: material_links polymorphic binding + materials status.
-- ============================================================

-- ---- 0004: V3 dynamic matrix tables ----
CREATE TABLE IF NOT EXISTS matrix_view_definitions (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  matrix_id VARCHAR(36) NOT NULL REFERENCES task_matrices(id) ON DELETE CASCADE,
  version_no INT NOT NULL,
  max_hierarchy_level INT NOT NULL DEFAULT 3,
  left_frozen_column_count INT NOT NULL DEFAULT 5,
  formula_mode VARCHAR(40) NOT NULL DEFAULT 'relative_cell_reference',
  style_mode VARCHAR(40) NOT NULL DEFAULT 'basic_text_style',
  status VARCHAR(20) NOT NULL DEFAULT 'draft',
  design_hash VARCHAR(128),
  confirmed_by VARCHAR(36) REFERENCES platform_users(id) ON DELETE SET NULL,
  confirmed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (matrix_id, version_no)
);
CREATE INDEX IF NOT EXISTS matrix_view_definitions_matrix_id_idx ON matrix_view_definitions(matrix_id);

CREATE TABLE IF NOT EXISTS matrix_hierarchy_nodes (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  matrix_id VARCHAR(36) NOT NULL REFERENCES task_matrices(id) ON DELETE CASCADE,
  parent_id VARCHAR(36) REFERENCES matrix_hierarchy_nodes(id) ON DELETE CASCADE,
  level INT NOT NULL CHECK (level IN (1,2,3)),
  node_label VARCHAR(200) NOT NULL,
  node_type VARCHAR(20) NOT NULL CHECK (node_type IN ('level_1','level_2','level_3')),
  sort_order INT NOT NULL DEFAULT 0,
  rowspan_cache INT,
  created_by VARCHAR(36) REFERENCES platform_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  archived_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS mhn_matrix_id_idx ON matrix_hierarchy_nodes(matrix_id);
CREATE INDEX IF NOT EXISTS mhn_parent_id_idx ON matrix_hierarchy_nodes(parent_id);
CREATE INDEX IF NOT EXISTS mhn_level_idx ON matrix_hierarchy_nodes(level);
CREATE UNIQUE INDEX IF NOT EXISTS mhn_active_unique_idx
  ON matrix_hierarchy_nodes (matrix_id, COALESCE(parent_id,''), level, node_label)
  WHERE archived_at IS NULL;

CREATE TABLE IF NOT EXISTS matrix_leaf_rows (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  matrix_id VARCHAR(36) NOT NULL REFERENCES task_matrices(id) ON DELETE CASCADE,
  level_1_node_id VARCHAR(36) NOT NULL REFERENCES matrix_hierarchy_nodes(id) ON DELETE CASCADE,
  level_2_node_id VARCHAR(36) REFERENCES matrix_hierarchy_nodes(id) ON DELETE SET NULL,
  level_3_node_id VARCHAR(36) REFERENCES matrix_hierarchy_nodes(id) ON DELETE SET NULL,
  visible_row_index INT NOT NULL DEFAULT 0,
  group_row_index INT NOT NULL DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  archived_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS mlr_matrix_id_idx ON matrix_leaf_rows(matrix_id);
CREATE INDEX IF NOT EXISTS mlr_l1_idx ON matrix_leaf_rows(level_1_node_id);
CREATE INDEX IF NOT EXISTS mlr_l2_idx ON matrix_leaf_rows(level_2_node_id);
CREATE INDEX IF NOT EXISTS mlr_l3_idx ON matrix_leaf_rows(level_3_node_id);
CREATE INDEX IF NOT EXISTS mlr_visible_idx ON matrix_leaf_rows(matrix_id, visible_row_index);

CREATE TABLE IF NOT EXISTS matrix_column_definitions (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  matrix_id VARCHAR(36) NOT NULL REFERENCES task_matrices(id) ON DELETE CASCADE,
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
  created_by VARCHAR(36) REFERENCES platform_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  archived_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS mcd_matrix_id_idx ON matrix_column_definitions(matrix_id);
CREATE INDEX IF NOT EXISTS mcd_zone_idx ON matrix_column_definitions(column_zone);
CREATE INDEX IF NOT EXISTS mcd_order_idx ON matrix_column_definitions(matrix_id, display_order);

CREATE TABLE IF NOT EXISTS matrix_cell_values (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  matrix_id VARCHAR(36) NOT NULL REFERENCES task_matrices(id) ON DELETE CASCADE,
  leaf_row_id VARCHAR(36) NOT NULL REFERENCES matrix_leaf_rows(id) ON DELETE CASCADE,
  column_id VARCHAR(36) NOT NULL REFERENCES matrix_column_definitions(id) ON DELETE CASCADE,
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
  updated_by VARCHAR(36) REFERENCES platform_users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (matrix_id, leaf_row_id, column_id)
);
CREATE INDEX IF NOT EXISTS mcv_matrix_row_idx ON matrix_cell_values(matrix_id, leaf_row_id);
CREATE INDEX IF NOT EXISTS mcv_column_idx ON matrix_cell_values(column_id);
CREATE INDEX IF NOT EXISTS mcv_state_idx ON matrix_cell_values(value_state);

CREATE TABLE IF NOT EXISTS matrix_cell_styles (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  matrix_id VARCHAR(36) NOT NULL REFERENCES task_matrices(id) ON DELETE CASCADE,
  target_type VARCHAR(30) NOT NULL CHECK (target_type IN ('column_header','cell','narrative_block')),
  target_id VARCHAR(36) NOT NULL,
  font_color_token VARCHAR(30),
  font_size_token VARCHAR(10) CHECK (font_size_token IS NULL OR font_size_token IN ('xs','sm','md','lg','xl')),
  bold BOOLEAN NOT NULL DEFAULT false,
  italic BOOLEAN NOT NULL DEFAULT false,
  updated_by VARCHAR(36) REFERENCES platform_users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (matrix_id, target_type, target_id)
);
CREATE INDEX IF NOT EXISTS mcs_matrix_target_idx ON matrix_cell_styles(matrix_id, target_type, target_id);

CREATE TABLE IF NOT EXISTS matrix_formula_definitions_v3 (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  matrix_id VARCHAR(36) NOT NULL REFERENCES task_matrices(id) ON DELETE CASCADE,
  column_id VARCHAR(36) NOT NULL REFERENCES matrix_column_definitions(id) ON DELETE CASCADE,
  expression_display TEXT NOT NULL,
  expression_ast JSONB NOT NULL,
  reference_mode VARCHAR(40) NOT NULL DEFAULT 'relative_by_visible_row',
  apply_scope VARCHAR(20) NOT NULL DEFAULT 'matrix' CHECK (apply_scope IN ('matrix','level_1_group')),
  result_format VARCHAR(20) NOT NULL DEFAULT 'number',
  decimal_places INT NOT NULL DEFAULT 2,
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active','invalid','archived')),
  created_by VARCHAR(36) REFERENCES platform_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS mfd3_matrix_id_idx ON matrix_formula_definitions_v3(matrix_id);
CREATE INDEX IF NOT EXISTS mfd3_column_id_idx ON matrix_formula_definitions_v3(column_id);

CREATE TABLE IF NOT EXISTS matrix_formula_runs_v3 (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  formula_id VARCHAR(36) NOT NULL REFERENCES matrix_formula_definitions_v3(id) ON DELETE CASCADE,
  matrix_id VARCHAR(36) NOT NULL,
  leaf_row_id VARCHAR(36) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('success','pending','failed')),
  result_value DECIMAL(18,6),
  error_code VARCHAR(60),
  dependency_snapshot JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS mfr3_formula_id_idx ON matrix_formula_runs_v3(formula_id);
CREATE INDEX IF NOT EXISTS mfr3_matrix_row_idx ON matrix_formula_runs_v3(matrix_id, leaf_row_id);

CREATE TABLE IF NOT EXISTS matrix_narrative_blocks (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  matrix_id VARCHAR(36) NOT NULL REFERENCES task_matrices(id) ON DELETE CASCADE,
  block_type VARCHAR(30) NOT NULL CHECK (block_type IN (
    'summary','note','formula_note','method_note','limitation_note'
  )),
  scope VARCHAR(20) NOT NULL DEFAULT 'matrix' CHECK (scope IN ('matrix','level_1_group')),
  scope_node_id VARCHAR(36) REFERENCES matrix_hierarchy_nodes(id) ON DELETE CASCADE,
  content TEXT,
  ai_suggestion_id VARCHAR(36),
  show_in_report BOOLEAN NOT NULL DEFAULT true,
  sort_order INT NOT NULL DEFAULT 0,
  updated_by VARCHAR(36) REFERENCES platform_users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS mnb_matrix_scope_idx ON matrix_narrative_blocks(matrix_id, scope);
CREATE INDEX IF NOT EXISTS mnb_node_idx ON matrix_narrative_blocks(scope_node_id);

ALTER TABLE task_matrices ADD COLUMN IF NOT EXISTS current_view_definition_id VARCHAR(36);
ALTER TABLE task_matrices DROP CONSTRAINT IF EXISTS tm_view_def_fkey;
ALTER TABLE task_matrices ADD CONSTRAINT tm_view_def_fkey
  FOREIGN KEY (current_view_definition_id) REFERENCES matrix_view_definitions(id) ON DELETE SET NULL;

-- ---- 0005: MaterialAsset + matrix_issue_points ----
ALTER TABLE materials ADD COLUMN IF NOT EXISTS status VARCHAR(30) DEFAULT 'uploaded';
ALTER TABLE materials ADD COLUMN IF NOT EXISTS project_id VARCHAR(36);
ALTER TABLE materials ADD COLUMN IF NOT EXISTS last_bind_suggestion JSONB;

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

CREATE INDEX IF NOT EXISTS materials_status_idx ON materials(status);
CREATE INDEX IF NOT EXISTS materials_project_id_idx ON materials(project_id);

CREATE TABLE IF NOT EXISTS material_links (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  material_id VARCHAR(36) NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
  target_type VARCHAR(40) NOT NULL,
  target_id VARCHAR(36) NOT NULL,
  binding_method VARCHAR(30) NOT NULL DEFAULT 'click_select' CHECK (binding_method IN (
    'click_select','drag_attach','upload_at_slot','wecom_ingest','agent_suggested'
  )),
  binding_order INT NOT NULL DEFAULT 0,
  bound_by VARCHAR(36) REFERENCES platform_users(id) ON DELETE SET NULL,
  bound_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (material_id, target_type, target_id)
);
CREATE INDEX IF NOT EXISTS ml_material_id_idx ON material_links(material_id);
CREATE INDEX IF NOT EXISTS ml_target_idx ON material_links(target_type, target_id);

ALTER TABLE material_links
  ADD COLUMN IF NOT EXISTS binding_order INT NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS ml_target_order_idx ON material_links(target_type, target_id, binding_order, bound_at);

CREATE TABLE IF NOT EXISTS matrix_issue_points (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  matrix_id VARCHAR(36) NOT NULL REFERENCES task_matrices(id) ON DELETE CASCADE,
  leaf_row_id VARCHAR(36) NOT NULL REFERENCES matrix_leaf_rows(id) ON DELETE CASCADE,
  column_id VARCHAR(36) NOT NULL REFERENCES matrix_column_definitions(id) ON DELETE CASCADE,
  issue_text TEXT NOT NULL,
  linked_issue_id VARCHAR(36) REFERENCES issues(id) ON DELETE SET NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'text' CHECK (status IN ('text','converted')),
  created_by VARCHAR(36) REFERENCES platform_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS mip_matrix_id_idx ON matrix_issue_points(matrix_id);
CREATE INDEX IF NOT EXISTS mip_leaf_row_idx ON matrix_issue_points(leaf_row_id);

-- ---- 0006: Hermes Agent + WeCom tables ----
CREATE TABLE IF NOT EXISTS agent_instances (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(36) NOT NULL DEFAULT 'default',
  name VARCHAR(100) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN (
    'draft','active','paused','maintenance','frozen','archived'
  )),
  model_config_id VARCHAR(36) REFERENCES ai_model_configs(id) ON DELETE SET NULL,
  bound_user_id VARCHAR(36) REFERENCES platform_users(id) ON DELETE SET NULL,
  description TEXT,
  max_active_conversations INT DEFAULT 5,
  created_by VARCHAR(36) REFERENCES platform_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ai_tenant_status_idx ON agent_instances(tenant_id, status);
CREATE INDEX IF NOT EXISTS ai_bound_user_idx ON agent_instances(bound_user_id);

CREATE TABLE IF NOT EXISTS agent_run_snapshot_configs (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_instance_id VARCHAR(36) NOT NULL REFERENCES agent_instances(id) ON DELETE CASCADE,
  base_url_snapshot TEXT NOT NULL,
  model_name_snapshot VARCHAR(200) NOT NULL,
  api_key_ref VARCHAR(36) NOT NULL,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS arsc_instance_idx ON agent_run_snapshot_configs(agent_instance_id);

CREATE TABLE IF NOT EXISTS agent_memory_namespaces (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  namespace_key VARCHAR(200) NOT NULL UNIQUE,
  tenant_id VARCHAR(36) NOT NULL DEFAULT 'default',
  agent_instance_id VARCHAR(36) NOT NULL REFERENCES agent_instances(id) ON DELETE CASCADE,
  binding_id VARCHAR(36),
  scope_config JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS amn_instance_idx ON agent_memory_namespaces(agent_instance_id);

CREATE TABLE IF NOT EXISTS conversations (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(36) NOT NULL DEFAULT 'default',
  agent_instance_id VARCHAR(36) NOT NULL REFERENCES agent_instances(id) ON DELETE CASCADE,
  platform_user_id VARCHAR(36) REFERENCES platform_users(id) ON DELETE SET NULL,
  wecom_user_id VARCHAR(100),
  project_id VARCHAR(36),
  task_id VARCHAR(36),
  memory_namespace_id VARCHAR(36) REFERENCES agent_memory_namespaces(id) ON DELETE SET NULL,
  title VARCHAR(200),
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active','closed','archived')),
  last_event_id BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS conv_agent_idx ON conversations(agent_instance_id);
CREATE INDEX IF NOT EXISTS conv_user_idx ON conversations(platform_user_id);
CREATE INDEX IF NOT EXISTS conv_task_idx ON conversations(task_id);
CREATE INDEX IF NOT EXISTS conv_status_idx ON conversations(status);

CREATE TABLE IF NOT EXISTS conversation_messages (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id VARCHAR(36) NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL CHECK (role IN ('user','assistant','tool','system')),
  content TEXT,
  tool_call_id VARCHAR(100),
  tool_name VARCHAR(100),
  event_seq BIGINT NOT NULL,
  model_name VARCHAR(200),
  tokens_used INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS cm_conv_seq_idx ON conversation_messages(conversation_id, event_seq);

CREATE TABLE IF NOT EXISTS agent_runs (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(36) NOT NULL DEFAULT 'default',
  agent_instance_id VARCHAR(36) NOT NULL REFERENCES agent_instances(id) ON DELETE CASCADE,
  conversation_id VARCHAR(36) REFERENCES conversations(id) ON DELETE SET NULL,
  memory_namespace_id VARCHAR(36),
  trigger VARCHAR(40) NOT NULL DEFAULT 'manual' CHECK (trigger IN (
    'manual','matrix_summary','report_draft','wecom_ingest','material_bind_suggestion'
  )),
  status VARCHAR(20) NOT NULL DEFAULT 'running' CHECK (status IN ('running','succeeded','failed')),
  model_config_snapshot JSONB,
  input_summary TEXT,
  output_summary TEXT,
  error_code VARCHAR(60),
  trace_id VARCHAR(60) NOT NULL UNIQUE,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS ar_instance_idx ON agent_runs(agent_instance_id);
CREATE INDEX IF NOT EXISTS ar_status_idx ON agent_runs(status);

CREATE TABLE IF NOT EXISTS agent_suggestion_blocks (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_run_id VARCHAR(36) NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
  block_type VARCHAR(40) NOT NULL,
  payload JSONB NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending','accepted','edited_then_accepted','rejected','expired'
  )),
  target_entity_type VARCHAR(60),
  target_entity_id VARCHAR(36),
  edited_payload JSONB,
  decided_by VARCHAR(36) REFERENCES platform_users(id) ON DELETE SET NULL,
  decided_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS asb_run_idx ON agent_suggestion_blocks(agent_run_id);
CREATE INDEX IF NOT EXISTS asb_status_idx ON agent_suggestion_blocks(status);

CREATE TABLE IF NOT EXISTS wecom_bindings (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  platform_user_id VARCHAR(36) NOT NULL REFERENCES platform_users(id) ON DELETE CASCADE,
  wecom_user_id VARCHAR(100) NOT NULL,
  wecom_corp_id VARCHAR(100),
  provider VARCHAR(20) NOT NULL DEFAULT 'wecom',
  agent_instance_id VARCHAR(36) REFERENCES agent_instances(id) ON DELETE SET NULL,
  project_scope JSONB,
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active','frozen','unbound')),
  bound_by VARCHAR(36) REFERENCES platform_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (wecom_user_id, wecom_corp_id)
);
CREATE INDEX IF NOT EXISTS wb_platform_user_idx ON wecom_bindings(platform_user_id);

ALTER TABLE wecom_bindings ADD COLUMN IF NOT EXISTS provider VARCHAR(20) NOT NULL DEFAULT 'wecom';

CREATE TABLE IF NOT EXISTS agent_binding_sessions (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  provider VARCHAR(20) NOT NULL CHECK (provider IN ('wecom','wechat')),
  platform_user_id VARCHAR(36) NOT NULL REFERENCES platform_users(id) ON DELETE CASCADE,
  agent_instance_id VARCHAR(36) REFERENCES agent_instances(id) ON DELETE SET NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','consumed','expired','cancelled')),
  expires_at TIMESTAMPTZ NOT NULL,
  external_user_id VARCHAR(200),
  created_by VARCHAR(36) REFERENCES platform_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  consumed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS abs_status_expires_idx ON agent_binding_sessions(status, expires_at);
CREATE INDEX IF NOT EXISTS abs_platform_user_idx ON agent_binding_sessions(platform_user_id);

CREATE TABLE IF NOT EXISTS wecom_media_ingest_jobs (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  wecom_msg_id VARCHAR(100) NOT NULL,
  wecom_media_id VARCHAR(200) NOT NULL,
  media_type VARCHAR(20) NOT NULL CHECK (media_type IN ('image','video','text')),
  wecom_binding_id VARCHAR(36),
  expires_at TIMESTAMPTZ NOT NULL,
  download_status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (download_status IN (
    'pending','downloading','downloaded','failed','dead_letter'
  )),
  retry_count INT NOT NULL DEFAULT 0,
  max_retries INT NOT NULL DEFAULT 12,
  last_error TEXT,
  last_retry_at TIMESTAMPTZ,
  material_id VARCHAR(36) REFERENCES materials(id) ON DELETE SET NULL,
  detected_project_id VARCHAR(36),
  detected_task_id VARCHAR(36),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS wmij_status_idx ON wecom_media_ingest_jobs(download_status);
CREATE INDEX IF NOT EXISTS wmij_expires_idx ON wecom_media_ingest_jobs(expires_at);

CREATE TABLE IF NOT EXISTS agent_skill_bindings (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_instance_id VARCHAR(36) NOT NULL REFERENCES agent_instances(id) ON DELETE CASCADE,
  skill_template_id VARCHAR(36) NOT NULL REFERENCES agent_skill_templates(id) ON DELETE CASCADE,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  overridden_system_prompt TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (agent_instance_id, skill_template_id)
);

-- ---- 0007: Feature flags V3.1.2.4 ----
INSERT INTO platform_settings (key, value)
VALUES (
  'feature_flag_v3_1_2_4',
  '{
    "matrix_tab_state_enabled": true,
    "task_matrix_enabled": false,
    "dynamic_matrix_excel_like_view_enabled": false,
    "dynamic_matrix_formula_enabled": false,
    "dynamic_matrix_cell_style_enabled": false,
    "inline_edit_enabled": false,
    "autosave_enabled": false,
    "material_staging_enabled": false,
    "hermes_agent_gateway_enabled": false,
    "wecom_material_ingest_enabled": false
  }'::jsonb
)
ON CONFLICT (key) DO NOTHING;

-- ============================================================
-- PRD V3.1.2.4 表结构结束
-- ============================================================
