import assert from 'node:assert/strict';
import {
  beginKeyboardSort,
  keyboardSortAria,
  transitionKeyboardSort,
} from './keyboard-sort';
import {
  assertSuccessfulSortResponse,
  persistOptimisticSort,
} from './persisted-sort';
import {
  discardPendingInlineSaves,
  retryFailedInlineSavesOrThrow,
  waitForPendingInlineSavesOrThrow,
} from './inline-save-registry';

async function main() {
  const started = beginKeyboardSort(['A', 'B', 'C'], 1);
  assert.deepEqual(keyboardSortAria(started), {
    grabbed: true,
    focusIndex: 1,
    keyShortcuts: 'Enter Space ArrowUp ArrowDown Home End Escape',
  });
  const moved = transitionKeyboardSort(started, 'ArrowDown');
  assert.deepEqual(moved.items, ['A', 'C', 'B']);
  assert.equal(moved.focusIndex, 2);
  assert.equal(moved.active, true);
  const exited = transitionKeyboardSort(moved, 'Escape');
  assert.equal(exited.active, false);
  assert.match(exited.announcement, /退出排序模式/);
  assert.doesNotMatch(exited.announcement, /取消/);

  discardPendingInlineSaves();
  let rendered = ['A', 'B'];
  await persistOptimisticSort({
    key: 'recipe-order:success',
    previous: rendered,
    next: ['B', 'A'],
    apply: (items) => { rendered = [...items]; },
    persist: async () => assertSuccessfulSortResponse(new Response(JSON.stringify({ code: 0 }), { status: 200 })),
  });
  assert.deepEqual(rendered, ['B', 'A']);
  await waitForPendingInlineSavesOrThrow();

  let serverFails = true;
  rendered = ['A', 'B'];
  await assert.rejects(persistOptimisticSort({
    key: 'recipe-order:retry',
    previous: rendered,
    next: ['B', 'A'],
    apply: (items) => { rendered = [...items]; },
    persist: async () => assertSuccessfulSortResponse(new Response(
      JSON.stringify({ code: serverFails ? 1 : 0, message: 'sort failed' }),
      { status: serverFails ? 500 : 200 },
    )),
  }), /sort failed/);
  assert.deepEqual(rendered, ['A', 'B'], 'PUT 500 rolls the optimistic order back');
  await assert.rejects(waitForPendingInlineSavesOrThrow(), /sort failed/, 'Task5 navigation waits for and surfaces the failed sort');
  serverFails = false;
  await retryFailedInlineSavesOrThrow();
  assert.deepEqual(rendered, ['B', 'A'], 'retry reapplies the persisted order');
  discardPendingInlineSaves();

  console.log('functions input keyboard sort behavior tests passed');
}

void main();
