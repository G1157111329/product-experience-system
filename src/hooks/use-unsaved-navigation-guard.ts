'use client';

import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';
import {
  discardPendingInlineSaves,
  getInlineSaveRegistrySnapshot,
  retryFailedInlineSavesOrThrow,
  subscribeInlineSaveRegistry,
  waitForPendingInlineSavesOrThrow,
} from '@/lib/inline-save-registry';

type NavigationContinuation = () => void | Promise<void>;

export interface UnsavedNavigationGuard {
  isDirty: boolean;
  isPromptOpen: boolean;
  errorMessage: string | null;
  attemptNavigation(next: NavigationContinuation): Promise<void>;
  attemptBackNavigation(): Promise<void>;
  retryNavigation(): Promise<void>;
  confirmDiscard(): Promise<void>;
  cancelDiscard(): void;
}

interface CoordinatorSnapshot { isPromptOpen: boolean; errorMessage: string | null }
interface NavigationCoordinator {
  getSnapshot(): CoordinatorSnapshot;
  subscribe(listener: () => void): () => void;
  attemptNavigation(next: NavigationContinuation): Promise<void>;
  retryNavigation(): Promise<void>;
  confirmDiscard(): Promise<void>;
  cancelDiscard(): void;
}

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message : '保存失败，请重试或放弃未保存的修改';
}

