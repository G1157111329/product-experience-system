import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';

if (process.env.RUN_ISSUE_RETEST_INTEGRATION !== '1') {
  console.log('issue retest PostgreSQL integration skipped; set RUN_ISSUE_RETEST_INTEGRATION=1');
  process.exit(0);
}

const connectionString = process.env.ISSUE_RETEST_DATABASE_URL || process.env.DATABASE_URL;
if (!connectionString) throw new Error('ISSUE_RETEST_DATABASE_URL or DATABASE_URL is required');

const client = new Client({ connectionString });
const id = () => randomUUID();

async function apply(command: Record<string, unknown>) {
  const result = await client.query<{ value: { re_evaluation: { id: string } | null; issue: { status: string } } }>(
    'SELECT apply_issue_retest($1::jsonb) AS value',
    [JSON.stringify(command)],
  );
  return result.rows[0].value;
}

async function issueStatus(issueId: string) {
  const result = await client.query<{ status: string }>('SELECT status FROM issues WHERE id = $1', [issueId]);
  return result.rows[0].status;
}

async function main() {
  await client.connect();
  await client.query('BEGIN');
  try {
    const taskId = id();
    const otherTaskId = id();
    const issueId = id();
    await client.query(
      `INSERT INTO experience_tasks (id, task_name, product_category) VALUES ($1, '复测事务测试', '测试品类'), ($2, '其他任务', '测试品类')`,
      [taskId, otherTaskId],
    );
    await client.query(
      `INSERT INTO issues (id, task_id, title, source_type, status) VALUES ($1, $2, '复测事务问题', 'recipe_problem', 'open')`,
      [issueId, taskId],
    );

    const materialId = id();
    const invalidMaterialId = id();
    await client.query(
      `INSERT INTO materials (id, task_id, material_type, file_name) VALUES ($1, $2, 'image', 'valid.jpg'), ($3, $4, 'image', 'other-task.jpg')`,
      [materialId, taskId, invalidMaterialId, otherTaskId],
    );

    const pending = await apply({ action: 'create', issue_id: issueId, description: '待确认', result: 'pending', material_ids: [] });
    assert.equal(pending.issue.status, 'open');
    // now() is transaction-scoped; move earlier rows back so this single rollback-only
    // transaction models separate HTTP transactions without sleeps.
    await client.query("UPDATE issue_re_evaluations SET created_at = clock_timestamp() - interval '3 minutes' WHERE id = $1", [pending.re_evaluation!.id]);
    const unqualified = await apply({ action: 'create', issue_id: issueId, description: '仍不合格', result: 'unqualified', material_ids: [] });
    assert.equal(unqualified.issue.status, 'rectifying');
    await client.query("UPDATE issue_re_evaluations SET created_at = clock_timestamp() - interval '2 minutes' WHERE id = $1", [unqualified.re_evaluation!.id]);
    const qualified = await apply({ action: 'create', issue_id: issueId, description: '现已合格', result: 'qualified', material_ids: [] });
    assert.equal(qualified.issue.status, 'verified_closed');

    await apply({ action: 'delete', re_evaluation_id: pending.re_evaluation!.id });
    assert.equal(await issueStatus(issueId), 'verified_closed', 'deleting a non-latest record must not change latest status');
    await apply({ action: 'delete', re_evaluation_id: qualified.re_evaluation!.id });
    assert.equal(await issueStatus(issueId), 'rectifying', 'deleting latest falls back to previous result');
    await apply({ action: 'delete', re_evaluation_id: unqualified.re_evaluation!.id });
    assert.equal(await issueStatus(issueId), 'open', 'deleting only remaining record falls back to open');

    const withMaterial = await apply({
      action: 'create', issue_id: issueId, description: '带素材复测', result: 'qualified', material_ids: [materialId],
    });
    const linked = await client.query<{ re_evaluation_id: string | null }>('SELECT re_evaluation_id FROM materials WHERE id = $1', [materialId]);
    assert.equal(linked.rows[0].re_evaluation_id, withMaterial.re_evaluation!.id);
    await apply({ action: 'delete', re_evaluation_id: withMaterial.re_evaluation!.id });
    const unlinked = await client.query<{ count: string; re_evaluation_id: string | null }>(
      'SELECT count(*) OVER ()::text AS count, re_evaluation_id FROM materials WHERE id = $1',
      [materialId],
    );
    assert.equal(unlinked.rows[0].count, '1', 'delete must retain the asset row');
    assert.equal(unlinked.rows[0].re_evaluation_id, null, 'delete must only unlink the asset');

    const before = await client.query<{ count: string }>('SELECT count(*)::text AS count FROM issue_re_evaluations WHERE issue_id = $1', [issueId]);
    await client.query('SAVEPOINT invalid_material');
    await assert.rejects(
      apply({ action: 'create', issue_id: issueId, description: '非法素材', result: 'unqualified', material_ids: [invalidMaterialId] }),
      /invalid or occupied retest material/,
    );
    await client.query('ROLLBACK TO SAVEPOINT invalid_material');
    const after = await client.query<{ count: string }>('SELECT count(*)::text AS count FROM issue_re_evaluations WHERE issue_id = $1', [issueId]);
    assert.equal(after.rows[0].count, before.rows[0].count, 'failed command must roll back the inserted retest');
    assert.equal(await issueStatus(issueId), 'open', 'failed command must not alter issue status');

    console.log('issue retest PostgreSQL integration passed');
  } finally {
    await client.query('ROLLBACK');
    await client.end();
  }
}

main();
