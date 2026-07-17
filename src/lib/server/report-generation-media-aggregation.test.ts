import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const reportsRoute = readFileSync(resolve(process.cwd(), 'src/app/api/reports/route.ts'), 'utf8');
const comparisonSnapshot = readFileSync(resolve(process.cwd(), 'src/lib/server/comparison-assembly.ts'), 'utf8');

assert.match(reportsRoute, /freezeReportMediaAtSource/, 'ordinary report generation must aggregate source media before snapshot persistence');
assert.match(reportsRoute, /from\('material_links'\)/, 'ordinary report generation must read new polymorphic bindings');
assert.match(reportsRoute, /from\('issue_re_evaluations'\)/, 'ordinary report generation must freeze re-evaluation source media');
assert.match(reportsRoute, /issues:\s*frozenReportSources\.issues/, 'ordinary report content must retain issue/re-evaluation media at its source position');
assert.match(comparisonSnapshot, /mergeTargetMaterials/, 'comparison snapshot generation must merge material_links with legacy cell foreign keys');
assert.match(comparisonSnapshot, /target_type', 'comparison_cell'/, 'comparison snapshot must request comparison-cell material links');

console.log('report generation media aggregation contract tests passed');
