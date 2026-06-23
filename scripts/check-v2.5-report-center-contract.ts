import { existsSync, readFileSync } from 'fs';
import path from 'path';
import assert from 'node:assert/strict';

const root = process.cwd();

function read(relativePath: string) {
  return readFileSync(path.join(root, relativePath), 'utf8');
}

function exists(relativePath: string) {
  return existsSync(path.join(root, relativePath));
}

function assertExists(relativePath: string) {
  assert.equal(exists(relativePath), true, `${relativePath} does not exist`);
}

function assertNotExists(relativePath: string) {
  assert.equal(exists(relativePath), false, `${relativePath} should not exist`);
}

function assertIncludes(file: string, expected: string) {
  assert.ok(read(file).includes(expected), `${file} is missing: ${expected}`);
}

function assertNotIncludes(file: string, unexpected: string) {
  assert.equal(read(file).includes(unexpected), false, `${file} should not include: ${unexpected}`);
}

assertExists('src/app/(main)/reports/page.tsx');
assertExists('src/app/api/reports/route.ts');
assertExists('tests/e2e/platform-smoke.spec.ts');

assertIncludes('src/app/(main)/reports/page.tsx', 'fetch(`/api/reports?${params}`)');
assertIncludes('src/app/(main)/reports/page.tsx', 'getReportMergeModel');
assertIncludes('src/app/(main)/reports/page.tsx', 'visibleReports');
assertIncludes('src/app/(main)/reports/page.tsx', 'FilterBar');
assertIncludes('src/app/(main)/reports/page.tsx', 'SearchField');
assertIncludes('tests/e2e/platform-smoke.spec.ts', 'report center list contract renders');

assertNotExists('src/lib/report-center-dashboard.ts');
assertNotExists('src/app/api/reports/dashboard/route.ts');
assertNotIncludes('src/app/(main)/reports/page.tsx', '/api/reports/dashboard');
assertNotIncludes('src/app/(main)/reports/page.tsx', 'delivery-board-title');
assertNotIncludes('src/app/(main)/reports/page.tsx', 'Action Inbox');
assertNotIncludes('src/app/(main)/reports/page.tsx', 'OrderedReportCard');

console.log('V2.5 report center list contract check passed');
