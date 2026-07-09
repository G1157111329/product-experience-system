import assert from 'node:assert/strict';
import { issueMaterialRows } from './report-issue-media';

const matched = issueMaterialRows(
  { id: 'issue-1', record_id: 'record-1', source_cell_id: 'cell-1' },
  [
    { id: 'm1', issue_id: 'issue-1' },
    { id: 'm2', record_id: 'record-1' },
    { id: 'm3', comparison_cell_id: 'cell-1' },
    { id: 'm3', comparison_cell_id: 'cell-1' },
    { id: 'm4', comparison_cell_id: 'other' },
  ],
);

assert.deepEqual(matched.map((item) => item.id), ['m1', 'm2', 'm3']);

console.log('report issue media tests passed');
