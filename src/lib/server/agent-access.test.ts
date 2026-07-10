import assert from 'node:assert/strict';
import { canAccessConversationRow } from './agent-access';

assert.equal(canAccessConversationRow({ id: 'u1', role: 'user' }, { platformUserId: 'u1' }), true);
assert.equal(canAccessConversationRow({ id: 'u1', role: 'user' }, { platformUserId: 'u2' }), false);
assert.equal(canAccessConversationRow({ id: 'a1', role: 'admin' }, { platformUserId: 'u2' }), true);
assert.equal(canAccessConversationRow({ id: 'u1', role: 'user' }, { platformUserId: null }), false);

console.log('agent access tests passed');
