import assert from 'node:assert/strict';
import { buildLiveIssueOverlayEvidence } from './report-frozen-view';
import { readFileSync } from 'node:fs';

const overlay = buildLiveIssueOverlayEvidence(
  [{ id: 'issue-live' }],
  [
    { id: 'rectification-media', issue_id: 'issue-live', file_url: '/uploads/rectification.jpg' },
    { id: 'retest-media', issue_id: 'issue-live', re_evaluation_id: 'retest-1', file_url: '/uploads/retest.jpg' },
    { id: 'record-origin', record_id: 'record-1', file_url: '/uploads/record-origin.jpg' },
    { id: 'recipe-origin', recipe_id: 'recipe-1', file_url: '/uploads/recipe-origin.jpg' },
    { id: 'other-issue', issue_id: 'other-issue', file_url: '/uploads/other.jpg' },
    { id: 'linked-rectification', file_url: '/uploads/linked-rectification.jpg' },
  ],
  [{ target_type: 'issue', target_id: 'issue-live', material_id: 'linked-rectification', binding_order: 2 }],
);
assert.deepEqual(overlay['issue-live']?.map((item) => item.id), ['rectification-media', 'linked-rectification']);
const serverProjectionSource = readFileSync('src/lib/server/report-frozen-view.ts', 'utf8');
assert.match(serverProjectionSource, /manageableIssueIdsForActor\(client, options\.actor, issues\)/, 'server projection computes issue management in one canonical batch');
assert.match(serverProjectionSource, /manageableIssueIds/, 'server passes explicit authorized issue ids into the pure frozen builder');
assert.doesNotMatch(serverProjectionSource, /issues\.map\(async[\s\S]*canManageIssue/, 'report projection must not query issue management once per issue');
console.log('frozen report live overlay media tests passed');
