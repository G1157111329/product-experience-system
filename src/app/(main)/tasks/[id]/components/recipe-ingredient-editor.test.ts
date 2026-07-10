import assert from 'node:assert/strict';
import { createIngredientDraft, shouldShowIngredientEditor, toIngredientPayload } from './recipe-ingredient-editor';

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
