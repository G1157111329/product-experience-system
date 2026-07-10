import assert from 'node:assert/strict';
import { getInlineEditKeyAction } from './inline-editable';

assert.equal(getInlineEditKeyAction('Enter', false, false), 'save');
assert.equal(getInlineEditKeyAction('Enter', true, false), 'none');
assert.equal(getInlineEditKeyAction('Enter', false, true), 'none');
assert.equal(getInlineEditKeyAction('Escape', false, false), 'cancel');
assert.equal(getInlineEditKeyAction('a', false, false), 'none');

console.log('inline editable key handling tests passed');
