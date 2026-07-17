import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { assertIlinkApiOk, buildIlinkTextReplyPayload } from './ilink-personal-bot-gateway';

test('each platform user has an independently revocable iLink bot credential', () => {
  const schema = readFileSync('src/storage/database/shared/schema.ts', 'utf8');
  const migration = readFileSync('src/storage/database/shared/migrations/0027_ilink_personal_bot_accounts.sql', 'utf8');

  assert.match(schema, /export const ilinkBotAccounts/);
  assert.match(schema, /platformUserId/);
  assert.match(schema, /ownerWeixinUserId/);
  assert.match(schema, /tokenEncrypted/);
  assert.match(migration, /UNIQUE\s*\(platform_user_id\)/i);
  assert.match(migration, /UNIQUE\s*\(bot_account_id\)/i);
});

test('iLink setup creates a separate bot identity, never an ordinary personal-WeChat transport', () => {
  const setup = readFileSync('src/app/api/v1/admin/ilink-bots/qr/route.ts', 'utf8');
  const gateway = readFileSync('src/lib/server/ilink-personal-bot-gateway.ts', 'utf8');

  assert.match(setup, /get_bot_qrcode/);
  assert.match(setup, /get_qrcode_status/);
  assert.match(setup, /scaned_but_redirect/);
  assert.match(setup, /tokenEncrypted/);
  assert.match(gateway, /ilink\/bot\/getupdates/);
  assert.match(gateway, /ownerWeixinUserId/);
  assert.match(gateway, /ilink\/bot\/sendmessage/);
  assert.match(gateway, /ingestIlinkPersonalMedia/);
  assert.match(gateway, /recordAccountError/);
  assert.match(gateway, /ilink\/bot\/msg\/notifystart/);
  const media = readFileSync('src/lib/server/ilink-personal-media-ingest.ts', 'utf8');
  assert.match(media, /aes-128-ecb/);
  assert.match(media, /materials\/ilink-inbox/);
});

test('admins can provision a personal assistant for themselves or another selected platform user before iLink binding', () => {
  const assistantSetup = readFileSync('src/app/api/v1/admin/ilink-bots/assistant/route.ts', 'utf8');
  const settings = readFileSync('src/components/wecom-bindings-settings.tsx', 'utf8');

  assert.match(assistantSetup, /eq\(agentInstances\.boundUserId, platformUserId\)/);
  assert.match(assistantSetup, /eq\(platformUsers\.status, 'approved'\)/);
  assert.match(assistantSetup, /modelConfigId: model\.id/);
  assert.match(settings, /\/api\/v1\/admin\/ilink-bots\/assistant/);
  assert.match(settings, /管理员本人也适用/);
});

test('agent_runs trigger check allows ilink_ingest so Hermes can reply to personal WeChat', () => {
  const migration = readFileSync('src/storage/database/shared/migrations/0028_ilink_agent_run_trigger.sql', 'utf8');
  const bootstrap = readFileSync('database-schema.sql', 'utf8');
  const ingest = readFileSync('src/lib/server/hermes/wecom-text-ingest.ts', 'utf8');
  const expectedHash = '0a93d89bee5461417a9b2826faea4757d408b431b94d65608cf7847c74f5760d';

  assert.match(migration, /ilink_ingest/);
  assert.match(migration, /agent_runs_trigger_check/);
  assert.match(bootstrap, /ilink_ingest/);
  assert.match(ingest, /trigger:\s*'ilink_ingest'/);
  assert.equal(createHash('sha256').update(migration).digest('hex'), expectedHash);
});

test('outbound sendmessage payload requires context_token and rejects empty replies', () => {
  const payload = buildIlinkTextReplyPayload({
    toUserId: 'user@im.wechat',
    contextToken: 'ctx-token',
    text: '你好',
    clientId: 'client-1',
  });
  assert.equal(payload.msg.context_token, 'ctx-token');
  const sanitizedPayload = buildIlinkTextReplyPayload({
    toUserId: 'user@im.wechat',
    contextToken: 'ctx-token',
    text: '<think>internal reasoning must not be delivered</think>\nfinal reply',
    clientId: 'client-2',
  });
  assert.equal(sanitizedPayload.msg.item_list[0]?.text_item?.text, 'final reply');
  assert.equal(payload.msg.to_user_id, 'user@im.wechat');
  assert.equal(payload.msg.from_user_id, '');
  assert.equal(payload.msg.message_type, 2);
  assert.equal(payload.msg.item_list[0]?.text_item?.text, '你好');
  assert.throws(() => buildIlinkTextReplyPayload({
    toUserId: 'user@im.wechat',
    contextToken: '',
    text: '你好',
  }), /ilink_missing_context_token/);
  assert.throws(() => buildIlinkTextReplyPayload({
    toUserId: 'user@im.wechat',
    contextToken: 'ctx',
    text: '   ',
  }), /ilink_empty_reply_text/);
});

test('iLink API ret/errcode failures are surfaced instead of silent success', () => {
  assert.doesNotThrow(() => assertIlinkApiOk({ ret: 0 }, 'ilink/bot/sendmessage'));
  assert.throws(() => assertIlinkApiOk({ ret: -2 }, 'ilink/bot/sendmessage'), /ilink_api_ret_-2/);
  assert.throws(() => assertIlinkApiOk({ errcode: -14 }, 'ilink/bot/sendmessage'), /ilink_session_expired/);
});
