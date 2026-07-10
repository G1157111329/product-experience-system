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
