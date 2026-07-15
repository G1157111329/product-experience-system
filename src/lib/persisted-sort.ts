import { flushInlineSave, markInlineSaveDirty } from './inline-save-registry';

export async function assertSuccessfulSortResponse(response: Response): Promise<void> {
  const payload = await response.json().catch(() => ({})) as { code?: number; message?: string };
  if (!response.ok || payload.code !== 0) {
    throw new Error(payload.message || '排序保存失败，请重试');
  }
}

export async function persistOptimisticSort<T>(input: {
  key: unknown;
  previous: readonly T[];
  next: readonly T[];
  apply: (items: readonly T[]) => void;
  persist: (items: readonly T[]) => Promise<void>;
}): Promise<void> {
  const previous = [...input.previous];
  const next = [...input.next];
  const save = async () => {
    await input.persist(next);
    input.apply(next);
  };

  input.apply(next);
  markInlineSaveDirty(input.key, save);
  try {
    await flushInlineSave(input.key);
  } catch (error) {
    input.apply(previous);
    throw error;
  }
}
