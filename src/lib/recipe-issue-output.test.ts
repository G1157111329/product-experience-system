import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildRecipeIssuePayload,
  findRecipeIssue,
  normalizeRecipeIssueTitle,
} from './recipe-issue-output';

test('normalizes a recipe problem into a bounded issue title', () => {
  assert.equal(normalizeRecipeIssueTitle('  奶昔口感不够细腻  '), '奶昔口感不够细腻');
  assert.equal(normalizeRecipeIssueTitle('a'.repeat(220)).length, 200);
});

test('builds a traceable issue payload from an effect problem point', () => {
  assert.deepEqual(
    buildRecipeIssuePayload({
      taskId: 'task-1',
      productModel: 'MX-01',
      recipe: { id: 'recipe-1', name: '香蕉奶昔' },
      problem: { text: '  口感偏粗糙 ', material_ids: ['media-1', 'media-2'] },
    }),
    {
      task_id: 'task-1',
      recipe_id: 'recipe-1',
      title: '口感偏粗糙',
      product_model: 'MX-01',
      level: '二类',
      source: '香蕉奶昔 - 效果评价',
      source_type: 'recipe_problem',
      description: '功能/食谱：香蕉奶昔\n来源：效果评价问题点',
      evidence_refs: ['media-1', 'media-2'],
    },
  );
});

test('matches the stable recipe source even when the legacy problem title changed', () => {
  const issues = [
    { id: 'other', recipe_id: 'recipe-2', source_type: 'recipe_problem', title: '口感偏粗糙' },
    { id: 'right', recipe_id: 'recipe-1', source_type: 'recipe_problem', title: ' 口感偏粗糙 ' },
  ];

  assert.equal(findRecipeIssue(issues, 'recipe-1', '口感偏粗糙')?.id, 'right');
  assert.equal(findRecipeIssue(issues, 'recipe-1', '温度偏低')?.id, 'right');
});
