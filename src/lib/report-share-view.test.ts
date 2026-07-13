import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { resolveFrozenReportTab } from '@/components/reports/frozen-report-reader';

assert.equal(resolveFrozenReportTab(['summary', 'issues'], 'issues'), 'issues');
assert.equal(resolveFrozenReportTab(['summary', 'issues'], 'comparison_matrix'), 'summary');
assert.equal(resolveFrozenReportTab(['issues'], 'summary'), 'issues');

const detailSource = readFileSync(resolve(process.cwd(), 'src/app/(main)/reports/[id]/page.tsx'), 'utf8');
const shareSource = readFileSync(resolve(process.cwd(), 'src/app/reports/share/[token]/page.tsx'), 'utf8');
const tabBarSource = readFileSync(resolve(process.cwd(), 'src/app/(main)/reports/[id]/components/report-tab-bar.tsx'), 'utf8');
const readerSource = readFileSync(resolve(process.cwd(), 'src/components/reports/frozen-report-reader.tsx'), 'utf8');
const stickyHeaderSource = readFileSync(resolve(process.cwd(), 'src/app/(main)/reports/[id]/components/report-sticky-header.tsx'), 'utf8');

for (const source of [detailSource, shareSource]) {
  assert.match(source, /import\s+\{\s*FrozenReportReader\s*\}/);
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
assert.match(stickyHeaderSource, /ReportShareDialog/);
assert.doesNotMatch(stickyHeaderSource, /expires_in/);

console.log('report share view contract tests passed');
