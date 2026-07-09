'use client';

/**
 * MatrixTab — task page "数据矩阵" tab (V2 model).
 *
 * PRD §5.1–5.2: Shows empty state or matrix list.
 * When a matrix is selected, delegates to MatrixInputViewV2.
 */

import { useCallback, useEffect, useState } from 'react';
import { Plus, Table2, Edit3, AlertCircle, CheckCircle2, Clock, Archive, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import type { TaskMatrix, MatrixFeatureFlags, MatrixReadProjectionV2 } from '@/lib/matrix/task-matrix-types';
import { MatrixDesigner } from './matrix-designer';
import { DesktopMatrixGrid } from './matrix-desktop-grid';
import { MobileMatrixCards } from './matrix-mobile-v2';

interface MatrixTabProps {
  taskId: string;
  taskName: string;
}

const STATUS_LABELS: Record<string, string> = {
  designing: '设计中',
  active: '录入中',
  review_locked: '审核锁定',
  completed: '已完成',
  archived: '已归档',
};

const STATUS_COLORS: Record<string, string> = {
  designing: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  active: 'bg-green-100 text-green-800 border-green-200',
  review_locked: 'bg-blue-100 text-blue-800 border-blue-200',
  completed: 'bg-gray-100 text-gray-800 border-gray-200',
  archived: 'bg-red-100 text-red-800 border-red-200',
};

const STATUS_ICONS: Record<string, React.ReactNode> = {
  designing: <Edit3 className="h-3 w-3" />,
  active: <CheckCircle2 className="h-3 w-3" />,
  review_locked: <Clock className="h-3 w-3" />,
  completed: <CheckCircle2 className="h-3 w-3" />,
  archived: <Archive className="h-3 w-3" />,
};

export function MatrixTab({ taskId, taskName }: MatrixTabProps) {
  const [matrices, setMatrices] = useState<TaskMatrix[]>([]);
  const [loading, setLoading] = useState(true);
  const [flags, setFlags] = useState<MatrixFeatureFlags | null>(null);
  const [selectedMatrixId, setSelectedMatrixId] = useState<string | null>(null);

  const fetchMatrices = useCallback(async () => {
    try {
      const res = await fetch(`/api/tasks/${taskId}/matrices`, { cache: 'no-store' });
      const json = await res.json();
      if (json.code === 0 && Array.isArray(json.data)) {
        setMatrices(json.data);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [taskId]);

  useEffect(() => { fetchMatrices(); }, [fetchMatrices]);

  useEffect(() => {
    fetch('/api/settings?key=feature_flag_task_matrix')
      .then((r) => r.json())
      .then((d) => {
        if (d.code === 0 && d.data?.value) {
          setFlags(typeof d.data.value === 'string' ? JSON.parse(d.data.value) : d.data.value);
        }
      })
      .catch(() => {});
  }, []);

  const handleCreate = async () => {
    const name = prompt('请输入矩阵名称：', `${taskName} - 数据矩阵`);
    if (!name?.trim()) return;

    try {
      const res = await fetch(`/api/tasks/${taskId}/matrices`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() }),
      });
      const json = await res.json();
      if (json.code === 0) {
        toast.success('矩阵创建成功，请设计矩阵结构');
        setMatrices((prev) => {
          const withoutDuplicate = prev.filter((item) => item.id !== json.data.id);
          return [json.data, ...withoutDuplicate];
        });
        setSelectedMatrixId(json.data.id);
      } else {
        toast.error(json.message || '创建失败');
      }
    } catch {
      toast.error('创建失败，请重试');
    }
  };

  const handleEnterMatrix = (matrix: TaskMatrix) => {
    if (matrix.status === 'designing') {
      // Go to designer
      setSelectedMatrixId(matrix.id);
    } else {
      // Go to input view
      setSelectedMatrixId(matrix.id);
    }
  };

  // If a specific matrix is selected, show its view
  if (selectedMatrixId) {
    const matrix = matrices.find((m) => m.id === selectedMatrixId);
    if (!matrix) {
      return (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <p>矩阵数据已刷新，请返回列表重新选择。</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={() => setSelectedMatrixId(null)}>
              返回矩阵列表
            </Button>
          </CardContent>
        </Card>
      );
    }

    if (matrix.status === 'designing') {
      return (
        <MatrixDesignerView
          matrixId={matrix.id}
          taskId={taskId}
          onBack={() => setSelectedMatrixId(null)}
          onConfirmed={fetchMatrices}
        />
      );
    }

    return (
      <MatrixInputShell
        matrixId={matrix.id}
        taskId={taskId}
        taskName={taskName}
        onBack={() => setSelectedMatrixId(null)}
      />
    );
  }

  // Feature flag check
  if (flags && !flags.taskMatrixEnabled) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          <AlertCircle className="mx-auto h-8 w-8 mb-2" />
          <p>数据矩阵功能当前未启用</p>
        </CardContent>
      </Card>
    );
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  // Empty state (PRD §5.1)
  if (matrices.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Table2 className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">当前任务尚未建立数据矩阵</h3>
          <p className="text-muted-foreground mb-6 max-w-md mx-auto">
            当本次体验需要记录多对象、多场景、多批次或多指标数据时，
            可创建一份由本次任务自行设计的动态数据矩阵。
          </p>
          <Button onClick={handleCreate} disabled={!!flags && !flags.matrixRuntimeDesignerEnabled}>
            <Plus className="mr-2 h-4 w-4" />
            新建数据矩阵
          </Button>
        </CardContent>
      </Card>
    );
  }

  // Matrix list (PRD §5.2)
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">数据矩阵（自定义）</h2>
        <Button onClick={handleCreate} variant="outline" size="sm" disabled={!!flags && !flags.matrixRuntimeDesignerEnabled}>
          <Plus className="mr-2 h-4 w-4" />
          新建数据矩阵
        </Button>
      </div>

      <div className="grid gap-3">
        {matrices.map((m) => (
          <Card
            key={m.id}
            className="cursor-pointer transition-shadow hover:shadow-md"
            onClick={() => handleEnterMatrix(m)}
          >
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle className="text-base">{m.name}</CardTitle>
                  {m.description && (
                    <CardDescription className="mt-1">{m.description}</CardDescription>
                  )}
                </div>
                <Badge className={STATUS_COLORS[m.status] ?? 'bg-gray-100'} variant="outline">
                  <span className="flex items-center gap-1">
                    {STATUS_ICONS[m.status]}
                    {STATUS_LABELS[m.status] ?? m.status}
                  </span>
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex gap-4 text-xs text-muted-foreground">
                {m.status === 'designing' ? (
                  <span>设计未确认 — 点击进入设计器</span>
                ) : (
                  <span>点击进入矩阵录入</span>
                )}
                <span>创建于 {new Date(m.createdAt).toLocaleDateString('zh-CN')}</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Placeholder sub-components (will be replaced by full Designer/InputGrid)
// ---------------------------------------------------------------------------

function MatrixDesignerView({
  matrixId,
  taskId,
  onBack,
  onConfirmed,
}: {
  matrixId: string;
  taskId: string;
  onBack: () => void;
  onConfirmed: () => void;
}) {
  return (
    <MatrixDesigner
      matrixId={matrixId}
      taskId={taskId}
      onBack={onBack}
      onConfirmed={onConfirmed}
    />
  );
}

function MatrixInputShell({
  matrixId,
  taskId,
  taskName,
  onBack,
}: {
  matrixId: string;
  taskId: string;
  taskName: string;
  onBack: () => void;
}) {
  const [projection, setProjection] = useState<MatrixReadProjectionV2 | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    setIsMobile(window.innerWidth < 768);
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  const fetchProjection = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/matrices/' + matrixId, { cache: 'no-store' });
      const json = await res.json();
      if (json.code === 0 && json.data) {
        setProjection(json.data);
      } else {
        setError(json.message || '加载失败');
      }
    } catch {
      setError('网络错误');
    } finally {
      setLoading(false);
    }
  }, [matrixId]);

  useEffect(() => { fetchProjection(); }, [fetchProjection]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onBack}>
          ← 返回矩阵列表
        </Button>
        <span className="text-sm text-muted-foreground">矩阵录入</span>
      </div>

      {loading && (
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground">
            <Loader2 className="mx-auto h-8 w-8 animate-spin mb-2" />
            <p>加载矩阵数据...</p>
          </CardContent>
        </Card>
      )}

      {error && (
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground">
            <AlertCircle className="mx-auto h-8 w-8 mb-2 text-destructive" />
            <p>{error}</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={() => window.location.reload()}>
              重试
            </Button>
          </CardContent>
        </Card>
      )}

      {projection && !isMobile && (
        <DesktopMatrixGrid
          projection={projection}
          taskId={taskId}
          onRefresh={() => {
            fetchProjection();
          }}
        />
      )}

      {projection && isMobile && (
        <MobileMatrixCards
          projection={projection}
          taskId={taskId}
          onRefresh={() => {
            fetchProjection();
          }}
        />
      )}
    </div>
  );
}
