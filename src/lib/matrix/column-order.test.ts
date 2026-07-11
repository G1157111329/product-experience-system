import assert from 'node:assert/strict';
import { planMatrixColumnOrder } from './column-order';

const existing = [
  { id: 'hierarchy', columnZone: 'hierarchy', displayOrder: 10 },
  { id: 'input-1', columnZone: 'detail_dimension', displayOrder: 40 },
  { id: 'formula', columnZone: 'calculation_dimension', displayOrder: 50 },
  { id: 'effect', columnZone: 'effect_media', displayOrder: 60 },
  { id: 'issue', columnZone: 'issue_point', displayOrder: 80 },
];

assert.deepEqual(
  planMatrixColumnOrder(existing, 'input-2', 'detail_dimension').map(({ id, displayOrder }) => [id, displayOrder]),
  [['hierarchy', 10], ['input-1', 20], ['input-2', 30], ['formula', 40], ['effect', 50], ['issue', 60]],
);
assert.deepEqual(
  planMatrixColumnOrder(existing, 'formula-2', 'calculation_dimension').map(({ id }) => id),
  ['hierarchy', 'input-1', 'formula', 'formula-2', 'effect', 'issue'],
);
assert.deepEqual(
  planMatrixColumnOrder(existing, 'evaluation', 'evaluation').map(({ id }) => id),
  ['hierarchy', 'input-1', 'formula', 'effect', 'evaluation', 'issue'],
);

console.log('matrix column order contract tests passed');
