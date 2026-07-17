import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const printPage = readFileSync('src/app/reports/print/page.tsx', 'utf8');

assert.match(printPage, /const PRINT_REQUEST_TIMEOUT_MS = 10_000;/, 'print requests need a bounded timeout');
assert.match(printPage, /async function fetchWithTimeout/, 'print loading must use a timeout-aware fetch helper');
assert.match(printPage, /if \(mode === 'high'\)/, 'fast mode must not wait for image-to-data-url conversion');
assert.doesNotMatch(printPage, /if \(mode !== 'text'\)/, 'fast mode must skip optional media conversion');

console.log('print loading timeout contract passed');
