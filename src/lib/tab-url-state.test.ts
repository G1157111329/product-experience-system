import assert from 'node:assert/strict';
import { withActiveTabSearch } from './tab-url-state';

assert.equal(withActiveTabSearch('record_id=record-1&tab=info', 'senses'), 'record_id=record-1&tab=senses');
assert.equal(withActiveTabSearch('', 'issues'), 'tab=issues');
assert.equal(withActiveTabSearch('tab=summary&share=1', 'issues'), 'tab=issues&share=1');

console.log('tab URL state tests passed');
