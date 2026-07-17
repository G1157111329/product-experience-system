import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const reader = readFileSync('src/components/reports/frozen-report-reader.tsx', 'utf8');
assert.doesNotMatch(reader, /if \(reportChanged\) return tabs\.includes\('summary'\)/, 'a live issue refresh must not force the summary tab');
assert.match(reader, /resolveFrozenReportTab\(model\.tabs, current\)/, 'the reader must preserve the active problem tab during projection updates');

console.log('frozen report tab stability contract passed');
