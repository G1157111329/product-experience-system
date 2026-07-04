/**
 * V3.1 §18.3 — Outbox drain worker (reference implementation).
 *
 * Polls `outbox_events` for pending rows and dispatches them to handlers.
 * Each handler is keyed on `aggregate_type + '.' + event_type` (e.g.
 * "report.published"). Handlers return on success or throw — the worker
 * retries up to `max_attempts`, then leaves the row in `pending` state with
 * `attempts = max_attempts + 1` for manual dead-letter inspection.
 *
 * Run via `pnpm tsx scripts/outbox-drain.ts`. For production, run under a
 * process supervisor (systemd, pm2, etc.).
 *
 * NOTE: This is a reference loop. The actual handler registrations (notification
 * fan-out, webhook delivery, audit log write) land in Wave 1 P1 alongside
 * the notifications module wiring.
 */

import { config } from "dotenv";
import path from "path";
import { claimPendingOutboxBatch, markOutboxDelivered, markOutboxFailed } from "../src/lib/server/outbox";

config({ path: path.join(process.cwd(), ".env.local"), quiet: true });
config({ path: path.join(process.cwd(), ".env"), quiet: true });

type Handler = (event: {
  eventId: string;
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  payload: unknown;
  traceId: string | null;
}) => Promise<void>;

const handlers: Record<string, Handler> = {
  // Wave 1 P1 will register real handlers here. For now, log + succeed so the
  // outbox table doesn't grow unbounded during integration testing.
  async "report.published"(event) {
    console.log(`[outbox] ${event.eventId} report.published -> ${event.aggregateId}`);
  },
  async "issue.rectified"(event) {
    console.log(`[outbox] ${event.eventId} issue.rectified -> ${event.aggregateId}`);
  },
};

async function drainOnce(): Promise<number> {
  const batch = await claimPendingOutboxBatch(20);
  let processed = 0;
  for (const event of batch) {
    const key = `${event.aggregateType}.${event.eventType}`;
    const handler = handlers[key];
    if (!handler) {
      console.warn(`[outbox] no handler for ${key}, marking delivered to avoid backlog`);
      await markOutboxDelivered(event.eventId);
      continue;
    }
    try {
      await handler({
        eventId: event.eventId,
        aggregateType: event.aggregateType,
        aggregateId: event.aggregateId,
        eventType: event.eventType,
        payload: event.payload,
        traceId: event.traceId,
      });
      await markOutboxDelivered(event.eventId);
      processed += 1;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[outbox] ${event.eventId} failed: ${msg}`);
      await markOutboxFailed(event.eventId, msg);
    }
  }
  return processed;
}

async function main() {
  const pollIntervalMs = Number(process.env.OUTBOX_POLL_INTERVAL_MS || 5000);
  console.log(`[outbox] drain worker started, poll=${pollIntervalMs}ms`);

  while (true) {
    try {
      const n = await drainOnce();
      if (n > 0) console.log(`[outbox] processed ${n} events`);
    } catch (err) {
      console.error("[outbox] drain cycle failed:", err);
    }
    await new Promise((r) => setTimeout(r, pollIntervalMs));
  }
}

void main();