export function createUnsavedNavigationCoordinator(dependencies: {
  flush: () => Promise<void>;
  retry: () => Promise<void>;
  discard: () => void;
}): NavigationCoordinator {
  let snapshot: CoordinatorSnapshot = { isPromptOpen: false, errorMessage: null };
  let pendingContinuation: NavigationContinuation | null = null;
  let activeAttempt: Promise<void> | null = null;
  const listeners = new Set<() => void>();
  const update = (next: CoordinatorSnapshot) => {
    snapshot = next;
    for (const listener of listeners) listener();
  };
  const runAttempt = (retry = false): Promise<void> => {
    if (activeAttempt) return activeAttempt;
    activeAttempt = (async () => {
      try {
        try {
          await (retry ? dependencies.retry() : dependencies.flush());
        } catch (error) {
          update({ isPromptOpen: true, errorMessage: errorMessage(error) });
          return;
        }
        const continuation = pendingContinuation;
        pendingContinuation = null;
        update({ isPromptOpen: false, errorMessage: null });
        if (continuation) await continuation();
      } finally {
        activeAttempt = null;
      }
    })();
    return activeAttempt;
  };
  return {
    getSnapshot: () => snapshot,
    subscribe: (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
    attemptNavigation: async (next) => {
      if (pendingContinuation || activeAttempt) return activeAttempt ?? Promise.resolve();
      pendingContinuation = next;
      return runAttempt();
    },
    retryNavigation: () => pendingContinuation ? runAttempt(true) : Promise.resolve(),
    confirmDiscard: async () => {
      if (!pendingContinuation || activeAttempt) return;
      dependencies.discard();
      const continuation = pendingContinuation;
      pendingContinuation = null;
      update({ isPromptOpen: false, errorMessage: null });
      await continuation();
    },
    cancelDiscard: () => {
      pendingContinuation = null;
      update({ isPromptOpen: false, errorMessage: null });
    },
  };
}

const HISTORY_MARKER_KEY = '__productExperienceUnsavedGuard';
const HISTORY_ORIGINAL_KEY = '__productExperienceOriginalState';
export const GUARDED_APP_NAVIGATION_EVENT = 'app-navigation:request';

function addHistoryMarker(state: unknown, marker: string): Record<string, unknown> {
  if (state && typeof state === 'object' && !Array.isArray(state)) {
    return { ...(state as Record<string, unknown>), [HISTORY_MARKER_KEY]: marker };
  }
  return { [HISTORY_MARKER_KEY]: marker, [HISTORY_ORIGINAL_KEY]: state };
}

function removeHistoryMarker(state: unknown, marker: string): unknown {
  if (!state || typeof state !== 'object' || Array.isArray(state)) return state;
  const record = state as Record<string, unknown>;
  if (record[HISTORY_MARKER_KEY] !== marker) return state;
  if (HISTORY_ORIGINAL_KEY in record) return record[HISTORY_ORIGINAL_KEY];
  const next = { ...record };
  delete next[HISTORY_MARKER_KEY];
  return next;
}

export function createHistoryBackController(dependencies: {
  getState: () => unknown;
  replaceState: (state: unknown) => void;
  pushState: (state: unknown) => void;
  forward: () => void;
  back: () => void;
  go: (delta: number) => void;
  attemptNavigation: (next: NavigationContinuation) => Promise<void>;
}) {
  let marker: string | null = null;
  let restoring = false;
  let allowNextPop = false;
  const performBack = () => {
    if (!marker) return;
    allowNextPop = true;
    dependencies.replaceState(removeHistoryMarker(dependencies.getState(), marker));
    // The current entry is the same-URL sentinel. Skip it and the underlying
    // guarded task entry to reach the user's real previous page exactly once.
    dependencies.go(-2);
  };
  return {
    activate(nextMarker: string) {
      marker = nextMarker;
      dependencies.pushState(addHistoryMarker(dependencies.getState(), nextMarker));
    },
    deactivate() {
      if (marker && (dependencies.getState() as Record<string, unknown> | null)?.[HISTORY_MARKER_KEY] === marker) {
        dependencies.replaceState(removeHistoryMarker(dependencies.getState(), marker));
        // The listener is removed before deactivate runs. Collapse back onto
        // the identical underlying task URL when autosave makes the page clean.
        dependencies.back();
      }
      marker = null;
      restoring = false;
    },
    handlePopState(state: unknown): Promise<void> {
      if (allowNextPop) { allowNextPop = false; return Promise.resolve(); }
      if (restoring && marker && (state as Record<string, unknown> | null)?.[HISTORY_MARKER_KEY] === marker) {
        restoring = false;
        return dependencies.attemptNavigation(performBack);
      }
      restoring = true;
      dependencies.forward();
      return Promise.resolve();
    },
    requestBack: () => dependencies.attemptNavigation(performBack),
    cancelRestore() { restoring = false; },
  };
}

export function useUnsavedNavigationGuard(): UnsavedNavigationGuard {
  const coordinatorRef = useRef<NavigationCoordinator | null>(null);
  if (!coordinatorRef.current) {
    coordinatorRef.current = createUnsavedNavigationCoordinator({
      flush: async () => {
        window.dispatchEvent(new Event('inline-save:flush'));
        await waitForPendingInlineSavesOrThrow();
      },
      retry: retryFailedInlineSavesOrThrow,
      discard: discardPendingInlineSaves,
    });
  }
  const coordinator = coordinatorRef.current;
  const coordinatorSnapshot = useSyncExternalStore(coordinator.subscribe, coordinator.getSnapshot, coordinator.getSnapshot);
  const isDirty = useSyncExternalStore(subscribeInlineSaveRegistry, getInlineSaveRegistrySnapshot, getInlineSaveRegistrySnapshot);
  const historyControllerRef = useRef<ReturnType<typeof createHistoryBackController> | null>(null);
  if (!historyControllerRef.current) {
    historyControllerRef.current = createHistoryBackController({
      getState: () => window.history.state,
      replaceState: (state) => window.history.replaceState(state, '', window.location.href),
      pushState: (state) => window.history.pushState(state, '', window.location.href),
      forward: () => window.history.forward(),
      back: () => window.history.back(),
      go: (delta) => window.history.go(delta),
      attemptNavigation: (next) => coordinator.attemptNavigation(next),
    });
  }
  const historyController = historyControllerRef.current;

  useEffect(() => {
    if (!isDirty) return;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);

  useEffect(() => {
    const handleAppNavigationRequest = (event: Event) => {
      if (!getInlineSaveRegistrySnapshot()) return;
      const navigationEvent = event as CustomEvent<{ href?: string }>;
      const href = navigationEvent.detail?.href;
      if (!href) return;
      navigationEvent.preventDefault();
      void coordinator.attemptNavigation(() => window.location.assign(href));
    };
    window.addEventListener(GUARDED_APP_NAVIGATION_EVENT, handleAppNavigationRequest);
    return () => window.removeEventListener(GUARDED_APP_NAVIGATION_EVENT, handleAppNavigationRequest);
  }, [coordinator]);

  useEffect(() => {
    const handleDocumentClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      // React may not have committed the external-store snapshot yet when a
      // user types and immediately clicks global navigation. Read the registry
      // synchronously so that first click cannot escape the save gate.
      if (!getInlineSaveRegistrySnapshot()) return;
      const target = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>('a[href]') : null;
      if (!target || target.target === '_blank' || target.hasAttribute('download')) return;
      const destination = new URL(target.href, window.location.href);
      if (destination.origin !== window.location.origin) return;
      if (destination.href === window.location.href || (destination.pathname === window.location.pathname && destination.search === window.location.search && destination.hash)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      void coordinator.attemptNavigation(() => window.location.assign(destination.href));
    };
    document.addEventListener('click', handleDocumentClick, true);
    return () => document.removeEventListener('click', handleDocumentClick, true);
  }, [coordinator]);

  useEffect(() => {
    if (!isDirty) return;
    historyController.activate(`unsaved-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    const handlePopState = (event: PopStateEvent) => { void historyController.handlePopState(event.state); };
    window.addEventListener('popstate', handlePopState);
    return () => { window.removeEventListener('popstate', handlePopState); historyController.deactivate(); };
  }, [historyController, isDirty]);

  const attemptNavigation = useCallback((next: NavigationContinuation) => coordinator.attemptNavigation(next), [coordinator]);
  const attemptBackNavigation = useCallback(() => historyController.requestBack(), [historyController]);
  const retryNavigation = useCallback(() => coordinator.retryNavigation(), [coordinator]);
  const confirmDiscard = useCallback(() => coordinator.confirmDiscard(), [coordinator]);
  const cancelDiscard = useCallback(() => coordinator.cancelDiscard(), [coordinator]);
  return { isDirty, ...coordinatorSnapshot, attemptNavigation, attemptBackNavigation, retryNavigation, confirmDiscard, cancelDiscard };
}
