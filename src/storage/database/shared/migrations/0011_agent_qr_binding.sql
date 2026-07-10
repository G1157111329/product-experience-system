ALTER TABLE wecom_bindings
  ADD COLUMN IF NOT EXISTS provider VARCHAR(20) NOT NULL DEFAULT 'wecom';

ALTER TABLE material_links
  ADD COLUMN IF NOT EXISTS binding_order INT NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS ml_target_order_idx
  ON material_links(target_type, target_id, binding_order, bound_at);

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
