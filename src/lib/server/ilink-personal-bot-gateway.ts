import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { decryptSecret } from '@/lib/server/secret-crypto';
import { ingestIlinkPersonalTextMessage } from '@/lib/server/hermes/wecom-text-ingest';
import { ingestIlinkPersonalMedia } from '@/lib/server/ilink-personal-media-ingest';
import { writeSecurityAudit } from '@/lib/server/security-audit';
import { getDb } from '@/storage/database/pg-db';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { ilinkBotAccounts } from '@/storage/database/shared/schema';
import { stripAssistantReasoning } from '@/lib/assistant-output';

const CHANNEL_VERSION = '2.2.0';
const POLL_TIMEOUT_MS = 40_000;
const RETRY_MS = 3_000;
const MESSAGE_DEDUPE_MS = 5 * 60_000;
const SAFE_ERROR_MAX = 180;

type Account = typeof ilinkBotAccounts.$inferSelect;
type LivePoller = { stop: () => void };
const livePollers = new Map<string, LivePoller>();
const recentMessageIds = new Map<string, number>();

export type IlinkGatewayStatus = { activePollers: number; updatedAt: string };
let gatewayStatus: IlinkGatewayStatus = { activePollers: 0, updatedAt: new Date().toISOString() };

function updateStatus() {
  gatewayStatus = { activePollers: livePollers.size, updatedAt: new Date().toISOString() };
}

function headers(token: string, body: string) {
  return {
    'content-type': 'application/json',
    'authorization': `Bearer ${token}`,
    'authorizationtype': 'ilink_bot_token',
    'x-wechat-uin': Buffer.from(String(randomBytes(4).readUInt32BE(0))).toString('base64'),
    'iLink-App-Id': 'bot',
    'iLink-App-ClientVersion': String((2 << 16) | (2 << 8)),
    'content-length': String(Buffer.byteLength(body)),
  };
}

function safeErrorCode(error: unknown, fallback = 'ilink_failed') {
  const raw = error instanceof Error ? error.message : String(error || fallback);
  return raw.replace(/[^\w.-]+/g, '_').slice(0, SAFE_ERROR_MAX) || fallback;
}

function messageIdFingerprint(messageId: string) {
  return createHash('sha256').update(messageId).digest('hex').slice(0, 12);
}

/** Exported for contract tests: outbound replies must echo inbound context_token. */
export function buildIlinkTextReplyPayload(input: {
  toUserId: string;
  contextToken: string;
  text: string;
  clientId?: string;
}) {
  const contextToken = input.contextToken.trim();
  if (!contextToken) throw new Error('ilink_missing_context_token');
  const text = stripAssistantReasoning(input.text);
  if (!text) throw new Error('ilink_empty_reply_text');
  return {
    msg: {
      from_user_id: '',
      to_user_id: input.toUserId,
      client_id: input.clientId || randomUUID(),
      message_type: 2,
      message_state: 2,
      context_token: contextToken,
      item_list: [{ type: 1, text_item: { text: text.slice(0, 2000) } }],
    },
  };
}

export function assertIlinkApiOk(payload: Record<string, unknown>, endpoint: string) {
  const errorCode = Number(payload.errcode ?? 0);
  if (errorCode === -14 || errorCode === -2) throw new Error(`ilink_session_expired`);
  if (errorCode !== 0) throw new Error(`ilink_api_${errorCode}`);
  if (typeof payload.ret === 'number' && payload.ret !== 0) {
    throw new Error(`ilink_api_ret_${payload.ret}`);
  }
  void endpoint;
}

async function recordAccountError(accountId: string, error: unknown, stage: string, messageId?: string) {
  const code = safeErrorCode(error, stage);
  const db = await getDb();
  await db.update(ilinkBotAccounts).set({
    lastError: code,
    updatedAt: sql`NOW()`,
  }).where(eq(ilinkBotAccounts.id, accountId)).execute();
  await writeSecurityAudit(getSupabaseClient(), {
    action: 'ilink_bot.outbound',
    outcome: 'failed',
    actorUserId: null,
    targetType: 'ilink_bot_account',
    targetId: accountId,
    metadata: {
      stage,
      errorCode: code,
      messageIdHash: messageId ? messageIdFingerprint(messageId) : undefined,
    },
  });
}

