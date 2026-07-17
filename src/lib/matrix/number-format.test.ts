import assert from 'node:assert/strict';
import test from 'node:test';
import { formatMatrixNumber } from './number-format';

test('formats numeric and formula values with the configured column precision', () => {
  assert.equal(formatMatrixNumber('7.375', 0), '7');
  assert.equal(formatMatrixNumber(7.375, 2), '7.38');
  assert.equal(formatMatrixNumber('7.375', null), '7.375');
  assert.equal(formatMatrixNumber('not-a-number', 0), 'not-a-number');
});
