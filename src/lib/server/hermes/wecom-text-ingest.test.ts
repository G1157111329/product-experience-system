import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { buildOngoingTaskListReply } from './wecom-text-ingest';

const read = (path: string) => readFileSync(path, 'utf8');

test('external chat returns only the bound users ongoing tasks instead of delegating the query to a generic model', () => {
  assert.match(
    buildOngoingTaskListReply('我的进行中任务列表', [
      { id: 'a', taskName: '蒸蛋体验', productModel: 'Z-01', projectPhase: '试制阶段', status: '进行中' },
      { id: 'b', taskName: '清洁体验', productModel: null, projectPhase: null, status: '进行中' },
    ]) || '',
    /我的进行中任务（2 项）/,
  );
  assert.equal(buildOngoingTaskListReply('你好', []), null);
  assert.match(buildOngoingTaskListReply('在办任务有哪些', []) || '', /当前没有进行中的任务/);
});

test('official WeCom text callbacks are persisted through the assistant conversation boundary', () => {
  const callback = read('src/lib/server/wecom-callback-auth.ts');
  const route = read('src/app/api/v1/wecom/callback/route.ts');
  const ingest = read('src/lib/server/hermes/wecom-text-ingest.ts');
  assert.match(callback, /messageType:\s*'text'\s*\|\s*'image'\s*\|\s*'video'/);
  assert.match(callback, /ingestWecomTextMessage/);
  assert.match(route, /ingestWecomTextMessage/);
  assert.match(ingest, /wecomBindings/);
  assert.match(ingest, /conversationMessages/);
  assert.match(ingest, /dispatchHermesTurn/);
});

test('settings separate website OAuth from each users personal iLink Bot authorisation', () => {
  const settings = read('src/components/wecom-bindings-settings.tsx');
  const qrRoute = read('src/app/api/v1/admin/ilink-bots/qr/route.ts');
  const revokeRoute = read('src/app/api/v1/admin/ilink-bots/route.ts');
  assert.match(settings, /个人微信 iLink Bot（每人独立）/);
  assert.match(settings, /生成 iLink 扫码授权/);
  assert.match(settings, /撤销授权/);
  assert.match(qrRoute, /ilink_bot_id/);
  assert.match(revokeRoute, /admin_revoked/);
});

test('Hermes planner exposes material_organize for WeChat inbox media', () => {
  const plan = read('src/lib/server/hermes/task-action-plan.ts');
  const actions = read('src/lib/agent-actions.ts');
  const executor = read('src/lib/server/hermes/task-action-executor.ts');
  assert.match(plan, /material_organize/);
  assert.match(plan, /微信\/企微待入库素材/);
  assert.match(actions, /'material_organize'/);
  assert.match(executor, /applyMaterialOrganize/);
  assert.match(executor, /claimMaterialForTask/);
  assert.match(executor, /bindMaterial/);
});

test('Hermes turn is the shared driver for platform and external chat', () => {
  const turn = read('src/lib/server/hermes/hermes-turn.ts');
  const ingest = read('src/lib/server/hermes/wecom-text-ingest.ts');
  const messages = read('src/app/api/v1/agent/conversations/[conversationId]/messages/route.ts');
  const commands = read('src/lib/server/hermes/external-chat-commands.ts');
  const executor = read('src/lib/server/hermes/task-action-executor.ts');
  const contract = read('src/lib/server/hermes/hermes-platform-contract.ts');
  assert.match(turn, /dispatchHermesTurn/);
  assert.match(turn, /planHermesTaskActions/);
  assert.match(turn, /confirmLatestHermesPlan/);
  assert.match(turn, /skillListOngoingTasks/);
  assert.match(turn, /workspace_action_plan/);
  assert.match(turn, /executeTaskActionPlanForUser/);
  assert.match(turn, /taskId: conversation\.taskId/);
  assert.match(contract, /平台锁定合同/);
  assert.match(commands, /confirm_plan/);
  assert.match(ingest, /dispatchHermesTurn/);
  assert.match(messages, /dispatchHermesTurn/);
  assert.match(executor, /export async function executeTaskActionPlanForUser/);
});
