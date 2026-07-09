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

console.log('report-pdf-loading tests passed');
