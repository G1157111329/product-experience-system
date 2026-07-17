import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const cwd = process.cwd();
const subTwelvePixelSearch = spawnSync(
  'rg',
  ['-n', 'text-\\[(10|11)px\\]', 'src', '--glob', '*.tsx'],
  { cwd, encoding: 'utf8' },
);
assert.ok(subTwelvePixelSearch.status === 0 || subTwelvePixelSearch.status === 1, subTwelvePixelSearch.stderr);
const subTwelvePixelMatches = subTwelvePixelSearch.stdout.trim();
assert.equal(subTwelvePixelMatches, '', 'product UI must not render text below 12px');

const reportHeader = readFileSync(resolve(cwd, 'src/app/(main)/reports/[id]/components/report-sticky-header.tsx'), 'utf8');
assert.doesNotMatch(reportHeader, /className="h-8 w-8/);
assert.match(reportHeader, /min-h-11 min-w-11/);

const agentAssistant = readFileSync(resolve(cwd, 'src/components/agent/agent-floating-assistant.tsx'), 'utf8');
assert.match(agentAssistant, /left: '50%', top: '50%'/, 'AI assistant must open centered');
assert.match(agentAssistant, /onPointerMove|onMouseMove/, 'AI assistant must remain draggable');

const functionsWorkspace = readFileSync(
  resolve(cwd, 'src/app/(main)/tasks/[id]/components/functions-input-workspace.tsx'),
  'utf8',
);
assert.match(functionsWorkspace, /role="button"[\s\S]*tabIndex=\{0\}[\s\S]*onKeyDown=/, 'clickable recipe rows must support keyboard activation');
assert.match(functionsWorkspace, /食材 \{selectedIngredientCount\}/);
assert.match(functionsWorkspace, /步骤 \{selectedRecipeStats\.stepCount\}/);
assert.match(functionsWorkspace, /问题 \{selectedRecipeStats\.problemCount\}/);

const taskHeader = readFileSync(
  resolve(cwd, 'src/app/(main)/tasks/[id]/components/task-authoring-header.tsx'),
  'utf8',
);
assert.match(taskHeader, /data-testid="mobile-task-context"/);
assert.match(taskHeader, /<details[\s\S]*className="md:hidden"/);

const issueList = readFileSync(resolve(cwd, 'src/app/(main)/issues/page.tsx'), 'utf8');
assert.match(issueList, /role="row"[\s\S]*tabIndex=\{0\}[\s\S]*onKeyDown=/, 'issue rows must support keyboard activation');
assert.match(issueList, /aria-pressed=\{current\.key === candidate\.key\}/);

console.log('UX baseline contract tests passed');
