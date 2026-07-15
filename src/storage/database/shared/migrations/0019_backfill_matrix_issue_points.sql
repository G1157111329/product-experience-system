-- Existing non-empty matrix issue points must behave exactly like newly entered points:
-- one source row is linked to one data-matrix issue, including repeated text in
-- different matrix cells.
INSERT INTO issues (task_id, title, description, level, status, source_type, source, source_report_id)
SELECT
  tm.task_id,
  left(trim(mip.issue_text), 200),
  trim(mip.issue_text),
  '二类',
  'open',
  'matrix_issue',
  '数据矩阵',
  mip.id
FROM matrix_issue_points mip
JOIN task_matrices tm ON tm.id = mip.matrix_id
WHERE mip.linked_issue_id IS NULL
  AND nullif(trim(mip.issue_text), '') IS NOT NULL;

UPDATE matrix_issue_points mip
SET
  linked_issue_id = issue_row.id,
  status = 'converted',
  updated_at = NOW()
FROM task_matrices tm, issues issue_row
WHERE tm.id = mip.matrix_id
  AND issue_row.task_id = tm.task_id
  AND issue_row.source_type = 'matrix_issue'
  AND issue_row.source_report_id = mip.id
  AND mip.linked_issue_id IS NULL
  AND nullif(trim(mip.issue_text), '') IS NOT NULL;
