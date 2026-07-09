import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const printSource = readFileSync(
  resolve(process.cwd(), 'src/app/reports/print/page.tsx'),
  'utf8',
);

const inlineMatrixStart = printSource.indexOf('function PrintInlineMatrix');
const inlineMatrixEnd = printSource.indexOf('function PrintDataMatrixSections');
assert.ok(inlineMatrixStart >= 0 && inlineMatrixEnd > inlineMatrixStart);
const inlineMatrixSource = printSource.slice(inlineMatrixStart, inlineMatrixEnd);

assert.match(inlineMatrixSource, /cell\.processNotes/);
assert.match(inlineMatrixSource, /过程记录：/);
assert.match(inlineMatrixSource, /效果结论：/);
assert.ok(
  inlineMatrixSource.indexOf('过程记录：') < inlineMatrixSource.indexOf('效果结论：'),
  'process notes should render before the independent effect conclusion',
);

console.log('report-print-matrix tests passed');
