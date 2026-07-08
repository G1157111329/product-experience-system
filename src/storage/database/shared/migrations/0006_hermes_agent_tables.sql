-- ============================================================
-- Migration 0006: Hermes Agent Runtime + WeCom (企微) tables
-- PRD V3.1.2.4 §11 (embedded Hermes Agent), §12 (企微 entry)
--
-- ADR-03: full Hermes. Reuses ai_model_configs (no hermes_* config columns).
-- New tables: agent_instances, agent_runs, conversations, conversation_messages,
--   agent_memory_namespaces, agent_suggestion_blocks, wecom_bindings,
--   wecom_media_ingest_jobs, agent_skill_bindings.
-- agent_run_snapshot_configs captures base_url/model_name snapshot (api_key NOT stored).
-- Idempotent.
-- ============================================================

-- Section 1: agent_instances (PRD §11.3)
CREATE TABLE IF NOT EXISTS agent_instances (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(36) NOT NULL DEFAULT 'default',
  name VARCHAR(100) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN (
    'draft','active','paused','maintenance','frozen','archived'
  )),
  model_config_id VARCHAR(36),
  bound_user_id VARCHAR(36),
  description TEXT,
  max_active_conversations INT DEFAULT 5,
  created_by VARCHAR(36),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ai_tenant_status_idx ON agent_instances (tenant_id, status);
CREATE INDEX IF NOT EXISTS ai_bound_user_idx ON agent_instances (bound_user_id);
ALTER TABLE agent_instances
  DROP CONSTRAINT IF EXISTS ai_model_config_fkey;
ALTER TABLE agent_instances
  ADD CONSTRAINT ai_model_config_fkey FOREIGN KEY (model_config_id) REFERENCES ai_model_configs(id) ON DELETE SET NULL;
ALTER TABLE agent_instances
  DROP CONSTRAINT IF EXISTS ai_bound_user_fkey;
ALTER TABLE agent_instances
  ADD CONSTRAINT ai_bound_user_fkey FOREIGN KEY (bound_user_id) REFERENCES platform_users(id) ON DELETE SET NULL;
ALTER TABLE agent_instances
  DROP CONSTRAINT IF EXISTS ai_created_by_fkey;
ALTER TABLE agent_instances
  ADD CONSTRAINT ai_created_by_fkey FOREIGN KEY (created_by) REFERENCES platform_users(id) ON DELETE SET NULL;

