import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  FrozenReportReader,
  frozenReaderDomPrefix,
  orderedFrozenModels,
  resolveFrozenReportTab,
} from '@/components/reports/frozen-report-reader';
import type { FrozenReportViewModel } from './report-frozen-view';

assert.equal(resolveFrozenReportTab(['summary', 'issues'], 'issues'), 'issues');
assert.equal(resolveFrozenReportTab(['summary', 'issues'], 'comparison_matrix'), 'summary');
assert.equal(resolveFrozenReportTab(['issues'], 'summary'), 'issues');
assert.equal(resolveFrozenReportTab(['summary', 'issues'], 'issues', true), 'summary');

const model = (id: string) => ({ header: { id } }) as FrozenReportViewModel;
assert.deepEqual(
  orderedFrozenModels(model('primary'), [{ id: 's2' }, { id: 's1' }], { s1: model('s1'), s2: model('s2') })
    .map((item) => item.header.id),
  ['primary', 's2', 's1'],
);

const safePrefix = frozenReaderDomPrefix('报告 id/with spaces', ':r1:');
assert.match(safePrefix, /^[a-z][a-z0-9-]*$/);
assert.notEqual(safePrefix, frozenReaderDomPrefix('报告 id/with spaces', ':r2:'));

const repeatedModel = {
  snapshotResolution: 'anchored',
  header: { id: 'same report/id', title: 'Repeated', reportType: 'single_report', status: 'published', productModel: null },
  tabs: ['summary', 'issues'],
  summary: { text: 'Summary', aiSummary: null },
  issues: [],
  matrix: null,
  functionEffects: [],
  capabilities: { canManageIssues: false, canShare: false, canExport: true },
} as FrozenReportViewModel;
const repeatedMarkup = renderToStaticMarkup(createElement('div', null,
  createElement(FrozenReportReader, { model: repeatedModel }),
  createElement(FrozenReportReader, { model: repeatedModel }),
));
const ids = [...repeatedMarkup.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
assert.equal(new Set(ids).size, ids.length, 'multiple readers must not emit duplicate DOM ids');
for (const controls of repeatedMarkup.matchAll(/aria-controls="([^"]+)"/g)) {
  assert.equal(ids.filter((id) => id === controls[1]).length, 1, `aria-controls must resolve once: ${controls[1]}`);
}
for (const labelledBy of repeatedMarkup.matchAll(/aria-labelledby="([^"]+)"/g)) {
  assert.equal(ids.filter((id) => id === labelledBy[1]).length, 1, `aria-labelledby must resolve once: ${labelledBy[1]}`);
}

const detailSource = readFileSync(resolve(process.cwd(), 'src/app/(main)/reports/[id]/page.tsx'), 'utf8');
const shareSource = readFileSync(resolve(process.cwd(), 'src/app/reports/share/[token]/page.tsx'), 'utf8');
const tabBarSource = readFileSync(resolve(process.cwd(), 'src/app/(main)/reports/[id]/components/report-tab-bar.tsx'), 'utf8');
const readerSource = readFileSync(resolve(process.cwd(), 'src/components/reports/frozen-report-reader.tsx'), 'utf8');
const stickyHeaderSource = readFileSync(resolve(process.cwd(), 'src/app/(main)/reports/[id]/components/report-sticky-header.tsx'), 'utf8');

for (const source of [detailSource, shareSource]) {
  assert.match(source, /import\s+\{[^}]*FrozenReportReader[^}]*\}/);
  assert.match(source, /<FrozenReportReader/);
  assert.match(source, /frozenViewModel/);
}
assert.doesNotMatch(shareSource, /\{false\s*&&/);
assert.match(tabBarSource, /role=["']tablist["']/);
assert.match(tabBarSource, /role=["']tab["']/);
assert.match(tabBarSource, /aria-selected=/);
assert.match(tabBarSource, /aria-controls=/);
assert.match(tabBarSource, /ArrowRight/);
assert.match(tabBarSource, /ArrowLeft/);
assert.match(readerSource, /liveOverlay\.reEvaluations/);
assert.match(readerSource, /effect\.steps/);
assert.match(readerSource, /effect\.problemPoints/);
assert.match(readerSource, /ReportMatrixTab/);
assert.match(readerSource, /MediaGallery/);
assert.doesNotMatch(readerSource, /<img\s+src=\{item\.url\}/);
assert.match(stickyHeaderSource, /ReportShareDialog/);
assert.doesNotMatch(stickyHeaderSource, /expires_in/);
assert.match(shareSource, /siblingFrozenViewModels/);
assert.match(shareSource, /siblingReports/);
assert.match(shareSource, /canExport/);
assert.match(shareSource, /导出PDF/);
assert.match(shareSource, /share_token/);

console.log('report share view contract tests passed');
