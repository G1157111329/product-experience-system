import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sharePage = readFileSync('src/app/reports/share/[token]/page.tsx', 'utf8');
const paperRenderer = readFileSync('src/components/reports/report-section-block-renderer.tsx', 'utf8');
const mediaGrid = readFileSync('src/components/reports/report-media-grid.tsx', 'utf8');
const printPage = readFileSync('src/app/reports/print/page.tsx', 'utf8');

assert.match(sharePage, /ReportPrintDocument/, 'the anonymous share page must use the print reading layout');
assert.match(sharePage, /buildPrintReportViewModel/, 'the share page must derive its layout from the frozen print model');
assert.match(sharePage, /interactiveMedia/, 'the share page must preserve interactive original-image and video previews');
assert.match(sharePage, /data-testid="share-readonly-header"/, 'the share page must render its standalone readonly header');
assert.match(sharePage, /data-testid="share-download-button"/, 'the share page must keep its download action in the header');
assert.match(sharePage, /document\.images/, 'the share download must wait for in-page images before printing');
assert.match(sharePage, /window\.print\(\)/, 'the share download must print the current page without opening a second page');
assert.doesNotMatch(sharePage, /window\.open\(/, 'the share download must not open a transient print page');
assert.match(sharePage, /print:hidden/, 'the share download control must not appear in the saved PDF');
assert.doesNotMatch(sharePage, /<FrozenReportReader/, 'the share page must not retain the platform operation layout');
assert.match(paperRenderer, /interactiveMedia/, 'the print document must support interactive media only for share reading');
assert.match(mediaGrid, /share-paper/, 'the interactive share media grid must use print-sized thumbnails');
assert.match(printPage, /searchParams\.get\('autoclose'\)/, 'the print page keeps its standalone transient-print compatibility');
assert.match(printPage, /afterprint/, 'the standalone transient print page closes after the print dialog completes');

console.log('report share print layout contract passed');
