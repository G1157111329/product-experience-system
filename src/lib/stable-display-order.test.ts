import assert from 'node:assert/strict';
import {
  sortCreatedAscending,
  sortFrozenIssues,
  sortMaterialsByBinding,
} from './stable-display-order';

assert.deepEqual(
  sortCreatedAscending([
    { id: 'later', created_at: '2026-07-15T10:00:00.000Z' },
    { id: 'same-b', created_at: '2026-07-15T09:00:00.000Z' },
    { id: 'same-a', created_at: '2026-07-15T09:00:00.000Z' },
  ]).map((item) => item.id),
  ['same-a', 'same-b', 'later'],
  'ordinary lists are oldest-first with a stable id tie-break',
);

assert.deepEqual(
  sortFrozenIssues([
    { id: 'matrix-old', sourceKind: 'matrix', createdAt: '2026-07-15T08:00:00.000Z' },
    { id: 'function-new', sourceKind: 'function', createdAt: '2026-07-15T11:00:00.000Z' },
    { id: 'sensory-new', sourceKind: 'sensory', createdAt: '2026-07-15T12:00:00.000Z' },
    { id: 'comparison-old', sourceKind: 'comparison', createdAt: '2026-07-15T07:00:00.000Z' },
    { id: 'function-old', sourceKind: 'function', createdAt: '2026-07-15T09:00:00.000Z' },
  ]).map((item) => item.id),
  ['sensory-new', 'function-old', 'function-new', 'comparison-old', 'matrix-old'],
  'frozen issues group by source contract before sorting oldest-first inside each group',
);

assert.deepEqual(
  sortMaterialsByBinding([
    { id: 'selected-third', bindingOrder: 3, linkedAt: '2026-07-15T08:00:00.000Z', created_at: '2026-07-15T07:00:00.000Z' },
    { id: 'selected-first', bindingOrder: 1, linkedAt: '2026-07-15T10:00:00.000Z', created_at: '2026-07-15T09:00:00.000Z' },
    { id: 'fallback-created-b', created_at: '2026-07-15T12:00:00.000Z' },
    { id: 'selected-second', bindingOrder: 2, linkedAt: '2026-07-15T09:00:00.000Z', created_at: '2026-07-15T08:00:00.000Z' },
    { id: 'fallback-linked', linkedAt: '2026-07-15T11:00:00.000Z', created_at: '2026-07-15T13:00:00.000Z' },
    { id: 'fallback-created-a', created_at: '2026-07-15T12:00:00.000Z' },
  ]).map((item) => item.id),
  ['selected-first', 'selected-second', 'selected-third', 'fallback-linked', 'fallback-created-a', 'fallback-created-b'],
  'materials preserve selection order, then association time, creation time and id',
);

console.log('stable display order tests passed');
