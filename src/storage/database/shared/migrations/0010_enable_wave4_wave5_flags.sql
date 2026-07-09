-- ============================================================
-- Migration 0010: Enable Wave 4 staging + Wave 5 Hermes flags
-- WeCom ingest stays OFF (no callback routes yet).
-- ============================================================

UPDATE platform_settings
SET value = COALESCE(value, '{}'::jsonb) || '{
  "material_staging_enabled": true,
  "hermes_agent_gateway_enabled": true
}'::jsonb,
updated_at = NOW()
WHERE key = 'feature_flag_v3_1_2_4';

INSERT INTO platform_settings (key, value)
SELECT
  'feature_flag_v3_1_2_4',
  '{
    "matrix_tab_state_enabled": true,
    "task_matrix_enabled": true,
    "dynamic_matrix_excel_like_view_enabled": true,
    "dynamic_matrix_formula_enabled": true,
    "dynamic_matrix_cell_style_enabled": false,
    "inline_edit_enabled": true,
    "autosave_enabled": true,
    "material_staging_enabled": true,
    "hermes_agent_gateway_enabled": true,
    "wecom_material_ingest_enabled": false
  }'::jsonb
WHERE NOT EXISTS (
  SELECT 1 FROM platform_settings WHERE key = 'feature_flag_v3_1_2_4'
);
