import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync('src/components/wecom-bindings-settings.tsx', 'utf8');

test('binding settings retains ID configuration without QR scan binding', () => {
  assert.match(source, /CorpId/);
  assert.match(source, /AgentId/);
  assert.match(source, /手动绑定/);
  assert.doesNotMatch(source, /生成绑定二维码/);
  assert.doesNotMatch(source, /qrSession/);
});

test('personal WeChat configuration explains official website OAuth callback requirements', () => {
  assert.match(source, /授权回调域名/);
  assert.match(source, /回调路径/);
  assert.match(source, /state/);
  assert.match(source, /authorizedRedirectDomain/);
  assert.match(source, /oauthProvider === 'wecom' \? \{ agentId: oauthAgentId\.trim\(\) \} : \{\}/);
  assert.match(source, /oauthProvider === 'wecom' \? 'CorpId' : 'AppID'/);
  assert.match(source, /wecomCorpId: bindingProvider === 'wecom' \? wecomCorpId\.trim\(\) \|\| null : null/);
  assert.match(source, /bindingProvider === 'wecom' && <div className="space-y-1">/);
});

test('binding settings expose a separate recommended WeCom AI Bot gateway configuration', () => {
  assert.match(source, /wecomBotGateway/);
  assert.match(source, /企微 AI Bot（推荐）/);
  assert.match(source, /Bot ID/);
  assert.match(source, /绑定主体 CorpId/);
  assert.match(source, /WebSocket 网关/);
});

test('platform users are selected from the approved user list instead of typed as raw IDs', () => {
  assert.match(source, /fetch\('\/api\/auth\/users'/);
  assert.match(source, /handlePlatformUserChange/);
  assert.match(source, /aria-label="选择平台用户"/);
  assert.doesNotMatch(source, /placeholder="platform_users\.id"/);
});
