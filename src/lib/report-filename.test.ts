import assert from 'node:assert/strict';
import { buildReportFilename, reportFilenameBase } from './report-filename';

assert.equal(buildReportFilename('原汁机体验报告'), '原汁机体验报告.pdf');
assert.equal(buildReportFilename('A/B:报告*终版?'), 'A_B_报告_终版_.pdf');
assert.equal(buildReportFilename('  报告名称.pdf  '), '报告名称.pdf');
assert.equal(reportFilenameBase('   '), '报告');

console.log('report filename tests passed');
