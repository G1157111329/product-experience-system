import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) => readFileSync(path, 'utf8');

test('matrix issue conversion writes canonical open status', () => {
  const route = read('src/app/api/v1/matrices/[id]/issue-points/[issuePointId]/convert/route.ts');
  assert.match(route, /status:\s*'open'/);
  assert.doesNotMatch(route, /status:\s*'待整改'/);
});

test('dashboard and analysis count canonical completion while tolerating legacy values', () => {
  const dashboard = read('src/app/api/dashboard/route.ts');
  const analysis = read('src/app/api/analysis/route.ts');
  for (const source of [dashboard, analysis]) {
    assert.match(source, /verified_closed/);
    assert.match(source, /已验证/);
    assert.match(source, /已整改/);
  }
  assert.match(analysis, /整改完成/);
  assert.match(analysis, /CASE[\s\S]*WHEN status IN \('open', '待整改', '待分派', '已分派', '已指派'\) THEN '待整改'/);
});

test('analysis and status badge expose only the four business labels', () => {
  const page = read('src/app/(main)/analysis/page.tsx');
  const badge = read('src/components/app/status-badge.tsx');
  assert.match(page, /\['待整改', '整改中', '整改完成', '不整改'\]/);
  assert.doesNotMatch(page, /\['待整改', '整改中', '已验证', '不整改'\]/);
  for (const code of ['open', 'rectifying', 'verified_closed', 'waived']) assert.match(badge, new RegExp(`${code}:`));
  assert.match(badge, /整改完成:/);
});

test('fresh schema creates the real issue status dictionary before four-state upsert', () => {
  for (const path of [
    'database-schema.sql',
    'src/storage/database/shared/migrations/0016_recipe_evaluation_retest.sql',
  ]) {
    const sql = read(path);
    const create = sql.indexOf('CREATE TABLE IF NOT EXISTS issue_status_dict');
    const upsert = sql.indexOf("INSERT INTO issue_status_dict (code, label, sort_order, is_active, description)");
    assert.ok(create >= 0 && upsert > create, `${path} must create the dictionary before upsert`);
    assert.match(sql, /CONSTRAINT issue_status_dict_code_uniq UNIQUE \(code\)/);
    assert.match(sql, /CREATE INDEX IF NOT EXISTS issue_status_dict_active_idx ON issue_status_dict\(is_active\)/);
  }
});

test('report issue writers use canonical open status', () => {
  const route = read('src/app/api/reports/route.ts');
  assert.doesNotMatch(route, /status:\s*'待整改'/);
  assert.match(route, /status:\s*'open'/);
});

test('issue detail highlights the unsaved four-state selection', () => {
  const page = read('src/app/(main)/issues/[id]/page.tsx');
  assert.match(page, /getIssueStatusPresentation\(form\.status \?\? issue\.status\)\.label/);
});
