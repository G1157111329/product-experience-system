import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const tasksPage = readFileSync('src/app/(main)/tasks/page.tsx', 'utf8');
const reportsPage = readFileSync('src/app/(main)/reports/page.tsx', 'utf8');

for (const [pageName, source] of [
  ['体验计划页', tasksPage],
  ['报告列表页', reportsPage],
] as const) {
  assert.match(
    source,
    /<FilterBar\s+sticky=\{false\}>/,
    `${pageName}筛选区必须随页面内容自然滚动，不能固定在移动端视口`,
  );
}

assert.match(tasksPage, /role="tablist"[\s\S]*STATUS_TABS\.map/);
assert.match(tasksPage, /<SearchField[\s\S]*placeholder="搜索单号、型号、任务名称/);
assert.match(reportsPage, /role="tablist"[\s\S]*reportScope === 'all'/);
assert.match(reportsPage, /<SearchField[\s\S]*placeholder="搜索报告名称、型号、品类、产品"/);
assert.match(reportsPage, /<Select value=\{categoryFilter\}/);

console.log('mobile filter scroll contract tests passed');
