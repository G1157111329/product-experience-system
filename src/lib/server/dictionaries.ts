/**
 * V3.1.1 §27.2.6 — Server-side dictionary loader with in-process LRU cache.
 *
 * Eliminates hardcoded PHASE_ORDER / ISSUE_STATUSES etc. (I-01 / I-04 known
 * issues). When the DB or table is unavailable, falls back to the frozen
 * defaultDict bundled in `@/lib/dictionary-types` so the UI keeps rendering.
 *
 * Server-only. Client components use the `@/hooks/useDictionary` hook.
 */

import { getDb } from "@/storage/database/pg-db";
import { dictionaryTables } from "@/storage/database/shared/dictionary-tables";
import { eq } from "drizzle-orm";
import {
  DICT_TYPES,
  defaultDict,
  isDictType,
  type DictItem,
  type DictMap,
  type DictType,
} from "@/lib/dictionary-types";

export { DICT_TYPES, defaultDict, isDictType };
export type { DictItem, DictMap, DictType };

const CACHE_TTL_MS = 5 * 60 * 1000;
type CacheEntry = { items: DictItem[]; fetchedAt: number };
const cache: Partial<Record<DictType, CacheEntry>> = {};

export function resetDictionaryCache(dictType?: DictType): void {
  if (dictType) {
    delete cache[dictType];
  } else {
    for (const k of Object.keys(cache) as DictType[]) delete cache[k];
  }
}

function isStale(entry: CacheEntry | undefined): boolean {
  if (!entry) return true;
  return Date.now() - entry.fetchedAt > CACHE_TTL_MS;
}

/**
 * Load a dictionary from the DB. Falls back to defaultDict when:
 *   - DB is unreachable
 *   - table is empty
 *   - dictType is unknown
 *
 * Always returns at least defaultDict[dictType] so callers don't need null checks.
 */
export async function loadDictionary(dictType: DictType): Promise<DictItem[]> {
  const cached = cache[dictType];
  if (!isStale(cached)) return cached!.items;

  try {
    const db = getDb();
    const table = dictionaryTables[dictType];
    const rows = await db
      .select({
        code: table.code,
        label: table.label,
        sortOrder: table.sortOrder,
        isActive: table.isActive,
        scopeFilter: table.scopeFilter,
        description: table.description,
      })
      .from(table)
      .where(eq(table.isActive, true))
      .orderBy(table.sortOrder);

    const items: DictItem[] = rows.map((r) => ({
      code: r.code,
      label: r.label,
      sortOrder: r.sortOrder,
      isActive: r.isActive,
      scopeFilter: r.scopeFilter as unknown,
      description: r.description,
    }));

    const resolved = items.length > 0 ? items : defaultDict[dictType];
    cache[dictType] = { items: resolved, fetchedAt: Date.now() };
    return resolved;
  } catch {
    // DB error or table missing — use frozen fallback so UI keeps rendering.
    const fallback = defaultDict[dictType] ?? [];
    cache[dictType] = { items: fallback, fetchedAt: Date.now() };
    return fallback;
  }
}

export async function loadAllDictionaries(): Promise<DictMap> {
  const entries = await Promise.all(
    DICT_TYPES.map(async (t) => [t, await loadDictionary(t)] as const),
  );
  return Object.fromEntries(entries) as DictMap;
}

/**
 * Convenience for ad-hoc validation in API routes. Returns the set of active
 * codes for the given dictionary. Mirrors the old `ISSUE_STATUSES = new Set([...])`
 * pattern but backed by server-side data with frozen fallback.
 */
export async function getDictCodeSet(dictType: DictType): Promise<Set<string>> {
  const items = await loadDictionary(dictType);
  return new Set(items.map((i) => i.code));
}

/**
 * Sync helper for places that can't await (rare). Returns defaultDict only —
 * use only for non-critical display defaults or test scaffolding.
 */
export function getDefaultDictionary(dictType: DictType): DictItem[] {
  return defaultDict[dictType] ?? [];
}