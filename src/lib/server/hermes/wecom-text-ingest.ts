import { and, desc, eq, sql } from 'drizzle-orm';
import { getDb } from '@/storage/database/pg-db';
import {
  agentInstances,
  conversationMessages,
  conversations,
  wecomBindings,
} from '@/storage/database/shared/schema';
import { executeHermesRun } from './runtime';

export type WecomTextMessage = {
  corpId: string;
  externalUserId: string;
  messageId: string;
  content: string;
};

export type WecomTextIngestResult = {
  accepted: boolean;
  conversationId?: string;
  reason?: 'binding_not_found' | 'agent_not_found';
};

/**
 * Persists a verified official WeCom text message in its bound Hermes
 * conversation. Delivery of the assistant reply remains WeCom-channel work;
 * this boundary intentionally records it without impersonating a personal
 * WeChat account or sending through an unofficial transport.
 */
export async function ingestWecomTextMessage(message: WecomTextMessage): Promise<WecomTextIngestResult> {
  const content = message.content.trim().slice(0, 4000);
  if (!content) return { accepted: false, reason: 'binding_not_found' };

  const db = await getDb();
  const bindings = await db
    .select()
    .from(wecomBindings)
    .where(and(
      eq(wecomBindings.provider, 'wecom'),
      eq(wecomBindings.wecomUserId, message.externalUserId),
      eq(wecomBindings.wecomCorpId, message.corpId),
      eq(wecomBindings.status, 'active'),
    ))
    .limit(1)
    .execute();
  const binding = bindings[0];
  if (!binding) return { accepted: false, reason: 'binding_not_found' };

  const agentInstanceId = binding.agentInstanceId || await resolveDefaultAgentInstanceId();
  if (!agentInstanceId) return { accepted: false, reason: 'agent_not_found' };

  const conversation = await findOrCreateExternalConversation({
    agentInstanceId,
    platformUserId: binding.platformUserId,
    externalUserId: message.externalUserId,
  });
  const last = await db
    .select({ eventSeq: conversationMessages.eventSeq })
    .from(conversationMessages)
    .where(eq(conversationMessages.conversationId, conversation.id))
    .orderBy(desc(conversationMessages.eventSeq))
    .limit(1)
    .execute();
  const eventSeq = (last[0]?.eventSeq ?? 0) + 1;
  await db.insert(conversationMessages).values({
    conversationId: conversation.id,
    role: 'user',
    content,
    toolName: 'wecom_inbound_text',
    toolCallId: message.messageId,
    eventSeq,
  }).execute();

  const run = await executeHermesRun({
    agentInstanceId,
    conversationId: conversation.id,
    trigger: 'wecom_ingest',
    systemPrompt: '你是产品体验管理平台的 AI 助手。回复必须使用简体中文，简洁、准确，不编造未提供的数据。不要输出思考过程。',
    userPrompt: `企业微信用户消息：\n${content}`,
    userId: binding.platformUserId,
  });
  if (run.status === 'succeeded' && run.output) {
    await db.insert(conversationMessages).values({
      conversationId: conversation.id,
      role: 'assistant',
      content: run.output.slice(0, 4000),
      toolName: 'wecom_inbound_reply_pending_delivery',
      eventSeq: eventSeq + 1,
    }).execute();
  }
  await db.update(conversations).set({ updatedAt: sql`NOW()` }).where(eq(conversations.id, conversation.id)).execute();
  return { accepted: true, conversationId: conversation.id };
}

async function resolveDefaultAgentInstanceId() {
  const db = await getDb();
  const agents = await db
    .select({ id: agentInstances.id })
    .from(agentInstances)
    .where(and(eq(agentInstances.tenantId, 'default'), eq(agentInstances.status, 'active')))
    .orderBy(agentInstances.createdAt)
    .limit(1)
    .execute();
  return agents[0]?.id ?? null;
}

async function findOrCreateExternalConversation(input: {
  agentInstanceId: string;
  platformUserId: string;
  externalUserId: string;
}) {
  const db = await getDb();
  const existing = await db
    .select()
    .from(conversations)
    .where(and(
      eq(conversations.agentInstanceId, input.agentInstanceId),
      eq(conversations.platformUserId, input.platformUserId),
      eq(conversations.wecomUserId, input.externalUserId),
      eq(conversations.status, 'active'),
    ))
    .orderBy(desc(conversations.updatedAt))
    .limit(1)
    .execute();
  if (existing[0]) return existing[0];
  const created = await db.insert(conversations).values({
    tenantId: 'default',
    agentInstanceId: input.agentInstanceId,
    platformUserId: input.platformUserId,
    wecomUserId: input.externalUserId,
    title: '企业微信会话',
    status: 'active',
  }).returning().execute();
  return created[0]!;
}
