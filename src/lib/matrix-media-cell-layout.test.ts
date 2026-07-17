import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync('src/app/(main)/tasks/[id]/components/matrix-v3-media-cell.tsx', 'utf8');

test('matrix media slots keep a fixed row height and use an icon-only add control', () => {
  assert.match(source, /data-testid="matrix-media-slot"/);
  assert.match(source, /h-9[^\n]*overflow-hidden/);
  assert.match(source, /flex-nowrap/);
  assert.match(source, /aria-label="添加素材"/);
  assert.doesNotMatch(source, /\{media\.length\}\/\{maxCount\}/);
  assert.doesNotMatch(source, /lastBoundLinkIds/);
});
