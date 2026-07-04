/**
 * V3.1 §17 / §18.3 — Idempotency-Key header parsing.
 *
 * Clients pass `Idempotency-Key: <opaque>` on POST/PUT so retries after a network
 * blip don't double-write. The real implementation persists the key alongside
 * the outbox event (V3.1 §16.3 `outbox_events.idempotency_key`) and replays the
 * stored response on duplicate. This module is the read/validate side only —
 * the persistence side lands in 0E with the outbox table.
 *
 * Until 0E lands, we keep an in-process LRU for the request lifetime so the
 * pattern is wired end-to-end. Operators running multiple replicas must wait
 * for 0E before relying on this for true cross-instance idempotency.
 */

const MAX_KEY_LEN = 100;
const KEY_RE = /^[A-Za-z0-9_\-.:]{1,100}$/;

export type IdempotencyKey = {
  raw: string;
  /** sha256-ish fingerprint for index lookups (avoid leaking raw in logs). */
  fingerprint: string;
};

export function parseIdempotencyKey(headers: Headers): IdempotencyKey | null {
  const raw = (headers.get("idempotency-key") || "").trim();
  if (!raw) return null;
  if (raw.length > MAX_KEY_LEN || !KEY_RE.test(raw)) return null;
  return { raw, fingerprint: fingerprintKey(raw) };
}

/**
 * Lightweight fingerprint — not cryptographic. The outbox table in 0E will use
 * a real hash column; this is just for log dedup until then.
 */
function fingerprintKey(key: string): string {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

const memoryCache = new Map<string, { status: number; body: unknown; at: number }>();
const MEMORY_TTL_MS = 5 * 60 * 1000;

/**
 * Check the in-process idempotency cache. Returns the cached response if the
 * same key was seen within the TTL window. NOTE: per-process only — see module
 * doc for cross-instance caveats.
 */
export function readIdempotentResult(key: IdempotencyKey): { status: number; body: unknown } | null {
  const cached = memoryCache.get(key.fingerprint);
  if (!cached) return null;
  if (Date.now() - cached.at > MEMORY_TTL_MS) {
    memoryCache.delete(key.fingerprint);
    return null;
  }
  return { status: cached.status, body: cached.body };
}

export function writeIdempotentResult(key: IdempotencyKey, status: number, body: unknown): void {
  memoryCache.set(key.fingerprint, { status, body, at: Date.now() });
  // Cap the cache to 1000 entries to bound memory.
  if (memoryCache.size > 1000) {
    const oldest = [...memoryCache.entries()].sort((a, b) => a[1].at - b[1].at)[0]?.[0];
    if (oldest) memoryCache.delete(oldest);
  }
}