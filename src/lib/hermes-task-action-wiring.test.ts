import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) => readFileSync(path, 'utf8');

test('task-scoped Hermes conversations plan contextual actions instead of chat-only replies', () => {
  const messagesRoute = read('src/app/api/v1/agent/conversations/[conversationId]/messages/route.ts');
  const planner = read('src/lib/server/hermes/task-action-plan.ts');

  assert.match(messagesRoute, /planHermesTaskActions/);
  assert.match(messagesRoute, /toolName:\s*'task_action_plan'/);
  assert.match(planner, /getV3MatrixProjection/);
  assert.match(planner, /check_records/);
  assert.match(planner, /comparison_matrix_cells/);
  assert.match(planner, /recipes/);
  assert.match(planner, /materials/);
  assert.match(planner, /getActiveSkillVersion/);
  assert.match(planner, /logAgentAudit/);
});

test('task floating assistant stays on Hermes chat and exposes confirmed action plans', () => {
  const floating = read('src/components/agent/agent-floating-assistant.tsx');
  const chat = read('src/components/agent/hermes-chat.tsx');

  assert.doesNotMatch(floating, /<AgentAssistPanel/);
  assert.match(floating, /<HermesChat[\s\S]*taskId=\{taskId\}/);
  assert.match(chat, /task_action_plan/);
  assert.match(chat, /agent-actions/);
});
