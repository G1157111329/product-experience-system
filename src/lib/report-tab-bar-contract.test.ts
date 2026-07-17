import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const source = readFileSync(resolve(process.cwd(), 'src/app/(main)/reports/[id]/components/report-tab-bar.tsx'), 'utf8');

assert.match(source, /bg-primary text-primary-foreground/,
  '报告选中 Tab 必须使用品牌主色实底，不能仅依赖白底阴影区分');
assert.match(source, /ring-1 ring-primary\/25/,
  '报告选中 Tab 必须保留明确边界，便于浅色页面识别');
assert.match(source, /bg-primary-foreground\/15 text-primary-foreground/,
  '选中 Tab 的数量徽标必须与主色背景保持高对比');

console.log('report tab bar active-state contract passed');
