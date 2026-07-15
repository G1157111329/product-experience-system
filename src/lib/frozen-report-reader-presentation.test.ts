import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const readerSource = readFileSync('src/components/reports/frozen-report-reader.tsx', 'utf8');
const headerSource = readFileSync('src/components/reports/frozen-report-header-meta.tsx', 'utf8');

test('frozen issue context renders a real Chinese colon instead of a unicode escape literal', () => {
  assert.match(readerSource, /\{label\}：<\/span>/);
  assert.doesNotMatch(readerSource, /\{label\}\\uff1a/);
});

test('frozen issue reader keeps evidence at its source and exposes one dedicated status field', () => {
  assert.match(readerSource, /data-issue-header="true"/);
  assert.match(readerSource, /data-issue-field="level"/);
  assert.match(readerSource, /data-issue-field="source"/);
  assert.match(readerSource, /data-issue-field="description"/);
  assert.match(readerSource, /data-issue-field="status"/);
  assert.equal(readerSource.match(/data-issue-field="status"/g)?.length, 1, 'the status field is declared exactly once');
  assert.match(readerSource, /issueStatusLabel\(issue\.liveOverlay\.status \|\| 'open'\)/);
  assert.match(readerSource, /issue\.canManage\s*&&\s*issue\.liveIssueId\s*&&\s*onManageIssue/, 'only a canonically authorized linked issue may make the status interactive');
  assert.match(readerSource, /onClick:\s*\(\) => onManageIssue\(issue\)/, 'the managed status itself opens rectification');
  assert.match(readerSource, /retest\.history\.slice\(1\)/, 'older retests are rendered from the complete frozen history');
  assert.match(readerSource, /关联缺失，无法进入整改/, 'unlinked internal rows explain why management is unavailable');
  assert.match(readerSource, /issue\.recipe[\s\S]*items=\{issue\.evidence\}/, 'explicit recipe-issue evidence is rendered once outside recipe context');
  assert.match(readerSource, /excludeClaimedRecipeMediaFromEffects/, 'browser rendering defensively removes same-recipe media already claimed by an issue');
  assert.doesNotMatch(readerSource, />\s*查看整改\s*</, 'managed rows use the status itself as the action');
  assert.doesNotMatch(readerSource, /role="appendix"/, 'issue evidence must never be collected as an appendix');
  assert.equal(readerSource.includes("comparison: '\\u98df\\u8c31/\\u529f\\u80fd-\\u5bf9\\u6bd4\\u77e9\\u9635'"), true);
});

test('function effect reader is a single recipe list without a duplicated issue section', () => {
  assert.match(readerSource, /整体判断/);
  assert.doesNotMatch(readerSource, /relatedIssues\.map/, 'function issue details belong to the unified issue tab');
  assert.doesNotMatch(readerSource, /<p className="font-medium">问题点<\/p>/);
});

test('frozen report header gives the report name primary typography and allows long names to wrap', () => {
  assert.match(headerSource, /break-words/);
  assert.match(headerSource, /text-2xl/);
  assert.match(headerSource, /sm:text-3xl/);
  assert.doesNotMatch(headerSource, /truncate text-sm/);
});
