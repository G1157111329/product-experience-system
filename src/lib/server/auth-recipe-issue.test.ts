import assert from 'node:assert/strict';
import { canAccessRecipe, type AuthUser, type ClientLike } from './auth';

function fakeClient(rows: Record<string, Record<string, unknown>[]>): ClientLike {
  return {
    from(table: string) {
      let selected = rows[table] || [];
      const query = {
        select() { return query; },
        eq(field: string, value: unknown) { selected = selected.filter((row) => row[field] === value); return query; },
        order() { return query; },
        async maybeSingle() { return { data: selected[0] || null, error: null }; },
        async single() { return { data: selected[0] || null, error: null }; },
        then(resolve: (value: { data: Record<string, unknown>[]; error: null }) => unknown) {
          return Promise.resolve({ data: selected, error: null }).then(resolve);
        },
      };
      return query;
    },
  } as unknown as ClientLike;
}

const user = (role: AuthUser['role'], id: string): AuthUser => ({ id, role, name: id, account: id });

async function run() {
  const client = fakeClient({
    recipes: [{ id: 'recipe-a', task_id: 'task-a' }],
    experience_tasks: [{ id: 'task-a', created_by: 'creator', owner_id: 'owner' }],
  });
  assert.equal(await canAccessRecipe(client, user('executor', 'owner'), 'recipe-a'), true, 'owner_id can read recipe issues');
  assert.equal(await canAccessRecipe(client, user('executor', 'creator'), 'recipe-a'), true, 'task creator can read recipe issues');
  assert.equal(await canAccessRecipe(client, user('task_owner', 'portfolio-owner'), 'recipe-a'), true, 'TASK_EDIT_ALL can read recipe issues');
  assert.equal(await canAccessRecipe(client, user('executor', 'outsider'), 'recipe-a'), false, 'unscoped user remains denied');
  assert.equal(await canAccessRecipe(client, user('executor', 'owner'), 'missing'), false);
  console.log('recipe issue authorization tests passed');
}

void run();
