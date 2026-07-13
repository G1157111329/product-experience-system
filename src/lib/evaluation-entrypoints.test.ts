import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) => readFileSync(path, 'utf8');

test('fresh database schema has valid issues syntax and upgrades before enforcing identity', () => {
  const source = read('database-schema.sql');
  assert.doesNotMatch(source, /updated_at TIMESTAMPTZ DEFAULT now\(\),\s*\);/);

  const upgrade = source.lastIndexOf('-- ---- 0016: canonical evaluation status + atomic issue retest ----');
  const addRecipeStatus = source.slice(0, upgrade).lastIndexOf('ALTER TABLE recipes ADD COLUMN IF NOT EXISTS effect_status');
  const mergeDuplicates = source.indexOf('CREATE TEMP TABLE _issue_merge_0016', upgrade);
  const uniqueRecipeSource = source.indexOf('CREATE UNIQUE INDEX IF NOT EXISTS issues_recipe_source_unique', upgrade);
  const recipeBackfill = source.indexOf('UPDATE recipes\nSET effect_status = CASE', upgrade);
  const recipeNotNull = source.indexOf('ALTER TABLE recipes ALTER COLUMN effect_status SET NOT NULL', upgrade);

  assert.ok(upgrade > addRecipeStatus, '0016 upgrade must run after legacy ADD COLUMN statements');
  assert.ok(mergeDuplicates > upgrade, 'database schema must merge duplicate source issues');
  assert.ok(uniqueRecipeSource > mergeDuplicates, 'unique source indexes must follow duplicate merge');
  assert.ok(recipeBackfill > upgrade && recipeNotNull > recipeBackfill, 'canonical backfill must precede NOT NULL');
});

test('agent action and preset entrypoints write pending evaluation states', () => {
  const actions = read('src/app/api/tasks/[id]/agent-actions/route.ts');
  const presets = read('src/app/api/tasks/[id]/agent-presets/route.ts');

  assert.match(actions, /applyRecipeCreate[\s\S]*effect_status:\s*'pending'/);
  assert.match(actions, /applyRecordUpdate[\s\S]*evaluation_result/);
  assert.match(presets, /acceptStandardSuggestions[\s\S]*evaluation_result:\s*'待定'/);
  assert.match(presets, /acceptRecipeSuggestions[\s\S]*effect_status:\s*'pending'/);
});

test('database owns atomic evaluation issue sync and route writers do not double write', () => {
  const schema = read('database-schema.sql');
  const migration = read('src/storage/database/shared/migrations/0016_recipe_evaluation_retest.sql');
  for (const sql of [schema, migration]) {
    assert.match(sql, /CREATE OR REPLACE FUNCTION normalize_evaluation_status/);
    assert.match(sql, /CREATE TRIGGER recipes_evaluation_issue_sync/);
    assert.match(sql, /CREATE TRIGGER check_records_evaluation_issue_sync/);
    assert.match(sql, /INSERT INTO issues[\s\S]*FROM recipes/);
    assert.match(sql, /INSERT INTO issues[\s\S]*FROM check_records/);
  }

  const routePaths = [
    'src/app/api/recipes/route.ts',
    'src/app/api/recipes/[id]/route.ts',
    'src/app/api/records/route.ts',
    'src/app/api/records/[id]/route.ts',
    'src/app/api/tasks/[id]/agent-actions/route.ts',
    'src/app/api/tasks/[id]/agent-presets/route.ts',
    'src/lib/server/inline-values.ts',
  ];
  for (const path of routePaths) assert.doesNotMatch(read(path), /syncEvaluationIssue/);
});

test('atomic retest RPC validates material ownership and applies update fields as patches', () => {
  for (const sql of [
    read('database-schema.sql'),
    read('src/storage/database/shared/migrations/0016_recipe_evaluation_retest.sql'),
  ]) {
    assert.match(sql, /jsonb_typeof\(p_command->'material_ids'\)/);
    assert.match(sql, /material\.task_id = v_issue_task_id/);
    assert.match(sql, /material\.re_evaluation_id IS NULL OR material\.re_evaluation_id = v_retest_id/);
    assert.match(sql, /CASE WHEN p_command \? 'description' THEN v_description ELSE description END/);
    assert.match(sql, /CASE WHEN p_command \? 'result' THEN v_result ELSE result END/);
    assert.match(sql, /CASE WHEN p_command \? 'ai_result' THEN v_ai_result ELSE ai_result END/);
  }
});

