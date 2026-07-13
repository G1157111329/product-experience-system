import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const route = readFileSync(resolve(process.cwd(), 'src/app/api/reports/route.ts'), 'utf8');
assert.doesNotMatch(route, /delete\(issuesTable\)/, 'regenerating a report must not delete historical canonical issues');
assert.doesNotMatch(route, /sourceReportId:\s*report\.id/, 'report generation must not manufacture report-scoped issue rows');
assert.doesNotMatch(route, /食谱功能问题|食谱效果问题/, 'legacy step/effect problem points must not create report issues');
assert.match(route, /report_content:\s*finalReportContent/, 'the ordinary report snapshot must keep original facts');
console.log('report generation issue ownership tests passed');
