import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ReportDataMatrixReadView } from '@/components/reports/report-data-matrix-read-view';
import { freezeV3MatrixForReport } from './report-projection-v3-adapter';
import type { V3MatrixProjection } from './v3-types';

const hierarchyRoute = readFileSync(
  'src/app/api/v1/matrices/[id]/hierarchy-nodes/route.ts',
  'utf8',
);
const gridSource = readFileSync(
  'src/app/(main)/tasks/[id]/components/matrix-v3-grid.tsx',
  'utf8',
);
const bootstrapSource = readFileSync('src/lib/matrix/bootstrap-v3.ts', 'utf8');
(globalThis as typeof globalThis & { React: typeof React }).React = React;

function projectionWithZeroDecimalFormula(): V3MatrixProjection {
  return {
    matrix: { id: 'matrix-1', name: '测试矩阵', status: 'active', currentViewDefinitionId: 'view-1' },
    viewDefinition: null,
    hierarchy: [],
    columns: [{
      id: 'formula-column', matrixId: 'matrix-1', columnZone: 'calculation_dimension', zoneRole: 'I',
      columnLabel: '计算结果', dataType: 'formula', unitText: null, displayOrder: 1,
      desktopWidthPx: 120, minWidthPx: null, maxWidthPx: null, isPinned: false, isRequired: false,
      showInReport: true, maxMediaCount: null, resultFormat: null, decimalPlaces: 0, archivedAt: null,
    }],
    rows: [{
      id: 'row-1', matrixId: 'matrix-1', level1NodeId: 'level-1', level2NodeId: null, level3NodeId: null,
      visibleRowIndex: 1, groupRowIndex: 1, status: 'active', archivedAt: null,
    }],
    cells: {
      'row-1:formula-column': {
        id: 'cell-1', leafRowId: 'row-1', columnId: 'formula-column', valueText: null,
        valueNumber: '7.375', valueDurationSeconds: null, valuePercentage: null, displayText: null,
        valueState: 'filled', errorCode: null, version: 1,
      },
    },
    styles: {}, narratives: [], issuePoints: [], formulas: [], cellMedia: {},
    summary: { totalLeafRows: 1, activeLeafRows: 1, totalColumns: 1, totalCells: 1, filledCells: 1, totalIssues: 0, hasSummary: false, hasNotes: false },
  };
}

test('freezes numeric and calculated columns using their configured decimal places', () => {
  const frozen = freezeV3MatrixForReport(projectionWithZeroDecimalFormula());
  assert.equal(frozen.columns[0]?.decimalPlaces, 0);
  assert.equal(frozen.rows[0]?.cells['formula-column'], '7');
});

test('freezes matrix issue link identity without relying on its title', () => {
  const projection = projectionWithZeroDecimalFormula();
  projection.issuePoints = [{
    id: 'matrix-point-1', matrixId: 'matrix-1', leafRowId: 'row-1', columnId: 'formula-column',
    issueText: 'same text can appear in another cell', linkedIssueId: 'issue-1', status: 'converted',
  }];
  const frozen = freezeV3MatrixForReport(projection);
  assert.deepEqual(frozen.issuePoints[0] && {
    sourceCellId: frozen.issuePoints[0].sourceCellId,
    linkedIssueId: frozen.issuePoints[0].linkedIssueId,
  }, { sourceCellId: 'matrix-point-1', linkedIssueId: 'issue-1' });
});

test('forbids new third-level hierarchy creation and removes it from new V3 authoring', () => {
  assert.match(hierarchyRoute, /level === 3[\s\S]{0,240}status:\s*422/);
  assert.doesNotMatch(gridSource, /InlineNewLevel3/);
  assert.doesNotMatch(bootstrapSource, /zoneRole:\s*'C'/);
  assert.match(bootstrapSource, /maxHierarchyLevel:\s*2/);
});

test('does not render historical third-level labels in the frozen data matrix table', () => {
  const frozen = freezeV3MatrixForReport(projectionWithZeroDecimalFormula());
  frozen.rows[0].level1Label = '一级大类';
  frozen.rows[0].level2Label = '二级细项';
  frozen.rows[0].level3Label = '历史三级不应展示';
  const markup = renderToStaticMarkup(React.createElement(ReportDataMatrixReadView, { projection: frozen }));
  assert.match(markup, /一级大类/);
  assert.match(markup, /二级细项/);
  assert.doesNotMatch(markup, /历史三级不应展示/);
});

test('requires a same-matrix level-one parent when adding a level-two item', () => {
  assert.match(hierarchyRoute, /level === 2[\s\S]{0,1200}parentId/);
  assert.match(hierarchyRoute, /parent\.matrixId !== matrixId/);
  assert.match(hierarchyRoute, /parent\.nodeType !== 'level_1'/);
});
