import assert from 'node:assert/strict';
import { createBindingState, verifyBindingState } from './binding-state';

const secret = 'test-secret-with-enough-entropy';
const state = createBindingState({ sessionId: 's1', provider: 'wecom', expiresAt: 2000 }, secret);

assert.deepEqual(verifyBindingState(state, secret, 1500), {
  sessionId: 's1',
  provider: 'wecom',
  expiresAt: 2000,
});
assert.equal(verifyBindingState(state, secret, 2001), null);
assert.equal(verifyBindingState(`${state}tampered`, secret, 1500), null);

console.log('binding state tests passed');