test('record trigger refreshes source metadata without widening recipe conflict updates', () => {
  for (const sql of [
    read('database-schema.sql'),
    read('src/storage/database/shared/migrations/0016_recipe_evaluation_retest.sql'),
  ]) {
    const recordConflict = sql.match(/ON CONFLICT \(record_id\)[\s\S]*?DO UPDATE SET([\s\S]*?);/)?.[1] ?? '';
    assert.match(recordConflict, /description = EXCLUDED\.description/);
    assert.match(recordConflict, /level = EXCLUDED\.level/);
    assert.match(recordConflict, /source = EXCLUDED\.source/);
    assert.doesNotMatch(recordConflict, /status\s*=/);

    const recipeConflict = sql.match(/ON CONFLICT \(recipe_id\)[\s\S]*?DO UPDATE SET([\s\S]*?);/)?.[1] ?? '';
    assert.match(recipeConflict, /title = EXCLUDED\.title/);
    assert.doesNotMatch(recipeConflict, /description|level|source\s*=|status\s*=/);
  }
});

test('duplicate issue merge preserves progressed workflow and latest rectification metadata', () => {
  for (const sql of [read('database-schema.sql'), read('src/storage/database/shared/migrations/0016_recipe_evaluation_retest.sql')]) {
    assert.match(sql, /bool_or\(i\.is_closed\)/);
    assert.match(sql, /verified_closed[\s\S]*waived[\s\S]*rectifying[\s\S]*open/);
    for (const field of ['improve_plan', 'responsible_person', 'responsible_dept', 'plan_complete_date', 'actual_complete_date', 'verification_note', 'no_improve_reason']) {
      assert.match(sql, new RegExp(field));
    }
    assert.match(sql, /UPDATE issues keeper[\s\S]*FROM merged/);
  }
});

test('retest RPC locks requested materials in stable order before validating occupancy', () => {
  for (const sql of [read('database-schema.sql'), read('src/storage/database/shared/migrations/0016_recipe_evaluation_retest.sql')]) {
    const lock = sql.indexOf('ORDER BY material.id FOR UPDATE');
    const validate = sql.indexOf('material.re_evaluation_id IS NULL OR material.re_evaluation_id = v_retest_id');
    assert.ok(lock >= 0 && validate > lock, 'material rows must be locked before occupancy validation');
  }
});

test('0016 collapses every legacy issue status into the four canonical states', () => {
  for (const sql of [read('database-schema.sql'), read('src/storage/database/shared/migrations/0016_recipe_evaluation_retest.sql')]) {
    for (const status of ['待整改', '整改中', '已验证', '已整改', '整改完成', '不整改', '待分派', '已分派', '已指派', '待验证', '已验证关闭', '已重开']) {
      assert.match(sql, new RegExp(`'${status}'`));
    }
    assert.match(sql, /WHEN 'triaged' THEN 'open'/);
    assert.match(sql, /WHEN 'assigned' THEN 'open'/);
    assert.match(sql, /WHEN 'pending_verification' THEN 'rectifying'/);
    assert.match(sql, /WHEN 'reopened' THEN 'rectifying'/);
    assert.match(sql, /CHECK \(status IN \('open', 'rectifying', 'verified_closed', 'waived'\)\)/);
    assert.match(sql, /WHEN 'pending' THEN 'open'/);
    assert.doesNotMatch(sql, /WHEN 5 THEN 'reopened'/);
  }
});

test('0016 keeps the real issue dictionary on the same four active status codes', () => {
  for (const sql of [read('database-schema.sql'), read('src/storage/database/shared/migrations/0016_recipe_evaluation_retest.sql')]) {
    for (const pair of [
      ['open', '待整改'],
      ['rectifying', '整改中'],
      ['verified_closed', '整改完成'],
      ['waived', '不整改'],
    ]) {
      assert.match(sql, new RegExp(`'${pair[0]}'[\\s\\S]*'${pair[1]}'`));
    }
    assert.match(sql, /UPDATE issue_status_dict[\s\S]*SET is_active = false/);
  }
});
