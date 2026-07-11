import assert from 'node:assert/strict';
import {
  hasMeaningfulComparisonCell,
  hasMeaningfulV2Projection,
  hasMeaningfulV3Projection,
} from './meaningful-content';

const comparison = (overrides: Record<string, unknown> = {}) => ({
  process_notes: '',
  problem_points: [],
  params: {},
  ...overrides,
});

const v2 = (overrides: Record<string, unknown> = {}) => ({
  matrix: { id: 'matrix-1', name: '结构', status: 'designing' },
  designVersion: { version: { id: 'version-1' }, sections: [] },
  groups: [],
  narratives: [],
  summary: { totalRows: 0, completedRows: 0, anomalousRows: 0, pendingIssueRows: 0, totalIssues: 0, totalEvidence: 0 },
  ...overrides,
});

const v2Row = (overrides: Record<string, unknown> = {}) => ({
  id: 'row-1',
  label: '结构行',
  values: {},
  primaryFields: [],
  evidenceCounts: {},
  issueCounts: {},
  hasCalculationFailures: false,
  hasMissingRequired: false,
  ...overrides,
});

const v3 = (overrides: Record<string, unknown> = {}) => ({
  matrix: { id: 'matrix-1', name: '结构', status: 'designing' },
  hierarchy: [],
  columns: [],
  rows: [],
  cells: {},
  styles: {},
  narratives: [],
  issuePoints: [],
  formulas: [],
  cellMedia: {},
  summary: { totalLeafRows: 1, activeLeafRows: 1, totalColumns: 1, totalCells: 1, filledCells: 0, totalIssues: 0, hasSummary: false, hasNotes: false },
  ...overrides,
});

assert.equal(hasMeaningfulComparisonCell(comparison()), false);
assert.equal(hasMeaningfulComparisonCell(comparison({ process_notes: '  ', problem_points: [' ', { text: '  ' }], params: { temperature: '  ' } })), false);
assert.equal(hasMeaningfulComparisonCell(comparison({ effect_summary: '口感稳定' })), true);
assert.equal(hasMeaningfulComparisonCell(comparison({ manual_score: '8.0' })), true);
assert.equal(hasMeaningfulComparisonCell(comparison({ ai_score: '7.5' })), true);
assert.equal(hasMeaningfulComparisonCell(comparison({ conclusion_tag: 'risk' })), true);
assert.equal(hasMeaningfulComparisonCell(comparison({ process_notes: '运行 20 分钟' })), true);
assert.equal(hasMeaningfulComparisonCell(comparison({ params: { temperature: 0 } })), true);
assert.equal(hasMeaningfulComparisonCell(comparison({ params: { enabled: false } })), true);

