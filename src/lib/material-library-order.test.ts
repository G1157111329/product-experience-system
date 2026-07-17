import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const route = readFileSync('src/app/api/materials/route.ts', 'utf8');
const picker = readFileSync('src/components/material-picker.tsx', 'utf8');

assert.match(
  route,
  /: query\.order\('created_at', \{ ascending: false \}\)\.order\('id', \{ ascending: false \}\)\.limit\(limit\)/,
  'the reusable material library must return newest uploads first',
);
assert.match(
  route,
  /scope\.comparison_cell_id\s*\? query\.order\('media_display_order', \{ ascending: true \}\)/,
  'cell-bound evidence must preserve its explicit display order',
);
assert.match(route, /sortMaterialsByBinding\(/, 'linked evidence must preserve binding order instead of upload order');
assert.match(
  picker,
  /setMaterials\(\(prev\) => \[newMaterial, \.\.\.prev\]\)/,
  'a newly uploaded material must appear first in the open picker',
);
assert.match(
  picker,
  /nextSelected = \[\.\.\.nextSelected, newMaterial\.id\]/,
  'newly bound material must be appended after earlier selections',
);
assert.match(
  picker,
  /orderMaterialsByIds\(nextSelected, allKnownMaterials\)/,
  'binding callbacks must retain the user selection sequence',
);

console.log('material library order contract passed');
