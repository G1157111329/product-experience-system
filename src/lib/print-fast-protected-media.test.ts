import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { printPresignStorageKey } from './print-assets';

const printPage = readFileSync('src/app/reports/print/page.tsx', 'utf8');

assert.equal(
  printPresignStorageKey('/uploads/materials/task/2026071711153001.jpg'),
  '/uploads/materials/task/2026071711153001.jpg',
  'print media must retain the protected uploads prefix for server-side lookup',
);
assert.doesNotMatch(printPage, /localPrintMediaUrl/, 'fast print must not bypass protected media signing with a bare /uploads URL');
assert.match(printPage, /fetchWithTimeout\('\/api\/materials\/presign'/, 'fast print must request a signed report-scoped media URL');

console.log('fast print protected media contract passed');
