import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  createHistoryBackController,
  createUnsavedNavigationCoordinator,
} from './use-unsaved-navigation-guard';

async function main() {
  const source = readFileSync(new URL('./use-unsaved-navigation-guard.ts', import.meta.url), 'utf8');
  assert.match(source, /if \(!isDirty\) return;[\s\S]*addEventListener\('beforeunload'/, 'beforeunload is registered only while dirty');
  assert.match(source, /document\.addEventListener\('click',[\s\S]*true\)/, 'dirty in-app anchor navigation must be captured before Next handles it');
  assert.match(source, /event\.preventDefault\(\);\s*event\.stopImmediatePropagation\(\)/, 'captured dirty links must not reach nested Next Link handlers');
  assert.match(source, /history\.pushState/, 'dirty browser history uses a same-URL sentinel entry');
  assert.match(source, /history\.forward\(\)/, 'a dirty Back must restore the guarded current entry before flushing');
  assert.match(source, /history\.go\(delta\)/, 'successful save or discard skips the sentinel and guarded entry');

  let flushAttempts = 0;
  let continuationCalls = 0;
  let discardCalls = 0;
  let firstFailure = true;

  const guard = createUnsavedNavigationCoordinator({
    flush: async () => {
      flushAttempts += 1;
      if (firstFailure) {
        firstFailure = false;
        throw new Error('功能评价保存失败');
      }
    },
    discard: () => {
      discardCalls += 1;
    },
    retry: async () => {
      flushAttempts += 1;
    },
  });

  await guard.attemptNavigation(() => {
    continuationCalls += 1;
  });
  assert.equal(continuationCalls, 0, 'failed flush must not invoke navigation continuation');
  assert.equal(guard.getSnapshot().isPromptOpen, true);
  assert.match(guard.getSnapshot().errorMessage || '', /功能评价保存失败/);

  await Promise.all([guard.retryNavigation(), guard.retryNavigation()]);
  assert.equal(flushAttempts, 2, 'duplicate retry clicks must share one flush attempt');
  assert.equal(continuationCalls, 1, 'successful retry invokes the continuation exactly once');

  let throwingContinuationCalls = 0;
  const continuationError = new Error('transfer request failed');
  const continuationGuard = createUnsavedNavigationCoordinator({
    flush: async () => undefined,
    retry: async () => undefined,
    discard: () => undefined,
  });
  await assert.rejects(
    continuationGuard.attemptNavigation(async () => {
      throwingContinuationCalls += 1;
      throw continuationError;
    }),
    continuationError,
  );
  assert.equal(throwingContinuationCalls, 1, 'a failing continuation runs only once');
  assert.equal(continuationGuard.getSnapshot().isPromptOpen, false, 'continuation failures are not save failures');
  await continuationGuard.retryNavigation();
  assert.equal(throwingContinuationCalls, 1, 'retry cannot replay a continuation already released by a successful flush');

  let blockedContinuationCalls = 0;
  const discardGuard = createUnsavedNavigationCoordinator({
    flush: async () => {
      throw new Error('检查记录保存失败');
    },
    discard: () => {
      discardCalls += 1;
    },
    retry: async () => { throw new Error('检查记录保存失败'); },
  });
  await discardGuard.attemptNavigation(() => {
    blockedContinuationCalls += 1;
  });
  discardGuard.confirmDiscard();
  assert.equal(discardCalls, 1, 'discard clears the pending inline draft');
  assert.equal(blockedContinuationCalls, 1, 'discard is the only failure path that may continue navigation');

  await discardGuard.attemptNavigation(() => {
    blockedContinuationCalls += 1;
  });
  discardGuard.cancelDiscard();
  assert.equal(blockedContinuationCalls, 1, 'cancel must drop the blocked continuation');

  const actions: string[] = [];
  let state: Record<string, unknown> = { __NA: true, idx: 7 };
  let historyAttempts = 0;
  const historyGuard = createHistoryBackController({
    getState: () => state,
    replaceState: (next) => { state = next as Record<string, unknown>; actions.push('replace'); },
    pushState: (next) => { state = next as Record<string, unknown>; actions.push('push'); },
    forward: () => { actions.push('forward'); },
    back: () => { actions.push('back'); },
    go: (delta) => { actions.push(`go:${delta}`); },
    attemptNavigation: async (next) => { historyAttempts += 1; await next(); },
  });
  historyGuard.activate('marker');
  assert.deepEqual(actions.slice(-1), ['push']);
  assert.equal(state.__NA, true, 'Next history fields are preserved when adding a marker');
  historyGuard.handlePopState({ __NA: true, idx: 6 });
  assert.deepEqual(actions.slice(-1), ['forward']);
  await historyGuard.handlePopState(state);
  assert.equal(historyAttempts, 1);
  assert.equal(actions.filter((action) => action === 'go:-2').length, 1, 'restored Back skips the sentinel exactly once');
  assert.equal(state.__NA, true);
  assert.equal('__productExperienceUnsavedGuard' in state, false, 'continuation removes only its marker');
  await historyGuard.handlePopState({ __NA: true, idx: 6 });

  historyGuard.activate('marker-2');
  historyGuard.handlePopState({ __NA: true, idx: 6 });
  await historyGuard.handlePopState(state);
  historyGuard.cancelRestore();
  assert.equal(actions.filter((action) => action === 'go:-2').length, 2, 'a new gesture performs no duplicate Back');

  console.log('unsaved navigation guard tests passed');
}

void main();
