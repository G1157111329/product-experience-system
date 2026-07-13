import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { orderedFrozenModels, resolveFrozenReportTab } from '@/components/reports/frozen-report-reader';
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
