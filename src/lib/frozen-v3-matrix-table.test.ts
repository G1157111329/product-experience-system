import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ReportDataMatrixReadView } from '@/components/reports/report-data-matrix-read-view';

(globalThis as typeof globalThis & { React: typeof React }).React = React;

const projection = {
  matrixProjectionVersion: 'v3',
  matrixId: 'matrix-render-test',
  matrixName: '冻结矩阵',
  frozenAt: '2026-07-16T00:00:00.000Z',
  columns: [
    { id: 'input', zone: 'input', label: '输入字段', displayOrder: 1 },
    { id: 'effect', zone: 'effect_media', label: '效果素材', displayOrder: 2 },
    { id: 'issue', zone: 'issue_point', label: '问题点', displayOrder: 3 },
  ],
  rows: [
    { id: 'row-1', level1Label: '一级大类', level2Label: '二级细项 A', level3Label: '不应展示的三级', cells: { input: 0, effect: '效果原值', issue: '问题原值' } },
    { id: 'row-2', level1Label: '一级大类', level2Label: '二级细项 B', level3Label: '不应展示的三级', cells: { input: '第二行', effect: '', issue: '' } },
  ],
  cellMedia: {
    'row-1:effect': [{ materialId: 'media-1', fileName: '效果图片', materialType: 'image', filePath: '/uploads/effect.jpg' }],
  },
  issuePoints: [{ id: 'issue-1', leafRowId: 'row-1', columnId: 'issue', issueText: '真实问题', status: 'open' }],
  narratives: [{ blockType: 'summary', content: '冻结矩阵小结', showInReport: true }],
  summary: { totalRows: 2, totalColumns: 3, filledCells: 4 },
};

const markup = renderToStaticMarkup(React.createElement(ReportDataMatrixReadView, { projection }));
const desktopMarker = markup.indexOf('data-testid="frozen-v3-matrix-desktop-table"');
assert.notEqual(desktopMarker, -1);
const desktopStart = markup.lastIndexOf('<div', desktopMarker);
const desktop = markup.slice(desktopStart);

test('frozen V3 report matrix renders a merged first-level category and complete production table', () => {
  assert.match(markup, /data-testid="frozen-v3-matrix-table"/);
  assert.match(desktop, /rowSpan="2"[^>]*scope="rowgroup"/);
  assert.equal((desktop.match(/<table/g) || []).length, 1);
  assert.match(desktop, /效果图片/);
});

test('frozen V3 report matrix renders the two report hierarchy levels without level-three text', () => {
  assert.match(desktop, /一级大类/);
  assert.match(desktop, /二级细项 A/);
  assert.doesNotMatch(desktop, /不应展示的三级/);
});

test('frozen V3 report matrix renders one header and unprefixed issue content', () => {
  assert.equal((desktop.match(/<thead/g) || []).length, 1);
  assert.match(desktop, />真实问题</);
  assert.doesNotMatch(desktop, /待整改[^<]*真实问题/);
});

test('frozen V3 report matrix keeps raw issue/media values and summary inside the table', () => {
  assert.match(desktop, />效果原值</);
  assert.match(desktop, />问题原值</);
  assert.match(desktop, /真实问题/);
  assert.match(desktop, /冻结矩阵小结/);
});

test('frozen V3 report matrix fills report width without a horizontal scroll rail', () => {
  assert.match(markup, /\[container-type:inline-size\]/);
  assert.match(desktop, /class="[^"]*w-full[^"]*table-fixed/);
  assert.doesNotMatch(desktop, /overflow-x-auto/);
});

test('frozen V3 report matrix uses dense responsive cells and preserves numeric zero', () => {
  assert.match(desktop, /table-fixed border-collapse text-xs/);
  assert.match(desktop, /\[@container\(max-width:720px\)\]:px-1/);
  assert.equal((desktop.match(/>0</g) || []).length, 1);
});
