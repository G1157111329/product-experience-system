import assert from 'node:assert/strict';
import {
  clearInlineSave,
  discardPendingInlineSaves,
  flushInlineSave,
  getInlineSaveRegistrySnapshot,
  markInlineSaveDirty,
  retryFailedInlineSavesOrThrow,
  waitForPendingInlineSavesOrThrow,
} from './inline-save-registry';

async function main() {
  discardPendingInlineSaves();
  const key = Symbol('field');
  let attempts = 0;
  let fail = true;
  markInlineSaveDirty(key, async () => {
    attempts += 1;
    if (fail) throw new Error('save failed');
  });
  assert.equal(attempts, 0, 'marking a draft dirty must not start persistence');
  assert.equal(getInlineSaveRegistrySnapshot(), true);
  await assert.rejects(waitForPendingInlineSavesOrThrow(), /save failed/);
  assert.equal(attempts, 1);

  fail = false;
  await retryFailedInlineSavesOrThrow();
  assert.equal(attempts, 2, 'retry must create a new promise from the retained factory');
  assert.equal(getInlineSaveRegistrySnapshot(), false, 'success clears the keyed draft');

  let releaseFirst: () => void = () => undefined;
  const first = new Promise<void>((resolve) => { releaseFirst = resolve; });
  let savedValue = '';
  let concurrentSaves = 0;
  let maxConcurrentSaves = 0;
  markInlineSaveDirty(key, async () => {
    concurrentSaves += 1;
    maxConcurrentSaves = Math.max(maxConcurrentSaves, concurrentSaves);
    await first;
    savedValue = 'old';
    concurrentSaves -= 1;
  });
  const oldFlush = flushInlineSave(key);
  markInlineSaveDirty(key, async () => {
    concurrentSaves += 1;
    maxConcurrentSaves = Math.max(maxConcurrentSaves, concurrentSaves);
    savedValue = 'new';
    concurrentSaves -= 1;
  });
  releaseFirst();
  await oldFlush;
  assert.equal(savedValue, 'new', 'the original flush covers a newer revision queued during its request');
  assert.equal(maxConcurrentSaves, 1, 'revisions for one key persist serially');
  assert.equal(getInlineSaveRegistrySnapshot(), false);

  let releaseDiscarded: () => void = () => undefined;
  const discardedRequest = new Promise<void>((resolve) => { releaseDiscarded = resolve; });
  markInlineSaveDirty(key, () => discardedRequest);
  const discardedFlush = flushInlineSave(key);
  discardPendingInlineSaves();
  let recreatedAfterDiscard = 0;
  markInlineSaveDirty(key, async () => { recreatedAfterDiscard += 1; });
  releaseDiscarded();
  await discardedFlush;
  assert.equal(getInlineSaveRegistrySnapshot(), true, 'an old discarded request cannot delete a recreated entry');
  await flushInlineSave(key);
  assert.equal(recreatedAfterDiscard, 1);

  let rejectCleared: (error: Error) => void = () => undefined;
  const clearedRequest = new Promise<void>((_resolve, reject) => { rejectCleared = reject; });
  markInlineSaveDirty(key, () => clearedRequest);
  const clearedFlush = flushInlineSave(key);
  clearInlineSave(key);
  let recreatedAfterClear = 0;
  markInlineSaveDirty(key, async () => { recreatedAfterClear += 1; });
  rejectCleared(new Error('stale failure'));
  await assert.rejects(clearedFlush, /stale failure/);
  assert.equal(getInlineSaveRegistrySnapshot(), true, 'an old cleared failure cannot poison a recreated entry');
  await waitForPendingInlineSavesOrThrow();
  assert.equal(recreatedAfterClear, 1);

  let discardedAttempts = 0;
  markInlineSaveDirty(key, async () => { discardedAttempts += 1; });
  discardPendingInlineSaves();
  await waitForPendingInlineSavesOrThrow();
  assert.equal(discardedAttempts, 0, 'discard explicitly removes the retry factory');

  console.log('inline save registry tests passed');
}

void main();
