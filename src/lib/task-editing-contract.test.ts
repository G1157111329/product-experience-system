import assert from 'node:assert/strict';
import { classifyTaskEditAction, requiresTaskEditConfirmation } from './task-editing-contract';

assert.equal(classifyTaskEditAction('recipe_step_update'), 'direct');
assert.equal(classifyTaskEditAction('material_bind'), 'direct');
assert.equal(classifyTaskEditAction('issue_update'), 'direct');
assert.equal(classifyTaskEditAction('recipe_step_delete'), 'confirm');
assert.equal(classifyTaskEditAction('user_role_update'), 'confirm');
assert.equal(classifyTaskEditAction('unknown_action'), 'blocked');

assert.equal(requiresTaskEditConfirmation('recipe_step_update'), false);
assert.equal(requiresTaskEditConfirmation('recipe_step_delete'), true);

console.log('task editing contract tests passed');
