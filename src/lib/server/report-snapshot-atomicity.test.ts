import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

function assertBefore(text: string, first: string, second: string, message: string) {
  const firstIndex = text.indexOf(first);
  const secondIndex = text.indexOf(second);
  assert.notEqual(firstIndex, -1, `missing contract marker: ${first}`);
  assert.notEqual(secondIndex, -1, `missing contract marker: ${second}`);
  assert.ok(firstIndex < secondIndex, message);
}

const reportsRoute = source('src/app/api/reports/route.ts');
const comparisonStart = reportsRoute.indexOf('if (comparisonSource)');
const comparisonEnd = reportsRoute.indexOf('const { data: rawRecords }', comparisonStart);
const comparisonBranch = reportsRoute.slice(comparisonStart, comparisonEnd);
assertBefore(
  comparisonBranch,
  'persistAnchoredReportSnapshot',
  ".from('issues').delete()",
  'comparison reports must anchor the new snapshot before deleting old issues',
);
assertBefore(
  comparisonBranch,
  'persistAnchoredReportSnapshot',
  ".update({ status: 'archived'",
  'comparison reports must anchor the new snapshot before archiving old reports',
);

const normalStart = reportsRoute.indexOf('let frozenSnapshotJson', comparisonEnd);
const normalBranch = reportsRoute.slice(normalStart);
const normalSnapshotMarker = 'tx.insert(reportSnapshots)';
for (const sideEffect of [
  ".set({ status: 'archived'",
  'tx.delete(issuesTable)',
  'tx.update(experienceTasks)',
  'tx.insert(issuesTable)',
  'tx.insert(recipeLibrary)',
]) {
  assertBefore(
    normalBranch,
    normalSnapshotMarker,
    sideEffect,
    `normal reports must anchor the new snapshot before ${sideEffect}`,
  );
}

const snapshotGuard = normalBranch.indexOf('if (dataMatrixProjection)');
const snapshotPersist = normalBranch.indexOf(normalSnapshotMarker, snapshotGuard);
const successResponse = normalBranch.indexOf("message: '报告生成成功'", snapshotPersist);
assert.ok(snapshotGuard >= 0 && snapshotPersist > snapshotGuard, 'meaningful matrices must persist a snapshot');
assert.ok(successResponse > snapshotPersist, 'normal report success must follow the optional snapshot block');
assert.ok(
  normalBranch.slice(snapshotGuard, snapshotPersist).includes('if (dataMatrixProjection)'),
  'reports without a meaningful matrix must bypass snapshot persistence and still reach success',
);

const directRoute = source('src/app/api/report-snapshots/route.ts');
assert.match(directRoute, /persistAnchoredReportSnapshot/);
assert.match(directRoute, /loadAnchoredReportSnapshot/);
assert.doesNotMatch(
  directRoute.slice(directRoute.indexOf('export async function GET'), directRoute.indexOf('export async function POST')),
  /order\('version'/,
  'default GET must resolve the report anchor instead of selecting the latest snapshot version',
);
assert.match(directRoute, /deleteReportOnFailure:\s*createdNewReport/);
assert.match(directRoute, /if \(!report\)/, 'direct snapshot creation must reject an empty anchor update result');

console.log('report snapshot atomicity contract tests passed');
