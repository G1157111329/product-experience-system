import assert from 'node:assert/strict';
import test from 'node:test';
import {
  syncEvaluationIssue,
  type EvaluationIssue,
  type EvaluationIssueRepository,
} from './evaluation-issue-sync';

function memoryRepository() {
  const issues: EvaluationIssue[] = [];
  let nextId = 1;
  const calls = { create: 0, update: 0, remove: 0 };
  const repository: EvaluationIssueRepository = {
    async findBySource(sourceKind, sourceId) {
      return issues.find((issue) => (
        sourceKind === 'recipe' ? issue.recipeId === sourceId : issue.recordId === sourceId
      )) ?? null;
    },
    async create(values) {
      calls.create += 1;
      const issue = { ...values, id: `issue-${nextId++}` };
      issues.push(issue);
      return issue;
    },
    async update(id, values) {
      calls.update += 1;
      const issue = issues.find((item) => item.id === id);
      assert.ok(issue);
      Object.assign(issue, values);
      return issue;
    },
  };
  return { repository, issues, calls };
}

test('pending and unqualified judgments reuse one stable recipe issue', async () => {
  const store = memoryRepository();
  const pending = await syncEvaluationIssue(store.repository, {
    taskId: 'task-1',
    sourceKind: 'recipe',
    sourceId: 'recipe-1',
    subjectName: '香蕉奶昔食谱',
    status: 'pending',
  });
  const unqualified = await syncEvaluationIssue(store.repository, {
    taskId: 'task-1',
    sourceKind: 'recipe',
    sourceId: 'recipe-1',
    subjectName: '香蕉奶昔食谱',
    status: '不合格',
  });

  assert.equal(pending.issue?.id, 'issue-1');
  assert.equal(unqualified.issue?.id, 'issue-1');
  assert.equal(store.issues.length, 1);
  assert.equal(store.issues[0].title, '香蕉奶昔食谱效果不合格');
  assert.equal(store.calls.create, 1);
  assert.equal(store.calls.update, 1);
});

test('record identity is the record id rather than a shared title', async () => {
  const store = memoryRepository();
  await syncEvaluationIssue(store.repository, {
    taskId: 'task-1', sourceKind: 'record', sourceId: 'record-1', subjectName: '噪音', status: '待定',
  });
  await syncEvaluationIssue(store.repository, {
    taskId: 'task-1', sourceKind: 'record', sourceId: 'record-2', subjectName: '噪音', status: 'pending',
  });

  assert.equal(store.issues.length, 2);
  assert.deepEqual(store.issues.map((issue) => issue.recordId), ['record-1', 'record-2']);
});

test('qualified never creates, deletes, closes, or rewrites historical issues', async () => {
  const store = memoryRepository();
  const absent = await syncEvaluationIssue(store.repository, {
    taskId: 'task-1', sourceKind: 'recipe', sourceId: 'recipe-1', subjectName: '蒸汽功能', status: '合格',
  });
  assert.equal(absent.issue, null);
  assert.equal(store.calls.create, 0);

  await syncEvaluationIssue(store.repository, {
    taskId: 'task-1', sourceKind: 'recipe', sourceId: 'recipe-1', subjectName: '蒸汽功能', status: '待定',
  });
  const before = { ...store.issues[0] };
  const qualified = await syncEvaluationIssue(store.repository, {
    taskId: 'task-1', sourceKind: 'recipe', sourceId: 'recipe-1', subjectName: '蒸汽功能', status: 'qualified',
  });

  assert.equal(qualified.issue?.id, before.id);
  assert.deepEqual(store.issues[0], before);
  assert.equal(store.calls.update, 0);
  assert.equal(store.calls.remove, 0);
});

test('status title changes preserve existing rectification metadata', async () => {
  const store = memoryRepository();
  await syncEvaluationIssue(store.repository, {
    taskId: 'task-1', sourceKind: 'record', sourceId: 'record-1', subjectName: '噪音', status: 'pending',
    level: '一类', description: '现场原始描述',
  });
  store.issues[0].source = '人工调整来源';

  await syncEvaluationIssue(store.repository, {
    taskId: 'task-1', sourceKind: 'record', sourceId: 'record-1', subjectName: '噪音', status: 'unqualified',
  });

  assert.equal(store.issues[0].level, '一类');
  assert.equal(store.issues[0].description, '现场原始描述');
  assert.equal(store.issues[0].source, '人工调整来源');
});

test('a unique race refetches the winner and applies the current title patch', async () => {
  let concurrent: EvaluationIssue | null = null;
  let updateCalls = 0;
  const repository: EvaluationIssueRepository = {
    async findBySource() {
      return concurrent;
    },
    async create(values) {
      concurrent = { ...values, id: 'race-winner', title: '旧的待定标题' };
      throw Object.assign(new Error('duplicate key'), { code: '23505' });
    },
    async update(id, values) {
      updateCalls += 1;
      assert.equal(id, 'race-winner');
      assert.ok(concurrent);
      concurrent = { ...concurrent, ...values };
      return concurrent;
    },
  };

  const result = await syncEvaluationIssue(repository, {
    taskId: 'task-1', sourceKind: 'recipe', sourceId: 'recipe-1', subjectName: '蒸汽功能', status: 'unqualified',
  });

  assert.equal(result.issue?.id, 'race-winner');
  assert.equal(result.issue?.title, '蒸汽功能效果不合格');
  assert.equal(updateCalls, 1);
});