-- Section 2: agent_run_snapshot_configs (PRD §11.2)
-- Captures base_url/model_name snapshot per instance; api_key NEVER stored (referenced via model_config_id).
CREATE TABLE IF NOT EXISTS agent_run_snapshot_configs (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_instance_id VARCHAR(36) NOT NULL,
  base_url_snapshot TEXT NOT NULL,
  model_name_snapshot VARCHAR(200) NOT NULL,
  api_key_ref VARCHAR(36) NOT NULL,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS arsc_instance_idx ON agent_run_snapshot_configs (agent_instance_id);
ALTER TABLE agent_run_snapshot_configs
  DROP CONSTRAINT IF EXISTS arsc_instance_fkey;
ALTER TABLE agent_run_snapshot_configs
  ADD CONSTRAINT arsc_instance_fkey FOREIGN KEY (agent_instance_id) REFERENCES agent_instances(id) ON DELETE CASCADE;

-- Section 3: agent_memory_namespaces (PRD §11.4)
CREATE TABLE IF NOT EXISTS agent_memory_namespaces (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  namespace_key VARCHAR(200) NOT NULL UNIQUE,
  tenant_id VARCHAR(36) NOT NULL DEFAULT 'default',
  agent_instance_id VARCHAR(36) NOT NULL,
  binding_id VARCHAR(36),
  scope_config JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS amn_instance_idx ON agent_memory_namespaces (agent_instance_id);
CREATE INDEX IF NOT EXISTS amn_tenant_idx ON agent_memory_namespaces (tenant_id);
ALTER TABLE agent_memory_namespaces
  DROP CONSTRAINT IF EXISTS amn_instance_fkey;
ALTER TABLE agent_memory_namespaces
  ADD CONSTRAINT amn_instance_fkey FOREIGN KEY (agent_instance_id) REFERENCES agent_instances(id) ON DELETE CASCADE;

-- Section 4: conversations (PRD §11.4 / §11.7)
CREATE TABLE IF NOT EXISTS conversations (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(36) NOT NULL DEFAULT 'default',
  agent_instance_id VARCHAR(36) NOT NULL,
  platform_user_id VARCHAR(36),
  wecom_user_id VARCHAR(100),
  project_id VARCHAR(36),
  task_id VARCHAR(36),
  memory_namespace_id VARCHAR(36),
  title VARCHAR(200),
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active','closed','archived')),
  last_event_id BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS conv_agent_idx ON conversations (agent_instance_id);
CREATE INDEX IF NOT EXISTS conv_user_idx ON conversations (platform_user_id);
CREATE INDEX IF NOT EXISTS conv_task_idx ON conversations (task_id);
CREATE INDEX IF NOT EXISTS conv_status_idx ON conversations (status);
ALTER TABLE conversations
  DROP CONSTRAINT IF EXISTS conv_agent_fkey;
ALTER TABLE conversations
  ADD CONSTRAINT conv_agent_fkey FOREIGN KEY (agent_instance_id) REFERENCES agent_instances(id) ON DELETE CASCADE;
ALTER TABLE conversations
  DROP CONSTRAINT IF EXISTS conv_memory_fkey;
ALTER TABLE conversations
  ADD CONSTRAINT conv_memory_fkey FOREIGN KEY (memory_namespace_id) REFERENCES agent_memory_namespaces(id) ON DELETE SET NULL;

-- Section 5: conversation_messages (PRD §11.7)
CREATE TABLE IF NOT EXISTS conversation_messages (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id VARCHAR(36) NOT NULL,
  role VARCHAR(20) NOT NULL CHECK (role IN ('user','assistant','tool','system')),
  content TEXT,
  tool_call_id VARCHAR(100),
  tool_name VARCHAR(100),
  event_seq BIGINT NOT NULL,
  model_name VARCHAR(200),
  tokens_used INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS cm_conv_seq_idx ON conversation_messages (conversation_id, event_seq);
ALTER TABLE conversation_messages
  DROP CONSTRAINT IF EXISTS cm_conv_fkey;
ALTER TABLE conversation_messages
  ADD CONSTRAINT cm_conv_fkey FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE;

-- Section 6: agent_runs (PRD §11.5 / §11.8)
CREATE TABLE IF NOT EXISTS agent_runs (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(36) NOT NULL DEFAULT 'default',
  agent_instance_id VARCHAR(36) NOT NULL,
  conversation_id VARCHAR(36),
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
CREATE INDEX IF NOT EXISTS ar_instance_idx ON agent_runs (agent_instance_id);
CREATE INDEX IF NOT EXISTS ar_conv_idx ON agent_runs (conversation_id);
CREATE INDEX IF NOT EXISTS ar_status_idx ON agent_runs (status);
CREATE INDEX IF NOT EXISTS ar_trace_idx ON agent_runs (trace_id);
ALTER TABLE agent_runs
  DROP CONSTRAINT IF EXISTS ar_instance_fkey;
ALTER TABLE agent_runs
  ADD CONSTRAINT ar_instance_fkey FOREIGN KEY (agent_instance_id) REFERENCES agent_instances(id) ON DELETE CASCADE;
ALTER TABLE agent_runs
  DROP CONSTRAINT IF EXISTS ar_conv_fkey;
ALTER TABLE agent_runs
  ADD CONSTRAINT ar_conv_fkey FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE SET NULL;

-- Section 7: agent_suggestion_blocks (PRD §11.5)
CREATE TABLE IF NOT EXISTS agent_suggestion_blocks (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_run_id VARCHAR(36) NOT NULL,
  block_type VARCHAR(40) NOT NULL,
  payload JSONB NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending','accepted','edited_then_accepted','rejected','expired'
  )),
  target_entity_type VARCHAR(60),
  target_entity_id VARCHAR(36),
  edited_payload JSONB,
  decided_by VARCHAR(36),
  decided_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS asb_run_idx ON agent_suggestion_blocks (agent_run_id);
CREATE INDEX IF NOT EXISTS asb_status_idx ON agent_suggestion_blocks (status);
CREATE INDEX IF NOT EXISTS asb_target_idx ON agent_suggestion_blocks (target_entity_type, target_entity_id);
ALTER TABLE agent_suggestion_blocks
  DROP CONSTRAINT IF EXISTS asb_run_fkey;
ALTER TABLE agent_suggestion_blocks
  ADD CONSTRAINT asb_run_fkey FOREIGN KEY (agent_run_id) REFERENCES agent_runs(id) ON DELETE CASCADE;

-- Section 8: wecom_bindings (PRD §12.1)
CREATE TABLE IF NOT EXISTS wecom_bindings (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  platform_user_id VARCHAR(36) NOT NULL,
  wecom_user_id VARCHAR(100) NOT NULL,
  wecom_corp_id VARCHAR(100),
  agent_instance_id VARCHAR(36),
  project_scope JSONB,
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active','frozen','unbound')),
  bound_by VARCHAR(36),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT wecom_bindings_user_corp_key UNIQUE (wecom_user_id, wecom_corp_id)
);
CREATE INDEX IF NOT EXISTS wb_platform_user_idx ON wecom_bindings (platform_user_id);
CREATE INDEX IF NOT EXISTS wb_wecom_user_idx ON wecom_bindings (wecom_user_id);
ALTER TABLE wecom_bindings
  DROP CONSTRAINT IF EXISTS wb_platform_user_fkey;
ALTER TABLE wecom_bindings
  ADD CONSTRAINT wb_platform_user_fkey FOREIGN KEY (platform_user_id) REFERENCES platform_users(id) ON DELETE CASCADE;
ALTER TABLE wecom_bindings
  DROP CONSTRAINT IF EXISTS wb_agent_fkey;
ALTER TABLE wecom_bindings
  ADD CONSTRAINT wb_agent_fkey FOREIGN KEY (agent_instance_id) REFERENCES agent_instances(id) ON DELETE SET NULL;

-- Section 9: wecom_media_ingest_jobs (PRD §12.2 / §12.3)
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
  material_id VARCHAR(36),
  detected_project_id VARCHAR(36),
  detected_task_id VARCHAR(36),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS wmij_status_idx ON wecom_media_ingest_jobs (download_status);
CREATE INDEX IF NOT EXISTS wmij_expires_idx ON wecom_media_ingest_jobs (expires_at);
CREATE INDEX IF NOT EXISTS wmij_binding_idx ON wecom_media_ingest_jobs (wecom_binding_id);
ALTER TABLE wecom_media_ingest_jobs
  DROP CONSTRAINT IF EXISTS wmij_material_fkey;
ALTER TABLE wecom_media_ingest_jobs
  ADD CONSTRAINT wmij_material_fkey FOREIGN KEY (material_id) REFERENCES materials(id) ON DELETE SET NULL;

-- Section 10: agent_skill_bindings (PRD §11.6)
CREATE TABLE IF NOT EXISTS agent_skill_bindings (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_instance_id VARCHAR(36) NOT NULL,
  skill_template_id VARCHAR(36) NOT NULL,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  overridden_system_prompt TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT agent_skill_bindings_key UNIQUE (agent_instance_id, skill_template_id)
);
ALTER TABLE agent_skill_bindings
  DROP CONSTRAINT IF EXISTS asb_instance_fkey2;
ALTER TABLE agent_skill_bindings
  ADD CONSTRAINT asb_instance_fkey2 FOREIGN KEY (agent_instance_id) REFERENCES agent_instances(id) ON DELETE CASCADE;
ALTER TABLE agent_skill_bindings
  DROP CONSTRAINT IF EXISTS asb_skill_fkey;
ALTER TABLE agent_skill_bindings
  ADD CONSTRAINT asb_skill_fkey FOREIGN KEY (skill_template_id) REFERENCES agent_skill_templates(id) ON DELETE CASCADE;
