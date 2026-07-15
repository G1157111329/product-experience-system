import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const source = readFileSync(
  resolve(process.cwd(), 'src/app/api/reports/share/route.ts'),
  'utf8',
);

assert.match(source, /eq\('share_token', token\)/, 'the public read must resolve an explicit share grant');
assert.match(source, /eq\('id', share\.report_id\)/, 'the grant must bind the response to its primary report');
assert.match(source, /mergedReportOrder:\s*\[String\(report\.id\)\]/,
  'a public token must expose only its explicitly granted report');
assert.doesNotMatch(source, /sameModelReports|eq\('product_model'/,
  'the public route must not infer same-model sibling reports');

console.log('report public share scope contract tests passed');
