import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const frozenReader = readFileSync('src/components/reports/frozen-report-reader.tsx', 'utf8');
const reportMediaGrid = readFileSync('src/components/reports/report-media-grid.tsx', 'utf8');
const paperRenderer = readFileSync('src/components/reports/report-section-block-renderer.tsx', 'utf8');
const htmlRenderer = readFileSync('src/lib/server/report-print-renderer.ts', 'utf8');

assert.match(frozenReader, /role="function-evidence" label="素材"/, 'frozen function-effect evidence must use its dedicated presentation');
assert.match(reportMediaGrid, /['"]function-evidence['"]: \{ limit: 10, imageAspect: '4\/3', videoAspect: '16\/9', minWidth: 96, maxWidth: 96 \}/, 'frozen function media must show ten slightly larger previews before collapsing');
assert.match(frozenReader, /<MediaList items=\{effect\.evidence\} role="function-evidence" label="素材"/, 'the frozen function tab must not limit effect evidence to compact previews');
assert.match(frozenReader, /<MediaList items=\{item\.evidence \?\? \[\]\} role="function-evidence" label="素材"/, 'the frozen function tab must not limit step evidence to compact previews');
assert.match(frozenReader, /border-emerald-200 bg-emerald-50 text-emerald-700/, 'qualified function tags must be green');
assert.match(frozenReader, /border-red-200 bg-red-50 text-red-700/, 'unqualified function tags must be red');
assert.match(frozenReader, /border-slate-200 bg-slate-50 text-slate-600/, 'pending function tags must be gray');
assert.match(paperRenderer, /printEvaluationStatusChipStyle/, 'browser print must use the same status color contract');
assert.match(htmlRenderer, /function-status-qualified/, 'server PDF must emit a qualified status class');
assert.match(htmlRenderer, /function-status-unqualified/, 'server PDF must emit an unqualified status class');
assert.match(htmlRenderer, /function-status-pending/, 'server PDF must emit a pending status class');
assert.match(paperRenderer, /<PaperMedia items=\{effect\.evidence\} \/>/, 'browser print function evidence must use issue-sized previews');
assert.doesNotMatch(paperRenderer, /<PaperMedia items=\{effect\.evidence\} density="compact" \/>/, 'browser print function evidence must not use compact previews');
assert.match(htmlRenderer, /\$\{renderMedia\(step\.evidence\)\}/, 'server PDF function-step evidence must use issue-sized previews');
assert.match(htmlRenderer, /\$\{renderMedia\(effect\.evidence\)\}/, 'server PDF function evidence must use issue-sized previews');
assert.doesNotMatch(htmlRenderer, /renderMedia\(step\.evidence, \{ compact: true \}\)/, 'server PDF function-step evidence must not use compact previews');
assert.doesNotMatch(htmlRenderer, /renderMedia\(effect\.evidence, \{ compact: true \}\)/, 'server PDF function evidence must not use compact previews');

console.log('function effect presentation contract passed');
