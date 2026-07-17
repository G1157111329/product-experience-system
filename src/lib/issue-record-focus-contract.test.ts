import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const taskPage = readFileSync('src/app/(main)/tasks/[id]/page.tsx', 'utf8');
const workspace = readFileSync('src/app/(main)/tasks/[id]/components/senses-input-workspace.tsx', 'utf8');
const functionsWorkspace = readFileSync('src/app/(main)/tasks/[id]/components/functions-input-workspace.tsx', 'utf8');

assert.match(taskPage, /searchParams\.get\('record_id'\)/);
assert.match(taskPage, /focusedRecordId=/);
assert.match(workspace, /focusedRecordId/);
assert.match(workspace, /scrollIntoView/);
assert.match(workspace, /id=\{`record-\$\{record\.id\}`\}/);
assert.match(taskPage, /searchParams\.get\('recipe_id'\)/);
assert.match(taskPage, /searchParams\.get\('recipe_step_id'\)/);
assert.match(taskPage, /focusedRecipeId=/);
assert.match(taskPage, /focusedRecipeStepId=/);
assert.match(functionsWorkspace, /focusedRecipeId/);
assert.match(functionsWorkspace, /focusedRecipeStepId/);
assert.match(functionsWorkspace, /id=\{`recipe-\$\{recipe\.id\}`\}/);
assert.match(functionsWorkspace, /id=\{`recipe-step-\$\{step\.id\}`\}/);
assert.match(functionsWorkspace, /scrollIntoView/);

console.log('issue record focus contract tests passed');
