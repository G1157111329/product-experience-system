import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildInboxMaterialOrganizeActions,
  extractInboundMaterialIds,
  parseExternalChatCommand,
  summarizeActionPlanResults,
} from './external-chat-commands';

test('parses WeChat confirm / create / bind commands deterministically', () => {
  assert.deepEqual(parseExternalChatCommand('确认'), { kind: 'confirm_plan' });
  assert.deepEqual(parseExternalChatCommand('确认执行'), { kind: 'confirm_plan' });
  assert.deepEqual(parseExternalChatCommand('执行'), { kind: 'confirm_plan' });
  assert.deepEqual(parseExternalChatCommand('新建任务：蒸蛋器体验'), {
    kind: 'create_task',
    taskName: '蒸蛋器体验',
  });
  assert.deepEqual(parseExternalChatCommand('创建任务:清洁走查'), {
    kind: 'create_task',
    taskName: '清洁走查',
  });
  assert.deepEqual(parseExternalChatCommand('关联任务：ZDQ-D12'), {
    kind: 'bind_task',
    query: 'ZDQ-D12',
  });
  assert.deepEqual(parseExternalChatCommand('你好'), { kind: 'none' });
});

test('extracts inbound WeChat material ids and builds organize actions', () => {
  const ids = extractInboundMaterialIds('已接收素材 ID：11111111-1111-4111-8111-111111111111, 22222222-2222-4222-8222-222222222222');
  assert.deepEqual(ids, [
    '11111111-1111-4111-8111-111111111111',
    '22222222-2222-4222-8222-222222222222',
  ]);
  const actions = buildInboxMaterialOrganizeActions(ids);
  assert.equal(actions.length, 2);
  assert.equal(actions[0]?.type, 'material_organize');
  assert.equal(actions[0]?.payload.material_id, ids[0]);
  assert.equal(actions[0]?.payload.naming_mode, 'context');
});

test('summarizes external confirmation results without leaking payloads', () => {
  assert.match(
    summarizeActionPlanResults([
      { status: 'applied', message: 'ok', type: 'material_organize' },
      { status: 'failed', message: 'boom', type: 'record_create' },
    ]),
    /已执行 1 项，失败 1 项/,
  );
  assert.match(
    summarizeActionPlanResults([{ status: 'applied', message: 'ok' }]),
    /已执行 1 项操作/,
  );
});
