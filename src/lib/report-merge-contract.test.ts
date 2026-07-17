import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildReportListEntries } from './report-merge';

const reports = [
  { id: 'old-a', task_id: 'task-a', product_model: 'X1', project_type: '自研', created_at: '2026-01-01T00:00:00Z' },
  { id: 'new-a', task_id: 'task-a', product_model: 'X1', project_type: '自研', created_at: '2026-02-01T00:00:00Z' },
  { id: 'report-b', task_id: 'task-b', product_model: 'X1', project_type: '前期研究', created_at: '2026-03-01T00:00:00Z' },
  { id: 'odm', task_id: 'task-c', product_model: 'X1', project_type: 'ODM', created_at: '2026-04-01T00:00:00Z' },
];

const entries = buildReportListEntries(reports);
const group = entries.find((entry) => entry.kind === 'group');
assert.ok(group && group.kind === 'group');
assert.deepEqual(group.reports.map((report) => report.id), ['report-b', 'new-a']);
assert.ok(entries.some((entry) => entry.kind === 'report' && entry.report.id === 'odm'));
assert.ok(!entries.some((entry) => entry.kind === 'report' && entry.report.id === 'old-a'));

const detailSource = readFileSync('src/app/api/reports/[id]/detail/route.ts', 'utf8');
const printSource = readFileSync('src/app/reports/print/page.tsx', 'utf8');
assert.match(detailSource, /mergedReportOrder:\s*members\.map/, 'report detail must expose frozen merge order');
assert.match(printSource, /mergedReportOrder/, 'print/PDF must consume the frozen merge order');
assert.match(printSource, /preparePrintModel\(model/, 'print/PDF must render each ordered frozen member');

console.log('report merge contract passed');
