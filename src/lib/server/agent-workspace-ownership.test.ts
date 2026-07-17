import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) => readFileSync(path, 'utf8');

test('a web-created default assistant is owned by the current platform user', () => {
  const route = read('src/app/api/v1/agent/conversations/route.ts');

  assert.match(route, /boundUserId:\s*userId/);
  assert.doesNotMatch(route, /isAdmin\s*\?\s*sql`TRUE`\s*:\s*or\(isNull\(agentInstances\.boundUserId\)/);
});

test('external WeCom messages require the assistant selected by that user binding', () => {
  const ingest = read('src/lib/server/hermes/wecom-text-ingest.ts');

  assert.match(ingest, /if \(!binding\.agentInstanceId\) return \{ accepted: false, reason: 'agent_not_found' \};/);
  assert.match(ingest, /eq\(agentInstances\.boundUserId, binding\.platformUserId\)/);
  assert.doesNotMatch(ingest, /binding\.agentInstanceId\s*\|\|\s*await resolveDefaultAgentInstanceId\(\)/);
});

test('an administrator can bind only the selected platform users own active assistant', () => {
  const bindings = read('src/app/api/v1/admin/wecom-bindings/route.ts');
  const qr = read('src/app/api/v1/admin/wecom-bindings/qr/route.ts');

  assert.match(bindings, /eq\(agentInstances\.boundUserId, platformUserId\)/);
  assert.match(qr, /eq\(agentInstances\.boundUserId, platformUserId\)/);
});

test('the administrator binding form requires an assistant selection before saving', () => {
  const settings = read('src/components/wecom-bindings-settings.tsx');

  assert.match(settings, /if \(!platformUserId\.trim\(\) \|\| !wecomUserId\.trim\(\) \|\| !agentInstanceId\)/);
  assert.match(settings, /请选择该平台账号的 AI 助手/);
});
