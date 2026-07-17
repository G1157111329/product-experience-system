import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync('src/components/agent/hermes-chat.tsx', 'utf8');
const messagesRoute = readFileSync('src/app/api/v1/agent/conversations/[conversationId]/messages/route.ts', 'utf8');
const streamRoute = readFileSync('src/app/api/v1/agent/conversations/[conversationId]/stream/route.ts', 'utf8');
const taskActionPlan = readFileSync('src/lib/server/hermes/task-action-plan.ts', 'utf8');
const taskActionRoute = readFileSync('src/app/api/tasks/[id]/agent-actions/route.ts', 'utf8');

test('Hermes chat renders only server-backed message ids and carries SSE tool metadata', () => {
  assert.doesNotMatch(source, /pending-\$\{Date\.now\(\)\}/);
  assert.match(source, /toolName:\s*data\.toolName/);
  assert.match(source, /toolCallId:\s*data\.toolCallId/);
});

test('Hermes chat uses readable Chinese strings instead of mojibake UI labels', () => {
  for (const text of ['开始一段新的体验协作', '待确认的平台操作', '确认并写入当前任务', '输入消息', '发送']) {
    assert.match(source, new RegExp(text));
  }
  assert.doesNotMatch(source, /瀵硅瘽|鎿嶄綔|鍔╂墜/);
});

test('Hermes prompts and stream errors keep user-facing output in simplified Chinese', () => {
  assert.match(messagesRoute, /所有面向用户的回复必须使用简体中文/);
  assert.match(taskActionPlan, /所有 reply、操作标题和操作说明必须使用简体中文/);
  assert.match(streamRoute, /对话不存在/);
  assert.doesNotMatch(streamRoute, /conversation 不存在/);
});

test('Hermes persists confirmed action-plan outcomes so a refreshed chat does not offer duplicate writes', () => {
  assert.match(source, /actionPlanMessageId:\s*message\.id/);
  assert.match(taskActionRoute, /task_action_plan_applying/);
  assert.match(taskActionRoute, /task_action_plan_applied/);
  assert.match(taskActionRoute, /task_action_plan_partial/);
});
