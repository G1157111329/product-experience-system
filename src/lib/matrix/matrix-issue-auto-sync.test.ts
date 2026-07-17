import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const issueCell = readFileSync(resolve(root, 'src/app/(main)/tasks/[id]/components/matrix-v3-grid.tsx'), 'utf8');
const issueCollection = readFileSync(resolve(root, 'src/app/api/v1/matrices/[id]/issue-points/route.ts'), 'utf8');
const issueItem = readFileSync(resolve(root, 'src/app/api/v1/matrices/[id]/issue-points/[issuePointId]/route.ts'), 'utf8');
const issueSync = readFileSync(resolve(root, 'src/lib/matrix/issue-point-sync.ts'), 'utf8');
const migration = readFileSync(resolve(root, 'src/storage/database/shared/migrations/0019_backfill_matrix_issue_points.sql'), 'utf8');

assert.doesNotMatch(issueCell, /转问题|转为问题|\/convert/);
assert.match(issueCell, /method: 'PATCH'/);
assert.match(issueCollection, /syncMatrixIssuePointToIssue/);
assert.match(issueItem, /syncMatrixIssuePointToIssue/);
assert.match(issueSync, /eq\(issues\.sourceReportId,\s*point\.id\)/, 'matrix issue fallback must use the matrix point identity');
assert.doesNotMatch(issueSync, /eq\(issues\.title,\s*title\)/, 'same-title matrix rows must never share an issue through fallback lookup');
assert.match(migration, /INSERT INTO issues/);
assert.match(migration, /UPDATE matrix_issue_points/);

console.log('matrix issue automatic sync tests passed');
