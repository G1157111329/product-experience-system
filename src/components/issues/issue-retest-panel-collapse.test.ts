import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const retestPanel = readFileSync('src/components/issues/issue-retest-panel.tsx', 'utf8');
const recipePanel = readFileSync('src/components/recipes/recipe-evaluation-panel.tsx', 'utf8');

assert.match(
  retestPanel,
  /defaultCollapsed\?: boolean/,
  'the shared retest panel must support a collapsed default for embedded recipe/function use',
);
assert.match(
  retestPanel,
  /展开整改复测/,
  'the collapsed retest summary must expose an explicit expand control',
);
assert.match(
  retestPanel,
  /!collapsed && \(/,
  'the full retest form and records must render only after expansion',
);
assert.match(
  recipePanel,
  /<IssueRetestPanel[\s\S]*defaultCollapsed/,
  'recipe/function details must opt into the collapsed retest summary',
);

console.log('recipe retest collapse contract passed');
