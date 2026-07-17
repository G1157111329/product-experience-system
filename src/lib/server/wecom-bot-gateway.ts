import WebSocket from 'ws';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import {
  BINDING_OAUTH_SETTING_KEY,
  resolveWecomBotConfig,
  type ResolvedWecomBotConfig,
  type StoredBindingOAuthConfig,
} from './binding-oauth-config';
import { ingestWecomTextMessage } from './hermes/wecom-text-ingest';
import { findActiveBinding } from './wecom-ingest-service';
import { ingestWecomBotMedia } from './wecom-bot-media-ingest';

const DEFAULT_WECOM_WS_URL = 'wss://openws.work.weixin.qq.com';
const HEARTBEAT_MS = 30_000;
const RECONNECT_MS = 5_000;
const SUBSCRIBE_TIMEOUT_MS = 15_000;
const MESSAGE_DEDUPE_MS = 5 * 60_000;

export type WecomBotGatewayStatus = {
  state: 'disabled' | 'connecting' | 'connected' | 'error';
  detail?: string;
  updatedAt: string;
};

let socket: WebSocket | null = null;
let heartbeat: ReturnType<typeof setInterval> | null = null;
let reconnect: ReturnType<typeof setTimeout> | null = null;
let subscribeTimeout: ReturnType<typeof setTimeout> | null = null;
let status: WecomBotGatewayStatus = { state: 'disabled', updatedAt: new Date().toISOString() };
let activeConfigFingerprint = '';
const recentMessageIds = new Map<string, number>();

function setStatus(state: WecomBotGatewayStatus['state'], detail?: string) {
  status = { state, detail, updatedAt: new Date().toISOString() };
}

function clearTimers() {
  if (heartbeat) clearInterval(heartbeat);
  if (reconnect) clearTimeout(reconnect);
  if (subscribeTimeout) clearTimeout(subscribeTimeout);
  heartbeat = null;
  reconnect = null;
  subscribeTimeout = null;
}

function makeRequestId(prefix: string) {
  return `${prefix}-${crypto.randomUUID().replace(/-/g, '')}`;
}

