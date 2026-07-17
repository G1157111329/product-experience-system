import { and, desc, eq } from 'drizzle-orm';
import { getDb } from '@/storage/database/pg-db';
import {
  agentInstances,
  conversationMessages,
  conversations,
  wecomBindings,
} from '@/storage/database/shared/schema';
import { dispatchHermesTurn } from './hermes-turn';
import {
  formatOngoingTaskListReply,
  isOngoingTaskListIntent,
  type OngoingTaskSummary,
} from './workspace-skills';

export type WecomTextMessage = { corpId: string; externalUserId: string; messageId: string; content: string };
export type IlinkPersonalTextMessage = {
  agentInstanceId: string;
  platformUserId: string;
  externalUserId: string;
  messageId: string;
  content: string;
};
export type WecomTextIngestResult = {
  accepted: boolean;
  conversationId?: string;
  reply?: string;
  reason?: 'binding_not_found' | 'agent_not_found';
};

/** @deprecated use formatOngoingTaskListReply — kept for contract tests */
export function buildOngoingTaskListReply(content: string, tasks: OngoingTaskSummary[]): string | null {
  if (!isOngoingTaskListIntent(content)) return null;
  return formatOngoingTaskListReply(tasks);
}

/** Accepts only an active, exactly scoped WeCom binding. */
export async function ingestWecomTextMessage(message: WecomTextMessage): Promise<WecomTextIngestResult> {
  const content = message.content.trim().slice(0, 4000);
  if (!content) return { accepted: false, reason: 'binding_not_found' };
  const db = await getDb();
  const bindings = await db.select().from(wecomBindings).where(and(
    eq(wecomBindings.provider, 'wecom'),
    eq(wecomBindings.wecomUserId, message.externalUserId),
    eq(wecomBindings.wecomCorpId, message.corpId),
    eq(wecomBindings.status, 'active'),
  )).limit(1).execute();
  const binding = bindings[0];
  if (!binding) return { accepted: false, reason: 'binding_not_found' };
  if (!binding.agentInstanceId) return { accepted: false, reason: 'agent_not_found' };

  const agents = await db.select({ id: agentInstances.id }).from(agentInstances).where(and(
    eq(agentInstances.id, binding.agentInstanceId),
    eq(agentInstances.boundUserId, binding.platformUserId),
    eq(agentInstances.status, 'active'),
  )).limit(1).execute();
  if (!agents[0]) return { accepted: false, reason: 'agent_not_found' };
  return ingestResolvedExternalTextMessage({
    agentInstanceId: agents[0].id,
    platformUserId: binding.platformUserId,
    externalUserId: message.externalUserId,
    messageId: message.messageId,
    content,
    inboundToolName: 'wecom_inbound_text',
    trigger: 'wecom_ingest',
  });
}

/** iLink QR authorisation is bound to one platform user and one assistant. */
export async function ingestIlinkPersonalTextMessage(message: IlinkPersonalTextMessage): Promise<WecomTextIngestResult> {
  const content = message.content.trim().slice(0, 4000);
  if (!content) return { accepted: false, reason: 'binding_not_found' };
  return ingestResolvedExternalTextMessage({
    ...message,
    content,
    inboundToolName: 'ilink_inbound_text',
    trigger: 'ilink_ingest',
  });
}

async function ingestResolvedExternalTextMessage(input: {
  agentInstanceId: string;
  platformUserId: string;
  externalUserId: string;
  messageId: string;
  content: string;
  inboundToolName: string;
  trigger: 'wecom_ingest' | 'ilink_ingest';
}): Promise<WecomTextIngestResult> {
  const db = await getDb();
  const conversation = await findOrCreateExternalConversation(input);

  const last = await db.select({ eventSeq: conversationMessages.eventSeq }).from(conversationMessages)
    .where(eq(conversationMessages.conversationId, conversation.id))
    .orderBy(desc(conversationMessages.eventSeq)).limit(1).execute();
  const eventSeq = (last[0]?.eventSeq ?? 0) + 1;
  await db.insert(conversationMessages).values({
    conversationId: conversation.id,
    role: 'user',
    content: input.content,
    toolName: input.inboundToolName,
    toolCallId: input.messageId,
    eventSeq,
  }).execute();

  const turn = await dispatchHermesTurn({
    agentInstanceId: input.agentInstanceId,
    conversationId: conversation.id,
    platformUserId: input.platformUserId,
    content: input.content,
    userEventSeq: eventSeq,
    messageId: input.messageId,
    trigger: input.trigger,
  });

  return {
    accepted: true,
    conversationId: conversation.id,
    reply: turn.reply || undefined,
  };
}

async function findOrCreateExternalConversation(input: Pick<IlinkPersonalTextMessage, 'agentInstanceId' | 'platformUserId' | 'externalUserId'>) {
  const db = await getDb();
  const existing = await db.select().from(conversations).where(and(
    eq(conversations.agentInstanceId, input.agentInstanceId),
    eq(conversations.platformUserId, input.platformUserId),
    eq(conversations.wecomUserId, input.externalUserId),
    eq(conversations.status, 'active'),
  )).orderBy(desc(conversations.updatedAt)).limit(1).execute();
  if (existing[0]) return existing[0];
  const created = await db.insert(conversations).values({
    tenantId: 'default',
    agentInstanceId: input.agentInstanceId,
    platformUserId: input.platformUserId,
    wecomUserId: input.externalUserId,
    title: '外部聊天会话',
    status: 'active',
  }).returning().execute();
  return created[0]!;
}
