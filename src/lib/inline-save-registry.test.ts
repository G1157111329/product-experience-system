import assert from 'node:assert/strict';
import {
  registerPendingInlineSave,
  waitForPendingInlineSaves,
} from './inline-save-registry';

async function main() {
  let release: () => void = () => {};
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  registerPendingInlineSave(pending);

  let completed = false;
  const waiting = waitForPendingInlineSaves().then(() => {
    completed = true;
  });

  await Promise.resolve();
  assert.equal(completed, false);
  release();
  await waiting;
  assert.equal(completed, true);

  console.log('inline save registry tests passed');
}

void main();
