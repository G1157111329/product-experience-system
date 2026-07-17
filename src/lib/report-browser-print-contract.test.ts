import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { PRINT_TYPOGRAPHY } from './report-print-theme';

const source = readFileSync('src/components/reports/report-section-block-renderer.tsx', 'utf8');

test('browser print blocks fit their frozen tables without internal horizontal scrolling', () => {
  assert.doesNotMatch(source, /overflowX:\s*['"]auto['"]/);
  assert.doesNotMatch(source, /overflow-x-auto/);
  assert.doesNotMatch(source, /minWidth:\s*['"]520px['"]/);
});

test('browser print V3 matrix only outputs the frozen two-level hierarchy', () => {
  assert.doesNotMatch(source, /level3Label/);
  assert.doesNotMatch(source, /<th[^>]*>三级<\/th>/);
  assert.doesNotMatch(source, /\['一级大类', '二级细项', '三级细项'\]/);
});

test('browser print uses the comparison matrix source label and does not duplicate recipe issue details', () => {
  assert.match(source, /comparison:\s*'食谱\/功能-对比矩阵'/);
  assert.doesNotMatch(source, /relatedIssues/);
});

test('browser print video poster fails to a labeled stable placeholder', () => {
  assert.match(source, /function PaperVideoPoster/);
  assert.match(source, /onError=\{\(\) => setPosterFailed\(true\)\}/);
  assert.match(source, /视频预览不可用/);
});

test('browser print preserves comparison category and summary rows', () => {
  assert.match(source, /data-testid="print-comparison-group-row"/);
  assert.match(source, /data-testid="print-comparison-summary-row"/);
  assert.match(source, /row\.summaryText/);
});

test('matrix evidence is a compact horizontal strip that stays inside the paper cell', () => {
  assert.match(source, /density="compact"/);
  assert.match(source, /data-testid="paper-media-grid"/);
  assert.match(source, /maxWidth:\s*'100%'/);
  assert.match(source, /overflow:\s*'hidden'/);
});

test('function effects use the frozen recipe report hierarchy', () => {
  assert.match(source, /data-testid="print-function-card"/);
  assert.match(source, /data-testid="print-function-metrics"/);
  assert.match(source, /data-testid="print-function-step"/);
  assert.match(source, /食谱\/食材/);
});

test('browser print uses the canonical frozen structured summary', () => {
  assert.match(source, /printSummaryContent\(model\.summary\)/);
  assert.match(source, /主要优势/);
  assert.match(source, /主要风险/);
  assert.match(source, /后续建议/);
});

test('browser print media does not display material names', () => {
  assert.doesNotMatch(source, /<figcaption\b/);
});

test('print typography has a stable readable hierarchy', () => {
  assert.ok(PRINT_TYPOGRAPHY.title > PRINT_TYPOGRAPHY.sectionTitle);
  assert.ok(PRINT_TYPOGRAPHY.sectionTitle > PRINT_TYPOGRAPHY.subsectionTitle);
  assert.ok(PRINT_TYPOGRAPHY.subsectionTitle > PRINT_TYPOGRAPHY.body);
  assert.ok(PRINT_TYPOGRAPHY.body >= 11);
});
