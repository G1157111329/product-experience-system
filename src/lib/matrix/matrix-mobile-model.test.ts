import assert from 'node:assert/strict';
import test from 'node:test';
import { buildMatrixMobileGroups, getAdjacentMatrixRowIndex } from './matrix-mobile-model';

const columns = [
  { id: 'input', columnZone: 'detail_dimension', dataType: 'text', isRequired: false, columnLabel: '输入指标' },
  { id: 'calculation', columnZone: 'calculation_dimension', dataType: 'formula', isRequired: false, columnLabel: '计算结果' },
  { id: 'media', columnZone: 'effect_media', dataType: 'media_slot', isRequired: false, columnLabel: '效果素材' },
  { id: 'evaluation', columnZone: 'evaluation', dataType: 'long_text', isRequired: true, columnLabel: '效果评价' },
  { id: 'issue', columnZone: 'issue_point', dataType: 'issue_point', isRequired: false, columnLabel: '问题点' },
] as const;

test('mobile matrix groups fields by input, calculation, media, evaluation and issues', () => {
  const groups = buildMatrixMobileGroups({
    columns,
    cells: {
      'row-1:input': { valueState: 'filled', valueText: '30 秒' },
      'row-1:calculation': { valueState: 'calculation_failed', valueText: null },
    },
    cellMedia: { 'row-1:media': [{ materialId: 'material-1' }] },
    issuePoints: [{ leafRowId: 'row-1', columnId: 'issue', issueText: '温度偏高' }],
    leafRowId: 'row-1',
  });

  assert.deepEqual(groups.map(({ id, defaultExpanded }) => ({ id, defaultExpanded })), [
    { id: 'input', defaultExpanded: true },
    { id: 'calculation', defaultExpanded: true },
    { id: 'media', defaultExpanded: true },
    { id: 'evaluation', defaultExpanded: true },
    { id: 'issue', defaultExpanded: true },
  ]);
});

test('mobile matrix collapses empty optional groups but keeps required groups expanded', () => {
  const groups = buildMatrixMobileGroups({
    columns,
    cells: {},
    cellMedia: {},
    issuePoints: [],
    leafRowId: 'row-1',
  });

  assert.deepEqual(groups.map(({ id, defaultExpanded }) => ({ id, defaultExpanded })), [
    { id: 'input', defaultExpanded: false },
    { id: 'calculation', defaultExpanded: false },
    { id: 'media', defaultExpanded: false },
    { id: 'evaluation', defaultExpanded: true },
    { id: 'issue', defaultExpanded: false },
  ]);
});

test('mobile matrix row navigation stops at the first and last row', () => {
  assert.equal(getAdjacentMatrixRowIndex(0, -1, 3), 0);
  assert.equal(getAdjacentMatrixRowIndex(1, -1, 3), 0);
  assert.equal(getAdjacentMatrixRowIndex(1, 1, 3), 2);
  assert.equal(getAdjacentMatrixRowIndex(2, 1, 3), 2);
});
