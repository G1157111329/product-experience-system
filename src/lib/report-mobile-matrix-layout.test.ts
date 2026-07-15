import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ComparisonReportView } from '@/components/reports/comparison-report-view';
import { ReportDataMatrixReadView } from '@/components/reports/report-data-matrix-read-view';
import { MatrixV3Mobile } from '@/app/(main)/tasks/[id]/components/matrix-v3-mobile';
import type { V3MatrixProjection } from './matrix/v3-types';

// The app uses Next's automatic JSX runtime; tsx's direct SSR runner needs the classic global.
(globalThis as typeof globalThis & { React: typeof React }).React = React;
import {
  buildDesktopDataMatrixRows,
  buildMobileComparisonSections,
  buildMobileDataMatrixRows,
} from './report-mobile-matrix-layout';

function occurrences(source: string, token: string) {
  return source.split(token).length - 1;
}

const objects = Array.from({ length: 12 }, (_, index) => ({ id: `object-${index + 1}`, object_name: `对象${index + 1}` }));
const comparison = buildMobileComparisonSections({
  objects,
  item_nodes: [{ id: 'item-1', node_type: 'item', node_label: '长文本对比项目' }],
  cells: objects.map((object, index) => ({ item_node_id: 'item-1', object_id: object.id, effect_summary: `CMP_VALUE_${String(index + 1).padStart(2, '0')}` })),
});
const comparisonJson = JSON.stringify(comparison);
for (let index = 1; index <= 12; index += 1) {
  assert.equal(occurrences(comparisonJson, `CMP_VALUE_${String(index).padStart(2, '0')}`), 1, `comparison value ${index} appears exactly once`);
}

const columns = Array.from({ length: 12 }, (_, index) => ({
  id: `column-${index + 1}`,
  zone: index === 9 ? 'effect_media' : index === 10 ? 'evaluation' : index === 11 ? 'issue_point' : index >= 6 ? 'calculated' : 'input',
  label: `字段${index + 1}`,
  displayOrder: index + 1,
}));
const matrixFixture = {
  matrixProjectionVersion: 'v3',
  matrixId: 'matrix-1',
  matrixName: '十二列真实呈现',
  frozenAt: '2026-07-16T00:00:00.000Z',
  columns,
  rows: [{
    id: 'row-1', level1Label: '一级长文本', level2Label: '二级长文本',
    cells: Object.fromEntries(columns.map((column, index) => [
      column.id,
      index === 0 ? 0 : `DM_VALUE_${String(index + 1).padStart(2, '0')}`,
    ])),
  }],
  cellMedia: { 'row-1:column-10': [{ materialId: 'media-1', fileName: '效果图片', materialType: 'image', filePath: '/uploads/effect.jpg' }] },
  issuePoints: [{ id: 'issue-1', leafRowId: 'row-1', columnId: 'column-12', issueText: '唯一问题点', status: 'open' }],
  narratives: [],
  summary: { totalRows: 1, totalColumns: 12, filledCells: 12 },
};
const mobileDataRows = buildMobileDataMatrixRows(matrixFixture);
const desktopDataRows = buildDesktopDataMatrixRows(matrixFixture);
for (const [presentation, rows] of [['mobile', mobileDataRows], ['desktop', desktopDataRows]] as const) {
  const dataJson = JSON.stringify(rows);
  assert.equal(rows[0]?.groups[0]?.fields[0]?.value, 0, `${presentation} preserves numeric zero`);
  for (let index = 2; index <= 12; index += 1) {
    assert.equal(occurrences(dataJson, `DM_VALUE_${String(index).padStart(2, '0')}`), 1, `${presentation} value ${index} appears exactly once`);
  }
  assert.equal(occurrences(dataJson, 'DM_VALUE_10'), 1, `${presentation} keeps the effect-media raw cell value`);
  assert.equal(occurrences(dataJson, 'DM_VALUE_12'), 1, `${presentation} keeps the issue raw cell value`);
  assert.equal(occurrences(dataJson, '效果图片'), 1);
  assert.equal(occurrences(dataJson, '唯一问题点'), 1);
}
assert.equal(mobileDataRows[0]?.groups.some((group) => group.id === 'calculated'), true);
assert.equal(mobileDataRows[0]?.groups.some((group) => group.id === 'evaluation'), true);

function surface(markup: string, testId: string, nextTestId?: string) {
  const marker = `data-testid="${testId}"`;
  const markerIndex = markup.indexOf(marker);
  assert.notEqual(markerIndex, -1, `${testId} is rendered`);
  const start = markup.lastIndexOf('<div', markerIndex);
  const end = nextTestId ? markup.indexOf(`data-testid="${nextTestId}"`, markerIndex) : markup.length;
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  return markup.slice(start, end);
}

