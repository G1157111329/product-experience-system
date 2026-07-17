import assert from 'node:assert/strict';
import { createCipheriv, createHash, randomBytes } from 'node:crypto';
import { verifyWecomCallback, claimWecomCallback, processWecomCallback } from './wecom-callback-auth';
import * as wecomAuth from './wecom-callback-auth';
import { readFileSync } from 'node:fs';

const token = 'callback-token';
const corpId = 'corp-123';
const aesKey = randomBytes(32);

function encrypted(xml: string) {
  const body = Buffer.from(xml);
  const raw = Buffer.concat([randomBytes(16), Buffer.from([0, 0, 0, body.length]), body, Buffer.from(corpId)]);
  const pad = 32 - (raw.length % 32);
  const padded = Buffer.concat([raw, Buffer.alloc(pad, pad)]);
  const cipher = createCipheriv('aes-256-cbc', aesKey, aesKey.subarray(0, 16));
  cipher.setAutoPadding(false);
  return Buffer.concat([cipher.update(padded), cipher.final()]).toString('base64');
}

function signedBody(now = 1_800_000_000, mediaType = 'image', mediaId = 'media-1', content = '') {
  const ciphertext = encrypted(`<xml><ToUserName><![CDATA[corp-123]]></ToUserName><FromUserName><![CDATA[user-a]]></FromUserName><CreateTime>1800000000</CreateTime><MsgType><![CDATA[${mediaType}]]></MsgType>${mediaId ? `<MediaId><![CDATA[${mediaId}]]></MediaId>` : ''}${content ? `<Content><![CDATA[${content}]]></Content>` : ''}<MsgId>msg-1</MsgId></xml>`);
  const timestamp = String(now);
  const nonce = 'nonce-1';
  const signature = createHash('sha1').update([token, timestamp, nonce, ciphertext].sort().join('')).digest('hex');
  return { signature, timestamp, nonce, encryptedBody: `<xml><Encrypt><![CDATA[${ciphertext}]]></Encrypt></xml>`, now: now * 1000 };
}

process.env.WECOM_CALLBACK_TOKEN = token;
process.env.WECOM_ENCODING_AES_KEY = aesKey.toString('base64').replace(/=$/, '');
process.env.WECOM_CORP_ID = corpId;

const verified = verifyWecomCallback(signedBody());
assert.equal(verified.messageId, 'msg-1');
assert.equal(verified.mediaId, 'media-1');
assert.equal(verified.externalUserId, 'user-a');

for (const [name, mutate] of [
  ['bad signature', (x: ReturnType<typeof signedBody>) => ({ ...x, signature: 'bad' })],
  ['stale timestamp', (x: ReturnType<typeof signedBody>) => ({ ...x, now: x.now + 6 * 60_000 })],
  ['invalid aes', (x: ReturnType<typeof signedBody>) => ({ ...x, encryptedBody: '<xml><Encrypt>bad</Encrypt></xml>' })],
] as const) {
  assert.throws(() => verifyWecomCallback(mutate(signedBody())), Error, name);
}

process.env.WECOM_CORP_ID = 'wrong-corp';
assert.throws(() => verifyWecomCallback(signedBody()), /corp/i);
process.env.WECOM_CORP_ID = corpId;

const previousToken = process.env.WECOM_CALLBACK_TOKEN;
delete process.env.WECOM_CALLBACK_TOKEN;
assert.throws(() => verifyWecomCallback(signedBody()), /config/i);
process.env.WECOM_CALLBACK_TOKEN = previousToken;

const previousKey = process.env.WECOM_ENCODING_AES_KEY;
delete process.env.WECOM_ENCODING_AES_KEY;
assert.throws(() => verifyWecomCallback(signedBody()), /config/i);
process.env.WECOM_ENCODING_AES_KEY = previousKey;

const missingMedia = signedBody();
const malformedCipher = encrypted('<xml><FromUserName>user-a</FromUserName><MsgType>image</MsgType><MsgId>msg-x</MsgId></xml>');
missingMedia.encryptedBody = `<xml><Encrypt><![CDATA[${malformedCipher}]]></Encrypt></xml>`;
missingMedia.signature = createHash('sha1').update([token, missingMedia.timestamp, missingMedia.nonce, malformedCipher].sort().join('')).digest('hex');
assert.throws(() => verifyWecomCallback(missingMedia), /payload/i);

