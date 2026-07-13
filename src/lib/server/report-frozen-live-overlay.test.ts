import assert from 'node:assert/strict';
import { buildLiveIssueOverlayEvidence } from './report-frozen-view';

const overlay = buildLiveIssueOverlayEvidence(
  [{ id: 'issue-live' }],
  [
    { id: 'rectification-media', issue_id: 'issue-live', file_url: '/uploads/rectification.jpg' },
    { id: 'retest-media', issue_id: 'issue-live', re_evaluation_id: 'retest-1', file_url: '/uploads/retest.jpg' },
    { id: 'record-origin', record_id: 'record-1', file_url: '/uploads/record-origin.jpg' },
    { id: 'recipe-origin', recipe_id: 'recipe-1', file_url: '/uploads/recipe-origin.jpg' },
    { id: 'other-issue', issue_id: 'other-issue', file_url: '/uploads/other.jpg' },
  ],
);
assert.deepEqual(overlay['issue-live']?.map((item) => item.id), ['rectification-media']);
console.log('frozen report live overlay media tests passed');
