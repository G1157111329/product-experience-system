import assert from 'node:assert/strict';
import test from 'node:test';

// @ts-expect-error -- Node's native TypeScript runner requires the explicit extension, while the project resolver disallows it.
import { getCreatedMatrixId } from './matrix-create-response.ts';

test('recognizes a successful v1 matrix envelope without the legacy code field', () => {
  assert.equal(
    getCreatedMatrixId(true, { data: { id: 'matrix-v1' }, error: null }),
    'matrix-v1',
  );
  assert.equal(
    getCreatedMatrixId(true, { code: 0, data: { id: 'matrix-legacy' } }),
    'matrix-legacy',
  );
  assert.equal(
    getCreatedMatrixId(false, { data: { id: 'matrix-error' }, error: { code: 'MATRIX_CREATE_FAILED' } }),
    null,
  );
});
