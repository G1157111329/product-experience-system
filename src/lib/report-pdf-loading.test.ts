import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const routeSource = readFileSync(
  resolve(process.cwd(), 'src/app/api/reports/[id]/pdf/route.ts'),
  'utf8',
);

assert.match(
  routeSource,
  /page\.setContent\([\s\S]+?waitUntil:\s*['"]domcontentloaded['"]/,
  'PDF HTML should wait for DOM readiness instead of global network idleness',
);
assert.doesNotMatch(
  routeSource,
  /page\.setContent\([\s\S]+?waitUntil:\s*['"]networkidle['"]/,
  'networkidle times out when reports contain many images or video metadata requests',
);
assert.match(
  routeSource,
  /presignReportMediaUrls\(detail,\s*\{\s*absoluteBaseUrl:\s*internalMediaBaseUrl\s*\}\)/,
  'server-side PDF media should load through the loopback application origin',
);
assert.match(
  routeSource,
  /internalMediaBaseUrl\s*=\s*`http:\/\/127\.0\.0\.1:\$\{process\.env\.PORT\s*\|\|\s*['"]5000['"]\}`/,
  'the loopback media origin should follow the production application port',
);

console.log('report-pdf-loading tests passed');
