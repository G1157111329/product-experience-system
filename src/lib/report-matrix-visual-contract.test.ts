import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

const mediaGrid = source('src/components/reports/report-media-grid.tsx');
const mediaPreview = source('src/components/reports/report-media-preview.tsx');
const dataMatrix = source('src/components/reports/report-data-matrix-read-view.tsx');
const comparisonMatrix = source('src/app/(main)/reports/[id]/components/report-matrix-tab.tsx');
const frozenReader = source('src/components/reports/frozen-report-reader.tsx');
const printRenderer = source('src/components/reports/report-section-block-renderer.tsx');
const posterRoute = source('src/app/api/materials/poster/[...key]/route.ts');

assert.match(mediaGrid, /matrix: \{ limit: Number\.MAX_SAFE_INTEGER,[^}]*minWidth: 64, maxWidth: 64 \}/);
assert.match(dataMatrix, /role="matrix"/);
assert.match(comparisonMatrix, /role="matrix"/);
assert.doesNotMatch(dataMatrix, /role="primary"/);
assert.match(dataMatrix, /rowSpan=\{group\.rows\.length\}/);
assert.match(dataMatrix, /hierarchyWidths = \[11, 14\]/);
assert.match(dataMatrix, /effect_media: 28/);
assert.match(dataMatrix, /adaptiveThumbnail/);
assert.match(mediaPreview, /<video[\s\S]*#t=0\.1[\s\S]*preload="metadata"/);
assert.match(frozenReader, /MediaList items=\{recipe\.evidence\} role="evidence"/);
assert.match(frozenReader, /MediaList items=\{effect\.evidence\} role="evidence"/);
assert.match(frozenReader, /function-effect-preview[\s\S]*justify-between[\s\S]*border-b/);
assert.match(comparisonMatrix, /const objectColumnWidth = `\$\{86 \/ Math\.max\(objects\.length, 1\)\}%`/);
assert.match(comparisonMatrix, /<col className="w-\[14%\]"/);
assert.doesNotMatch(frozenReader, /data-issue-field="status"/);
assert.match(frozenReader, /issueStatusLabel\(issue\.liveOverlay\.status \|\| 'open'\)/);
assert.match(printRenderer, /uniquePaperMedia\(\[\.\.\.\(recipe\?\.evidence \|\| \[\]\), \.\.\.issue\.evidence\]\)/);
assert.match(printRenderer, /paperIssueStatus\(issue\.liveOverlay\.status \|\| 'open'\)/);
assert.doesNotMatch(printRenderer, /media\.slice\(0, 4\)/);
assert.match(posterRoute, /ffmpeg extraction failed; using Chromium fallback/);
assert.match(posterRoute, /video\.screenshot\(\{ path: posterPath, type: 'jpeg'/);

console.log('report matrix visual contract passed');
