-- Provider capabilities are configuration, never model-name conditionals.
-- The stored JSON supports only sanitized request options in application code.
ALTER TABLE "ai_model_configs"
  ADD COLUMN IF NOT EXISTS "request_options" jsonb DEFAULT '{}'::jsonb;
