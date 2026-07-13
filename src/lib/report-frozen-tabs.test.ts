import assert from 'node:assert/strict';
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
  comparisonSnapshot: { cells: [{ effect_summary: '口感稳定' }] },
  recipes: [{}],
}), ['summary', 'issues', 'comparison_matrix', 'function_effect']);

assert.deepEqual(buildReportFrozenTabs({
  reportType: 'comparison_report',
  comparisonSnapshot: { cells: [{ inline_media: [{ id: 'material-1' }] }] },
  recipes: [],
}), ['summary', 'issues', 'comparison_matrix']);

assert.deepEqual(buildReportFrozenTabs({
  reportType: 'single',
  dataMatrixProjection: emptyV3Projection,
  recipes: [],
}), ['summary', 'issues']);

assert.deepEqual(buildReportFrozenTabs({
  reportType: 'comparison_report',
  comparisonSnapshot: { cells: [{ effect_summary: ' ', inline_media: [] }] },
  recipes: [],
}), ['summary', 'issues']);

assert.deepEqual(buildReportFrozenTabs({
  reportType: 'single',
  dataMatrixProjection: null,
  recipes: [{}],
}), ['summary', 'issues', 'function_effect']);

console.log('report-frozen-tabs contract tests passed');
