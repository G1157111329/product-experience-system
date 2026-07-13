import assert from 'node:assert/strict';
import { dataMatrixReadLayout } from './report-data-matrix-layout';

const v2 = {
  matrixId: 'matrix-v2',
  schema: {
    name: '原汁机数据矩阵',
    dimensions: [
      { dimensionKey: 'temperature', displayName: '温度', columnGroup: 'observed' },
      { dimensionKey: 'yield', displayName: '出汁率', columnGroup: 'calculated' },
      { dimensionKey: 'evaluation', displayName: '效果评价', columnGroup: 'observed' },
      { dimensionKey: 'empty', displayName: '空字段', columnGroup: 'observed' },
    ],
  },
  viewport: { totalGroups: 1, totalRows: 1 },
  groups: [{
    id: 'group-v2',
    label: '苹果组',
    conditionSummary: '室温静置 30 分钟',
    rows: [{
      id: 'row-v2',
      subject: { label: '样品 A' },
      metrics: {
        temperature: { display: '25℃' },
        yield: { value: 0 },
        evaluation: { text: '透彻' },
        empty: { text: '' },
      },
      slots: {
        result: { summary: '效果稳定' },
        process: { note: '运行无抖动' },
        issues: { count: 1, severitySummary: ['出汁口滴液'] },
      },
      evidence: {
        primaryCount: 1,
        media: [{ id: 'media-v2', name: '出汁效果.jpg', type: 'image', url: '/uploads/v2.jpg' }],
      },
    }],
  }],
};

const v3 = {
  matrixProjectionVersion: 'v3',
  matrixId: 'matrix-v3',
  matrixName: '破壁机数据矩阵',
  frozenAt: '2026-07-13T00:00:00.000Z',
  columns: [
    { id: 'input', zone: 'detail_dimension', label: '温度', unitText: '℃', displayOrder: 1 },
    { id: 'calc', zone: 'calculation_dimension', label: '出汁率', unitText: '%', displayOrder: 2 },
    { id: 'evaluation', zone: 'evaluation', label: '效果评价', displayOrder: 3 },
    { id: 'empty', zone: 'detail_dimension', label: '空字段', displayOrder: 4 },
    { id: 'media', zone: 'effect_media', label: '效果素材', displayOrder: 5 },
  ],
  rows: [{
    id: 'row-v3',
    level1Label: '使用效果',
    level2Label: '出汁表现',
    level3Label: '苹果',
    visibleRowIndex: 1,
    cells: { input: '0', calc: '0%', evaluation: '清透', empty: '', media: '' },
  }],
  cellMedia: {
    'row-v3:media': [{ materialId: 'media-v3', materialType: 'image', fileName: '清透度.jpg', fileUrl: '/uploads/v3.jpg' }],
  },
  narratives: [{ blockType: 'summary', content: '整体表现稳定', showInReport: true }],
  issuePoints: [{ id: 'issue-v3', leafRowId: 'row-v3', columnId: 'evaluation', leafRowIndex: 1, issueText: '果渣偏多', status: 'open', materialIds: ['media-v3'] }],
  summary: { totalRows: 1, totalColumns: 5, filledCells: 3 },
};

const v2Layout = dataMatrixReadLayout(v2);
assert.equal(v2Layout.title, '原汁机数据矩阵');
assert.equal(v2Layout.cards.length, 1);
assert.deepEqual(v2Layout.cards[0]?.path, ['苹果组', '样品 A']);
assert.deepEqual(v2Layout.cards[0]?.fields.map((field) => [field.label, field.group]), [
  ['温度', 'inputs'],
  ['出汁率', 'calculated'],
  ['效果评价', 'evaluation'],
  ['效果结论', 'evaluation'],
]);
assert.equal(v2Layout.cards[0]?.fields.find((field) => field.label === '出汁率')?.value, 0);
assert.equal(v2Layout.cards[0]?.fields.some((field) => field.value === ''), false);
assert.deepEqual(v2Layout.cards[0]?.issues.map((issue) => issue.text), ['出汁口滴液']);
assert.deepEqual(v2Layout.cards[0]?.media.map((item) => item.url), ['/uploads/v2.jpg']);
assert.deepEqual(v2Layout.cards[0]?.narratives.map((item) => item.text), ['室温静置 30 分钟', '运行无抖动']);

const v3Layout = dataMatrixReadLayout(v3);
assert.equal(v3Layout.title, '破壁机数据矩阵');
assert.deepEqual(v3Layout.cards[0]?.path, ['使用效果', '出汁表现', '苹果']);
assert.deepEqual(v3Layout.cards[0]?.fields.map((field) => [field.label, field.group]), [
  ['温度', 'inputs'],
  ['出汁率', 'calculated'],
  ['效果评价', 'evaluation'],
]);
assert.equal(v3Layout.cards[0]?.fields.find((field) => field.label === '温度')?.value, '0');
assert.equal(v3Layout.cards[0]?.fields.some((field) => field.value === ''), false);
assert.deepEqual(v3Layout.cards[0]?.issues.map((issue) => [issue.text, issue.status]), [['果渣偏多', 'open']]);
assert.deepEqual(v3Layout.cards[0]?.media.map((item) => item.url), ['/uploads/v3.jpg']);
assert.deepEqual(v3Layout.narratives.map((item) => item.text), ['整体表现稳定']);

console.log('report data matrix read layout tests passed');
