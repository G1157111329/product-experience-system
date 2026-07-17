import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const matrixTabSource = readFileSync(
  'src/app/(main)/tasks/[id]/components/matrix-tab.tsx',
  'utf8',
);

test('selected matrix view starts with the editor instead of repeating matrix metadata', () => {
  const selectedMatrixStart = matrixTabSource.indexOf('// ---- Selected matrix detail ----');
  const selectedMatrixEnd = matrixTabSource.indexOf("if (tabState === 'feature_disabled')");
  const selectedMatrixView = matrixTabSource.slice(selectedMatrixStart, selectedMatrixEnd);

  assert.match(selectedMatrixView, /MatrixV3Shell/);
  assert.doesNotMatch(selectedMatrixView, /matrix\.name/);
  assert.doesNotMatch(selectedMatrixView, /handleLifecycle\(matrix\.id/);
});