assert.equal(hasMeaningfulV2Projection(v2({ groups: [{ id: 'group-1', label: '分组', rows: [v2Row()] }] })), false);
assert.equal(hasMeaningfulV2Projection(v2({ groups: [{ id: 'group-1', label: '分组', rows: [v2Row({ values: { result: { state: 'missing', value: 0 } } })] }] })), false);
assert.equal(hasMeaningfulV2Projection(v2({ groups: [{ id: 'group-1', label: '分组', rows: [v2Row({ values: { result: { result_status: 'pending' } } })] }] })), false);
assert.equal(hasMeaningfulV2Projection(v2({ summary: { totalRows: 1, completedRows: 0, anomalousRows: 0, pendingIssueRows: 0, totalIssues: 0, totalEvidence: 0 } })), false);
assert.equal(hasMeaningfulV2Projection(v2({ groups: [{ rows: [v2Row({ values: { metric: { state: 'valid', value: 12000 } } })] }] })), true);
assert.equal(hasMeaningfulV2Projection(v2({ groups: [{ rows: [{ metrics: { temperature: { state: 'missing' } }, slots: { result: { status: 'pending' }, process: {}, issues: { count: 0 } }, evidence: { primaryCount: 0, previewIds: [], media: [] } }] }] })), false);
assert.equal(hasMeaningfulV2Projection(v2({ groups: [{ rows: [{ metrics: { temperature: { state: 'valid', value: 12000 } }, slots: { result: { status: 'pending' }, process: {}, issues: { count: 0 } }, evidence: { primaryCount: 0, previewIds: [], media: [] } }] }] })), true);
assert.equal(hasMeaningfulV2Projection(v2({ groups: [{ rows: [{ metrics: {}, slots: { result: { status: 'pass' }, process: {}, issues: { count: 0 } }, evidence: { primaryCount: 0, previewIds: [], media: [] } }] }] })), true);
assert.equal(hasMeaningfulV2Projection(v2({ groups: [{ rows: [{ metrics: {}, slots: { result: { status: 'pending' }, process: { note: '过程记录' }, issues: { count: 0 } }, evidence: { primaryCount: 0, previewIds: [], media: [] } }] }] })), true);
assert.equal(hasMeaningfulV2Projection(v2({ groups: [{ rows: [{ metrics: {}, slots: { result: { status: 'pending' }, process: {}, issues: { count: 1 } }, evidence: { primaryCount: 0, previewIds: [], media: [] } }] }] })), true);
assert.equal(hasMeaningfulV2Projection(v2({ groups: [{ rows: [{ metrics: {}, slots: { result: { status: 'pending' }, process: {}, issues: { count: 0 } }, evidence: { primaryCount: 1, previewIds: [], media: [] } }] }] })), true);
assert.equal(hasMeaningfulV2Projection(v2({ groups: [{ rows: [{ metrics: {}, slots: { result: { status: 'pending' }, process: {}, issues: { count: 0 } }, evidence: { primaryCount: 0, previewIds: ['material-1'], media: [] } }] }] })), true);
assert.equal(hasMeaningfulV2Projection(v2({ groups: [{ rows: [{ metrics: {}, slots: { result: { status: 'pending' }, process: {}, issues: { count: 0 } }, evidence: { primaryCount: 0, previewIds: [], media: [{ id: 'material-1' }] } }] }] })), true);
assert.equal(hasMeaningfulV2Projection(v2({ groups: [{ rows: [v2Row({ values: { metric: { valueState: 'filled', numericValue: 12000 } } })] }] })), true);
assert.equal(hasMeaningfulV2Projection(v2({ groups: [{ rows: [v2Row({ values: { metric: { valueState: 'missing', numericValue: 12000 } } })] }] })), false);
assert.equal(hasMeaningfulV2Projection(v2({ groups: [{ rows: [v2Row({ values: { metric: { valueState: 'filled' } } })] }] })), false);
assert.equal(hasMeaningfulV2Projection(v2({ groups: [{ rows: [v2Row({ values: { metric: { valueState: 'filled', textValue: '   ' } } })] }] })), false);
assert.equal(hasMeaningfulV2Projection(v2({ groups: [{ rows: [v2Row({ values: { metric: { valueState: 'filled', numericValue: 0 } } })] }] })), true);
assert.equal(hasMeaningfulV2Projection(v2({ groups: [{ rows: [v2Row({ values: { metric: { valueState: 'filled', booleanValue: false } } })] }] })), true);
assert.equal(hasMeaningfulV2Projection(v2({ groups: [{ rows: [v2Row({ values: { metric: { valueState: 'filled', durationMs: 0 } } })] }] })), true);
assert.equal(hasMeaningfulV2Projection(v2({ groups: [{ rows: [v2Row({ values: { metric: { valueState: 'filled', textValue: '备注' } } })] }] })), true);
assert.equal(hasMeaningfulV2Projection(v2({ groups: [{ rows: [v2Row({ values: { metric: { valueState: 'filled', enumValue: 'pass' } } })] }] })), true);
assert.equal(hasMeaningfulV2Projection(v2({ groups: [{ rows: [v2Row({ values: { metric: { valueState: 'filled', dateTimeValue: '2026-07-11T00:00:00Z' } } })] }] })), true);
assert.equal(hasMeaningfulV2Projection(v2({ groups: [{ rows: [v2Row({ slots: { result: { summary: '结论' }, process: {}, issues: { count: 0 } } })] }] })), true);
assert.equal(hasMeaningfulV2Projection(v2({ groups: [{ rows: [v2Row({ slots: { result: {}, process: { note: '过程记录' }, issues: { count: 0 } } })] }] })), true);
assert.equal(hasMeaningfulV2Projection(v2({ summary: { totalIssues: 1 } })), true);
assert.equal(hasMeaningfulV2Projection(v2({ summary: { totalEvidence: 1 } })), true);

assert.equal(hasMeaningfulV3Projection(v3()), false);
assert.equal(hasMeaningfulV3Projection(v3({ summary: { filledCells: 0 } })), false);
assert.equal(hasMeaningfulV3Projection(v3({ cells: { 'row-1:col-1': { id: 'cell-1', valueState: 'filled', valueText: '85℃' } } })), true);
assert.equal(hasMeaningfulV3Projection(v3({ rows: [{ id: 'row-1', cells: { 'col-1': '' } }] })), false);
assert.equal(hasMeaningfulV3Projection(v3({ rows: [{ id: 'row-1', cells: { 'col-1': '85℃' } }] })), true);
assert.equal(hasMeaningfulV3Projection(v3({ cellMedia: { 'row-1:col-1': [{ materialId: 'material-1' }] } })), true);
assert.equal(hasMeaningfulV3Projection(v3({ narratives: [{ id: 'n-1', blockType: 'summary', content: '总体表现稳定' }] })), true);
assert.equal(hasMeaningfulV3Projection(v3({ issuePoints: [{ id: 'issue-1', issueText: '温度偏高' }] })), true);

console.log('meaningful-content contract tests passed');
