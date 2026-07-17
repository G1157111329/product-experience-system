import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) => readFileSync(path, 'utf8');

test('official WeCom text callbacks are persisted through the Hermes conversation boundary', () => {
  const callback = read('src/lib/server/wecom-callback-auth.ts');
  const route = read('src/app/api/v1/wecom/callback/route.ts');
  const ingest = read('src/lib/server/hermes/wecom-text-ingest.ts');

  assert.match(callback, /messageType:\s*'text'\s*\|\s*'image'\s*\|\s*'video'/);
  assert.match(callback, /content:\s*string/);
  assert.match(callback, /ingestWecomTextMessage/);
  assert.match(route, /ingestWecomTextMessage/);
  assert.match(ingest, /wecomBindings/);
  assert.match(ingest, /conversations/);
  assert.match(ingest, /conversationMessages/);
  assert.match(ingest, /executeHermesRun/);
});

test('binding settings support official WeChat OAuth but explicitly reject personal-account chatbots', () => {
  const settings = read('src/components/wecom-bindings-settings.tsx');
  const bindingsRoute = read('src/app/api/v1/admin/wecom-bindings/route.ts');

  assert.match(settings, /个人微信应用配置/);
  assert.match(settings, /个人微信没有官方安全的聊天机器人 API/);
  assert.match(settings, /选择 AI 助手/);
  assert.match(settings, /\/api\/v1\/admin\/agent-instances/);
  assert.match(bindingsRoute, /agentInstanceId/);
});
