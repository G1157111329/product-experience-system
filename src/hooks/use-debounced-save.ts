'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  clearInlineSave,
  flushInlineSave,
  markInlineSaveDirty,
} from '@/lib/inline-save-registry';

export type SaveStatus = 'idle' | 'dirty' | 'saving' | 'saved' | 'error' | 'conflict' | 'offline_queued';

export interface DebouncedSaveOptions {
  debounceMs?: number;
  savedFlashMs?: number;
}

export interface DebouncedSaveResult<T> {
  status: SaveStatus;
  schedule: (value: T) => void;
  flush: () => void;
  reset: () => void;
  setStatus: (s: SaveStatus) => void;
}

export function useDebouncedSave<T>(
  saveFn: (value: T) => Promise<{ conflict?: boolean } | void>,
  options: DebouncedSaveOptions = {},
): DebouncedSaveResult<T> {
  const { debounceMs = 800, savedFlashMs = 1500 } = options;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedFlashRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingValueRef = useRef<T | null>(null);
  const saveKeyRef = useRef(Symbol('debounced-inline-save'));
  const saveFnRef = useRef(saveFn);
  const mountedRef = useRef(true);
  saveFnRef.current = saveFn;
  const [status, setStatusState] = useState<SaveStatus>('idle');

  const persistLatest = useCallback(async () => {
    const value = pendingValueRef.current;
    if (value === null) return;
    if (mountedRef.current) setStatusState('saving');
    try {
      const result = await saveFnRef.current(value);
      if (result?.conflict) {
        const conflict = new Error('保存冲突，请处理冲突后重试');
        conflict.name = 'InlineSaveConflictError';
        if (mountedRef.current) setStatusState('conflict');
        throw conflict;
      }
      if (pendingValueRef.current === value) pendingValueRef.current = null;
      if (mountedRef.current) {
        setStatusState('saved');
        savedFlashRef.current = setTimeout(() => {
          if (mountedRef.current) setStatusState('idle');
          savedFlashRef.current = null;
        }, savedFlashMs);
      }
    } catch (error) {
      if (mountedRef.current && !(error instanceof Error && error.name === 'InlineSaveConflictError')) {
        setStatusState('error');
      }
      throw error;
    }
  }, [savedFlashMs]);

  const registerLatestDraft = useCallback(() => {
    markInlineSaveDirty(saveKeyRef.current, persistLatest);
  }, [persistLatest]);

  const flush = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    void flushInlineSave(saveKeyRef.current).catch(() => undefined);
  }, []);

  const schedule = useCallback((value: T) => {
    pendingValueRef.current = value;
    if (mountedRef.current) setStatusState('dirty');
    registerLatestDraft();
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      void flushInlineSave(saveKeyRef.current).catch(() => undefined);
    }, debounceMs);
  }, [debounceMs, registerLatestDraft]);

  const reset = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    pendingValueRef.current = null;
    clearInlineSave(saveKeyRef.current);
    if (mountedRef.current) setStatusState('idle');
  }, []);

  useEffect(() => {
    const handleGlobalFlush = () => flush();
    const handleGlobalDiscard = () => reset();
    window.addEventListener('inline-save:flush', handleGlobalFlush);
    window.addEventListener('inline-save:discard', handleGlobalDiscard);
    return () => {
      window.removeEventListener('inline-save:flush', handleGlobalFlush);
      window.removeEventListener('inline-save:discard', handleGlobalDiscard);
    };
  }, [flush, reset]);

  useEffect(() => {
    mountedRef.current = true;
    const saveKey = saveKeyRef.current;
    return () => {
      mountedRef.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
      if (savedFlashRef.current) clearTimeout(savedFlashRef.current);
      if (pendingValueRef.current !== null) {
        void flushInlineSave(saveKey).catch(() => undefined);
      }
    };
  }, []);

  return { status, schedule, flush, reset, setStatus: setStatusState };
}
