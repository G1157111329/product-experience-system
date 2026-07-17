import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  createIssueRetest,
  deleteIssueRetest,
  issueStatusForRetestResult,
  classifyIssueRetestError,
  updateIssueRetest,
} from './issue-retest-service';

type Call = { name: string; args: Record<string, unknown> };

function rpcClient(response: unknown = {
  re_evaluation: { id: 'retest-1', result: 'pending' },
  issue: { id: 'issue-1', status: 'open' },
}) {
  const calls: Call[] = [];
  return {
    calls,
    client: {
      async rpc(name: string, args: Record<string, unknown>) {
        calls.push({ name, args });
        return { data: response, error: null };
      },
    },
  };
}

async function main() {
  assert.equal(issueStatusForRetestResult('qualified'), 'verified_closed');
  assert.equal(issueStatusForRetestResult('unqualified'), 'rectifying');
  assert.equal(issueStatusForRetestResult('pending'), 'open');
  assert.deepEqual(classifyIssueRetestError(new Error('issue not found')), { status: 404, message: '问题不存在', log: false });
  assert.deepEqual(classifyIssueRetestError(new Error('retest not found')), { status: 404, message: '复测记录不存在', log: false });
  assert.deepEqual(classifyIssueRetestError(new Error('invalid retest result')), { status: 400, message: '复测结果格式错误', log: false });
  assert.deepEqual(classifyIssueRetestError(new Error('material_ids must be an array')), { status: 400, message: '素材参数格式错误', log: false });
  assert.deepEqual(classifyIssueRetestError(new Error('invalid retest material')), { status: 400, message: '所选素材不属于该问题任务', log: false });
  assert.deepEqual(classifyIssueRetestError(new Error('password=secret internal detail')), { status: 500, message: '复测操作失败', log: true });

  const created = rpcClient();
  const createResult = await createIssueRetest(created.client, {
    issueId: 'issue-1',
    description: '复测后仍有异响',
    result: 'unqualified',
    materialIds: ['material-2', 'material-1', 'material-2'],
    createdBy: 'user-1',
  });
  assert.equal(created.calls.length, 1);
  assert.equal(created.calls[0].name, 'apply_issue_retest');
  assert.deepEqual(created.calls[0].args, {
    p_command: {
      action: 'create',
      issue_id: 'issue-1',
      description: '复测后仍有异响',
      result: 'unqualified',
      material_ids: ['material-2', 'material-1'],
      created_by: 'user-1',
    },
  });
  assert.equal(createResult.issue.status, 'open');

  const updated = rpcClient();
  await updateIssueRetest(updated.client, 'retest-1', {
    description: '复测通过',
    result: 'qualified',
    materialIds: [],
  });
  assert.deepEqual(updated.calls[0].args, {
    p_command: {
      action: 'update',
      re_evaluation_id: 'retest-1',
      description: '复测通过',
      result: 'qualified',
      material_ids: [],
    },
  });

  const deleted = rpcClient({ re_evaluation: null, issue: { id: 'issue-1', status: 'rectifying' } });
  const deleteResult = await deleteIssueRetest(deleted.client, 'retest-1');
  assert.deepEqual(deleted.calls[0].args, {
    p_command: { action: 'delete', re_evaluation_id: 'retest-1' },
  });
  assert.equal(deleteResult.re_evaluation, null);
  assert.equal(deleteResult.issue.status, 'rectifying');

  const failing = {
    async rpc() {
      return { data: null, error: { message: 'invalid retest material' } };
    },
  };
  await assert.rejects(
    createIssueRetest(failing, {
      issueId: 'issue-1', description: '失败事务', result: 'pending', materialIds: ['occupied'], createdBy: 'user-1',
    }),
    /所选素材不属于该问题任务/,
  );

  await assert.rejects(
    createIssueRetest(created.client, {
      issueId: 'issue-1', description: '非法', result: 'reopened' as never, materialIds: [], createdBy: 'user-1',
    }),
    /复测结果格式错误/,
  );

  const migration = readFileSync(resolve(process.cwd(), 'src/storage/database/shared/migrations/0016_recipe_evaluation_retest.sql'), 'utf8');
  assert.match(migration, /ORDER BY created_at DESC, id DESC/);
  assert.match(migration, /WHEN 'qualified' THEN 'verified_closed'/);
  assert.match(migration, /WHEN 'unqualified' THEN 'rectifying'/);
  assert.match(migration, /WHEN 'pending' THEN 'open'/);
  assert.match(migration, /UPDATE materials SET re_evaluation_id = NULL WHERE re_evaluation_id = v_retest_id/);
  assert.match(migration, /DELETE FROM issue_re_evaluations WHERE id = v_retest_id/);

  console.log('issue retest service contract passed');
}

main();
