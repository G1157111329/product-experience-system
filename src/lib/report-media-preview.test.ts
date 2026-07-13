import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const previewPath = resolve(
  process.cwd(),
  'src/components/reports/report-media-preview.tsx',
);
assert.equal(existsSync(previewPath), true, 'shared report media preview component should exist');

const previewSource = readFileSync(previewPath, 'utf8');
assert.match(previewSource, /ImagePreview/);
assert.doesNotMatch(previewSource, /usePresignedUrls/);
assert.match(previewSource, /mediaType=\{media\.type\}/);
assert.match(previewSource, /report-media-placeholder/);
assert.match(
  previewSource,
  /mediaFailed/,
  'a final thumbnail load failure must render a stable placeholder',
);
assert.match(
  previewSource,
  /canPreview\s*=\s*!pending\s*&&\s*!unavailable\s*&&\s*!mediaFailed/,
  'a final media load failure must not remain interactive',
);
assert.match(previewSource, /aspect-\[4\/3\]/);
assert.match(previewSource, /aspect-video/);

const compatibilitySource = readFileSync(resolve(
  process.cwd(),
  'src/app/(main)/reports/[id]/components/report-media-preview.tsx',
), 'utf8');
assert.match(compatibilitySource, /export \{ ReportMediaPreview \}/);
assert.match(compatibilitySource, /@\/components\/reports\/report-media-preview/);

const sharedPreviewSource = readFileSync(resolve(process.cwd(), 'src/components/image-preview.tsx'), 'utf8');
assert.match(sharedPreviewSource, /<video[\s\S]+?controls/);
assert.match(sharedPreviewSource, /mediaType\?:\s*string/);
assert.match(sharedPreviewSource, /mediaType[\s\S]+?isVideo/);
assert.doesNotMatch(
  sharedPreviewSource,
  /const displayUrl = presignedUrl \|\| url/,
  'raw storage keys must not be requested as report-relative URLs while presigning is pending',
);

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
