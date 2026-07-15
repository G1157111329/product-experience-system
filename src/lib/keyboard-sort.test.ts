import assert from 'node:assert/strict';
import { moveByKeyboard } from './keyboard-sort';

const items = ['A', 'B', 'C', 'D'];
assert.deepEqual(moveByKeyboard(items, 1, 'ArrowUp'), { items: ['B', 'A', 'C', 'D'], nextIndex: 0 });
assert.deepEqual(moveByKeyboard(items, 1, 'ArrowDown'), { items: ['A', 'C', 'B', 'D'], nextIndex: 2 });
assert.deepEqual(moveByKeyboard(items, 2, 'Home'), { items: ['C', 'A', 'B', 'D'], nextIndex: 0 });
assert.deepEqual(moveByKeyboard(items, 1, 'End'), { items: ['A', 'C', 'D', 'B'], nextIndex: 3 });
assert.deepEqual(moveByKeyboard(items, 0, 'ArrowUp'), { items, nextIndex: 0 });
assert.deepEqual(moveByKeyboard(items, 3, 'ArrowDown'), { items, nextIndex: 3 });
assert.deepEqual(items, ['A', 'B', 'C', 'D'], 'source array is never mutated');

console.log('keyboard sort tests passed');
