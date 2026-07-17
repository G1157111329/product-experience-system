import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  applyHermesPlatformContract,
  sanitizeHermesAssistantReply,
} from './hermes-platform-contract';
import { normalizeCreateTaskInput } from './workspace-plan';
import { parseExternalChatCommand } from './external-chat-commands';

test('Hermes runtime always prepends the platform lock contract', () => {
  const runtime = readFileSync('src/lib/server/hermes/runtime.ts', 'utf8');
  assert.match(runtime, /applyHermesPlatformContract/);
  const wrapped = applyHermesPlatformContract('自定义提示');
  assert.match(wrapped, /平台锁定合同/);
  assert.match(wrapped, /严禁/);
  assert.match(wrapped, /自定义提示/);
  assert.equal(applyHermesPlatformContract(wrapped), wrapped);
});

test('Hermes blocks fake platform writes but allows opinion answers', () => {
  assert.match(
    sanitizeHermesAssistantReply('请到网页手工录入，或联系管理员代为创建'),
    /只能在产品体验管理平台内执行/,
  );
  assert.match(
    sanitizeHermesAssistantReply('✅ 体验任务已成功创建并关联到「中式电饭煲」'),
    /还没有在平台写入/,
  );
  assert.equal(
    sanitizeHermesAssistantReply('已在平台新建体验计划「测试」', { allowSuccessClaim: true }),
    '已在平台新建体验计划「测试」',
  );
  assert.equal(
    sanitizeHermesAssistantReply('我认为开箱触点应优先检查密封胶条的手感与对齐。'),
    '我认为开箱触点应优先检查密封胶条的手感与对齐。',
  );
});

test('create-task normalization only keeps platform experience_tasks fields', () => {
  const created = normalizeCreateTaskInput({
    task_name: '测试任务1995',
    product: '中式电饭煲',
    project_type: '自研',
    project_phase: '手板阶段',
    test_purpose: '测试AI助手能力',
    participants: '张三',
    priority: '紧急',
  });
  assert.deepEqual(created, {
    taskName: '测试任务1995',
    productCategory: null,
    product: '中式电饭煲',
    productModel: null,
    projectType: '自研',
    projectPhase: '手板研究',
    testPurpose: '测试AI助手能力',
    organizer: null,
    testDate: null,
  });
});

test('确认创建 is treated as Hermes confirm sugar', () => {
  assert.deepEqual(parseExternalChatCommand('确认创建'), { kind: 'confirm_plan' });
});

test('Hermes turn and workspace planner stay platform-bound', () => {
  const turn = readFileSync('src/lib/server/hermes/hermes-turn.ts', 'utf8');
  const workspace = readFileSync('src/lib/server/hermes/workspace-plan.ts', 'utf8');
  assert.match(turn, /workspace_action_plan/);
  assert.match(turn, /skillCreateTask/);
  assert.match(turn, /sanitizeHermesAssistantReply/);
  assert.match(workspace, /只能规划本平台体验计划操作/);
  assert.doesNotMatch(turn, /请登录平台筛选/);
});
