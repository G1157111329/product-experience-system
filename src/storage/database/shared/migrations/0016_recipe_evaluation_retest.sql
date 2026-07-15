-- Canonical recipe judgments, stable evaluation issue identity, and atomic retests.

CREATE TABLE IF NOT EXISTS issue_status_dict (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(64) NOT NULL,
  label VARCHAR(120) NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  scope_filter JSONB DEFAULT '{}'::jsonb,
  description VARCHAR(400),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT issue_status_dict_code_uniq UNIQUE (code)
);
CREATE INDEX IF NOT EXISTS issue_status_dict_sort_idx ON issue_status_dict(sort_order);
CREATE INDEX IF NOT EXISTS issue_status_dict_active_idx ON issue_status_dict(is_active);


ALTER TABLE issues DROP CONSTRAINT IF EXISTS issues_unique_per_task;
ALTER TABLE issues DROP CONSTRAINT IF EXISTS issues_title_source_type_task_id_key;

CREATE OR REPLACE FUNCTION normalize_issue_status_0016(p_status TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE trim(COALESCE(p_status, ''))
    WHEN '待整改' THEN 'open'
    WHEN '整改中' THEN 'rectifying'
    WHEN '已验证' THEN 'verified_closed'
    WHEN '已整改' THEN 'verified_closed'
    WHEN '整改完成' THEN 'verified_closed'
    WHEN '不整改' THEN 'waived'
    WHEN '待分派' THEN 'open'
    WHEN '已分派' THEN 'open'
    WHEN '已指派' THEN 'open'
    WHEN '待验证' THEN 'rectifying'
    WHEN '已验证关闭' THEN 'verified_closed'
    WHEN '已重开' THEN 'rectifying'
    WHEN 'open' THEN 'open'
    WHEN 'triaged' THEN 'open'
    WHEN 'assigned' THEN 'open'
    WHEN 'rectifying' THEN 'rectifying'
    WHEN 'pending_verification' THEN 'rectifying'
    WHEN 'verified_closed' THEN 'verified_closed'
    WHEN 'waived' THEN 'waived'
    WHEN 'reopened' THEN 'rectifying'
    ELSE 'open'
  END;
$$;

UPDATE issues SET status = normalize_issue_status_0016(status);
ALTER TABLE issues ALTER COLUMN status SET DEFAULT 'open';
ALTER TABLE issues DROP CONSTRAINT IF EXISTS issues_status_check;
ALTER TABLE issues ADD CONSTRAINT issues_status_check
  CHECK (status IN ('open', 'rectifying', 'verified_closed', 'waived'));

INSERT INTO issue_status_dict (code, label, sort_order, is_active, description)
VALUES
  ('open', '待整改', 10, true, '问题尚未开始整改'),
  ('rectifying', '整改中', 20, true, '问题正在整改或复测未通过'),
  ('verified_closed', '整改完成', 30, true, '问题复测合格或已确认完成'),
  ('waived', '不整改', 40, true, '问题已确认不整改')
ON CONFLICT (code) DO UPDATE SET
  label = EXCLUDED.label,
  sort_order = EXCLUDED.sort_order,
  is_active = true,
  description = EXCLUDED.description,
  updated_at = now();
UPDATE issue_status_dict
SET is_active = false, updated_at = now()
WHERE code NOT IN ('open', 'rectifying', 'verified_closed', 'waived');

DROP TABLE IF EXISTS _issue_merge_0016;
CREATE TEMP TABLE _issue_merge_0016 AS
SELECT id AS duplicate_id, keeper_id
FROM (
  SELECT
    id,
    FIRST_VALUE(id) OVER (
      PARTITION BY source_type,
        CASE WHEN source_type = 'recipe_problem' THEN recipe_id ELSE record_id END
      ORDER BY created_at ASC, id ASC
    ) AS keeper_id,
    ROW_NUMBER() OVER (
      PARTITION BY source_type,
        CASE WHEN source_type = 'recipe_problem' THEN recipe_id ELSE record_id END
      ORDER BY created_at ASC, id ASC
    ) AS row_number
  FROM issues
  WHERE source_report_id IS NULL
    AND (
      (source_type = 'recipe_problem' AND recipe_id IS NOT NULL)
      OR (source_type = 'record_fail' AND record_id IS NOT NULL)
    )
) ranked
WHERE row_number > 1;

WITH members AS (
  SELECT keeper_id, duplicate_id AS issue_id FROM _issue_merge_0016
  UNION
  SELECT DISTINCT keeper_id, keeper_id FROM _issue_merge_0016
),
merged AS (
  SELECT m.keeper_id,
    max(CASE normalize_issue_status_0016(i.status) WHEN 'verified_closed' THEN 4 WHEN 'waived' THEN 3
      WHEN 'rectifying' THEN 2 ELSE 1 END) AS status_rank,
    bool_or(i.is_closed) AS is_closed,
    (array_agg(NULLIF(trim(i.improve_plan), '') ORDER BY i.created_at DESC, i.id DESC)
      FILTER (WHERE NULLIF(trim(i.improve_plan), '') IS NOT NULL))[1] AS improve_plan,
    (array_agg(NULLIF(trim(i.responsible_person), '') ORDER BY i.created_at DESC, i.id DESC)
      FILTER (WHERE NULLIF(trim(i.responsible_person), '') IS NOT NULL))[1] AS responsible_person,
    (array_agg(NULLIF(trim(i.responsible_dept), '') ORDER BY i.created_at DESC, i.id DESC)
      FILTER (WHERE NULLIF(trim(i.responsible_dept), '') IS NOT NULL))[1] AS responsible_dept,
    (array_agg(i.plan_complete_date ORDER BY i.created_at DESC, i.id DESC)
      FILTER (WHERE i.plan_complete_date IS NOT NULL))[1] AS plan_complete_date,
    (array_agg(i.actual_complete_date ORDER BY i.created_at DESC, i.id DESC)
      FILTER (WHERE i.actual_complete_date IS NOT NULL))[1] AS actual_complete_date,
    (array_agg(NULLIF(trim(i.verification_note), '') ORDER BY i.created_at DESC, i.id DESC)
      FILTER (WHERE NULLIF(trim(i.verification_note), '') IS NOT NULL))[1] AS verification_note,
    (array_agg(NULLIF(trim(i.no_improve_reason), '') ORDER BY i.created_at DESC, i.id DESC)
      FILTER (WHERE NULLIF(trim(i.no_improve_reason), '') IS NOT NULL))[1] AS no_improve_reason,
    (array_agg(NULLIF(trim(i.description), '') ORDER BY i.created_at DESC, i.id DESC)
      FILTER (WHERE NULLIF(trim(i.description), '') IS NOT NULL))[1] AS description,
    (array_agg(i.is_improve ORDER BY i.created_at DESC, i.id DESC)
      FILTER (WHERE i.is_improve IS NOT NULL))[1] AS is_improve
  FROM members m JOIN issues i ON i.id = m.issue_id
  GROUP BY m.keeper_id
)
UPDATE issues keeper
SET status = CASE merged.status_rank WHEN 4 THEN 'verified_closed' WHEN 3 THEN 'waived'
    WHEN 2 THEN 'rectifying' ELSE 'open' END,
  is_closed = merged.is_closed,
  improve_plan = COALESCE(merged.improve_plan, keeper.improve_plan),
  responsible_person = COALESCE(merged.responsible_person, keeper.responsible_person),
  responsible_dept = COALESCE(merged.responsible_dept, keeper.responsible_dept),
  plan_complete_date = COALESCE(merged.plan_complete_date, keeper.plan_complete_date),
  actual_complete_date = COALESCE(merged.actual_complete_date, keeper.actual_complete_date),
  verification_note = COALESCE(merged.verification_note, keeper.verification_note),
  no_improve_reason = COALESCE(merged.no_improve_reason, keeper.no_improve_reason),
  description = COALESCE(merged.description, keeper.description),
  is_improve = COALESCE(merged.is_improve, keeper.is_improve),
  updated_at = now()
FROM merged WHERE keeper.id = merged.keeper_id;

UPDATE materials target SET issue_id = mapping.keeper_id
FROM _issue_merge_0016 mapping WHERE target.issue_id = mapping.duplicate_id;
UPDATE issue_re_evaluations target SET issue_id = mapping.keeper_id
FROM _issue_merge_0016 mapping WHERE target.issue_id = mapping.duplicate_id;
UPDATE issue_occurrences target SET issue_id = mapping.keeper_id
FROM _issue_merge_0016 mapping WHERE target.issue_id = mapping.duplicate_id;
UPDATE rectification_actions target SET issue_id = mapping.keeper_id
FROM _issue_merge_0016 mapping WHERE target.issue_id = mapping.duplicate_id;
UPDATE verifications target SET issue_id = mapping.keeper_id
FROM _issue_merge_0016 mapping WHERE target.issue_id = mapping.duplicate_id;
UPDATE matrix_issue_points target SET linked_issue_id = mapping.keeper_id
FROM _issue_merge_0016 mapping WHERE target.linked_issue_id = mapping.duplicate_id;
DELETE FROM issues target USING _issue_merge_0016 mapping WHERE target.id = mapping.duplicate_id;
DROP TABLE _issue_merge_0016;

CREATE UNIQUE INDEX IF NOT EXISTS issues_recipe_source_unique ON issues(recipe_id)
  WHERE source_type = 'recipe_problem' AND recipe_id IS NOT NULL AND source_report_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS issues_record_source_unique ON issues(record_id)
  WHERE source_type = 'record_fail' AND record_id IS NOT NULL AND source_report_id IS NULL;

CREATE OR REPLACE FUNCTION normalize_evaluation_status(p_value TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN lower(trim(COALESCE(p_value, ''))) IN ('qualified', 'qualify', 'pass', 'passed') OR trim(COALESCE(p_value, '')) = '合格' THEN 'qualified'
    WHEN lower(trim(COALESCE(p_value, ''))) IN ('unqualified', 'fail', 'failed') OR trim(COALESCE(p_value, '')) = '不合格' THEN 'unqualified'
    ELSE 'pending'
  END
$$;

CREATE OR REPLACE FUNCTION evaluation_issue_title(p_subject TEXT, p_kind TEXT, p_status TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$
  SELECT left(trim(COALESCE(p_subject, '')) || CASE WHEN p_kind = 'recipe' THEN '效果' ELSE '' END ||
    CASE normalize_evaluation_status(p_status) WHEN 'qualified' THEN '合格' WHEN 'unqualified' THEN '不合格' ELSE '待定' END, 200)
$$;

CREATE OR REPLACE FUNCTION sync_evaluation_issue_trigger()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_status TEXT;
  v_subject TEXT;
BEGIN
  IF TG_TABLE_NAME = 'recipes' THEN
    v_status := normalize_evaluation_status(NEW.effect_status);
    IF v_status = 'qualified' THEN RETURN NEW; END IF;
    v_subject := trim(NEW.name);
    IF right(v_subject, 2) NOT IN ('食谱', '功能') THEN
      v_subject := v_subject || CASE WHEN lower(trim(COALESCE(NEW.recipe_type, ''))) IN ('功能', 'function') THEN '功能' ELSE '食谱' END;
    END IF;
    INSERT INTO issues (task_id, recipe_id, title, level, source, source_type, status)
    VALUES (NEW.task_id, NEW.id, evaluation_issue_title(v_subject, 'recipe', v_status), '二类', '功能/食谱效果评价', 'recipe_problem', 'open')
    ON CONFLICT (recipe_id) WHERE source_type = 'recipe_problem' AND recipe_id IS NOT NULL AND source_report_id IS NULL
    DO UPDATE SET title = EXCLUDED.title, updated_at = now();
  ELSE
    v_status := normalize_evaluation_status(NEW.evaluation_result);
    IF v_status = 'qualified' THEN RETURN NEW; END IF;
    INSERT INTO issues (task_id, record_id, title, level, source, source_type, description, status)
    VALUES (NEW.task_id, NEW.id, evaluation_issue_title(NEW.check_item, 'record', v_status),
      COALESCE(NEW.problem_level, '二类'),
      CASE WHEN NEW.standard_category IS NULL THEN '体验检查' ELSE NEW.standard_category || '问题' END,
      'record_fail', NEW.problem_description, 'open')
    ON CONFLICT (record_id) WHERE source_type = 'record_fail' AND record_id IS NOT NULL AND source_report_id IS NULL
    DO UPDATE SET title = EXCLUDED.title, description = EXCLUDED.description,
      level = EXCLUDED.level, source = EXCLUDED.source, updated_at = now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS recipes_evaluation_issue_sync ON recipes;
CREATE TRIGGER recipes_evaluation_issue_sync
AFTER INSERT OR UPDATE OF effect_status, name, recipe_type ON recipes
FOR EACH ROW EXECUTE FUNCTION sync_evaluation_issue_trigger();
DROP TRIGGER IF EXISTS check_records_evaluation_issue_sync ON check_records;
CREATE TRIGGER check_records_evaluation_issue_sync
AFTER INSERT OR UPDATE OF evaluation_result, check_item, problem_description, problem_level, standard_category ON check_records
FOR EACH ROW EXECUTE FUNCTION sync_evaluation_issue_trigger();

UPDATE recipes
SET effect_status = CASE
  WHEN lower(trim(COALESCE(effect_status, ''))) IN ('qualified', 'qualify', 'pass', 'passed') OR trim(COALESCE(effect_status, '')) = '合格' THEN 'qualified'
  WHEN lower(trim(COALESCE(effect_status, ''))) IN ('unqualified', 'fail', 'failed') OR trim(COALESCE(effect_status, '')) = '不合格' THEN 'unqualified'
  ELSE 'pending'
END;
ALTER TABLE recipes ALTER COLUMN effect_status SET DEFAULT 'pending';
ALTER TABLE recipes ALTER COLUMN effect_status SET NOT NULL;
ALTER TABLE recipes DROP CONSTRAINT IF EXISTS recipes_effect_status_check;
ALTER TABLE recipes ADD CONSTRAINT recipes_effect_status_check
  CHECK (effect_status IN ('qualified', 'unqualified', 'pending'));

ALTER TABLE issue_re_evaluations ADD COLUMN IF NOT EXISTS result VARCHAR(20);
UPDATE issue_re_evaluations
SET result = CASE
  WHEN lower(trim(COALESCE(result, ''))) IN ('qualified', 'qualify', 'pass', 'passed') OR trim(COALESCE(result, '')) = '合格' THEN 'qualified'
  WHEN lower(trim(COALESCE(result, ''))) IN ('unqualified', 'fail', 'failed') OR trim(COALESCE(result, '')) = '不合格' THEN 'unqualified'
  ELSE 'pending'
END;
ALTER TABLE issue_re_evaluations ALTER COLUMN result SET DEFAULT 'pending';
ALTER TABLE issue_re_evaluations ALTER COLUMN result SET NOT NULL;
ALTER TABLE issue_re_evaluations DROP CONSTRAINT IF EXISTS issue_re_evaluations_result_check;
ALTER TABLE issue_re_evaluations ADD CONSTRAINT issue_re_evaluations_result_check
  CHECK (result IN ('qualified', 'unqualified', 'pending'));

INSERT INTO issues (task_id, recipe_id, title, level, source, source_type, status)
SELECT r.task_id, r.id,
  evaluation_issue_title(CASE WHEN right(trim(r.name), 2) IN ('食谱', '功能') THEN trim(r.name)
    ELSE trim(r.name) || CASE WHEN lower(trim(COALESCE(r.recipe_type, ''))) IN ('功能', 'function') THEN '功能' ELSE '食谱' END END,
    'recipe', r.effect_status),
  '二类', '功能/食谱效果评价', 'recipe_problem', 'open'
FROM recipes r
WHERE normalize_evaluation_status(r.effect_status) IN ('pending', 'unqualified')
ON CONFLICT (recipe_id) WHERE source_type = 'recipe_problem' AND recipe_id IS NOT NULL AND source_report_id IS NULL
DO UPDATE SET title = EXCLUDED.title, updated_at = now();

INSERT INTO issues (task_id, record_id, title, level, source, source_type, description, status)
SELECT r.task_id, r.id, evaluation_issue_title(r.check_item, 'record', r.evaluation_result),
  COALESCE(r.problem_level, '二类'),
  CASE WHEN r.standard_category IS NULL THEN '体验检查' ELSE r.standard_category || '问题' END,
  'record_fail', r.problem_description, 'open'
FROM check_records r
WHERE normalize_evaluation_status(r.evaluation_result) IN ('pending', 'unqualified')
ON CONFLICT (record_id) WHERE source_type = 'record_fail' AND record_id IS NOT NULL AND source_report_id IS NULL
DO UPDATE SET title = EXCLUDED.title, description = EXCLUDED.description,
  level = EXCLUDED.level, source = EXCLUDED.source, updated_at = now();

CREATE OR REPLACE FUNCTION apply_issue_retest(p_command JSONB)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_action TEXT := lower(trim(COALESCE(p_command->>'action', '')));
  v_issue_id VARCHAR(36) := NULLIF(trim(COALESCE(p_command->>'issue_id', '')), '');
  v_retest_id VARCHAR(36) := NULLIF(trim(COALESCE(p_command->>'re_evaluation_id', '')), '');
  v_result VARCHAR(20) := CASE WHEN p_command ? 'result' THEN lower(trim(COALESCE(p_command->>'result', 'pending'))) ELSE NULL END;
  v_description TEXT := p_command->>'description';
  v_created_by VARCHAR(36) := NULLIF(trim(COALESCE(p_command->>'created_by', '')), '');
  v_ai_result JSONB := p_command->'ai_result';
  v_retest_json JSONB;
  v_issue_json JSONB;
  v_latest_result VARCHAR(20);
  v_issue_task_id VARCHAR(36);
  v_requested_material_count INTEGER;
  v_valid_material_count INTEGER;
BEGIN
  IF v_action NOT IN ('create', 'update', 'delete') THEN
    RAISE EXCEPTION 'unsupported retest action';
  END IF;
  IF v_action IN ('create', 'update') AND p_command ? 'result' AND v_result NOT IN ('qualified', 'unqualified', 'pending') THEN
    RAISE EXCEPTION 'invalid retest result';
  END IF;

  IF v_action = 'create' THEN
    SELECT task_id INTO v_issue_task_id FROM issues WHERE id = v_issue_id FOR UPDATE;
    IF v_issue_task_id IS NULL THEN RAISE EXCEPTION 'issue not found'; END IF;
    v_retest_id := gen_random_uuid()::text;
    INSERT INTO issue_re_evaluations (id, issue_id, description, result, ai_result, created_by)
    VALUES (v_retest_id, v_issue_id, COALESCE(v_description, ''), COALESCE(v_result, 'pending'), v_ai_result, v_created_by);
  ELSE
    SELECT issue_id INTO v_issue_id
    FROM issue_re_evaluations
    WHERE id = v_retest_id
    FOR UPDATE;
    IF v_issue_id IS NULL THEN RAISE EXCEPTION 'retest not found'; END IF;
    SELECT task_id INTO v_issue_task_id FROM issues WHERE id = v_issue_id FOR UPDATE;
    IF v_issue_task_id IS NULL THEN RAISE EXCEPTION 'issue not found'; END IF;

    IF v_action = 'update' THEN
      UPDATE issue_re_evaluations
      SET description = CASE WHEN p_command ? 'description' THEN v_description ELSE description END,
          result = CASE WHEN p_command ? 'result' THEN v_result ELSE result END,
          ai_result = CASE WHEN p_command ? 'ai_result' THEN v_ai_result ELSE ai_result END
      WHERE id = v_retest_id;
    ELSE
      DELETE FROM material_links
      WHERE target_type = 're_evaluation' AND target_id = v_retest_id;
      UPDATE materials SET re_evaluation_id = NULL WHERE re_evaluation_id = v_retest_id;
      DELETE FROM issue_re_evaluations WHERE id = v_retest_id;
    END IF;
  END IF;

  IF v_action IN ('create', 'update') AND p_command ? 'material_ids' THEN
    IF jsonb_typeof(p_command->'material_ids') <> 'array' THEN RAISE EXCEPTION 'material_ids must be an array'; END IF;
    PERFORM material.id FROM materials material
    WHERE material.id IN (SELECT DISTINCT value FROM jsonb_array_elements_text(p_command->'material_ids'))
    ORDER BY material.id FOR UPDATE;
    SELECT count(DISTINCT value) INTO v_requested_material_count FROM jsonb_array_elements_text(p_command->'material_ids');
    SELECT count(*) INTO v_valid_material_count
    FROM materials material
    WHERE material.id IN (SELECT DISTINCT value FROM jsonb_array_elements_text(p_command->'material_ids'))
      AND material.task_id = v_issue_task_id;
    IF v_valid_material_count <> v_requested_material_count THEN RAISE EXCEPTION 'invalid retest material'; END IF;

    -- Replace only this retest's links. Legacy re_evaluation_id values remain
    -- readable for old rows and never make the asset unavailable elsewhere.
    DELETE FROM material_links
    WHERE target_type = 're_evaluation'
      AND target_id = v_retest_id
      AND material_id NOT IN (
        SELECT DISTINCT value FROM jsonb_array_elements_text(p_command->'material_ids')
      );

    INSERT INTO material_links (material_id, target_type, target_id, binding_method, binding_order, bound_by)
    SELECT selected.material_id, 're_evaluation', v_retest_id, 'click_select', selected.binding_order, v_created_by
    FROM (
      SELECT value AS material_id, min(ordinality)::INTEGER AS binding_order
      FROM jsonb_array_elements_text(p_command->'material_ids') WITH ORDINALITY
      GROUP BY value
    ) selected
    ON CONFLICT (material_id, target_type, target_id)
    DO UPDATE SET binding_order = EXCLUDED.binding_order,
                  binding_method = EXCLUDED.binding_method,
                  bound_by = EXCLUDED.bound_by,
                  bound_at = NOW(),
                  version = material_links.version + 1;
  END IF;

  SELECT result INTO v_latest_result
  FROM issue_re_evaluations
  WHERE issue_id = v_issue_id
  ORDER BY created_at DESC, id DESC
  LIMIT 1;

  UPDATE issues
  SET status = CASE v_latest_result
    WHEN 'qualified' THEN 'verified_closed'
    WHEN 'unqualified' THEN 'rectifying'
    WHEN 'pending' THEN 'open'
    ELSE 'open'
  END,
  updated_at = now()
  WHERE id = v_issue_id;

  SELECT to_jsonb(row_value) INTO v_retest_json
  FROM issue_re_evaluations row_value WHERE id = v_retest_id;
  SELECT to_jsonb(row_value) INTO v_issue_json
  FROM issues row_value WHERE id = v_issue_id;

  RETURN jsonb_build_object('re_evaluation', v_retest_json, 'issue', v_issue_json);
END;
$$;