function parseJson(value: WebSocket.RawData) {
  try {
    const parsed = JSON.parse(Buffer.isBuffer(value) ? value.toString('utf8') : String(value));
    return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function payloadRequestId(payload: Record<string, unknown>) {
  const headers = payload.headers;
  return headers && typeof headers === 'object' ? String((headers as Record<string, unknown>).req_id || '') : '';
}

function extractText(body: Record<string, unknown>) {
  const text = body.text;
  if (text && typeof text === 'object') {
    const content = String((text as Record<string, unknown>).content || '').trim();
    if (content) return content;
  }
  const mixed = body.mixed;
  const items = mixed && typeof mixed === 'object' ? (mixed as Record<string, unknown>).msg_item : null;
  if (!Array.isArray(items)) return '';
  return items
    .map((item) => {
      if (!item || typeof item !== 'object') return '';
      const record = item as Record<string, unknown>;
      const entry = record.text;
      return entry && typeof entry === 'object' ? String((entry as Record<string, unknown>).content || '').trim() : '';
    })
    .filter(Boolean)
    .join('\n');
}

type CallbackMedia = {
  mediaId: string;
  mediaType: 'image' | 'video';
  base64?: string;
  url?: string;
  aesKey?: string;
  declaredMime?: string;
};

function extractMedia(body: Record<string, unknown>, messageId: string) {
  const candidates: Record<string, unknown>[] = [body];
  const mixed = body.mixed;
  const items = mixed && typeof mixed === 'object' ? (mixed as Record<string, unknown>).msg_item : null;
  if (Array.isArray(items)) {
    for (const item of items) if (item && typeof item === 'object') candidates.push(item as Record<string, unknown>);
  }
  const media: CallbackMedia[] = [];
  for (const candidate of candidates) {
    for (const mediaType of ['image', 'video'] as const) {
      const item = candidate[mediaType];
      if (!item || typeof item !== 'object') continue;
      const value = item as Record<string, unknown>;
      const base64 = String(value.base64 || value.content || '').trim() || undefined;
      const url = String(value.url || '').trim() || undefined;
      if (!base64 && !url) continue;
      media.push({
        mediaId: String(value.media_id || value.mediaid || value.id || `${messageId}-${media.length + 1}`).slice(0, 200),
        mediaType,
        base64,
        url,
        aesKey: String(value.aeskey || value.aes_key || '').trim() || undefined,
        declaredMime: String(value.content_type || value.mime_type || '').trim() || undefined,
      });
    }
  }
  return media;
}

function isGroupMessage(body: Record<string, unknown>) {
  return Boolean(body.roomid || body.chatid)
    || ['group', 'groupchat'].includes(String(body.chattype || body.chat_type || '').toLowerCase());
}

function isDuplicateMessage(messageId: string) {
  const now = Date.now();
  for (const [id, receivedAt] of recentMessageIds) {
    if (receivedAt < now - MESSAGE_DEDUPE_MS) recentMessageIds.delete(id);
  }
  if (recentMessageIds.has(messageId)) return true;
  recentMessageIds.set(messageId, now);
  return false;
}

function closeSocket() {
  if (socket) {
    socket.removeAllListeners();
    socket.close();
  }
  socket = null;
}

function sendJson(payload: Record<string, unknown>) {
  if (!socket || socket.readyState !== WebSocket.OPEN) return false;
  socket.send(JSON.stringify(payload));
  return true;
}

async function handleInbound(config: ResolvedWecomBotConfig, payload: Record<string, unknown>) {
  const body = payload.body;
  if (!body || typeof body !== 'object') return;
  const value = body as Record<string, unknown>;
  const sender = value.from;
  const externalUserId = sender && typeof sender === 'object'
    ? String((sender as Record<string, unknown>).userid || '').trim()
    : '';
  const messageId = String(value.msgid || payloadRequestId(payload) || '').trim();
  const content = extractText(value);
  const replyRequestId = payloadRequestId(payload);
  const groupMessage = isGroupMessage(value);
  if (!externalUserId || !messageId || !replyRequestId) return;
  if ((!groupMessage && config.dmPolicy === 'disabled') || (groupMessage && config.groupPolicy === 'disabled')) return;
  if (isDuplicateMessage(messageId)) return;

  const binding = await findActiveBinding(externalUserId, config.bindingCorpId);
  if (!binding?.agentInstanceId) return;
  const mediaIds: string[] = [];
  for (const media of extractMedia(value, messageId)) {
    try {
      const ingested = await ingestWecomBotMedia({
        ...media,
        messageId,
        platformUserId: binding.platformUserId,
        wecomBindingId: binding.id,
      });
      mediaIds.push(ingested.materialId);
    } catch (error) {
      setStatus('error', error instanceof Error ? error.message : 'media_ingest_failed');
    }
  }
  const userContent = [content, mediaIds.length ? `已接收素材 ID：${mediaIds.join(', ')}` : ''].filter(Boolean).join('\n');
  if (!userContent) return;

  const result = await ingestWecomTextMessage({
    corpId: config.bindingCorpId,
    externalUserId,
    messageId,
    content: userContent,
  });
  if (!result.accepted || !result.reply) return;
  sendJson({
    cmd: 'aibot_respond_msg',
    headers: { req_id: replyRequestId },
    body: { msgtype: 'markdown', markdown: { content: result.reply } },
  });
}

function scheduleReconnect(config: ResolvedWecomBotConfig) {
  if (reconnect) return;
  reconnect = setTimeout(() => {
    reconnect = null;
    connect(config);
  }, RECONNECT_MS);
  reconnect.unref?.();
}

function connect(config: ResolvedWecomBotConfig) {
  clearTimers();
  closeSocket();
  setStatus('connecting');
  const requestId = makeRequestId('subscribe');
  const url = config.websocketUrl || DEFAULT_WECOM_WS_URL;
  const nextSocket = new WebSocket(url);
  socket = nextSocket;
  let authenticated = false;

  nextSocket.once('open', () => {
    if (socket !== nextSocket) return;
    sendJson({
      cmd: 'aibot_subscribe',
      headers: { req_id: requestId },
      body: { bot_id: config.botId, secret: config.secret, device_id: crypto.randomUUID().replace(/-/g, '') },
    });
    subscribeTimeout = setTimeout(() => {
      if (socket !== nextSocket || authenticated) return;
      setStatus('error', 'subscribe_timeout');
      nextSocket.close();
    }, SUBSCRIBE_TIMEOUT_MS);
    subscribeTimeout.unref?.();
  });
  nextSocket.on('message', (raw) => {
    const payload = parseJson(raw);
    if (!payload) return;
    if (!authenticated && payloadRequestId(payload) === requestId) {
      if (subscribeTimeout) clearTimeout(subscribeTimeout);
      subscribeTimeout = null;
      const errorCode = Number(payload.errcode || 0);
      if (errorCode !== 0) {
        setStatus('error', String(payload.errmsg || `subscribe_failed_${errorCode}`));
        nextSocket.close();
        return;
      }
      authenticated = true;
      setStatus('connected');
      heartbeat = setInterval(() => {
        sendJson({ cmd: 'ping', headers: { req_id: makeRequestId('ping') }, body: {} });
      }, HEARTBEAT_MS);
      heartbeat.unref?.();
      return;
    }
    if (String(payload.cmd || '') === 'aibot_msg_callback' && authenticated) {
      void handleInbound(config, payload).catch((error) => setStatus('error', error instanceof Error ? error.message : 'inbound_failed'));
    }
  });
  nextSocket.on('error', (error) => setStatus('error', error.message));
  nextSocket.on('close', () => {
    if (socket !== nextSocket) return;
    socket = null;
    if (activeConfigFingerprint) scheduleReconnect(config);
  });
}

async function loadConfig() {
  const client = getSupabaseClient();
  const { data, error } = await client
    .from('platform_settings')
    .select('value')
    .eq('key', BINDING_OAUTH_SETTING_KEY)
    .maybeSingle();
  if (error) throw new Error(error.message || 'wecom_bot_config_read_failed');
  return resolveWecomBotConfig((data?.value || {}) as StoredBindingOAuthConfig);
}

export async function refreshWecomBotGateway() {
  const config = await loadConfig();
  const fingerprint = `${config.source}:${config.botId}:${config.bindingCorpId}:${config.websocketUrl}:${config.secret}`;
  if (!config.ready) {
    activeConfigFingerprint = '';
    clearTimers();
    closeSocket();
    setStatus('disabled', 'credentials_missing');
    return getWecomBotGatewayStatus();
  }
  if (fingerprint !== activeConfigFingerprint || !socket) {
    activeConfigFingerprint = fingerprint;
    connect(config);
  }
  return getWecomBotGatewayStatus();
}

export async function startWecomBotGateway() {
  try {
    await refreshWecomBotGateway();
  } catch (error) {
    setStatus('error', error instanceof Error ? error.message : 'startup_failed');
  }
  return () => {
    activeConfigFingerprint = '';
    clearTimers();
    closeSocket();
    setStatus('disabled');
  };
}

export function getWecomBotGatewayStatus() {
  return { ...status };
}
