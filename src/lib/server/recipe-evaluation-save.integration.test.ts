import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';

if (process.env.RUN_RECIPE_EVALUATION_INTEGRATION !== '1') {
  console.log('recipe evaluation PostgreSQL integration skipped; set RUN_RECIPE_EVALUATION_INTEGRATION=1');
  process.exit(0);
}

const connectionString = process.env.RECIPE_EVALUATION_DATABASE_URL || process.env.DATABASE_URL;
if (!connectionString) throw new Error('RECIPE_EVALUATION_DATABASE_URL or DATABASE_URL is required');

const id = () => randomUUID();
const owner = new Client({ connectionString });

async function apply(client: Client, command: Record<string, unknown>) {
  const result = await client.query<{ value: { recipe: { effect_status: string; effect_description: string }; materials: Array<{ id: string }> } }>(
    'SELECT save_recipe_evaluation($1::jsonb) AS value',
    [JSON.stringify(command)],
  );
  return result.rows[0].value;
}

async function main() {
  const taskId = id();
  const otherTaskId = id();
  const recipeId = id();
  const sharedRecipeId = id();
  const deletedRecipeId = id();
  const materialA = id();
  const materialB = id();
  const materialC = id();
  const otherTaskMaterial = id();
  await owner.connect();
  try {
    const acl = await owner.query<{
      proname: string; public_execute: boolean; owner_execute: boolean; service_role_exists: boolean; service_role_execute: boolean;
    }>(
      `SELECT p.proname,
              EXISTS (
                SELECT 1 FROM aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a
                WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE'
              ) AS public_execute,
              has_function_privilege(current_user, p.oid, 'EXECUTE') AS owner_execute,
              EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') AS service_role_exists,
              COALESCE(has_function_privilege(
                (SELECT oid FROM pg_roles WHERE rolname = 'service_role'),
                p.oid,
                'EXECUTE'
              ), false) AS service_role_execute
       FROM pg_proc p
       JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public'
         AND p.proname IN ('save_recipe_evaluation', 'apply_issue_retest')
         AND pg_get_function_identity_arguments(p.oid) = 'p_command jsonb'`,
    );
    assert.deepEqual(acl.rows.map((row) => row.proname).sort(), ['apply_issue_retest', 'save_recipe_evaluation']);
    for (const row of acl.rows) {
      assert.equal(row.public_execute, false, `${row.proname} must not be executable by PUBLIC`);
      assert.equal(row.owner_execute, true, `${row.proname} must remain executable by the database owner`);
      if (row.service_role_exists) assert.equal(row.service_role_execute, true, `${row.proname} must be executable by service_role`);
    }

    await owner.query(
      `INSERT INTO experience_tasks (id, task_name, product_category)
       VALUES ($1, '评价原子测试', '测试品类'), ($2, '其他评价任务', '测试品类')`,
      [taskId, otherTaskId],
    );
    await owner.query(
      `INSERT INTO recipes (id, task_id, name, effect_description)
       VALUES ($1, $2, '原子评价食谱', '初始描述'), ($3, $2, '共享素材食谱', '初始描述'), ($4, $2, '待删除食谱', '删除前')`,
      [recipeId, taskId, sharedRecipeId, deletedRecipeId],
    );
    await owner.query(
      `INSERT INTO materials (id, task_id, material_type, file_name, recipe_id)
       VALUES ($1, $5, 'image', 'a.jpg', $6), ($2, $5, 'image', 'b.jpg', NULL),
              ($3, $5, 'image', 'c.jpg', NULL), ($4, $7, 'image', 'other.jpg', NULL)`,
      [materialA, materialB, materialC, otherTaskMaterial, taskId, recipeId, otherTaskId],
    );

    await assert.rejects(
      apply(owner, {
        recipe_id: recipeId,
        effect_status: 'unqualified',
        effect_description: '不应落库',
        material_ids: [otherTaskMaterial],
      }),
      /invalid recipe material/,
    );
    const unchanged = await owner.query<{ effect_status: string; effect_description: string }>(
      'SELECT effect_status, effect_description FROM recipes WHERE id = $1',
      [recipeId],
    );
    assert.deepEqual(unchanged.rows[0], { effect_status: 'pending', effect_description: '初始描述' });
    const unchangedMaterials = await owner.query<{ id: string }>('SELECT id FROM materials WHERE recipe_id = $1', [recipeId]);
    assert.deepEqual(unchangedMaterials.rows.map((row) => row.id), [materialA]);

    const first = await apply(owner, {
      recipe_id: recipeId,
      effect_status: 'qualified',
      effect_description: '首次保存',
      material_ids: [materialB],
    });
    assert.equal(first.recipe.effect_status, 'qualified');
    assert.deepEqual(first.materials.map((row) => row.id), [materialB]);

    const shared = await apply(owner, {
      recipe_id: sharedRecipeId,
      effect_status: 'qualified',
      effect_description: '复用同一段视频素材',
      material_ids: [materialB],
    });
    assert.deepEqual(shared.materials.map((row) => row.id), [materialB], '同一任务素材应可被多个食谱/功能同时引用');

    const partial = await apply(owner, { recipe_id: recipeId, effect_description: '仅更新描述' });
    assert.equal(partial.recipe.effect_status, 'qualified', 'partial update must retain status');
    assert.deepEqual(partial.materials.map((row) => row.id), [materialB], 'omitted material_ids must retain links');

    const mixed = await apply(owner, {
      recipe_id: recipeId,
      effect_status: 'pending',
      name: '混合更新名称',
      ingredients: '水 1L',
      recipe_type: '功能',
      problem_count: 3,
      ingredient_items: [{ name: '水', amount: '1L' }],
    });
    assert.equal(mixed.recipe.effect_status, 'pending');
    const mixedRow = await owner.query<{
      name: string; ingredients: string; recipe_type: string; problem_count: number; ingredient_items: unknown;
    }>('SELECT name, ingredients, recipe_type, problem_count, ingredient_items FROM recipes WHERE id = $1', [recipeId]);
    assert.deepEqual(mixedRow.rows[0], {
      name: '混合更新名称', ingredients: '水 1L', recipe_type: '功能', problem_count: 3,
      ingredient_items: [{ name: '水', amount: '1L' }],
    });

    await apply(owner, {
      recipe_id: recipeId,
      effect_status: 'pending',
      material_ids: [materialC, materialB, materialC],
    });
    const orderedLinks = await owner.query<{ material_id: string; binding_order: number }>(
      `SELECT material_id, binding_order FROM material_links
       WHERE target_type = 'recipe' AND target_id = $1
       ORDER BY binding_order`,
      [recipeId],
    );
    assert.deepEqual(orderedLinks.rows, [
      { material_id: materialC, binding_order: 1 },
      { material_id: materialB, binding_order: 2 },
    ], 'duplicate material ids must be removed without changing first-selection order');

    const concurrentA = new Client({ connectionString });
    const concurrentB = new Client({ connectionString });
    await Promise.all([concurrentA.connect(), concurrentB.connect()]);
    try {
      await Promise.all([
        apply(concurrentA, { recipe_id: recipeId, effect_status: 'unqualified', effect_description: '并发 A', material_ids: [materialA] }),
        apply(concurrentB, { recipe_id: recipeId, effect_status: 'pending', effect_description: '并发 B', material_ids: [materialB, materialC] }),
      ]);
    } finally {
      await Promise.all([concurrentA.end(), concurrentB.end()]);
    }
    const finalMaterials = await owner.query<{ id: string }>(
      `SELECT material_id AS id FROM material_links
       WHERE target_type = 'recipe' AND target_id = $1
       ORDER BY material_id`,
      [recipeId],
    );
    const finalIds = finalMaterials.rows.map((row) => row.id);
    const expectedA = [materialA].sort();
    const expectedB = [materialB, materialC].sort();
    assert.ok(
      JSON.stringify(finalIds) === JSON.stringify(expectedA) || JSON.stringify(finalIds) === JSON.stringify(expectedB),
      'concurrent saves must produce one exact material set, never a union',
    );

    await owner.query('DELETE FROM recipes WHERE id = $1', [deletedRecipeId]);
    await assert.rejects(
      apply(owner, { recipe_id: deletedRecipeId, effect_status: 'qualified', effect_description: '已删除', material_ids: [] }),
      /recipe not found/,
    );
    console.log('recipe evaluation PostgreSQL integration passed');
  } finally {
    await owner.query('DELETE FROM experience_tasks WHERE id = ANY($1::varchar[])', [[taskId, otherTaskId]]).catch(() => undefined);
    await owner.end();
  }
}

void main();
