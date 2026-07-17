import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyIdleUnbind,
  applySectionStale,
  defaultHermesSession,
  describeHermesContext,
  formatTaskPickPrompt,
  HERMES_IDLE_UNBIND_MS,
  HERMES_SECTION_STALE_MS,
  parseHermesNavCode,
  requiresMediaListReselect,
  touchHermesSession,
} from './hermes-session';

test('2h idle unbinds task and marks timeout for later media list reselect', () => {
  const now = new Date('2026-07-17T12:00:00.000Z');
  const before = {
    ...defaultHermesSession(new Date(now.getTime() - HERMES_IDLE_UNBIND_MS - 1000)),
    bindMode: 'bound' as const,
    taskId: 'task-1',
    section: 2 as const,
    recipeIndex: 1,
  };
  const session = applyIdleUnbind(before, now);
  assert.equal(session.bindMode, 'awaiting_task_pick');
  assert.equal(session.taskId, null);
  assert.equal(session.section, null);
  assert.equal(session.unboundByIdleTimeout, true);
  assert.equal(requiresMediaListReselect(session, true), true);
});

test('active bound session does not reselect lists on every media send', () => {
  const now = new Date('2026-07-17T12:00:00.000Z');
  const session = touchHermesSession({
    ...defaultHermesSession(now),
    bindMode: 'bound',
    taskId: 'task-1',
    section: 1,
    unboundByIdleTimeout: false,
  }, now);
  assert.equal(requiresMediaListReselect(session, true), false);
  assert.equal(requiresMediaListReselect(session, false), false);
});

test('1h section stale clears sticky codes but keeps task bound', () => {
  const now = new Date('2026-07-17T12:00:00.000Z');
  const stale = applySectionStale({
    ...defaultHermesSession(new Date(now.getTime() - HERMES_SECTION_STALE_MS - 1)),
    bindMode: 'bound',
    taskId: 'task-1',
    section: 3,
    comparisonObjectIndex: 1,
    comparisonItemIndex: 2,
  }, now);
  assert.equal(stale.taskId, 'task-1');
  assert.equal(stale.bindMode, 'bound');
  assert.equal(stale.section, null);
  assert.equal(requiresMediaListReselect(stale, true), false);
});

test('parses dual-mode nav codes and decline bind', () => {
  assert.deepEqual(parseHermesNavCode('不绑定'), { kind: 'decline_bind' });
  assert.deepEqual(parseHermesNavCode('1'), { kind: 'section', section: 1 });
  assert.deepEqual(parseHermesNavCode('21'), { kind: 'recipe', recipeIndex: 1 });
  assert.deepEqual(parseHermesNavCode('311'), { kind: 'comparison_cell', objectIndex: 1, itemIndex: 1 });
  assert.deepEqual(parseHermesNavCode('31'), { kind: 'comparison_object', objectIndex: 1 });
  assert.deepEqual(parseHermesNavCode('411'), { kind: 'matrix_leaf', categoryIndex: 1, leafIndex: 1 });
  assert.deepEqual(parseHermesNavCode('5'), { kind: 'task_pick', index: 5 });
});

test('task pick prompt and context line stay platform-bound', () => {
  assert.match(formatTaskPickPrompt([{ taskName: '测试任务1995' }]), /1\. 测试任务1995/);
  assert.match(formatTaskPickPrompt([]), /不绑定/);
  assert.match(
    describeHermesContext({
      ...defaultHermesSession(),
      bindMode: 'bound',
      taskId: 't1',
      section: 2,
      recipeIndex: 1,
    }, '蒸蛋器'),
    /蒸蛋器.*食谱\/功能 #1/,
  );
});