async function main() {
  assert.equal(typeof wecomAuth.settleWecomRouteDenial, 'function', 'route denial audit boundary must be injectable');
  for (const denial of [
    { reason: 'wecom_material_ingest_disabled', status: 503 },
    { reason: 'wecom_plaintext_payload_rejected', status: 415 },
    { reason: 'wecom_callback_body_unreadable', status: 400 },
    { reason: 'encrypted_echostr_required', status: 400 },
    { reason: 'wecom_signature_invalid', status: 403 },
  ]) {
    let normalAudits = 0;
    assert.deepEqual(await wecomAuth.settleWecomRouteDenial(denial, async () => { normalAudits += 1; }), denial);
    assert.equal(normalAudits, 1, `${denial.reason} writes exactly one audit when storage is healthy`);
    assert.deepEqual(await wecomAuth.settleWecomRouteDenial(denial, async () => { throw new Error('audit unavailable'); }), denial, `${denial.reason} preserves stable status/code when audit fails`);
  }
  let rejectedEnqueues = 0;
  const rejected = [
    { ...signedBody(), signature: 'bad' },
    { ...signedBody(), now: signedBody().now + 6 * 60_000 },
    { ...signedBody(), encryptedBody: '<xml><Encrypt>bad</Encrypt></xml>' },
    missingMedia,
  ];
  for (const request of rejected) {
    const audits: Array<Record<string, unknown>> = [];
    await assert.rejects(() => processWecomCallback(
      request,
      async () => { rejectedEnqueues += 1; },
      async (denial) => { audits.push(denial); },
    ), Error);
    assert.equal(audits.length, 1, 'each rejected callback emits one injectable denial audit');
    assert.equal(audits[0].actorUserId, null, 'public callback audit has no fabricated user');
    assert.equal(audits[0].targetType, 'wecom_callback');
  }
  const configuredKey = process.env.WECOM_ENCODING_AES_KEY;
  delete process.env.WECOM_ENCODING_AES_KEY;
  await assert.rejects(() => processWecomCallback(signedBody(), async () => { rejectedEnqueues += 1; }), /config/i);
  process.env.WECOM_ENCODING_AES_KEY = configuredKey;
  const configuredCorp = process.env.WECOM_CORP_ID;
  process.env.WECOM_CORP_ID = 'wrong-corp';
  await assert.rejects(() => processWecomCallback(signedBody(), async () => { rejectedEnqueues += 1; }), /corp/i);
  process.env.WECOM_CORP_ID = configuredCorp;
  assert.equal(rejectedEnqueues, 0, 'every rejected callback must stop before enqueue');
  for (const [mediaType, mediaId] of [['file', 'media-file'], ['voice', 'media-voice']] as const) {
    let unsupportedEnqueues = 0;
    const audits: Array<Record<string, unknown>> = [];
    await assert.rejects(() => processWecomCallback(
      signedBody(1_800_000_000, mediaType, mediaId),
      async () => { unsupportedEnqueues += 1; },
      async (denial) => { audits.push(denial); },
    ), /payload/i);
    assert.equal(unsupportedEnqueues, 0, `${mediaType} never reaches the ingest queue`);
    assert.equal(audits.length, 1, `${mediaType} rejection is audited`);
  }
  const ingested: Array<Record<string, string>> = [];
  const textResult = await processWecomCallback(
    signedBody(1_800_000_000, 'text', '', '保存到 Hermes 会话'),
    async () => { throw new Error('text must not enter media queue'); },
    undefined,
    async (message) => { ingested.push(message); return { accepted: true, conversationId: 'conversation-1' }; },
    async () => true,
  );
  assert.equal((textResult as { conversationId?: string }).conversationId, 'conversation-1');
  assert.equal(ingested[0]?.content, '保存到 Hermes 会话');
  await assert.rejects(() => processWecomCallback(
    { ...signedBody(), signature: 'bad' },
    async () => { throw new Error('enqueue must not run'); },
    async () => { throw new Error('audit unavailable'); },
  ), /wecom_signature_invalid/, 'audit storage failure preserves the stable callback rejection');
  let claims = 0;
  let enqueues = 0;
  const tx = {
    async claim() { claims += 1; return claims === 1; },
    async enqueue() { enqueues += 1; return { id: 'job-1', downloadStatus: 'pending' }; },
  };
  await claimWecomCallback(verified, tx);
  await assert.rejects(() => claimWecomCallback(verified, tx), /replay/i);
  assert.equal(enqueues, 1, 'replay must not enqueue');
  const routeSource = readFileSync('src/app/api/v1/wecom/callback/route.ts', 'utf8');
  assert.match(routeSource, /contentType\.includes\('application\/json'\)/);
  assert.match(routeSource, /processWecomCallback\([\s\S]*?callbackInput\(req, body\),[\s\S]*?writeSecurityAudit/);
  assert.match(routeSource, /writeSecurityAudit\([\s\S]*?outcome:\s*'denied'/, 'every route rejection funnels through security audit');
  assert.match(routeSource, /try\s*\{\s*body\s*=\s*await req\.text\(\);\s*\}\s*catch\s*\{\s*return denyCallback\(/, 'request body read failures are audited too');
  for (const contract of [
    /if \(!echostr\) return denyCallback\(/,
    /catch \(error\) \{\s*return denyCallback\(req, traceId, error instanceof WecomCallbackError/,
    /if \(!flags\.wecomMaterialIngestEnabled\) return denyCallback\(/,
    /if \(contentType\.includes\('application\/json'\)\) return denyCallback\(/,
    /catch \{ return denyCallback\(req, traceId, 'wecom_callback_body_unreadable'/,
  ]) assert.match(routeSource, contract, 'every route-level rejection uses the audit-failure-safe denial boundary');
  console.log('wecom callback auth tests passed');
}

void main();
