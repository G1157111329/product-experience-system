import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const page = readFileSync('src/app/(main)/tasks/[id]/page.tsx', 'utf8');
const panel = readFileSync('src/components/recipes/recipe-evaluation-panel.tsx', 'utf8');
const workspace = readFileSync('src/app/(main)/tasks/[id]/components/functions-input-workspace.tsx', 'utf8');
const duplicatePath = 'src/app/(main)/tasks/[id]/components/functions-tab.tsx';
const duplicate = existsSync(duplicatePath) ? readFileSync(duplicatePath, 'utf8') : '';
const aiRoute = readFileSync('src/app/api/recipes/[id]/ai-evaluate/route.ts', 'utf8');
const stepsRoute = readFileSync('src/app/api/recipe-steps/route.ts', 'utf8');
const stepRoute = readFileSync('src/app/api/recipe-steps/[id]/route.ts', 'utf8');
const inlineValues = readFileSync('src/lib/server/inline-values.ts', 'utf8');
const agentChat = readFileSync('src/app/api/tasks/[id]/agent-chat/route.ts', 'utf8');
const agentActions = readFileSync('src/app/api/tasks/[id]/agent-actions/route.ts', 'utf8');
const issuesRoute = readFileSync('src/app/api/issues/route.ts', 'utf8');
const recipeRoute = readFileSync('src/app/api/recipes/[id]/route.ts', 'utf8');

assert.match(page, /useState<[^>]*>\('agent'\)/, 'Task 3 must not change the task default tab');
assert.match(page, /<RecipeEvaluationPanel/, 'active inline FunctionsTab must use the shared evaluation panel');
assert.match(panel, /qualified[\s\S]*unqualified[\s\S]*pending/, 'panel must offer all three canonical judgments');
assert.match(panel, /onBlur/, 'description must save on blur');
assert.match(panel, /保存中[\s\S]*已保存[\s\S]*保存失败/, 'autosave feedback must be visible');
assert.match(panel, /aria-label="AI生成评价"/, 'AI must be an embedded textarea action');
assert.match(panel, /<IssueRetestPanel/, 'the former problem area must use the shared retest panel');
assert.match(panel, /AbortController/, 'recipe-scoped async work must be abortable');
assert.match(panel, /recipe\.id/, 'async state must be bound to stable recipe identity');
assert.match(panel, /saveController\.current\?\.abort\(\)/, 'recipe switch/unmount must abort an in-flight autosave');
assert.match(panel, /generation !== saveGeneration\.current/, 'queued autosaves must not start after their recipe generation is stale');
assert.match(panel, /queueSave\(\{ materialIds: ids, materials: selected \}\)/, 'material autosave must retain the selected material snapshot');
assert.match(panel, /draftGeneration/, 'AI fill must be tied to the current recipe draft generation');
assert.match(panel, /aiController\.current\?\.abort\(\)/, 'a new draft or AI request must abort older AI work');

for (const [name, source] of [['workspace', workspace], ['duplicate', duplicate]] as const) {
  assert.doesNotMatch(source, /AI总结评分|AI评价结果|AI识别问题点|新增问题点|保存素材/, `${name} must not expose legacy effect controls`);
  assert.doesNotMatch(source, /步骤问题点|添加问题点|有问题点/, `${name} must not expose step problem points`);
}
assert.doesNotMatch(workspace, /effect_score|problemCount/, 'recipe cards must not show legacy score or problem-count badges');
assert.doesNotMatch(page, /AI总结评分|AI评价结果|AI识别问题点/, 'active effect editor must not expose legacy AI controls');

assert.doesNotMatch(page, /effect_problem_point\s*:/, 'active authoring payload must not write legacy effect problem points');
assert.doesNotMatch(page, /problem_point:\s*legacy|problem_points:\s*valid/, 'active authoring payload must not write legacy step problem points');
assert.doesNotMatch(stepsRoute, /body\.problem_point|body\.problem_points/, 'step create route must ignore legacy problem-point writes');
assert.doesNotMatch(stepRoute, /body\.problem_point|body\.problem_points/, 'step update route must ignore legacy problem-point writes');
assert.doesNotMatch(aiRoute, /effect_score\s*:|effect_ai_result\s*:/, 'AI route must not persist standalone score/result');
assert.match(aiRoute, /data:\s*\{\s*summary/, 'AI route must return summary text');
assert.doesNotMatch(inlineValues, /fieldId === 'effect_problem_point'/, 'inline values must not retain a reachable effect problem writer');
assert.doesNotMatch(agentChat, /"problem_point"|step\.problem_point/, 'task agent must neither prompt nor read step problem points');
assert.doesNotMatch(agentActions, /payload\.problem_point\b/, 'agent actions must not write step problem points');
assert.match(issuesRoute, /if \(recipe_id\)[\s\S]*canAccessRecipe\(client, user, recipe_id\)/, 'recipe-scoped issue reads must reuse recipe authorization');
assert.match(recipeRoute, /saveRecipeEvaluation/, 'all recipe evaluation writes must use the atomic RPC service');
assert.doesNotMatch(recipeRoute, /effect_description === undefined \|\| body\.effect_status === undefined/, 'partial evaluation PUTs must remain backward compatible');
for (const mixedField of ['name', 'ingredients', 'recipeType', 'problemCount', 'ingredientItems']) {
  assert.match(recipeRoute, new RegExp(`${mixedField}:`), `mixed evaluation PUT must forward ${mixedField} into the atomic command`);
}

console.log('recipe evaluation UI contract tests passed');
