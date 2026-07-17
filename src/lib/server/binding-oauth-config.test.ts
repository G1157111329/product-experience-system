import assert from 'node:assert/strict';
import {
  describeWeChatWebsiteOAuthCallback,
  resolveBindingOAuthConfig,
  updateStoredBindingOAuthConfig,
} from './binding-oauth-config';

const stored = updateStoredBindingOAuthConfig(null, 'wechat', {
  appId: 'wx-platform',
  secret: 'platform-secret',
});
const platform = resolveBindingOAuthConfig('wechat', stored, {});
assert.equal(platform.ready, true);
assert.equal(platform.source, 'platform');
assert.equal(platform.appId, 'wx-platform');
assert.equal(platform.secret, 'platform-secret');
assert.notEqual(stored.wechat?.secretEncrypted, 'platform-secret');

const environment = resolveBindingOAuthConfig('wechat', stored, {
  WECHAT_APP_ID: 'wx-env',
  WECHAT_APP_SECRET: 'env-secret',
});
assert.equal(environment.source, 'environment');
assert.equal(environment.appId, 'wx-env');

const incomplete = resolveBindingOAuthConfig('wecom', {
  wecom: { corpId: 'corp', agentId: 'agent' },
}, {});
assert.equal(incomplete.ready, false);

const callback = describeWeChatWebsiteOAuthCallback(
  'https://experience.example.com/api/v1/bindings/oauth/callback',
);
assert.equal(callback.authorizedRedirectDomain, 'experience.example.com');
assert.equal(callback.callbackPath, '/api/v1/bindings/oauth/callback');

console.log('binding oauth config tests passed');
