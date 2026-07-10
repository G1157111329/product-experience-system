import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const stickyHeader = readFileSync(
  resolve(process.cwd(), 'src/app/(main)/reports/[id]/components/report-sticky-header.tsx'),
  'utf8',
);
const sharePage = readFileSync(
  resolve(process.cwd(), 'src/app/reports/share/[token]/page.tsx'),
  'utf8',
);

assert.match(stickyHeader, /ReportShareDialog/);
assert.doesNotMatch(stickyHeader, /expires_in/);
assert.doesNotMatch(stickyHeader, /\/reports\/\$\{id\}/);
assert.match(sharePage, /ReportSummaryTab/);
assert.match(sharePage, /ReportMatrixTab/);

console.log('report share view tests passed');
