import assert from 'node:assert/strict';
import test from 'node:test';

// @ts-expect-error -- Node's native TypeScript runner requires the explicit extension, while the project resolver disallows it.
import { getProjectPhaseSelectionLabels, normalizeProjectPhase } from './dictionary-types.ts';

test('uses only canonical project phases while accepting legacy short labels', () => {
  assert.deepEqual(getProjectPhaseSelectionLabels(), [
    '手板研究',
    '试制阶段',
    '试产阶段',
    '量产阶段',
  ]);

  assert.equal(normalizeProjectPhase('手板'), '手板研究');
  assert.equal(normalizeProjectPhase('试制'), '试制阶段');
  assert.equal(normalizeProjectPhase('试产'), '试产阶段');
  assert.equal(normalizeProjectPhase('量产'), '量产阶段');
});
