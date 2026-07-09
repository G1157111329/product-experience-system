import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const previewPath = resolve(
  process.cwd(),
  'src/app/(main)/reports/[id]/components/report-media-preview.tsx',
);
assert.equal(existsSync(previewPath), true, 'shared report media preview component should exist');

const previewSource = readFileSync(previewPath, 'utf8');
assert.match(previewSource, /MediaThumbnail/);
assert.match(previewSource, /ImagePreview/);
assert.match(previewSource, /onClick=\{\(\)\s*=>\s*setPreviewUrl/);

const sharedPreviewSource = readFileSync(resolve(process.cwd(), 'src/components/image-preview.tsx'), 'utf8');
assert.match(sharedPreviewSource, /<video[\s\S]+?controls/);

const matrixSource = readFileSync(
  resolve(process.cwd(), 'src/app/(main)/reports/[id]/components/report-matrix-tab.tsx'),
  'utf8',
);
assert.doesNotMatch(
  matrixSource,
  /allMedia\.slice\(0,\s*4\)/,
  'report matrix must not hide appendix media after the fourth item',
);

console.log('report-media-preview tests passed');
