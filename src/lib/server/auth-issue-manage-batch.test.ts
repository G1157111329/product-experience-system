import assert from 'node:assert/strict';
import { manageableIssueIdsForActor, type AuthUser, type ClientLike } from './auth';

function user(role: AuthUser['role'], id: string): AuthUser {
  return { id, role, name: id, account: id };
}

function fakeClient(tasks: Array<Record<string, unknown>>) {
  let taskQueries = 0;
  const client = {
    from(table: string) {
      assert.equal(table, 'experience_tasks');
      taskQueries += 1;
      let selected = tasks;
      const query = {
        select() { return query; },
        in(field: string, values: unknown[]) { selected = selected.filter((row) => values.includes(row[field])); return query; },
        then(resolve: (value: { data: typeof selected; error: null }) => unknown) {
          return Promise.resolve({ data: selected, error: null }).then(resolve);
        },
      };
      return query;
    },
  } as unknown as ClientLike;
  return { client, taskQueries: () => taskQueries };
}

async function main() {
  const issues = Array.from({ length: 100 }, (_, index) => ({
    id: `issue-${index}`,
    task_id: index % 2 === 0 ? 'task-owned' : 'task-other',
  }));
  const ownerClient = fakeClient([
    { id: 'task-owned', owner_id: 'owner', created_by: 'creator' },
    { id: 'task-other', owner_id: 'other', created_by: 'other' },
  ]);
  const manageable = await manageableIssueIdsForActor(ownerClient.client, user('executor', 'owner'), issues);
  assert.equal(manageable.size, 50);
  assert.equal(ownerClient.taskQueries(), 1, '100 issues across two tasks require one batch task query');

  for (const role of ['admin', 'task_owner'] as const) {
    const shortCircuitClient = fakeClient([]);
    assert.equal((await manageableIssueIdsForActor(shortCircuitClient.client, user(role, role), issues)).size, 100);
    assert.equal(shortCircuitClient.taskQueries(), 0, `${role} short-circuits without querying tasks`);
  }

  for (const role of ['product_manager', 'reviewer', 'executive_viewer'] as const) {
    const readOnlyClient = fakeClient([]);
    assert.equal((await manageableIssueIdsForActor(readOnlyClient.client, user(role, role), issues)).size, 0);
    assert.equal(readOnlyClient.taskQueries(), 0, `${role} has no task-edit capability`);
  }
  console.log('batch issue manageability tests passed');
}

void main();
