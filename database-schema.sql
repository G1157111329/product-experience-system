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
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS check_records_task_id_idx ON check_records(task_id);
CREATE INDEX IF NOT EXISTS check_records_standard_item_id_idx ON check_records(standard_item_id);

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
  description TEXT,
  is_improve BOOLEAN,
  no_improve_reason TEXT,
  improve_plan TEXT,
  responsible_dept VARCHAR(50),
  responsible_person VARCHAR(50),
  plan_complete_date DATE,
  actual_complete_date DATE,
  is_closed BOOLEAN DEFAULT false,
  status VARCHAR(20) NOT NULL DEFAULT '待整改',     -- 待整改/整改中/已验证/不整改
  verification_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(title, source_type, task_id)
);
CREATE INDEX IF NOT EXISTS issues_task_id_idx ON issues(task_id);
CREATE INDEX IF NOT EXISTS issues_status_idx ON issues(status);
CREATE INDEX IF NOT EXISTS issues_severity_idx ON issues(severity);
CREATE INDEX IF NOT EXISTS issues_created_at_idx ON issues(created_at);

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
  recipe_type VARCHAR(20) DEFAULT '食谱',           -- 食谱 / 功能
  problem_count INTEGER DEFAULT 0,
  sort_order INTEGER DEFAULT 0,
  effect_description TEXT,                           -- 效果评价描述
  effect_score VARCHAR(20),                          -- AI综合评分
  effect_problem_point TEXT,                         -- 效果问题点（JSON数组格式）
  effect_ai_result JSONB,                           -- AI四维评价完整结果
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
-- 21. AI模型配置表
-- ============================================================
CREATE TABLE IF NOT EXISTS ai_model_configs (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  provider VARCHAR(20) NOT NULL DEFAULT 'builtin',  -- builtin / custom
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
-- 种子数据：初始管理员账号
-- 密码: bear2026
-- Hash方式: SHA-256(salt + password), salt = xp_experience_platform
-- ============================================================
INSERT INTO platform_users (id, account, password_hash, name, role, status)
VALUES (
  gen_random_uuid(),
  'bear2026',
  '821e2ed1ef455f2b09f2bfd5cfa356833da3fc5790ba1367a84adb971f108588',
  '管理员',
  'admin',
  'approved'
) ON CONFLICT (account) DO UPDATE SET
  password_hash = EXCLUDED.password_hash,
  role = 'admin',
  status = 'approved';

-- ============================================================
-- 种子数据：平台默认设置
-- ============================================================
INSERT INTO platform_settings (key, value) VALUES
  ('standard_options', '{"usage_phases":["开箱","首次安装","产品使用","清洁收纳","其他"],"experience_flows":{"开箱":["拿取外包装","拆开内包装"],"首次安装":["配件梳理","外观美观","外观缺陷","标识文字","首次安装"],"产品使用":["放置及组装","操作交互","产品运行"],"清洁收纳":["冲水","擦拭","晾干","收纳"],"其他":["其他"]},"sensory_dimensions":["视觉","听觉","触觉","嗅觉","味觉"]}'),
  ('ai_config', '{"provider":"custom","model":"Bear-Model-VL","temperature":5,"custom_api_url":"http://ds.bears.com.cn:8000/v1/chat/completions","custom_api_key":"local"}')
ON CONFLICT (key) DO NOTHING;

-- ============================================================
-- RLS 策略（Supabase 必需，自建 PostgreSQL 可跳过）
-- 对所有表启用 RLS 并设置为公开读写
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
        'platform_settings', 'standards', 'standard_items', 'experience_tasks', 'check_records',
        'materials', 'issues', 'issue_re_evaluations', 'report_templates', 'reports', 'report_shares',
        'recipes', 'recipe_steps', 'recipe_library', 'recipe_library_steps',
        'health_check', 'ai_model_configs', 'agent_skill_templates', 'agent_skill_versions',
        'agent_skill_audit_logs'
      )
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format('DROP POLICY IF EXISTS allow_all ON %I', tbl);
    EXECUTE format('CREATE POLICY allow_all ON %I FOR ALL USING (true) WITH CHECK (true)', tbl);
  END LOOP;
END $$;
