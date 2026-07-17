import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const gridSource = readFileSync(
  'src/app/(main)/tasks/[id]/components/matrix-v3-grid.tsx',
  'utf8',
);
const pickerSource = readFileSync('src/components/material-picker.tsx', 'utf8');
const bootstrapSource = readFileSync('src/lib/matrix/bootstrap-v3.ts', 'utf8');
const cellRouteSource = readFileSync(
  'src/app/api/v1/matrices/[id]/cells/[leafRowId]/[columnId]/route.ts',
  'utf8',
);

test('adding matrix hierarchy children opens an in-app form instead of a native prompt', () => {
  assert.doesNotMatch(gridSource, /window\.prompt/);
  assert.match(gridSource, /nodeDialog/);
  assert.match(gridSource, /DialogContent/);
});

test('controlled matrix material pickers fetch the task library when opened', () => {
  assert.match(pickerSource, /if \(!isOpen\)/);
  assert.match(pickerSource, /void fetchMaterials\(\)/);
});

test('saving a matrix input cell triggers authoritative formula recomputation', () => {
  assert.match(cellRouteSource, /await recomputeMatrixFormulas\(matrixId\)/);
});

test('the matrix omits the redundant primary image column and uses the later material column', () => {
  assert.doesNotMatch(bootstrapSource, /columnZone: 'primary_media'/);
  assert.match(gridSource, /column\.columnZone !== 'primary_media'/);
});

test('new matrices do not offer editable third-level cells while historical third-level rows remain readable', () => {
  assert.doesNotMatch(gridSource, /InlineNewLevel3/);
  assert.doesNotMatch(gridSource, /onAddLevel3/);
  assert.match(gridSource, /orderRowsByHierarchy/);
});

test('each matrix header exposes a compact minus control for column removal', () => {
  assert.match(gridSource, /删除列 \$\{col\.columnLabel\}/);
  assert.match(gridSource, />−<\/button>/);
});

test('matrix column labels enter inline edit on text click and save through the column API', () => {
  assert.match(gridSource, /editingHeaderId/);
  assert.match(gridSource, /aria-label={`编辑列名/);
  assert.match(gridSource, /\/api\/v1\/matrix-columns\/\$\{column\.id\}/);
  assert.match(gridSource, /onBlur=\{\(event\) => void saveColumnHeader/);
});

test('the last frozen hierarchy column draws a durable boundary above scrolling cells', () => {
  assert.match(gridSource, /frozenHierarchyBoundaryId/);
  assert.match(gridSource, /after:w-px after:bg-border/);
  assert.match(gridSource, /data-frozen-hierarchy-boundary/);
});