const dataMatrixMarkup = renderToStaticMarkup(React.createElement(ReportDataMatrixReadView, { projection: matrixFixture }));
const dataMobileMarkup = surface(dataMatrixMarkup, 'frozen-v3-matrix-mobile-reader', 'frozen-v3-matrix-desktop-table');
const dataDesktopMarkup = surface(dataMatrixMarkup, 'frozen-v3-matrix-desktop-table');
assert.match(dataMobileMarkup, /class="[^"]*md:hidden/);
assert.match(dataDesktopMarkup, /class="[^"]*hidden[^"]*md:block/);
for (const [presentation, markup] of [['mobile', dataMobileMarkup], ['desktop', dataDesktopMarkup]] as const) {
  assert.equal(occurrences(markup, '>0<'), 1, `${presentation} renders numeric zero exactly once`);
  for (let index = 2; index <= 12; index += 1) {
    assert.equal(occurrences(markup, `DM_VALUE_${String(index).padStart(2, '0')}`), 1, `${presentation} renders data token ${index} exactly once`);
  }
  assert.equal(occurrences(markup, 'DM_VALUE_10'), 1, `${presentation} renders effect raw value`);
  assert.ok(occurrences(markup, '效果图片') >= 1, `${presentation} renders effect media`);
  assert.equal(occurrences(markup, 'DM_VALUE_12'), 1, `${presentation} renders issue raw value`);
  assert.ok(occurrences(markup, '唯一问题点') >= 1, `${presentation} renders linked issue`);
}

const comparisonMarkup = renderToStaticMarkup(React.createElement(ComparisonReportView, {
  snapshot: {
    objects,
    item_nodes: [{ id: 'item-1', node_type: 'item', node_label: '长文本对比项目' }],
    cells: objects.map((object, index) => ({ item_node_id: 'item-1', object_id: object.id, effect_summary: `CMP_VALUE_${String(index + 1).padStart(2, '0')}` })),
  },
}));
const comparisonMobileMarkup = surface(comparisonMarkup, 'comparison-mobile-reader', 'comparison-desktop-table');
const comparisonDesktopMarkup = surface(comparisonMarkup, 'comparison-desktop-table');
assert.match(comparisonMobileMarkup, /class="[^"]*md:hidden/);
assert.match(comparisonDesktopMarkup, /class="[^"]*hidden[^"]*overflow-x-auto[^"]*md:block/);
for (let index = 1; index <= 12; index += 1) {
  const token = `CMP_VALUE_${String(index).padStart(2, '0')}`;
  assert.equal(occurrences(comparisonMobileMarkup, token), 1, `mobile comparison renders ${token} once`);
  assert.equal(occurrences(comparisonDesktopMarkup, token), 1, `desktop comparison renders ${token} once`);
}

const mobileEntryProjection = {
  matrix: { id: 'matrix-1', name: '矩阵', status: 'active', currentViewDefinitionId: null },
  viewDefinition: null,
  hierarchy: [],
  columns: [],
  rows: [
    { id: 'row-1', matrixId: 'matrix-1', level1NodeId: 'l1', level2NodeId: null, level3NodeId: null, visibleRowIndex: 0, groupRowIndex: 0, status: 'active', archivedAt: null },
    { id: 'row-2', matrixId: 'matrix-1', level1NodeId: 'l1', level2NodeId: null, level3NodeId: null, visibleRowIndex: 1, groupRowIndex: 1, status: 'active', archivedAt: null },
  ],
  cells: {}, styles: {}, narratives: [], issuePoints: [], formulas: [], cellMedia: {},
  summary: {
    totalLeafRows: 2,
    activeLeafRows: 2,
    totalColumns: 0,
    totalCells: 0,
    filledCells: 0,
    totalIssues: 0,
    hasSummary: false,
    hasNotes: false,
  },
} as V3MatrixProjection;
const mobileEntryMarkup = renderToStaticMarkup(React.createElement(MatrixV3Mobile, {
  matrixId: 'matrix-1',
  taskId: 'task-1',
  projection: mobileEntryProjection,
  onChanged: () => undefined,
  attemptNavigation: async (next) => { await next(); },
}));
assert.equal(occurrences(mobileEntryMarkup, 'min-h-11 min-w-11'), 2, 'both row navigation controls meet the 44px target');

console.log('mobile report matrix layout tests passed');
