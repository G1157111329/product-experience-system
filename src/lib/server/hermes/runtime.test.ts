import assert from 'node:assert/strict';
import test from 'node:test';

// @ts-expect-error Node's direct TypeScript test runner needs the source extension.
import { HERMES_RUN_MAX_TOKENS } from './runtime.ts';

test('Hermes reserves enough completion tokens for a reasoning model to emit the final action JSON', () => {
  assert.ok(HERMES_RUN_MAX_TOKENS >= 6400);
});
