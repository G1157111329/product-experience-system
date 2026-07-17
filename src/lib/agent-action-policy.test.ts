import assert from 'node:assert/strict';
import { isAgentActionAllowed } from './agent-action-policy';
import { AGENT_ACTION_TYPES } from './agent-actions';

for (const action of ['recipe_create', 'recipe_step_create', 'recipe_step_update', 'comparison_cell_update', 'material_bind', 'comparison_cell_material_bind', 'data_matrix_cell_material_bind', 'issue_create', 'issue_update', 'standard_item_create', 'record_update']) {
  assert.equal(isAgentActionAllowed(action), true, `${action} should be allowed`);
}

for (const action of ['recipe_step_delete', 'material_delete', 'settings_update', 'agent_config_update', 'user_remove']) {
  assert.equal(isAgentActionAllowed(action), false, `${action} must be denied`);
}

console.log('agent action policy tests passed');

for (const required of [
  'task_create',
  'recipe_create',
  'recipe_step_create',
  'material_bind',
  'comparison_cell_material_bind',
  'data_matrix_cell_material_bind',
  'comparison_cell_update',
  'data_matrix_cell_update',
  'record_update',
  'standard_item_create',
  'issue_create',
  'issue_update',
]) {
  assert.ok(AGENT_ACTION_TYPES.includes(required as (typeof AGENT_ACTION_TYPES)[number]), `${required} must be exposed`);
}
assert.equal(AGENT_ACTION_TYPES.some((type) => /delete|settings|config/.test(type)), false);
