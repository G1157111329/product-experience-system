import assert from 'node:assert/strict';
import test from 'node:test';
import { hasMeaningfulActiveComparison, hasMeaningfulActiveMatrix } from './task-header-status';

test('task header ignores archived and empty data matrices', () => {
  assert.equal(hasMeaningfulActiveMatrix([
    { status: 'archived', meaningful: true },
    { status: 'active', meaningful: false },
  ]), false);
  assert.equal(hasMeaningfulActiveMatrix([{ status: 'active', meaningful: true }]), true);
});

test('task header ignores an empty comparison shell but accepts saved cell content', () => {
  assert.equal(hasMeaningfulActiveComparison({ status: 'active', cells: [{ effect_summary: '  ' }] }), false);
  assert.equal(hasMeaningfulActiveComparison({ status: 'active', cells: [{ manual_score: 0 }] }), true);
});
