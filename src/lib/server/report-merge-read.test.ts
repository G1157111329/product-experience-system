import assert from 'node:assert/strict';
import test from 'node:test';
import {
  filterAuthorizedMergeCandidates,
  runAuthorizedReportMerge,
} from './report-merge-read';

type Report = { id: string; task_id: string };

const primary: Report = { id: 'report-a', task_id: 'task-a' };
const foreignSibling: Report = { id: 'report-b', task_id: 'task-b' };

test('same-model reports owned by another user never enter the merge response', async () => {
  const checked: string[] = [];
  const result = await filterAuthorizedMergeCandidates(
    [primary, foreignSibling],
    primary.id,
    async (reportId) => {
      checked.push(reportId);
      return reportId !== foreignSibling.id;
    },
  );

  assert.deepEqual(result, [primary]);
  assert.deepEqual(checked, [foreignSibling.id]);
});

test('an admin or report-view-all actor can still merge every authorized sibling', async () => {
  const result = await filterAuthorizedMergeCandidates(
    [primary, foreignSibling],
    primary.id,
    async () => true,
  );

  assert.deepEqual(result, [primary, foreignSibling]);
});

test('a rejected primary report never starts sibling discovery', async () => {
  let siblingDiscoveryCalls = 0;
  const result = await runAuthorizedReportMerge(
    async () => false,
    async () => {
      siblingDiscoveryCalls += 1;
      return [primary, foreignSibling];
    },
  );

  assert.deepEqual(result, { allowed: false });
  assert.equal(siblingDiscoveryCalls, 0);
});
