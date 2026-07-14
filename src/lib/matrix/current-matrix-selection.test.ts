import assert from 'node:assert/strict';
import { selectCurrentMatrix } from './current-matrix-selection';

const matrix = (overrides: Partial<Parameters<typeof selectCurrentMatrix>[0][number]> = {}) => ({
  id: 'matrix',
  status: 'active',
  meaningful: false,
  updatedAt: '2026-07-14T00:00:00.000Z',
  contentUpdatedAt: null,
  ...overrides,
});

assert.equal(
  selectCurrentMatrix([
    matrix({ id: 'empty-new', updatedAt: '2026-07-14T10:00:00.000Z' }),
    matrix({ id: 'filled-old', meaningful: true, contentUpdatedAt: '2026-07-14T09:00:00.000Z' }),
  ])?.id,
  'filled-old',
  'a newly created empty matrix must not hide an older matrix with real content',
);

assert.equal(
  selectCurrentMatrix([
    matrix({ id: 'filled-old', meaningful: true, contentUpdatedAt: '2026-07-14T09:00:00.000Z' }),
    matrix({ id: 'filled-new', meaningful: true, contentUpdatedAt: '2026-07-14T10:00:00.000Z' }),
  ])?.id,
  'filled-new',
  'the newest content update wins among meaningful matrices',
);

assert.equal(
  selectCurrentMatrix([
    matrix({ id: 'archived', status: 'archived', meaningful: true, contentUpdatedAt: '2026-07-14T12:00:00.000Z' }),
    matrix({ id: 'draft-old', status: 'designing', updatedAt: '2026-07-14T09:00:00.000Z' }),
    matrix({ id: 'draft-new', status: 'active', updatedAt: '2026-07-14T10:00:00.000Z' }),
  ])?.id,
  'draft-new',
  'archived matrices are excluded and the newest active draft is the empty fallback',
);

assert.equal(selectCurrentMatrix([]), null);

console.log('current matrix selection tests passed');
