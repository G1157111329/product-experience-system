import assert from 'node:assert/strict';
import { matrixLifecyclePatch } from './matrix-lifecycle';

const now = '2026-07-10T12:00:00.000Z';

assert.deepEqual(matrixLifecyclePatch('archive', now, 'user_delete'), {
  status: 'archived',
  archived_at: now,
  archived_reason: 'user_delete',
  updated_at: now,
});

assert.deepEqual(matrixLifecyclePatch('clear_and_archive', now, 'user_clear'), {
  status: 'archived',
  archived_at: now,
  archived_reason: 'user_clear',
  updated_at: now,
});

assert.deepEqual(matrixLifecyclePatch('restore', now), {
  status: 'active',
  archived_at: null,
  archived_reason: null,
  updated_at: now,
});

assert.equal(matrixLifecyclePatch('restore', now, undefined, 'designing').status, 'designing');

console.log('matrix lifecycle tests passed');
