import { and, desc, eq } from 'drizzle-orm';
import { getDb } from '@/storage/database/pg-db';
import { conversationMessages } from '@/storage/database/shared/schema';
import {
  applyIdleUnbind,
  applySectionStale,
  parseHermesSession,
  touchHermesSession,
  type HermesSessionState,
} from './hermes-session';

const SESSION_TOOL = 'hermes_session';

export async function loadHermesSession(conversationId: string, now = new Date()): Promise<HermesSessionState> {
  const db = await getDb();
  const rows = await db.select({
    content: conversationMessages.content,
  }).from(conversationMessages).where(and(
    eq(conversationMessages.conversationId, conversationId),
    eq(conversationMessages.toolName, SESSION_TOOL),
  )).orderBy(desc(conversationMessages.eventSeq)).limit(1).execute();

  let session = parseHermesSession(rows[0]?.content ? safeJson(rows[0].content) : null, now);
  session = applyIdleUnbind(session, now);
  session = applySectionStale(session, now);
  return session;
}

/** Persist session; returns next eventSeq if a new tool row was inserted. */
export async function saveHermesSession(
  conversationId: string,
  session: HermesSessionState,
  eventSeq: number,
  now = new Date(),
): Promise<number> {
  const db = await getDb();
  const next = touchHermesSession(session, now);
  const existing = await db.select({
    id: conversationMessages.id,
  }).from(conversationMessages).where(and(
    eq(conversationMessages.conversationId, conversationId),
    eq(conversationMessages.toolName, SESSION_TOOL),
  )).orderBy(desc(conversationMessages.eventSeq)).limit(1).execute();

  const content = JSON.stringify(next);
  if (existing[0]?.id) {
    await db.update(conversationMessages).set({ content }).where(eq(conversationMessages.id, existing[0].id)).execute();
    return eventSeq;
  }
  await db.insert(conversationMessages).values({
    conversationId,
    role: 'tool',
    toolName: SESSION_TOOL,
    content,
    eventSeq,
  }).execute();
  return eventSeq + 1;
}

function safeJson(content: string): unknown {
  try {
    return JSON.parse(content);
  } catch {
    return null;
  }
}
