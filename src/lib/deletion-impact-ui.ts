export type DeletionImpactKind = 'record' | 'comparison_section' | 'comparison_item' | 'recipe';

export interface DeletionImpact {
  records: number;
  childNodes: number;
  cells: number;
  materialLinks: number;
  issues: number;
}

export interface DeletionImpactItem {
  key: keyof DeletionImpact;
  label: string;
  value: number;
}

export type DeletionFlowTarget = { kind: DeletionImpactKind; id: string; label: string };
export type DeletionFlowState = {
  phase: 'idle' | 'loading' | 'confirming' | 'deleting';
  pending: DeletionFlowTarget | null;
  impact: DeletionImpact | null;
};

export function createDeletionFlowController(dependencies: {
  load: (target: DeletionFlowTarget) => Promise<DeletionImpact>;
  remove: (target: DeletionFlowTarget) => Promise<void>;
  refresh: () => void | Promise<void>;
  onError: (error: unknown) => void;
}) {
  let state: DeletionFlowState = { phase: 'idle', pending: null, impact: null };
  const listeners = new Set<() => void>();
  const update = (next: DeletionFlowState) => {
    state = next;
    for (const listener of listeners) listener();
  };
  return {
    getState: () => state,
    subscribe(listener: () => void) { listeners.add(listener); return () => listeners.delete(listener); },
    async request(target: DeletionFlowTarget) {
      if (state.phase !== 'idle') return;
      update({ phase: 'loading', pending: target, impact: null });
      try {
        const impact = await dependencies.load(target);
        const current = state as DeletionFlowState;
        if (current.phase === 'loading' && current.pending === target) {
          update({ phase: 'confirming', pending: target, impact });
        }
      } catch (error) {
        update({ phase: 'idle', pending: null, impact: null });
        dependencies.onError(error);
      }
    },
    cancel() {
      if (state.phase === 'confirming') update({ phase: 'idle', pending: null, impact: null });
    },
    async confirm() {
      if (state.phase !== 'confirming' || !state.pending) return;
      const target = state.pending;
      update({ ...state, phase: 'deleting' });
      try {
        await dependencies.remove(target);
      } catch (error) {
        update({ ...state, phase: 'confirming' });
        dependencies.onError(error);
        return;
      }
      update({ phase: 'idle', pending: null, impact: null });
      try {
        await dependencies.refresh();
      } catch (error) {
        dependencies.onError(error);
      }
    },
  };
}

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

const IMPACT_LABELS: Record<keyof DeletionImpact, string> = {
  records: '检查记录',
  childNodes: '下级内容',
  cells: '对比单元格',
  materialLinks: '素材关联',
  issues: '关联问题',
};

export function deletionImpactItems(impact: DeletionImpact): DeletionImpactItem[] {
  return (Object.keys(IMPACT_LABELS) as Array<keyof DeletionImpact>).map((key) => ({
    key,
    label: IMPACT_LABELS[key],
    value: impact[key],
  }));
}

function isImpact(value: unknown): value is DeletionImpact {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  return (Object.keys(IMPACT_LABELS) as Array<keyof DeletionImpact>)
    .every((key) => Number.isInteger(row[key]) && Number(row[key]) >= 0);
}

export async function loadDeletionImpact(
  kind: DeletionImpactKind,
  id: string,
  fetcher: FetchLike = fetch,
): Promise<DeletionImpact> {
  const params = new URLSearchParams({ kind, id });
  const response = await fetcher(`/api/v1/deletion-impact?${params.toString()}`, {
    method: 'GET',
    cache: 'no-store',
  });
  const payload = await response.json().catch(() => null) as {
    code?: number;
    message?: string;
    data?: unknown;
  } | null;
  if (!response.ok || payload?.code !== 0 || !isImpact(payload.data)) {
    throw new Error(payload?.message || '无法读取删除影响，请稍后重试');
  }
  return payload.data;
}
