import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const frozenReader = readFileSync('src/components/reports/frozen-report-reader.tsx', 'utf8');
const paperRenderer = readFileSync('src/components/reports/report-section-block-renderer.tsx', 'utf8');
const htmlRenderer = readFileSync('src/lib/server/report-print-renderer.ts', 'utf8');

assert.match(frozenReader, /role="compact" label="素材"/, 'frozen function-effect evidence must use compact thumbnails');
assert.match(frozenReader, /border-emerald-200 bg-emerald-50 text-emerald-700/, 'qualified function tags must be green');
assert.match(frozenReader, /border-red-200 bg-red-50 text-red-700/, 'unqualified function tags must be red');
assert.match(frozenReader, /border-slate-200 bg-slate-50 text-slate-600/, 'pending function tags must be gray');
assert.match(paperRenderer, /printEvaluationStatusChipStyle/, 'browser print must use the same status color contract');
assert.match(htmlRenderer, /function-status-qualified/, 'server PDF must emit a qualified status class');
assert.match(htmlRenderer, /function-status-unqualified/, 'server PDF must emit an unqualified status class');
assert.match(htmlRenderer, /function-status-pending/, 'server PDF must emit a pending status class');

console.log('function effect presentation contract passed');
