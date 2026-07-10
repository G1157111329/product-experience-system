import assert from 'node:assert/strict';
import { getRecipeStatistics } from './recipe-statistics';

const mixedRecipe = {
  recipe_steps: [
    { problem_points: [{ text: '  杯盖渗水  ' }, { text: ' ' }], problem_point: 'legacy should not double count' },
    { problem_points: [], problem_point: '噪音偏大' },
    { problem_points: [{ text: '转速不稳定' }] },
  ],
  effect_problem_points: [{ text: '成品颗粒感明显' }, { text: '' }],
};

assert.deepEqual(getRecipeStatistics(mixedRecipe), {
  stepCount: 3,
  problemCount: 4,
});

assert.deepEqual(getRecipeStatistics({
  recipe_steps: [{ problem_points: [{ text: '   ' }], problem_point: ' ' }],
  effect_problem_points: [{ text: ' ' }],
}), {
  stepCount: 1,
  problemCount: 0,
});

console.log('recipe statistics tests passed');
