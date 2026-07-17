import assert from 'node:assert/strict';
import test from 'node:test';
import { AGENT_ACTION_TYPES, normalizeAgentActions } from './agent-actions';

test('normalizes a provider action field into the executable action type', () => {
  const actions = normalizeAgentActions([{
    action: 'record_create',
    title: '新增五感记录',
    payload: { check_item: '杯盖边缘检查', evaluation_result: '待定' },
  }]);

  assert.equal(actions.length, 1);
  assert.equal(actions[0].type, 'record_create');
  assert.equal(actions[0].payload.check_item, '杯盖边缘检查');
});

test('normalizes common provider params fields into the executable payload', () => {
  const actions = normalizeAgentActions([{
    action: 'data_matrix_cell_material_bind',
    params: {
      material_id: 'bc586889-4b39-4174-a619-f959db6d73d7',
      matrix_id: 'ac1d5e49-4722-4016-ba0a-bcf0e5a81776',
      leaf_row_id: 'f36bafd2-903e-4081-ad71-1fa1fe869a3b',
      column_id: '8b129757-c07b-4351-9957-6c682f2e4aef',
    },
  }]);

  assert.equal(actions.length, 1);
  assert.equal(actions[0].payload.column_id, '8b129757-c07b-4351-9957-6c682f2e4aef');
});

test('normalizes flat action fields and gives action precedence over a business type', () => {
  const actions = normalizeAgentActions([{
    action: 'recipe_create',
    type: '功能',
    title: '新增功能',
    name: 'AI联通验证功能',
    effect: '验证待确认写入',
  }]);

  assert.equal(actions.length, 1);
  assert.equal(actions[0].type, 'recipe_create');
  assert.equal(actions[0].payload.name, 'AI联通验证功能');
  assert.equal(actions[0].payload.effect, '验证待确认写入');
});

test('normalizes common Chinese plan payload keys before confirmation', () => {
  const [record, recipe] = normalizeAgentActions([
    { action: 'record_create', payload: { '检查项': '杯盖边缘检查', '标准': '边缘无毛刺', '结果': '待复核' } },
    { action: 'recipe_create', payload: { '名称': 'AI验证功能', '食谱类型': '功能', '效果描述': '用于验证录入链路' } },
  ]);

  assert.equal(record.payload.check_item, '杯盖边缘检查');
  assert.equal(record.payload.check_standard, '边缘无毛刺');
  assert.equal(record.payload.actual_result, '待复核');
  assert.equal(recipe.payload.name, 'AI验证功能');
  assert.equal(recipe.payload.recipe_type, '功能');
  assert.equal(recipe.payload.description, '用于验证录入链路');
});

test('drops incomplete placeholder actions instead of exposing them for confirmation', () => {
  const actions = normalizeAgentActions([
    { action: 'record_create', payload: { '检查项': '（请补充检查项名称）' } },
    { action: 'comparison_cell_material_bind', payload: { material_id: '（请选择素材）', comparison_cell_id: 'not-an-id' } },
  ]);

  assert.deepEqual(actions, []);
});

test('keeps confirmed context-based material rename plans executable', () => {
  const actions = normalizeAgentActions([{
    action: 'material_rename',
    payload: { material_id: 'bc586889-4b39-4174-a619-f959db6d73d7', auto_name: true },
  }]);

  assert.equal(actions.length, 1);
  assert.equal(actions[0].payload.naming_mode, 'context');
  assert.equal(actions[0].payload.file_name, undefined);
});

test('normalizes matrix structure actions into executable confirmation plans', () => {
  const actions = normalizeAgentActions([
    { action: 'data_matrix_create', payload: { name: '研磨表现记录', description: '记录研磨效果' } },
    {
      action: 'data_matrix_category_create',
      payload: { matrix_id: 'ac1d5e49-4722-4016-ba0a-bcf0e5a81776', level: 1, label: '研磨表现' },
    },
    { action: 'comparison_object_create', payload: { object_name: '样机 A', object_type: 'product_model' } },
    { action: 'comparison_category_create', payload: { label: '外观体验', node_type: 'section' } },
  ]);

  assert.deepEqual(actions.map((action) => action.type), [
    'data_matrix_create',
    'data_matrix_category_create',
    'comparison_object_create',
    'comparison_category_create',
  ]);
  assert.ok(AGENT_ACTION_TYPES.includes('data_matrix_create'));
});

test('drops incomplete matrix structure actions before confirmation', () => {
  const actions = normalizeAgentActions([
    { action: 'data_matrix_create', payload: { name: '（请补充矩阵名称）' } },
    { action: 'data_matrix_category_create', payload: { matrix_id: 'not-an-id', level: 1, label: '研磨表现' } },
    { action: 'comparison_object_create', payload: { object_name: '' } },
    { action: 'comparison_category_create', payload: { label: '（请补充分类）' } },
    { action: 'comparison_category_create', payload: { label: '杯盖边缘', node_type: 'item' } },
  ]);

  assert.deepEqual(actions, []);
});