async function postIlink(account: Account, token: string, endpoint: string, payload: Record<string, unknown>, timeoutMs = 15_000) {
  const body = JSON.stringify({ ...payload, base_info: { channel_version: CHANNEL_VERSION } });
  const response = await fetch(`${account.baseUrl.replace(/\/+$/, '')}/${endpoint}`, {
    method: 'POST', headers: headers(token, body), body, signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) throw new Error(`ilink_http_${response.status}`);
  const json = await response.json() as Record<string, unknown>;
  assertIlinkApiOk(json, endpoint);
  return json;
}

function textFromItems(items: unknown) {
  if (!Array.isArray(items)) return '';
  return items.map((item) => {
    if (!item || typeof item !== 'object') return '';
    const textItem = (item as Record<string, unknown>).text_item;
    return textItem && typeof textItem === 'object' ? String((textItem as Record<string, unknown>).text || '').trim() : '';
  }).filter(Boolean).join('\n');
}

function isDuplicateMessage(accountId: string, messageId: string) {
  const now = Date.now();
  for (const [key, receivedAt] of recentMessageIds) if (receivedAt < now - MESSAGE_DEDUPE_MS) recentMessageIds.delete(key);
  const key = `${accountId}:${messageId}`;
  if (recentMessageIds.has(key)) return true;
  recentMessageIds.set(key, now);
  return false;
}

async function ingestMediaFromItems(account: Account, messageId: string, items: unknown) {
  if (!Array.isArray(items)) return [] as string[];
  const ids: string[] = [];
  for (const item of items) {
    if (!item || typeof item !== 'object') continue;
    const value = item as Record<string, unknown>;
    const mediaType = Number(value.type) === 2 ? 'image' : Number(value.type) === 5 ? 'video' : null;
    if (!mediaType) continue;
    const mediaKey = mediaType === 'image' ? 'image_item' : 'video_item';
    const mediaContainer = value[mediaKey];
    const media = mediaContainer && typeof mediaContainer === 'object' ? (mediaContainer as Record<string, unknown>).media : null;
    if (!media || typeof media !== 'object') continue;
    const ref = media as Record<string, unknown>;
    const encryptedQueryParam = String(ref.encrypt_query_param || '').trim();
    const aesKey = String(ref.aes_key || (mediaContainer as Record<string, unknown>).aeskey || '').trim();
    if (!encryptedQueryParam || !aesKey) continue;
    const material = await ingestIlinkPersonalMedia({
      platformUserId: account.platformUserId, messageId, mediaType, encryptedQueryParam, aesKey,
    });
    ids.push(material.id);
  }
  return ids;
}

async function sendTextReply(account: Account, token: string, toUserId: string, contextToken: string, text: string, messageId: string) {
  try {
    await postIlink(account, token, 'ilink/bot/sendmessage', buildIlinkTextReplyPayload({
      toUserId,
      contextToken,
      text,
    }));
    const db = await getDb();
    await db.update(ilinkBotAccounts).set({ lastError: null, updatedAt: sql`NOW()` })
      .where(eq(ilinkBotAccounts.id, account.id)).execute();
  } catch (error) {
    await recordAccountError(account.id, error, 'sendmessage', messageId);
    throw error;
  }
}

async function handleMessage(account: Account, token: string, message: Record<string, unknown>) {
  const messageType = Number(message.message_type ?? 1);
  if (messageType !== 1) return;
  const sender = String(message.from_user_id || '').trim();
  if (!sender || sender !== account.ownerWeixinUserId || sender === account.botAccountId) return;
  const text = textFromItems(message.item_list);
  const messageId = String(message.message_id || randomUUID()).trim();
  if (isDuplicateMessage(account.id, messageId)) return;
  const contextToken = String(message.context_token || '').trim();
  if (!contextToken) {
    await recordAccountError(account.id, new Error('ilink_missing_context_token'), 'inbound_context', messageId);
    return;
  }

  let mediaIds: string[] = [];
  try {
    mediaIds = await ingestMediaFromItems(account, messageId, message.item_list);
  } catch (error) {
    await recordAccountError(account.id, error, 'media_ingest', messageId);
  }

  const content = [text, mediaIds.length ? `已接收素材 ID：${mediaIds.join(', ')}` : ''].filter(Boolean).join('\n');
  if (!content) return;

  let result: Awaited<ReturnType<typeof ingestIlinkPersonalTextMessage>>;
  try {
    result = await ingestIlinkPersonalTextMessage({
      agentInstanceId: account.agentInstanceId,
      platformUserId: account.platformUserId,
      externalUserId: sender,
      messageId,
      content,
    });
  } catch (error) {
    await recordAccountError(account.id, error, 'hermes_ingest', messageId);
    await sendTextReply(
      account,
      token,
      sender,
      contextToken,
      'AI助手暂时无法处理该消息，请稍后重试。',
      messageId,
    ).catch(() => undefined);
    return;
  }

  if (!result.accepted) {
    await recordAccountError(account.id, new Error(result.reason || 'ingest_rejected'), 'hermes_rejected', messageId);
    return;
  }

  const reply = (result.reply || '').trim()
    || 'AI助手已收到消息，但暂时没有可用回复，请稍后重试。';
  await sendTextReply(account, token, sender, contextToken, reply, messageId);
}

function startPoller(account: Account) {
  if (livePollers.has(account.id)) return;
  let stopped = false;
  let syncBuffer = account.syncBuffer || '';
  const token = decryptSecret(account.tokenEncrypted);
  if (!token) return;
  const stop = () => { stopped = true; };
  livePollers.set(account.id, { stop });
  updateStatus();
  void (async () => {
    try {
      void postIlink(account, token, 'ilink/bot/msg/notifystart', {}).catch(() => undefined);
      while (!stopped) {
        try {
          const response = await postIlink(account, token, 'ilink/bot/getupdates', { get_updates_buf: syncBuffer }, POLL_TIMEOUT_MS);
          const nextSyncBuffer = String(response.get_updates_buf || '');
          if (nextSyncBuffer && nextSyncBuffer !== syncBuffer) {
            syncBuffer = nextSyncBuffer;
            const db = await getDb();
            await db.update(ilinkBotAccounts).set({ syncBuffer, lastError: null, updatedAt: sql`NOW()` })
              .where(eq(ilinkBotAccounts.id, account.id)).execute();
          }
          for (const item of Array.isArray(response.msgs) ? response.msgs : []) {
            if (item && typeof item === 'object') {
              void handleMessage(account, token, item as Record<string, unknown>).catch(async (error) => {
                await recordAccountError(account.id, error, 'handle_message').catch(() => undefined);
              });
            }
          }
        } catch (error) {
          if (stopped) return;
          const code = safeErrorCode(error, 'ilink_poll_failed');
          if (code.includes('session_expired')) {
            const db = await getDb();
            await db.update(ilinkBotAccounts).set({ status: 'expired', lastError: 'ilink_session_expired', updatedAt: sql`NOW()` })
              .where(eq(ilinkBotAccounts.id, account.id)).execute();
            return;
          }
          const db = await getDb();
          await db.update(ilinkBotAccounts).set({ lastError: code, updatedAt: sql`NOW()` })
            .where(eq(ilinkBotAccounts.id, account.id)).execute();
          await new Promise((resolve) => setTimeout(resolve, RETRY_MS));
        }
      }
    } finally {
      void postIlink(account, token, 'ilink/bot/msg/notifystop', {}).catch(() => undefined);
      livePollers.delete(account.id);
      updateStatus();
    }
  })();
}

export async function refreshIlinkPersonalBotGateway() {
  const db = await getDb();
  const active = await db.select().from(ilinkBotAccounts).where(eq(ilinkBotAccounts.status, 'active')).execute();
  const activeIds = new Set(active.map((item) => item.id));
  for (const [id, poller] of livePollers) if (!activeIds.has(id)) poller.stop();
  for (const account of active) startPoller(account);
  updateStatus();
  return getIlinkPersonalBotGatewayStatus();
}

export async function startIlinkPersonalBotGateway() {
  try { await refreshIlinkPersonalBotGateway(); } catch { updateStatus(); }
  return () => {
    for (const poller of livePollers.values()) poller.stop();
    livePollers.clear();
    updateStatus();
  };
}

export function getIlinkPersonalBotGatewayStatus() { return { ...gatewayStatus }; }
