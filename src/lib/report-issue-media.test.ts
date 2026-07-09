import assert from 'node:assert/strict';
import { issueMaterialRows, recipeIssueMaterialRows } from './report-issue-media';

const matched = issueMaterialRows(
  { id: 'issue-1', record_id: 'record-1', source_cell_id: 'cell-1' },
  [
    { id: 'm1', issue_id: 'issue-1' },
    { id: 'm2', record_id: 'record-1' },
    { id: 'm3', comparison_cell_id: 'cell-1' },
    { id: 'm3', comparison_cell_id: 'cell-1' },
    { id: 'm4', comparison_cell_id: 'other' },
  ],
);

assert.deepEqual(matched.map((item) => item.id), ['m1', 'm2', 'm3']);

const recipeMatched = recipeIssueMaterialRows(
  { id: 'issue-2', title: '边缘粘附明显', source_type: 'recipe_problem', source: '和面功能问题' },
  [{
    id: 'recipe-1',
    name: '和面功能',
    effect_problem_point: JSON.stringify([{ text: '成团偏慢', material_ids: ['effect-bound'] }]),
    recipe_steps: [{
      id: 'step-1',
      problem_points: [{ text: '边缘粘附明显', material_ids: ['step-bound'] }],
    }],
  }],
  [
    { id: 'step-level', recipe_step_id: 'step-1' },
    { id: 'step-bound', recipe_id: null },
    { id: 'effect-level', recipe_id: 'recipe-1' },
    { id: 'effect-bound', recipe_id: null },
  ],
);

assert.deepEqual(recipeMatched.map((item) => item.id), ['step-level', 'step-bound']);

console.log('report issue media tests passed');
