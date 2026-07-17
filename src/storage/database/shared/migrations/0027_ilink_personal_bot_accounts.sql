-- One iLink bot credential per platform user. The QR scanner's WeChat user ID
-- is recorded and becomes the only accepted direct-message sender by default.
CREATE TABLE IF NOT EXISTS ilink_bot_accounts (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  platform_user_id VARCHAR(36) NOT NULL,
  agent_instance_id VARCHAR(36) NOT NULL,
  bot_account_id VARCHAR(200) NOT NULL,
  owner_weixin_user_id VARCHAR(200) NOT NULL,
  token_encrypted TEXT NOT NULL,
  base_url TEXT NOT NULL DEFAULT 'https://ilinkai.weixin.qq.com',
  sync_buffer TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  last_error TEXT,
  bound_by VARCHAR(36),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ilink_bot_accounts_platform_user_key UNIQUE(platform_user_id),
  CONSTRAINT ilink_bot_accounts_bot_account_key UNIQUE(bot_account_id),
  CONSTRAINT iba_platform_user_fkey FOREIGN KEY(platform_user_id) REFERENCES platform_users(id) ON DELETE CASCADE,
  CONSTRAINT iba_agent_fkey FOREIGN KEY(agent_instance_id) REFERENCES agent_instances(id) ON DELETE RESTRICT,
  CONSTRAINT iba_bound_by_fkey FOREIGN KEY(bound_by) REFERENCES platform_users(id) ON DELETE SET NULL,
  CONSTRAINT iba_status_check CHECK(status IN ('pending','active','expired','revoked'))
);

CREATE INDEX IF NOT EXISTS iba_agent_idx ON ilink_bot_accounts(agent_instance_id);
CREATE INDEX IF NOT EXISTS iba_status_idx ON ilink_bot_accounts(status);
