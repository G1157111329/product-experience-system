import assert from 'node:assert/strict';
import {
  getIssueStatusPresentation,
  toStoredIssueStatus,
} from './issue-state-machine';

assert.deepEqual(getIssueStatusPresentation('open'), {
  key: 'pending',
  label: '待整改',
  className: 'text-foreground',
});
assert.deepEqual(getIssueStatusPresentation('assigned'), {
  key: 'rectifying',
  label: '整改中',
  className: 'text-amber-600',
});
assert.deepEqual(getIssueStatusPresentation('waived'), {
  key: 'waived',
  label: '不整改',
  className: 'text-muted-foreground',
});
assert.deepEqual(getIssueStatusPresentation('verified_closed'), {
  key: 'rectified',
  label: '已整改',
  className: 'text-emerald-600',
});

assert.equal(toStoredIssueStatus('待整改'), 'open');
assert.equal(toStoredIssueStatus('整改中'), 'rectifying');
assert.equal(toStoredIssueStatus('不整改'), 'waived');
assert.equal(toStoredIssueStatus('已整改'), 'verified_closed');

console.log('issue status presentation tests passed');
