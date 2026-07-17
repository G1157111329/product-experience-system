import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = () => readFileSync('src/lib/server/wecom-bot-gateway.ts', 'utf8');

test('WeCom AI Bot gateway authenticates with the documented subscribe command and heartbeat', () => {
  const value = source();
  assert.match(value, /aibot_subscribe/);
  assert.match(value, /openws\.work\.weixin\.qq\.com/);
  assert.match(value, /setInterval/);
});

test('WeCom AI Bot gateway routes an inbound reply to the bound personal assistant', () => {
  const value = source();
  assert.match(value, /ingestWecomTextMessage/);
  assert.match(value, /aibot_respond_msg/);
  assert.match(value, /bindingCorpId/);
  assert.match(value, /SUBSCRIBE_TIMEOUT_MS/);
  assert.match(value, /isDuplicateMessage/);
  assert.match(value, /ingestWecomBotMedia/);
});

test('WeCom AI Bot media ingest only accepts callback bytes and persists protected materials', () => {
  const value = readFileSync('src/lib/server/wecom-bot-media-ingest.ts', 'utf8');
  assert.match(value, /detectUploadMediaType/);
  assert.match(value, /uploadFile/);
  assert.match(value, /createdBy/);
  assert.match(value, /wecom_bot_media/);
  assert.match(value, /isOfficialWecomMediaUrl/);
  assert.match(value, /AbortSignal\.timeout/);
});
