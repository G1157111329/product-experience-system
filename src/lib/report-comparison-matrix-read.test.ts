import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync('src/app/(main)/reports/[id]/components/report-matrix-tab.tsx', 'utf8');

test('frozen comparison reader fits every object column into one static report table', () => {
  assert.match(source, /className="w-full table-fixed/);
  assert.doesNotMatch(source, /overflow-x-auto/);
  assert.match(source, /const objectColumnWidth =/);
  assert.match(source, /style=\{\{ width: objectColumnWidth \}\}/);
});

test('frozen comparison reader preserves a named category summary with its source content', () => {
  assert.match(source, /本大类小结/);
  assert.match(source, /summaryTextOf\(section\)/);
  assert.match(source, /summaryNode \?\? section/);
});

test('comparison cell evidence remains at the cell rather than an appendix block', () => {
  assert.match(source, /<ReportMediaGrid/);
  assert.doesNotMatch(source, /附录素材/);
});
