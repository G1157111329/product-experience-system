import assert from 'node:assert/strict';
import {
  createIngredientDraft,
  formatIngredientTag,
  ingredientTagSummary,
  shouldShowIngredientEditor,
  toIngredientPayload,
} from './recipe-ingredient-editor';

assert.equal(formatIngredientTag({ name: '香蕉', quantity: 100, unit: 'g' }), '香蕉 100g');
assert.equal(formatIngredientTag({ name: '冰块', quantity: 4, unit: '块', note: '去冰可删' }), '冰块 4块');
assert.deepEqual(
  ingredientTagSummary([
    { name: '香蕉', quantity: 100, unit: 'g' },
    { name: '牛奶', quantity: 200, unit: 'ml' },
    { name: '冰块', quantity: 4, unit: '块' },
    { name: '蜂蜜', quantity: 10, unit: 'g' },
  ], 3),
  { visible: ['香蕉 100g', '牛奶 200ml', '冰块 4块'], hiddenCount: 1 },
);

assert.equal(shouldShowIngredientEditor('食谱'), true);
assert.equal(shouldShowIngredientEditor('功能'), false);

assert.deepEqual(createIngredientDraft([], '香蕉 180g\n牛奶 250ml'), [
  { name: '香蕉 180g' },
  { name: '牛奶 250ml' },
]);

assert.deepEqual(createIngredientDraft([{ name: '香蕉', quantity: 180, unit: 'g' }], '旧文本'), [
  { name: '香蕉', quantity: 180, unit: 'g' },
]);

assert.deepEqual(createIngredientDraft([], ''), [{ name: '' }]);

assert.deepEqual(toIngredientPayload([
  { name: ' 香蕉 ', quantity: '180', unit: ' g ', note: ' 去皮 ' },
  { name: '  ', quantity: '', unit: '' },
]), [
  { name: '香蕉', quantity: 180, unit: 'g', note: '去皮' },
]);

console.log('recipe ingredient editor tests passed');
