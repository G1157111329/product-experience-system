/**
 * useDebouncedSave — shared debounced autosave hook for InlineEditable fields.
 *
 * Extracted from the matrix cell autosave pattern (matrix-cell.tsx) and
 * generalized for platform-wide use (PRD V3.1.2.4 §5 — InlineEditable).
 *
 * State machine (PRD §5.2):
 *   idle → dirty → saving → saved | error | conflict
 *
 * Triggers (PRD §5.3):
 *   - 800ms debounce after input stops
 *   - immediate flush on blur
 *
 * Returns helpers to drive an InlineEditable component:
 *   - status: the current save state for UX feedback
 *   - schedule(text): start/reset the debounce timer
 *   - flush(): commit immediately (call on blur / Tab / Enter)
 *   - reset(): discard pending timer (e.g. server value synced)
 */
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { registerPendingInlineSave } from '@/lib/inline-save-registry';

export type SaveStatus =
  | 'idle'
  | 'dirty'
  | 'saving'
  | 'saved'
  | 'error'
  | 'conflict'
  | 'offline_queued';

export interface DebouncedSaveOptions {
  /** Debounce delay in ms. Default 800ms per PRD §5.3. */
  debounceMs?: number;
  /** How long the "saved" status stays visible before returning to idle. Default 1500ms. */
  savedFlashMs?: number;
}

export interface DebouncedSaveResult<T> {
  status: SaveStatus;
  /** Schedule a save for the given value, resetting the debounce timer. */
  schedule: (value: T) => void;
  /** Flush pending save immediately (blur / Tab / Enter). No-op if not dirty. */
  flush: () => void;
  /** Discard the pending timer without invoking the save fn. */
  reset: () => void;
  /** Explicitly set status (e.g. parent resolved a 409 conflict). */
  setStatus: (s: SaveStatus) => void;
}

/**
 * Hook for a single field's debounced autosave.
 *
 * @param saveFn async function that persists the value. Should throw on failure
 *   (status→error) or return { conflict: true } to signal a 409 (status→conflict).
 *   Returning void or { conflict: false } marks status→saved.
 */
export function useDebouncedSave<T>(
  saveFn: (value: T) => Promise<{ conflict?: boolean } | void>,
  options: DebouncedSaveOptions = {},
): DebouncedSaveResult<T> {
  const { debounceMs = 800, savedFlashMs = 1500 } = options;

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedFlashRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingValueRef = useRef<T | null>(null);
  const saveFnRef = useRef(saveFn);
  // Keep latest saveFn without resetting timers on re-render.
  saveFnRef.current = saveFn;

  const [status, setStatusState] = useState<SaveStatus>('idle');

  const setStatus = useCallback((s: SaveStatus) => {
    setStatusState(s);
  }, []);

  const clearTimers = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (savedFlashRef.current) {
      clearTimeout(savedFlashRef.current);
      savedFlashRef.current = null;
    }
  }, []);

  const runSave = useCallback(
    (value: T) => registerPendingInlineSave((async () => {
      setStatusState('saving');
      try {
        const result = await saveFnRef.current(value);
        if (result && result.conflict) {
          setStatusState('conflict');
        } else {
          setStatusState('saved');
          savedFlashRef.current = setTimeout(() => {
            setStatusState('idle');
            savedFlashRef.current = null;
          }, savedFlashMs);
        }
      } catch {
        setStatusState('error');
      }
    })()),
    [savedFlashMs],
  );

  const schedule = useCallback(
    (value: T) => {
      pendingValueRef.current = value;
      setStatusState('dirty');
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        const v = pendingValueRef.current;
        if (v !== null) void runSave(v);
      }, debounceMs);
    },
    [debounceMs, runSave],
  );

  const flush = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const v = pendingValueRef.current;
    if (v !== null) {
      pendingValueRef.current = null;
      void runSave(v);
    }
  }, [runSave]);

  const reset = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    pendingValueRef.current = null;
    setStatusState('idle');
  }, []);

  useEffect(() => {
    const handleGlobalFlush = () => flush();
    window.addEventListener('inline-save:flush', handleGlobalFlush);
    return () => window.removeEventListener('inline-save:flush', handleGlobalFlush);
  }, [flush]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (savedFlashRef.current) clearTimeout(savedFlashRef.current);
    };
  }, []);

  // clearTimers is stable; keep it referenced so it can be used if needed.
  void clearTimers;

  return { status, schedule, flush, reset, setStatus };
}
