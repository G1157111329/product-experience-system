export type InlineSaveFactory = () => Promise<unknown>;

interface InlineSaveEntry {
  key: unknown;
  dirty: boolean;
  revision: number;
  inFlight: Promise<unknown> | null;
  drainPromise: Promise<unknown> | null;
  lastError: unknown;
  retryFactory: InlineSaveFactory | null;
}

const entries = new Map<unknown, InlineSaveEntry>();
const registryListeners = new Set<() => void>();

function emitRegistryChange() {
  for (const listener of registryListeners) listener();
}

function isCurrentEntry(entry: InlineSaveEntry): boolean {
  return entries.get(entry.key) === entry;
}

function getOrCreateEntry(key: unknown): InlineSaveEntry {
  const current = entries.get(key);
  if (current) return current;
  const created: InlineSaveEntry = {
    key,
    dirty: false,
    revision: 0,
    inFlight: null,
    drainPromise: null,
    lastError: undefined,
    retryFactory: null,
  };
  entries.set(key, created);
  return created;
}

async function drainEntry(entry: InlineSaveEntry, initialPromise?: Promise<unknown>): Promise<void> {
  let suppliedPromise = initialPromise;
  while (isCurrentEntry(entry)) {
    const revision = entry.revision;
    const factory = entry.retryFactory;
    if (!suppliedPromise && !entry.dirty) return;
    if (!suppliedPromise && !factory) return;

    entry.dirty = false;
    let request: Promise<unknown>;
    try {
      request = suppliedPromise ?? Promise.resolve(factory!());
    } catch (error) {
      request = Promise.reject(error);
    }
    suppliedPromise = undefined;
    entry.inFlight = request;
    emitRegistryChange();

    try {
      await request;
    } catch (error) {
      if (!isCurrentEntry(entry)) throw error;
      entry.inFlight = null;
      if (entry.revision !== revision || entry.dirty) {
        entry.lastError = undefined;
        emitRegistryChange();
        continue;
      }
      entry.lastError = error;
      entry.dirty = true;
      emitRegistryChange();
      throw error;
    }

    if (!isCurrentEntry(entry)) return;
    entry.inFlight = null;
    entry.lastError = undefined;
    if (entry.revision !== revision || entry.dirty) {
      emitRegistryChange();
      continue;
    }
    entries.delete(entry.key);
    emitRegistryChange();
    return;
  }
}

function startEntry(
  entry: InlineSaveEntry,
  options: { retryFailed?: boolean; initialPromise?: Promise<unknown> } = {},
): Promise<unknown> {
  if (entry.drainPromise) return entry.drainPromise;
  if (entry.lastError !== undefined && !options.retryFailed && !options.initialPromise) {
    return Promise.reject(entry.lastError);
  }
  if (options.retryFailed) entry.lastError = undefined;
  const drain = drainEntry(entry, options.initialPromise);
  entry.drainPromise = drain;
  void drain.finally(() => {
    if (isCurrentEntry(entry) && entry.drainPromise === drain) {
      entry.drainPromise = null;
      emitRegistryChange();
    }
  }).catch(() => undefined);
  return drain;
}

export function markInlineSaveDirty(key: unknown, retryFactory: InlineSaveFactory): void {
  const entry = getOrCreateEntry(key);
  entry.dirty = true;
  entry.revision += 1;
  entry.retryFactory = retryFactory;
  entry.lastError = undefined;
  emitRegistryChange();
}

export function clearInlineSave(key: unknown): void {
  if (entries.delete(key)) emitRegistryChange();
}

export function flushInlineSave(key: unknown): Promise<unknown> {
  const entry = entries.get(key);
  return entry ? startEntry(entry) : Promise.resolve();
}

export function registerPendingInlineSave<T>(
  promise: Promise<T>,
  failureKey: unknown = promise,
  retryFactory?: () => Promise<T>,
): Promise<T> {
  const entry = getOrCreateEntry(failureKey);
  entry.revision += 1;
  entry.dirty = false;
  entry.lastError = undefined;
  if (retryFactory) entry.retryFactory = retryFactory;
  return startEntry(entry, { initialPromise: promise }) as Promise<T>;
}

export function subscribeInlineSaveRegistry(listener: () => void): () => void {
  registryListeners.add(listener);
  return () => registryListeners.delete(listener);
}

export function getInlineSaveRegistrySnapshot(): boolean {
  return entries.size > 0;
}

export function discardPendingInlineSaves(): void {
  entries.clear();
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('inline-save:discard'));
  emitRegistryChange();
}

export async function waitForPendingInlineSaves(): Promise<void> {
  await Promise.allSettled(Array.from(entries.values()).map((entry) => startEntry(entry)));
}

export async function waitForPendingInlineSavesOrThrow(): Promise<void> {
  while (entries.size > 0) {
    const current = Array.from(entries.values());
    await Promise.allSettled(current.map((entry) => startEntry(entry)));
    const failed = Array.from(entries.values()).find((entry) => entry.lastError !== undefined);
    if (failed) throw failed.lastError;
    if (current.every((entry) => !isCurrentEntry(entry))) continue;
    if (Array.from(entries.values()).every((entry) => !entry.dirty && !entry.inFlight)) return;
  }
}

export async function retryFailedInlineSavesOrThrow(): Promise<void> {
  const failedEntries = Array.from(entries.values()).filter((entry) => entry.lastError !== undefined);
  await Promise.allSettled(failedEntries.map((entry) => startEntry(entry, { retryFailed: true })));
  await waitForPendingInlineSavesOrThrow();
}
