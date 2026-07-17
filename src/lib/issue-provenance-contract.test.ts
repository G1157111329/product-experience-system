import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const route = readFileSync('src/app/api/issues/[id]/route.ts', 'utf8');
const page = readFileSync('src/app/(main)/issues/[id]/page.tsx', 'utf8');

assert.match(route, /provenance/);
assert.match(route, /resolveIssueStatusChange/);
assert.match(route, /status:\s*422/);
assert.match(route, /canReadIssue/);
assert.match(route, /canMutateIssueRetest/);
assert.match(route, /canManageIssue/);
assert.match(route, /role:\s*user\.role/);
assert.doesNotMatch(route, /user\.role === 'admin' \? 'admin' : 'task_owner'/);
assert.match(route, /enrichIssueProjection/);
assert.match(route, /recipe_steps/);
assert.match(route, /recipes/);
assert.match(route, /isTransitionActionPayload/);
assert.match(route, /deleteIssueWithMaterialCleanup/);
assert.doesNotMatch(route, /unbindAllMaterialsFromTarget/);
assert.match(route, /experience_tasks/);
assert.match(route, /check_records/);
assert.match(route, /reports/);
assert.match(page, /issue\.provenance/);
assert.match(page, /\/tasks\/\$\{issue\.provenance\.task\.id\}/);
assert.match(page, /\/reports\/\$\{issue\.provenance\.report\.id\}/);
assert.match(page, /issue\.provenance\.recipe/);
assert.match(page, /issue\.provenance\.recipe_step/);
assert.match(page, /statusTransitionFor\(normalizeIssueStatus\(issue\.status\), step\.code\)/);
assert.match(page, /aria-pressed=\{selected\}/);
assert.match(page, /Object\.entries\(form\)/);

console.log('issue provenance contract tests passed');
