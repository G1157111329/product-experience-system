import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const actionTypes = [
  'data_matrix_create',
  'data_matrix_category_create',
  'comparison_object_create',
  'comparison_category_create',
];

for (const file of [
  'src/lib/agent-skills.ts',
  'src/lib/server/hermes/task-action-plan.ts',
]) {
  const source = readFileSync(file, 'utf8');
  for (const actionType of actionTypes) {
    assert.match(source, new RegExp(actionType), `${file} must advertise ${actionType} to Hermes`);
  }
}

console.log('Hermes task action catalog tests passed');
