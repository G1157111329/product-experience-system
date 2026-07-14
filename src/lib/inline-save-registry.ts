const pendingInlineSaves = new Set<Promise<unknown>>();

export function registerPendingInlineSave<T>(promise: Promise<T>): Promise<T> {
  pendingInlineSaves.add(promise);
  void promise.then(
    () => pendingInlineSaves.delete(promise),
    () => pendingInlineSaves.delete(promise),
  );
  return promise;
}

export async function waitForPendingInlineSaves(): Promise<void> {
  while (pendingInlineSaves.size > 0) {
    await Promise.allSettled(Array.from(pendingInlineSaves));
  }
}

/** Wait for all currently pending saves and surface a persistence failure to the caller. */
export async function waitForPendingInlineSavesOrThrow(): Promise<void> {
  while (pendingInlineSaves.size > 0) {
    const results = await Promise.allSettled(Array.from(pendingInlineSaves));
    const failed = results.find((result): result is PromiseRejectedResult => result.status === 'rejected');
    if (failed) throw failed.reason;
  }
}
