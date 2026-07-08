-- ============================================================
-- V2 → V3 Matrix Migration Script
-- PRD V3.1.2.4 ADR-01/ADR-06 — migrate existing V2 task_matrices
-- data into the V3 dynamic matrix model.
--
-- This script is IDEMPOTENT and safe to re-run. It only migrates
-- matrices that have NOT yet been migrated (no matrix_view_definitions
-- row exists for the matrix).
--
-- Run BEFORE enabling task_matrix_enabled flag in production.
-- After migration, V2 tables (matrix_groups/matrix_rows/matrix_field_values)
-- become read-only legacy (cold-retained).
--
-- Mapping strategy:
--   V2 matrix_groups (group_label)  → V3 matrix_hierarchy_nodes level_1
--   V2 matrix_rows (row_label)      → V3 matrix_leaf_rows (under the group's level_1)
--   V2 matrix_field_definitions     → V3 matrix_column_definitions (by data_type mapping)
--   V2 matrix_field_values          → V3 matrix_cell_values
--   V2 matrix_narratives            → V3 matrix_narrative_blocks
-- ============================================================

-- Step 1: Create a V3 view definition for each task_matrix that lacks one.
INSERT INTO matrix_view_definitions (matrix_id, version_no, max_hierarchy_level, left_frozen_column_count, formula_mode, style_mode, status, design_hash)
SELECT tm.id, 1, 3, 5, 'relative_cell_reference', 'basic_text_style', 'confirmed', 'v2-migration-' || tm.id
FROM task_matrices tm
WHERE NOT EXISTS (
  SELECT 1 FROM matrix_view_definitions mvd WHERE mvd.matrix_id = tm.id
)
ON CONFLICT (matrix_id, version_no) DO NOTHING;

-- Link task_matrices.current_view_definition_id to the new view definition.
UPDATE task_matrices tm
SET current_view_definition_id = (
  SELECT mvd.id FROM matrix_view_definitions mvd
  WHERE mvd.matrix_id = tm.id AND mvd.version_no = 1
  LIMIT 1
)
WHERE tm.current_view_definition_id IS NULL
  AND EXISTS (SELECT 1 FROM matrix_view_definitions mvd WHERE mvd.matrix_id = tm.id);

-- Step 2: Migrate V2 groups → V3 level_1 hierarchy nodes.
-- (Only for matrices that have a view definition now.)
INSERT INTO matrix_hierarchy_nodes (matrix_id, parent_id, level, node_label, node_type, sort_order)
SELECT DISTINCT ON (mg.matrix_id, mg.id)
  mg.matrix_id, NULL, 1, mg.group_label, 'level_1', mg.sort_order
FROM matrix_groups mg
WHERE NOT EXISTS (
    SELECT 1 FROM matrix_hierarchy_nodes mhn
    WHERE mhn.matrix_id = mg.matrix_id
      AND mhn.node_label = mg.group_label
      AND mhn.level = 1
      AND mhn.parent_id IS NULL
      AND mhn.archived_at IS NULL
  )
  AND mg.is_archived = false
  AND EXISTS (SELECT 1 FROM matrix_view_definitions mvd WHERE mvd.matrix_id = mg.matrix_id)
ON CONFLICT DO NOTHING;

-- Step 3: Migrate V2 field definitions → V3 column definitions.
-- Map V2 field_kind/data_type → V3 column_zone/data_type.
INSERT INTO matrix_column_definitions (matrix_id, column_zone, zone_role, column_label, data_type, unit_text, display_order, desktop_width_px, is_pinned, is_required, show_in_report, max_media_count, result_format, decimal_places, created_by)
SELECT DISTINCT ON (mfd.design_version_id, mfd.id)
  tm.id,
  CASE
    WHEN mfd.field_kind = 'evidence_slot' THEN 'primary_media'
    WHEN mfd.field_kind = 'issue_slot' THEN 'issue_point'
    WHEN mfd.field_kind = 'formula' THEN 'calculation_dimension'
    WHEN mfd.scope = 'row' THEN 'detail_dimension'
    ELSE 'evaluation'
  END,
  'A',
  mfd.label,
  CASE
    WHEN mfd.data_type LIKE 'calculated%' THEN 'formula'
    WHEN mfd.data_type LIKE '%slot' THEN 'media_slot'
    WHEN mfd.data_type = 'issue_slot' THEN 'issue_point'
    WHEN mfd.data_type IN ('short_text','long_text') THEN 'text'
    WHEN mfd.data_type IN ('integer','decimal','percentage') THEN 'number'
    WHEN mfd.data_type = 'duration' THEN 'duration'
    ELSE 'text'
  END,
  mfd.unit_text,
  mfd.sort_order,
  140,
  mfd.show_in_desktop_grid,
  mfd.required_mode = 'required',
  mfd.show_in_report,
  mfd.max_media_count,
  CASE WHEN mfd.display_format = 'percentage' THEN 'percentage' ELSE 'number' END,
  mfd.decimal_places,
  tm.created_by
FROM matrix_field_definitions mfd
JOIN matrix_design_versions mdv ON mdv.id = mfd.design_version_id
JOIN task_matrices tm ON tm.id = mdv.matrix_id
JOIN matrix_view_definitions mvd2 ON mvd2.matrix_id = tm.id
WHERE mfd.is_archived = false
  AND NOT EXISTS (
    SELECT 1 FROM matrix_column_definitions mcd
    WHERE mcd.matrix_id = tm.id AND mcd.column_label = mfd.label AND mcd.archived_at IS NULL
  )
ON CONFLICT DO NOTHING;

-- Step 4: Migrate V2 rows → V3 leaf rows (linked to the migrated level_1 node).
INSERT INTO matrix_leaf_rows (matrix_id, level_1_node_id, level_2_node_id, level_3_node_id, visible_row_index, group_row_index, status)
SELECT
  tm.id,
  mhn.id,
  NULL, NULL,
  mr.sort_order,
  mr.sort_order,
  CASE WHEN mr.is_archived THEN 'archived' ELSE 'active' END
FROM matrix_rows mr
JOIN matrix_groups mg ON mg.id = mr.group_id
JOIN task_matrices tm ON tm.id = mr.matrix_id
JOIN matrix_hierarchy_nodes mhn ON mhn.matrix_id = tm.id
  AND mhn.node_label = mg.group_label
  AND mhn.level = 1 AND mhn.parent_id IS NULL
WHERE EXISTS (SELECT 1 FROM matrix_view_definitions mvd WHERE mvd.matrix_id = tm.id)
  AND NOT EXISTS (
    SELECT 1 FROM matrix_leaf_rows mlr
    WHERE mlr.matrix_id = tm.id AND mlr.level_1_node_id = mhn.id
      AND mlr.visible_row_index = mr.sort_order
  )
ON CONFLICT DO NOTHING;

-- Step 5: Migrate V2 field values → V3 cell values.
INSERT INTO matrix_cell_values (matrix_id, leaf_row_id, column_id, value_text, value_number, value_duration_seconds, value_percentage, display_text, value_state, version)
SELECT
  tm.id,
  mlr.id,
  mcd.id,
  mfv.text_value,
  mfv.numeric_value,
  -- duration_ms → seconds
  CASE WHEN mfv.duration_ms IS NOT NULL THEN mfv.duration_ms / 1000 ELSE NULL END,
  NULL,
  mfv.enum_value,
  CASE
    WHEN mfv.value_state IN ('filled') THEN 'filled'
    WHEN mfv.value_state IN ('calculation_failed') THEN 'calculation_failed'
    WHEN mfv.value_state IN ('missing','not_tested') THEN 'empty'
    ELSE 'empty'
  END,
  1
FROM matrix_field_values mfv
JOIN matrix_rows mr ON mr.id = mfv.row_id
JOIN matrix_groups mg ON mg.id = mr.group_id
JOIN task_matrices tm ON tm.id = mr.matrix_id
JOIN matrix_leaf_rows mlr ON mlr.matrix_id = tm.id
  AND mlr.level_1_node_id = (
    SELECT mhn.id FROM matrix_hierarchy_nodes mhn
    WHERE mhn.matrix_id = tm.id AND mhn.node_label = mg.group_label
      AND mhn.level = 1 AND mhn.parent_id IS NULL LIMIT 1
  )
  AND mlr.visible_row_index = mr.sort_order
JOIN matrix_field_definitions mfd ON mfd.id = mfv.field_definition_id
JOIN matrix_column_definitions mcd ON mcd.matrix_id = tm.id
  AND mcd.column_label = mfd.label AND mcd.archived_at IS NULL
WHERE EXISTS (SELECT 1 FROM matrix_view_definitions mvd WHERE mvd.matrix_id = tm.id)
ON CONFLICT (matrix_id, leaf_row_id, column_id) DO NOTHING;

-- Step 6: Migrate V2 narratives → V3 narrative blocks.
INSERT INTO matrix_narrative_blocks (matrix_id, block_type, scope, scope_node_id, content, show_in_report, sort_order)
SELECT
  tm.id,
  'summary',
  CASE WHEN mn.group_id IS NOT NULL THEN 'level_1_group' ELSE 'matrix' END,
  NULL,
  mn.content,
  true,
  0
FROM matrix_narratives mn
JOIN task_matrices tm ON tm.id = mn.matrix_id
WHERE mn.narrative_key = 'summary'
  AND mn.content IS NOT NULL
  AND EXISTS (SELECT 1 FROM matrix_view_definitions mvd WHERE mvd.matrix_id = tm.id)
  AND NOT EXISTS (
    SELECT 1 FROM matrix_narrative_blocks mnb
    WHERE mnb.matrix_id = tm.id AND mnb.block_type = 'summary'
  )
ON CONFLICT DO NOTHING;

-- Migration complete. Verify with:
--   SELECT count(*) FROM matrix_view_definitions;  -- should match task_matrices count
--   SELECT count(*) FROM matrix_hierarchy_nodes WHERE level = 1;
--   SELECT count(*) FROM matrix_leaf_rows;
--   SELECT count(*) FROM matrix_cell_values;
