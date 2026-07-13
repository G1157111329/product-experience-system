import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

const panel = read('src/components/issues/issue-retest-panel.tsx');
const dialog = read('src/components/issues/issue-rectification-dialog.tsx');
const collectionRoute = read('src/app/api/issue-re-evaluations/route.ts');
const itemRoute = read('src/app/api/issue-re-evaluations/[id]/route.ts');
const aiRoute = read('src/app/api/issue-re-evaluations/[id]/ai-evaluate/route.ts');

assert.match(panel, /export function IssueRetestPanel/);
assert.match(panel, /role="radiogroup"/);
for (const value of ['qualified', 'unqualified', 'pending']) {
  assert.match(panel, new RegExp(`value:\\s*'${value}'`));
}
assert.ok(panel.includes("useState<EvaluationStatus>('pending')"));
assert.match(panel, /保存复测/);
assert.match(panel, /确认删除|window\.confirm/);
assert.match(panel, /查看全部|历史复测/);
assert.match(panel, /aria-label="AI生成评价"/);
assert.doesNotMatch(panel, /AI评分|ai_result\.score|综合评分/);
assert.match(panel, /material_ids/);
assert.match(panel, /created_by_name/);
assert.match(panel, /录入人/);
assert.match(panel, /AbortController/);
assert.match(panel, /aiAbortController/);
assert.match(panel, /abortAiRequest/);
assert.match(panel, /target.*recordId|targetIdentity/);
assert.match(panel, /mutationAbortController/);
assert.match(panel, /mutationGeneration/);
assert.match(panel, /mutationTargetIdentity/);
assert.match(panel, /abortMutation/);
assert.match(panel, /isCurrentMutation/);
assert.match(panel, /currentIssueIdentity/);
assert.match(panel, /signal:\s*mutation\.controller\.signal/);

assert.match(dialog, /import \{ IssueRetestPanel \} from '@\/components\/issues\/issue-retest-panel'/);
assert.match(dialog, /<IssueRetestPanel/);
assert.doesNotMatch(dialog, /保存复评估|复测结果记录 —/);

assert.match(collectionRoute, /createIssueRetest/);
assert.match(collectionRoute, /canMutateIssueRetest/);
assert.match(collectionRoute, /platform_users/);
assert.match(collectionRoute, /created_by_name/);
assert.match(itemRoute, /updateIssueRetest/);
assert.match(itemRoute, /deleteIssueRetest/);
assert.match(itemRoute, /canMutateIssueReEvaluation/);
for (const route of [collectionRoute, itemRoute]) {
  assert.match(route, /请求格式错误/);
  assert.match(route, /classifyIssueRetestError/);
  assert.match(route, /复测操作失败|classified\.message/);
  assert.doesNotMatch(route, /message:\s*'[^']*'\s*\+\s*(error|err)\.message/);
  assert.doesNotMatch(route, /err instanceof Error \? err\.message/);
}
assert.match(aiRoute, /summary/);
assert.doesNotMatch(aiRoute, /from\('issue_re_evaluations'\)\.update/);

console.log('issue retest UI contract passed');
