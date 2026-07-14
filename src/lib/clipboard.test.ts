import assert from 'node:assert/strict';
import test from 'node:test';
import { isLegacyCopyConfirmed } from './clipboard';

test('does not treat a legacy copy command without a clipboard write event as success', () => {
  assert.equal(isLegacyCopyConfirmed(true, false), false);
});

test('accepts a legacy copy only when both the command and clipboard write succeed', () => {
  assert.equal(isLegacyCopyConfirmed(true, true), true);
  assert.equal(isLegacyCopyConfirmed(false, true), false);
});
