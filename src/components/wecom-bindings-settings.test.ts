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
