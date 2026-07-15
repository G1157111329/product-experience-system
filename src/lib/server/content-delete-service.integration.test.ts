import assert from 'node:assert/strict';
import { Pool } from 'pg';

async function main() {
  const databaseUrl = process.env.CONTENT_DELETE_TEST_DATABASE_URL;
  if (!databaseUrl) {
    console.log('SKIP content delete PostgreSQL integration: set CONTENT_DELETE_TEST_DATABASE_URL (Task10 Docker must set it)');
    return;
  }
  process.env.DATABASE_URL = databaseUrl;
  const pool = new Pool({ connectionString: databaseUrl, max: 1 });
  const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`.slice(-12);
  const actorId = `cd-user-${suffix}`;
  const taskId = `cd-task-${suffix}`;
  const recipeId = `cd-recipe-${suffix}`;
  const stepId = `cd-step-${suffix}`;
  const recipeRecordId = `cd-rec-r-${suffix}`;
  const stepRecordId = `cd-rec-s-${suffix}`;
  try {
    await pool.query(
      `INSERT INTO platform_users (id, account, password_hash, name, role, status)
       VALUES ($1, $2, 'integration-test-only', 'Content delete integration', 'user', 'approved')`,
      [actorId, `cd-${suffix}`],
    );
    await pool.query(
      `INSERT INTO experience_tasks (id, task_name, product_category, product_model, created_by, owner_id)
       VALUES ($1, 'Content delete integration', 'test', 'test', $2, $2)`,
      [taskId, actorId],
    );
    await pool.query(`INSERT INTO recipes (id, task_id, name) VALUES ($1, $2, 'Integration recipe')`, [recipeId, taskId]);
    await pool.query(
      `INSERT INTO recipe_steps (id, recipe_id, step_number, operation) VALUES ($1, $2, 1, 'Integration step')`,
      [stepId, recipeId],
    );
    await pool.query(
      `INSERT INTO check_records (id, task_id, check_item, recipe_id) VALUES ($1, $2, 'Recipe record', $3)`,
      [recipeRecordId, taskId, recipeId],
    );
    await pool.query(
      `INSERT INTO check_records (id, task_id, check_item, recipe_step_id) VALUES ($1, $2, 'Step record', $3)`,
      [stepRecordId, taskId, stepId],
    );

    const [{ deleteRecipeAtomically }, { getDeletionImpact }, { projectDeleteGraphImpact }] = await Promise.all([
      import('./content-delete-service'),
      import('./deletion-impact'),
      import('./content-delete-graph'),
    ]);
    assert.deepEqual(
      await getDeletionImpact({ kind: 'recipe', id: recipeId, actorId }),
      projectDeleteGraphImpact({
        kind: 'recipe', id: recipeId, actorId, stepIds: [stepId],
        affectedRecordIds: [recipeRecordId, stepRecordId], issueIds: [], reEvaluationIds: [],
        targets: [], materialIds: [],
      }),
      'real PostgreSQL impact SQL matches the shared execution graph projector',
    );
    assert.equal(await deleteRecipeAtomically({ recipeId, actorId }), true);
    const detached = await pool.query<{ id: string; recipe_id: string | null; recipe_step_id: string | null }>(
      `SELECT id, recipe_id, recipe_step_id FROM check_records WHERE id = ANY($1::varchar[]) ORDER BY id`,
      [[recipeRecordId, stepRecordId]],
    );
    assert.equal(detached.rowCount, 2);
    assert.ok(detached.rows.every((row) => row.recipe_id === null && row.recipe_step_id === null));
  } finally {
    await pool.query('DELETE FROM experience_tasks WHERE id = $1', [taskId]).catch(() => undefined);
    await pool.query('DELETE FROM platform_users WHERE id = $1', [actorId]).catch(() => undefined);
    await pool.end();
  }
  console.log('content delete PostgreSQL integration tests passed');
}

void main();
