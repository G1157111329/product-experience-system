"use client";

import { useEffect, useState } from "react";
import { defaultDict, type DictItem, type DictType } from "@/lib/dictionary-types";

type DictResponse = {
  code: number;
  message: string;
  data?: { type: DictType; items: DictItem[] };
};

const memoryCache: Partial<Record<DictType, { items: DictItem[]; fetchedAt: number }>> = {};
const MEMORY_TTL_MS = 60 * 1000;

/**
 * V3.1.1 §27.2.6 — Client dictionary hook. Fetches `/api/v1/dictionaries/[dictType]`,
 * caches in-memory for 60s, falls back to bundled defaultDict on any error so the
 * UI keeps rendering without flicker. Returns a stable reference for the items
 * array across renders when items haven't changed.
 */
export function useDictionary(dictType: DictType) {
  const [items, setItems] = useState<DictItem[]>(() => memoryCache[dictType]?.items ?? defaultDict[dictType] ?? []);
  const [loading, setLoading] = useState<boolean>(!memoryCache[dictType]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const cached = memoryCache[dictType];
    if (cached && Date.now() - cached.fetchedAt < MEMORY_TTL_MS) {
      setItems(cached.items);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    fetch(`/api/v1/dictionaries/${dictType}`, { credentials: "same-origin" })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const body = (await r.json()) as DictResponse;
        if (!body.data?.items) throw new Error(body.message || "no items");
        if (cancelled) return;
        memoryCache[dictType] = { items: body.data.items, fetchedAt: Date.now() };
        setItems(body.data.items);
        setError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const fallback = defaultDict[dictType] ?? [];
        memoryCache[dictType] = { items: fallback, fetchedAt: Date.now() };
        setItems(fallback);
        setError(err instanceof Error ? err.message : "load failed");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [dictType]);

  return { items, loading, error };
}

/**
 * Convenience: return codes as a Set for O(1) lookup (mirrors old ISSUE_STATUSES pattern).
 */
export function useDictCodes(dictType: DictType): Set<string> {
  const { items } = useDictionary(dictType);
  return new Set(items.map((i) => i.code));
}

/**
 * Convenience: return labels as a string array for direct rendering in <select>/<combobox>.
 */
export function useDictLabels(dictType: DictType): string[] {
  const { items } = useDictionary(dictType);
  return items.map((i) => i.label);
}

export function clearDictionaryCache(dictType?: DictType) {
  if (dictType) {
    delete memoryCache[dictType];
  } else {
    for (const k of Object.keys(memoryCache) as DictType[]) delete memoryCache[k];
  }
}