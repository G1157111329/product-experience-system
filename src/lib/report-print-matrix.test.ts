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
assert.match(paperRendererSource, /cell\.notes/);
assert.match(paperRendererSource, /row\.issueSummary/);
assert.match(paperRendererSource, /paperProblemTexts\(effect\.problemPoints\)/);
assert.match(paperRendererSource, /item\.posterUrl/);
assert.match(paperRendererSource, /source\.posterUrl/);
assert.match(paperRendererSource, /data-testid="paper-video-poster"/);
assert.match(paperRendererSource, /<img[\s\S]+?data-video-poster/);
assert.doesNotMatch(paperRendererSource, /<video\b/);

console.log('report-print-matrix tests passed');
