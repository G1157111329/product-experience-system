import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const printSource = readFileSync(resolve(process.cwd(), 'src/app/reports/print/page.tsx'), 'utf8');

assert.match(printSource, /buildPrintReportViewModel/);
assert.match(printSource, /frozenViewModel/);
assert.match(printSource, /ReportPrintDocument/);
assert.doesNotMatch(printSource, /fetch\(`\/api\/reports\/\$\{rpt\.id\}\/issues`/);
assert.doesNotMatch(printSource, /fetch\(`\/api\/issue-re-evaluations/);
assert.doesNotMatch(printSource, /PrintInlineMatrix/);
assert.doesNotMatch(printSource, /ReportPrintSectionBlocks/);
assert.doesNotMatch(printSource, /overflowX:\s*['"]auto['"]/);
assert.doesNotMatch(printSource, /<video\b/);
assert.doesNotMatch(printSource, /role=['"]tab/);

const paperRendererSource = readFileSync(resolve(process.cwd(), 'src/components/reports/report-section-block-renderer.tsx'), 'utf8');
assert.doesNotMatch(paperRendererSource, /#0f766e|#0f4c45/i, 'browser print must not retain legacy Teal report accents');
assert.match(paperRendererSource, /PRINT_GOLDEN_YELLOW/, 'browser print must consume the shared Golden Yellow print token');
assert.match(paperRendererSource, /cell\.notes/);
assert.match(paperRendererSource, /cell\.problems/, '矩阵单元格问题能力必须保留');
assert.match(paperRendererSource, /row\.issueSummary/);
assert.doesNotMatch(paperRendererSource, /paperProblemTexts\(effect\.problemPoints\)/);
assert.doesNotMatch(paperRendererSource, /effect\.problemPoints/);
assert.doesNotMatch(paperRendererSource, /effect\.score/);
assert.doesNotMatch(paperRendererSource, /effect\.effectScore/);
assert.match(paperRendererSource, /evaluationStatusLabel\(effect\.evaluationStatus\)/);
assert.match(paperRendererSource, /食谱效果评价/);
assert.match(paperRendererSource, /step\.problemPoints/);
assert.doesNotMatch(paperRendererSource, /relatedIssues/);
assert.match(paperRendererSource, /item\.posterUrl/);
assert.match(paperRendererSource, /data-testid="paper-video-poster"/);
assert.match(paperRendererSource, /<img[\s\S]+?data-video-poster/);
assert.doesNotMatch(paperRendererSource, /<video\b/);
assert.match(paperRendererSource, /data-testid="print-report-product-info"/);
assert.match(paperRendererSource, /data-testid="print-data-matrix-paper"/);
assert.match(paperRendererSource, /paperIssueLevel\(issue\.level\)/);
assert.match(paperRendererSource, /rowSpan=\{group\.rows\.length\}/);
assert.doesNotMatch(paperRendererSource, /model\.header\.productModel && <p style=\{\{ margin: 0/);

const htmlRendererSource = readFileSync(resolve(process.cwd(), 'src/lib/server/report-print-renderer.ts'), 'utf8');
assert.doesNotMatch(htmlRendererSource, /#0f766e|#f0fdfa/i, 'server PDF HTML must not retain legacy Teal accents');
assert.match(htmlRendererSource, /PRINT_GOLDEN_YELLOW/, 'server PDF HTML must consume the shared Golden Yellow print token');
assert.doesNotMatch(htmlRendererSource, /model\.header\.productModel \? `<p>/);

console.log('report-print-matrix tests passed');
