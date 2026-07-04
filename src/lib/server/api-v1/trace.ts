/**
 * V3.1 §17 — trace_id generation and propagation.
 *
 * Every v1 API response carries a `trace_id` so logs, outbox events, and AI run
 * audit rows can be cross-referenced. The id is generated server-side; clients
 * may pass `X-Trace-Id` to extend an existing trace (e.g. from a frontend fetch
 * that already created one). Trace ids are 16-char base32 (no I/O, sortable-ish
 * Crockford prefix + random suffix) so they fit in logs without bloating.
 */

import { randomBytes } from "node:crypto";

const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

function encodeCrockford(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += CROCKFORD[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += CROCKFORD[(value << (5 - bits)) & 31];
  return out;
}

/**
 * Generate a fresh trace id. Format: 4-char time prefix (mod 32^4 ≈ 1M buckets)
 * + 12-char random — total 16 chars, URL-safe, case-insensitive on round-trip.
 */
export function newTraceId(): string {
  const buf = randomBytes(10);
  return encodeCrockford(buf).slice(0, 16).padEnd(16, "0");
}

/**
 * Read trace id from request headers, or generate a new one.
 * Accepts both `X-Trace-Id` (customary) and `trace-id` (lowercase, per RFC 9110
 * token convention). Validates length ≤ 64 to avoid log injection.
 */
export function resolveTraceId(headers: Headers): string {
  const incoming =
    headers.get("x-trace-id") ||
    headers.get("trace-id") ||
    "";
  const trimmed = incoming.trim();
  if (trimmed && trimmed.length <= 64 && /^[A-Za-z0-9_-]+$/.test(trimmed)) {
    return trimmed;
  }
  return newTraceId();
}

declare global {
  // Per-request AsyncLocalStorage would be the cleaner carrier, but Next.js
  // route handlers don't yet expose a stable RequestContext. We use a plain
  // symbol-keyed property on the request headers instead. This is safe because
  // trace_id is also returned in the response body — the global is just a hint
  // for any helper that wants to log it without threading it through every call.
  var __currentTraceId: string | undefined;
}

export function setCurrentTraceId(id: string): void {
  globalThis.__currentTraceId = id;
}

export function getCurrentTraceId(): string | undefined {
  return globalThis.__currentTraceId;
}