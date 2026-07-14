import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildReportFrozenTabs } from './report-frozen-tabs';

const meaningfulV2Projection = {
  groups: [{
    rows: [{
      metrics: { temperature: { state: 'valid', value: 85 } },
      slots: { result: { status: 'pending' }, process: {}, issues: { count: 0 } },
      evidence: { primaryCount: 0, previewIds: [], media: [] },
    }],
  }],
};

const meaningfulV3Projection = {
  projectionVersion: 'v3',
  rows: [{ id: 'row-1', cells: { 'column-1': '85℃' } }],
};

const emptyV3Projection = {
  projectionVersion: 'v3',
  rows: [{ id: 'row-1', cells: { 'column-1': '' } }],
  cells: {},
  cellMedia: {},
  narratives: [],
  issuePoints: [],
};

const comparisonSnapshot = (cells: unknown[]) => ({
  objects: [{ id: 'object-1' }],
  item_nodes: [{ id: 'item-1' }],
  cells,
});

assert.deepEqual(buildReportFrozenTabs({
  reportType: 'single',
  dataMatrixProjection: meaningfulV2Projection,
  recipes: [],
}), ['summary', 'issues', 'data_matrix']);

assert.deepEqual(buildReportFrozenTabs({
  reportType: 'single',
  dataMatrixProjection: meaningfulV3Projection,
  recipes: [],
}), ['summary', 'issues', 'data_matrix']);

assert.deepEqual(buildReportFrozenTabs({
  reportType: 'comparison_report',
  comparisonSnapshot: comparisonSnapshot([{ effect_summary: '口感稳定' }]),
  recipes: [{}],
}), ['summary', 'issues', 'comparison_matrix', 'function_effect']);

assert.deepEqual(buildReportFrozenTabs({
  reportType: 'comparison_report',
  comparisonSnapshot: comparisonSnapshot([{ effect_summary: '口感稳定' }]),
  dataMatrixProjection: meaningfulV3Projection,
  recipes: [{}],
}), ['summary', 'issues', 'data_matrix', 'comparison_matrix', 'function_effect']);

assert.deepEqual(buildReportFrozenTabs({
  reportType: 'comparison_report',
  comparisonSnapshot: comparisonSnapshot([{ inline_media: [{ id: 'material-1' }] }]),
  recipes: [],
}), ['summary', 'issues', 'comparison_matrix']);

assert.deepEqual(buildReportFrozenTabs({
  reportType: 'comparison_report',
  comparisonSnapshot: { item_nodes: [{ id: 'item-1' }], cells: [{ effect_summary: '口感稳定' }] },
  recipes: [],
}), ['summary', 'issues']);

assert.deepEqual(buildReportFrozenTabs({
  reportType: 'comparison_report',
  comparisonSnapshot: { objects: [{ id: 'object-1' }], cells: [{ effect_summary: '口感稳定' }] },
  recipes: [],
}), ['summary', 'issues']);

assert.deepEqual(buildReportFrozenTabs({
  reportType: 'single',
  dataMatrixProjection: emptyV3Projection,
  recipes: [],
}), ['summary', 'issues']);

assert.deepEqual(buildReportFrozenTabs({
  reportType: 'comparison_report',
  comparisonSnapshot: comparisonSnapshot([{ effect_summary: ' ', inline_media: [] }]),
  recipes: [],
}), ['summary', 'issues']);

assert.deepEqual(buildReportFrozenTabs({
  reportType: 'single',
  dataMatrixProjection: null,
  recipes: [{}],
}), ['summary', 'issues', 'function_effect']);

const headerRouteSource = readFileSync(
  resolve(process.cwd(), 'src/app/api/reports/[id]/header/route.ts'),
  'utf8',
);
assert.match(headerRouteSource, /loadReportSnapshotWithLegacyErrorFallback/);
assert.doesNotMatch(headerRouteSource, /await loadAnchoredReportSnapshot\(/);

const reportPageSource = readFileSync(
  resolve(process.cwd(), 'src/app/(main)/reports/[id]/page.tsx'),
  'utf8',
);
assert.match(reportPageSource, /new AbortController\(\)/);
assert.match(reportPageSource, /setFrozenViewModel\(null\)/);
const frozenReaderSource = readFileSync(
  resolve(process.cwd(), 'src/components/reports/frozen-report-reader.tsx'),
  'utf8',
);
assert.match(frozenReaderSource, /resolveFrozenReportTab/);
assert.match(frozenReaderSource, /tabs\.includes\(current\)/);

console.log('report-frozen-tabs contract tests passed');
