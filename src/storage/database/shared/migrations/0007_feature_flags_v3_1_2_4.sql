-- ============================================================
-- Migration 0007: Feature Flags for PRD V3.1.2.4
-- PRD §14 — 10 new flags for InlineEditable / V3 dynamic matrix /
-- formula / cell style / material staging / Hermes / WeCom.
--
-- Stored under platform_settings key='feature_flag_v3_1_2_4'.
-- Per PRD §14 rules:
--   - Missing flag MUST NOT cause blank page; code defaults apply.
--   - matrix_tab_state_enabled=true + task_matrix_enabled=false
--     => Tab visible but shows "功能未启用", no create CTA.
-- Idempotent (INSERT ... ON CONFLICT DO UPDATE).
-- ============================================================

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
