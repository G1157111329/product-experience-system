import assert from 'node:assert/strict';
import { canMutateIssueReEvaluation, canMutateIssueRetest, type AuthUser, type ClientLike } from './auth';

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

const user = (role: AuthUser['role'], id: string, name = id, account = id): AuthUser => ({ id, role, name, account });

async function main() {
  const client = fakeClient({
    issues: [
      { id: 'issue-owned-task', task_id: 'task-owned', responsible_person: null },
      { id: 'issue-responsible', task_id: 'task-other', responsible_person: '研发小王' },
      { id: 'issue-other', task_id: 'task-other', responsible_person: 'other' },
    ],
    experience_tasks: [
      { id: 'task-owned', created_by: 'executor-1', owner_id: 'task-owner-1' },
      { id: 'task-other', created_by: 'someone', owner_id: 'someone' },
    ],
    issue_re_evaluations: [{ id: 'retest-owned', issue_id: 'issue-owned-task' }],
  });

  assert.equal(await canMutateIssueRetest(client, user('executive_viewer', 'viewer'), 'issue-other'), false);
  assert.equal(await canMutateIssueRetest(client, user('rectification_owner', 'dev-1', '研发小王', 'wang'), 'issue-responsible'), true);
  assert.equal(await canMutateIssueRetest(client, user('rectification_owner', 'dev-2', '研发小李', 'li'), 'issue-responsible'), false);
  assert.equal(await canMutateIssueRetest(client, user('executor', 'executor-1'), 'issue-owned-task'), true);
  assert.equal(await canMutateIssueRetest(client, user('executor', 'executor-other'), 'issue-owned-task'), false);
  assert.equal(await canMutateIssueRetest(client, user('task_owner', 'task-owner-1'), 'issue-owned-task'), true);
  assert.equal(await canMutateIssueRetest(client, user('task_owner', 'task-owner-other'), 'issue-owned-task'), false);
  assert.equal(await canMutateIssueRetest(client, user('product_manager', 'pm'), 'issue-other'), true);
  assert.equal(await canMutateIssueRetest(client, user('reviewer', 'reviewer'), 'issue-other'), true);
  assert.equal(await canMutateIssueReEvaluation(client, user('executor', 'executor-1'), 'retest-owned'), true);
  assert.equal(await canMutateIssueReEvaluation(client, user('executive_viewer', 'viewer'), 'retest-owned'), false);
  assert.equal(await canMutateIssueRetest(client, user('executor', 'executor-1'), 'missing'), false);

  console.log('issue retest mutation auth passed');
}

main();
