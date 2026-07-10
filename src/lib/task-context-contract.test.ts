import assert from 'node:assert/strict';
import { normalizeIngredientItems, normalizeStepParameters } from './task-context-contract';

assert.deepEqual(
  normalizeIngredientItems([
    { name: '香蕉', quantity: 180, unit: 'g' },
    { name: '牛奶', quantity: '250', unit: 'ml', note: '冷藏' },
  ]),
  [
    { name: '香蕉', quantity: 180, unit: 'g' },
    { name: '牛奶', quantity: 250, unit: 'ml', note: '冷藏' },
  ],
);

assert.deepEqual(normalizeIngredientItems([{ name: '  ' }]), []);
assert.deepEqual(
  normalizeStepParameters({ duration_sec: '60', speed: 'high', temperature_c: 45, mode: '奶昔' }),
  { duration_sec: 60, speed: 'high', temperature_c: 45, mode: '奶昔' },
);
assert.deepEqual(normalizeStepParameters({ duration_sec: -1, mode: '  ' }), {});

console.log('task context contract tests passed');
