import assert from 'node:assert/strict';
import {
  applyTransition,
  getAvailableTransitions,
  getIssueStatusPresentation,
  normalizeIssueStatus,
  toStoredIssueStatus,
} from './issue-state-machine';

assert.deepEqual(getIssueStatusPresentation('open'), {
  key: 'pending',
  label: '待整改',
  className: 'text-foreground',
});
assert.deepEqual(getIssueStatusPresentation('assigned'), {
  key: 'pending',
  label: '待整改',
  className: 'text-foreground',
});
assert.deepEqual(getIssueStatusPresentation('waived'), {
  key: 'waived',
  label: '不整改',
  className: 'text-muted-foreground',
});
assert.deepEqual(getIssueStatusPresentation('verified_closed'), {
  key: 'rectified',
  label: '整改完成',
  className: 'text-emerald-600',
});

assert.equal(toStoredIssueStatus('待整改'), 'open');
assert.equal(toStoredIssueStatus('整改中'), 'rectifying');
assert.equal(toStoredIssueStatus('不整改'), 'waived');
assert.equal(toStoredIssueStatus('整改完成'), 'verified_closed');

assert.equal(normalizeIssueStatus('triaged'), 'open');
assert.equal(normalizeIssueStatus('assigned'), 'open');
assert.equal(normalizeIssueStatus('pending_verification'), 'rectifying');
assert.equal(normalizeIssueStatus('reopened'), 'rectifying');
assert.equal(normalizeIssueStatus('已重开'), 'rectifying');
assert.equal(normalizeIssueStatus('已整改'), 'verified_closed');
assert.equal(applyTransition('verified_closed', 'return_to_rectifying'), 'rectifying');
assert.equal(getAvailableTransitions('verified_closed', 'admin').includes('reopen' as never), false);

console.log('issue status presentation tests passed');
