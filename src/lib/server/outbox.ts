/**
 * V3.1 §18.3 — Transactional outbox writer.
 *
 * Producers append rows to `outbox_events` in the same DB transaction as the
 * business write. A relay worker (Wave 1 P0) drains the table and delivers to
 * downstream consumers (notifications, webhooks, AI re-run, audit). Idempotency
 * keys prevent double-fanout on retry.
 *
 * This module is the write side only. The drain worker is a separate process
 * (see scripts/outbox-drain.ts, lands in Wave 1 P1).
 */

import { getDb } from "@/storage/database/pg-db";
import { outboxEvents } from "@/storage/database/shared/v3-contract-tables";
import { randomUUID } from "node:crypto";
import { getCurrentTraceId } from "./api-v1/trace";

export type OutboxAggregateType = "report" | "issue" | "task" | "rectification" | "verification" | "ai_run";

export type OutboxEventInput = {
  aggregateType: OutboxAggregateType;
  aggregateId: string;
  eventType: string; // e.g. "report.published", "issue.rectified"
  payload?: Record<string, unknown>;
  traceId?: string;
  idempotencyKey?: string;
  scheduledFor?: Date;
};

export type OutboxEventRecord = {
  eventId: string;
  status: string;
  attempts: number;
};

/**
 * Append an event to the outbox. Safe to call inside an open transaction — the
 * caller is responsible for committing. Returns the generated event_id.
 *
 * If `idempotencyKey` is supplied and an event with the same key already exists,
 * returns that existing event instead of inserting a duplicate. This makes
 * retries safe: the same logical event always produces exactly one outbox row.
 */
export async function appendOutboxEvent(input: OutboxEventInput): Promise<OutboxEventRecord> {
  const db = getDb();
  const eventId = `evt_${randomUUID().replace(/-/g, "").slice(0, 24)}`;
  const traceId = input.traceId || getCurrentTraceId() || null;
  const scheduledFor = (input.scheduledFor ?? new Date()).toISOString();

  // Idempotency: if the key already exists, return the existing row's status.
  if (input.idempotencyKey) {
    const existing = await db
      .select({
        eventId: outboxEvents.eventId,
        status: outboxEvents.status,
        attempts: outboxEvents.attempts,
      })
      .from(outboxEvents)
      .where(
        // drizzle eq imported inline to keep this module self-contained
        (await import("drizzle-orm")).eq(outboxEvents.idempotencyKey, input.idempotencyKey),
      )
      .limit(1);
    if (existing.length > 0) {
      return { eventId: existing[0].eventId, status: existing[0].status, attempts: existing[0].attempts };
    }
  }

  await db.insert(outboxEvents).values({
    eventId,
    aggregateType: input.aggregateType,
    aggregateId: input.aggregateId,
    eventType: input.eventType,
    payload: input.payload ?? {},
    traceId,
    idempotencyKey: input.idempotencyKey,
    status: "pending",
    attempts: 0,
    scheduledFor,
  });

  return { eventId, status: "pending", attempts: 0 };
}

/**
 * Mark an outbox event as delivered. Called by the relay worker after the
 * downstream consumer acknowledged.
 */
export async function markOutboxDelivered(eventId: string): Promise<void> {
  const db = getDb();
  const { eq } = await import("drizzle-orm");
  await db
    .update(outboxEvents)
    .set({
      status: "delivered",
      deliveredAt: new Date().toISOString(),
    })
    .where(eq(outboxEvents.eventId, eventId));
}

/**
 * Mark an outbox event as failed and record the last error. The relay worker
 * will retry until attempts >= maxAttempts, then move to dead_letter.
 */
export async function markOutboxFailed(eventId: string, errorMessage: string): Promise<void> {
  const db = getDb();
  const { eq, sql } = await import("drizzle-orm");
  await db
    .update(outboxEvents)
    .set({
      status: "pending",
      attempts: sql`${outboxEvents.attempts} + 1`,
      lastError: errorMessage,
    })
    .where(eq(outboxEvents.eventId, eventId));
}

/**
 * Drain a batch of pending events. The relay worker calls this in a loop. Returns
 * the rows claimed — the caller is responsible for invoking the downstream
 * consumer and then calling markOutboxDelivered or markOutboxFailed.
 *
 * Uses SELECT ... FOR UPDATE SKIP LOCKED so multiple relay workers can drain
 * concurrently without double-processing.
 */
export async function claimPendingOutboxBatch(batchSize = 20): Promise<
  Array<{
    id: string;
    eventId: string;
    aggregateType: string;
    aggregateId: string;
    eventType: string;
    payload: unknown;
    traceId: string | null;
    attempts: number;
    maxAttempts: number;
  }>
> {
  const db = getDb();
  const { sql } = await import("drizzle-orm");
  const rows = await db.execute(sql`
    WITH claimed AS (
      SELECT id FROM ${outboxEvents}
      WHERE status = 'pending'
        AND scheduled_for <= NOW()
        AND attempts < max_attempts
      ORDER BY scheduled_for ASC
      LIMIT ${batchSize}
      FOR UPDATE SKIP LOCKED
    )
    UPDATE ${outboxEvents}
    SET status = 'running'
    WHERE id IN (SELECT id FROM claimed)
    RETURNING id, event_id, aggregate_type, aggregate_id, event_type, payload, trace_id, attempts, max_attempts
  `);
  return rows.rows.map((r) => ({
    id: String(r.id),
    eventId: String(r.event_id),
    aggregateType: String(r.aggregate_type),
    aggregateId: String(r.aggregate_id),
    eventType: String(r.event_type),
    payload: r.payload,
    traceId: (r.trace_id as string | null) ?? null,
    attempts: Number(r.attempts),
    maxAttempts: Number(r.max_attempts),
  }));
}