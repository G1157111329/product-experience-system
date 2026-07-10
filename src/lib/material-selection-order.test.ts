import assert from 'node:assert/strict';
import { orderMaterialsByIds } from './material-selection-order';

const materials = [
  { id: 'newest', name: 'newest' },
  { id: 'middle', name: 'middle' },
  { id: 'oldest', name: 'oldest' },
];

assert.deepEqual(
  orderMaterialsByIds(['oldest', 'newest', 'middle'], materials).map((item) => item.id),
  ['oldest', 'newest', 'middle'],
);
assert.deepEqual(
  orderMaterialsByIds(['missing', 'middle'], materials).map((item) => item.id),
  ['middle'],
);

console.log('material selection order tests passed');
