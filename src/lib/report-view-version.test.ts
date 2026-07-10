import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const reportPage = readFileSync(
  resolve(process.cwd(), 'src/app/(main)/reports/[id]/page.tsx'),
  'utf8',
);
const printPage = readFileSync(
  resolve(process.cwd(), 'src/app/reports/print/page.tsx'),
  'utf8',
);

assert.match(reportPage, /ReportSummaryTab/);
assert.match(reportPage, /ReportMatrixTab/);
assert.doesNotMatch(reportPage, /ReportDetailCanvasPage/);

assert.match(printPage, /PrintInlineMatrix/);
assert.doesNotMatch(printPage, /<ReportPrintSectionBlocks sections=\{rptSnapshot\.sections\}/);

console.log('report view version contract passed');
