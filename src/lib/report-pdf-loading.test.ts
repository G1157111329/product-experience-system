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
  /presignPrintReportMediaUrls\(printModel,\s*\{\s*absoluteBaseUrl:\s*internalMediaBaseUrl\s*\}\)/,
  'server-side PDF media should load through the loopback application origin',
);
assert.match(
  routeSource,
  /internalMediaBaseUrl\s*=\s*`http:\/\/127\.0\.0\.1:\$\{process\.env\.PORT\s*\|\|\s*['"]5000['"]\}`/,
  'the loopback media origin should follow the production application port',
);
assert.match(routeSource, /buildFrozenReportResponse\(client,\s*report/);
assert.match(routeSource, /buildPrintReportViewModel\(frozen\.model\)/);
assert.match(routeSource, /pdfProfileForPrintModel\(printModel\)/);
assert.match(routeSource, /createPdfJob\([\s\S]+?actualProfile\.id/);
assert.match(routeSource, /['"]X-PDF-Profile['"]:\s*actualProfile\.id/);
assert.match(routeSource, /metadata:\s*\{[\s\S]+?profile:\s*actualProfile\.id/);
assert.doesNotMatch(routeSource, /createPdfJob\([\s\S]+?delivery\.profile\.id/);
assert.doesNotMatch(routeSource, /loadAnchoredReportSnapshot/);
assert.doesNotMatch(routeSource, /attachReEvaluations/);
assert.doesNotMatch(routeSource, /buildReportDetailModel/);
assert.match(routeSource, /renderPrintReportHtml\(printModel/);
assert.match(routeSource, /posterStorageKey\(sourceUrl\)/);
assert.match(routeSource, /signedPosterUrl\(target\.posterUrl,\s*signedUrl\)/);
assert.match(routeSource, /startsWith\(['"]data:/);
assert.doesNotMatch(routeSource, /item\.type\.toLowerCase\(\)\.includes\(['"]video['"]\)\s*\|\|/);

console.log('report-pdf-loading tests passed');
