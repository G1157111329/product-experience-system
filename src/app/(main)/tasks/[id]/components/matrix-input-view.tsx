'use client';

import { useEffect, useState } from 'react';

interface MatrixInstance {
  id: string;
  name: string;
  matrixRole: string;
  matrixSchemaVersionId: string;
  status: string;
  comparabilityStatus: string;
  createdAt: string;
}

interface MatrixInputViewProps {
  taskId: string;
  taskName: string;
}

/**
 * Data-matrix input view. Task 9 ships this stub; Task 10 replaces the body
 * with the full desktop grid (and Task 11 adds mobile cards).
 *
 * For now: fetches the task's matrix instance if one exists and renders a
 * placeholder. The full grid + mobile cards are added in subsequent tasks.
 */
export function MatrixInputView({ taskId, taskName }: MatrixInputViewProps) {
  const [instances, setInstances] = useState<MatrixInstance[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/tasks/${taskId}/matrices`, { cache: 'no-store' });
        const json = await res.json();
        if (cancelled) return;
        if (json.code !== 0) throw new Error(json.message || '加载失败');
        setInstances(Array.isArray(json.data) ? json.data : []);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : '加载失败');
      }
    })();
    return () => { cancelled = true; };
  }, [taskId]);

  if (error) {
    return <div className="p-4 text-sm text-destructive">数据矩阵加载失败：{error}</div>;
  }
  if (instances === null) {
    return <div className="p-4 text-sm text-muted-foreground">加载中…</div>;
  }
  if (instances.length === 0) {
    return (
      <div className="p-4 text-sm text-muted-foreground">
        当前任务尚未应用数据矩阵模式。任务负责人可在标准管理发布模式后，从已发布模式库应用。
      </div>
    );
  }
  // Stub body — Task 10 replaces this with <MatrixVirtualGrid>.
  return (
    <div className="p-4 space-y-2">
      <div className="text-sm font-medium">{taskName} · 数据矩阵</div>
      <div className="text-xs text-muted-foreground">
        已加载 {instances.length} 个矩阵实例（占位 UI，完整网格将在后续任务中实现）。
      </div>
      <ul className="text-xs text-muted-foreground space-y-1">
        {instances.map((m) => (
          <li key={m.id}>{m.name} · {m.status}</li>
        ))}
      </ul>
    </div>
  );
}
