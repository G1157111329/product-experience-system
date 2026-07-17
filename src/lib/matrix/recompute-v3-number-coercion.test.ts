import assert from 'node:assert/strict';
import test from 'node:test';
import * as recompute from './recompute-v3';

const toFormulaNumber = (recompute as typeof recompute & {
  toFormulaNumber?: (value: unknown) => number | null;
}).toFormulaNumber;
const getFormulaCoordinateColumns = (recompute as typeof recompute & {
  getFormulaCoordinateColumns?: <T extends { archivedAt: unknown; zoneRole: string | null; columnZone: string }>(
    columns: T[],
  ) => T[];
}).getFormulaCoordinateColumns;

test('formula evaluation accepts a numeric text value saved by a text matrix cell', () => {
  assert.equal(toFormulaNumber?.({ valueNumber: null, valueText: ' 30 ' }), 30);
  assert.equal(toFormulaNumber?.({ valueNumber: null, valueText: 'not-a-number' }), null);
});

test('formula coordinates keep the third-level slot but omit the removed primary image slot', () => {
  const visible = getFormulaCoordinateColumns?.([
    { id: 'a', archivedAt: null, zoneRole: 'A', columnZone: 'hierarchy' },
    { id: 'b', archivedAt: null, zoneRole: 'B', columnZone: 'hierarchy' },
    { id: 'c', archivedAt: null, zoneRole: 'C', columnZone: 'hierarchy' },
    { id: 'image', archivedAt: null, zoneRole: 'D', columnZone: 'primary_media' },
    { id: 'comparison', archivedAt: null, zoneRole: 'E', columnZone: 'comparison_category' },
  ]);
  assert.deepEqual(visible?.map((column) => column.id), ['a', 'b', 'c', 'comparison']);
});
