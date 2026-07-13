import assert from 'node:assert/strict';
import test from 'node:test';
import {
  evaluationIssueTitle,
  evaluationRecipeSubjectName,
  evaluationStatusLabel,
  normalizeEvaluationStatus,
} from './evaluation-status';

test('normalizes canonical and Chinese evaluation values', () => {
  assert.equal(normalizeEvaluationStatus('qualified'), 'qualified');
  assert.equal(normalizeEvaluationStatus('合格'), 'qualified');
  assert.equal(normalizeEvaluationStatus('pass'), 'qualified');
  assert.equal(normalizeEvaluationStatus('unqualified'), 'unqualified');
  assert.equal(normalizeEvaluationStatus('不合格'), 'unqualified');
  assert.equal(normalizeEvaluationStatus('failed'), 'unqualified');
  assert.equal(normalizeEvaluationStatus('pending'), 'pending');
  assert.equal(normalizeEvaluationStatus('待定'), 'pending');
});

test('does not duplicate an existing recipe or function suffix', () => {
  assert.equal(evaluationRecipeSubjectName('香蕉奶昔', '食谱'), '香蕉奶昔食谱');
  assert.equal(evaluationRecipeSubjectName('香蕉奶昔食谱', '食谱'), '香蕉奶昔食谱');
  assert.equal(evaluationRecipeSubjectName('蒸汽功能', '功能'), '蒸汽功能');
  assert.equal(evaluationRecipeSubjectName('蒸汽', 'function'), '蒸汽功能');
});

test('defaults empty and unknown evaluation values to pending', () => {
  assert.equal(normalizeEvaluationStatus(undefined), 'pending');
  assert.equal(normalizeEvaluationStatus(null), 'pending');
  assert.equal(normalizeEvaluationStatus(''), 'pending');
  assert.equal(normalizeEvaluationStatus('not-a-status'), 'pending');
});

test('provides canonical Chinese labels', () => {
  assert.equal(evaluationStatusLabel('qualified'), '合格');
  assert.equal(evaluationStatusLabel('不合格'), '不合格');
  assert.equal(evaluationStatusLabel(null), '待定');
});

test('builds recipe and record issue titles from the whole judgment', () => {
  assert.equal(
    evaluationIssueTitle('香蕉奶昔食谱', 'recipe', 'unqualified'),
    '香蕉奶昔食谱效果不合格',
  );
  assert.equal(
    evaluationIssueTitle('首次操作流畅度', 'record', 'pending'),
    '首次操作流畅度待定',
  );
});
