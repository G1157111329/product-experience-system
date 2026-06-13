import assert from 'node:assert/strict';
import {
  AGENT_SKILL_KEYS,
  getDefaultSkillDefinitions,
  normalizePresetSuggestions,
  renderPromptTemplate,
} from './agent-skills';

const defaults = getDefaultSkillDefinitions();

assert.deepEqual(AGENT_SKILL_KEYS, [
  'senses_standard_preset',
  'recipe_scene_preset',
  'effect_evaluation',
  'problem_detection',
  'report_summary',
  'report_product_compare',
]);

assert.equal(defaults.length, 6);
assert.equal(defaults.every((item) => item.systemPrompt.includes('JSON')), true);
assert.equal(defaults.every((item) => item.outputSchema && typeof item.outputSchema === 'object'), true);

assert.equal(
  renderPromptTemplate('品类：{{product_category}}，目的：{{test_purpose}}，缺省：{{missing}}', {
    product_category: '破壁机',
    test_purpose: '验证早餐豆浆体验',
  }),
  '品类：破壁机，目的：验证早餐豆浆体验，缺省：',
);

const normalized = normalizePresetSuggestions({
  standards: [
    { standard_item_id: 's1', standard_category: '通用标准', reason: '重点风险', focus: '噪音' },
    { reason: '缺少ID', focus: '会被过滤' },
  ],
  recipes: [
    {
      name: '快速豆浆',
      recipe_type: '食谱',
      ingredients: '黄豆 50g，水 600ml',
      reason: '早餐高频场景',
      steps: [{ operation: '加入食材' }, { operation: '' }],
    },
    { ingredients: '无名称会被过滤' },
  ],
});

assert.equal(normalized.standards.length, 2);
assert.equal(normalized.standards[0].standardItemId, 's1');
assert.equal(normalized.standards[0].standardCategory, '通用标准');
assert.equal(normalized.standards[1].focus, '会被过滤');
assert.equal(normalized.recipes.length, 1);
assert.equal(normalized.recipes[0].name, '快速豆浆');
assert.equal(normalized.recipes[0].steps.length, 1);
assert.equal(normalized.recipes[0].steps[0].operation, '加入食材');
