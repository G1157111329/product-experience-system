'use client';

/**
 * MatrixTab — task page "数据矩阵" tab.
 *
 * Wave 2 (PRD V3.1.2.4):
 *   - Consumes /api/v1/tasks/{id}/matrix-tab-state so the tab is never blank
 *   - When dynamic_matrix_excel_like_view is ON → MatrixV3Grid (Excel-like)
 *   - Otherwise falls back to V2 designer / desktop grid
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Table2, Edit3, AlertCircle, CheckCircle2, Clock, Archive, Loader2, Lock,
  Trash2, RotateCcw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import type { MatrixReadProjectionV2 } from '@/lib/matrix/task-matrix-types';
import type { V3MatrixProjection } from '@/lib/matrix/v3-types';
import { selectCurrentMatrix } from '@/lib/matrix/current-matrix-selection';
import { MatrixDesigner } from './matrix-designer';
import { DesktopMatrixGrid } from './matrix-desktop-grid';
import { MobileMatrixCards } from './matrix-mobile-v2';
import { MatrixV3Grid } from './matrix-v3-grid';

interface MatrixTabProps {
  taskId: string;
  taskName: string;
}

type TabState = 'loading' | 'feature_disabled' | 'forbidden' | 'api_error' | 'empty' | 'ready';

interface TabStatePayload {
  enabled: boolean;
  permission: 'editable' | 'none';
  state: TabState;
  matrices: Array<{ id: string; name: string; status: string; updatedAt: string; meaningful: boolean; contentUpdatedAt: string | null }>;
  cta: { primary: 'create_matrix' | null };
  flags?: {
    dynamicMatrixExcelLikeViewEnabled?: boolean;
    dynamicMatrixFormulaEnabled?: boolean;
    dynamicMatrixCellStyleEnabled?: boolean;
    materialStagingEnabled?: boolean;
    hermesAgentGatewayEnabled?: boolean;
    wecomMaterialIngestEnabled?: boolean;
    taskMatrixEnabled?: boolean;
  };
  error?: string;
}

const STATUS_LABELS: Record<string, string> = {
  designing: '设计中',
  active: '录入中',
  draft: '草稿',
  review_locked: '审核锁定',
  completed: '已完成',
  archived: '已归档',
};

const STATUS_COLORS: Record<string, string> = {
  designing: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  active: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  draft: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  review_locked: 'bg-blue-100 text-blue-800 border-blue-200',
  completed: 'bg-muted text-muted-foreground border-border',
  archived: 'bg-red-100 text-red-800 border-red-200',
};

const STATUS_ICONS: Record<string, React.ReactNode> = {
  designing: <Edit3 className="h-3 w-3" />,
  active: <CheckCircle2 className="h-3 w-3" />,
  draft: <Edit3 className="h-3 w-3" />,
  review_locked: <Clock className="h-3 w-3" />,
  completed: <CheckCircle2 className="h-3 w-3" />,
  archived: <Archive className="h-3 w-3" />,
};

export function MatrixTab({ taskId, taskName }: MatrixTabProps) {
  const [tabState, setTabState] = useState<TabState>('loading');
  const [matrices, setMatrices] = useState<TabStatePayload['matrices']>([]);
  const [canCreate, setCanCreate] = useState(false);
  const [excelLike, setExcelLike] = useState(true);
  const [formulaEnabled, setFormulaEnabled] = useState(true);
  const [cellStyleEnabled, setCellStyleEnabled] = useState(true);
  const [hermesEnabled, setHermesEnabled] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectedMatrixId, setSelectedMatrixId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const autoCreateStartedRef = useRef(false);
  const activeMatrixCount = matrices.filter((matrix) => matrix.status !== 'archived').length;

  const handleLifecycle = async (matrixId: string, action: 'clear_and_archive' | 'restore') => {
    const prompt = action === 'clear_and_archive'
      ? '将清空本矩阵的单元格、问题、小结和素材关联，并移入回收区。矩阵将不进入后续生成的报告；已冻结报告不受影响。是否继续？'
      : '确认恢复该数据矩阵？';
    if (!window.confirm(prompt)) return;
    try {
      const res = await fetch(`/api/v1/matrices/${matrixId}/lifecycle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, reason: action === 'clear_and_archive' ? 'user_clear' : undefined }),
      });
      const json = await res.json();
      if (json.code !== 0) {
        toast.error(json.message || '操作失败');
        return;
      }
      if (action === 'clear_and_archive') autoCreateStartedRef.current = false;
      if (selectedMatrixId === matrixId) setSelectedMatrixId(null);
      await fetchTabState();
      toast.success(action === 'clear_and_archive' ? '矩阵内容已停用并移入回收区' : '矩阵已恢复');
    } catch {
      toast.error('操作失败，请重试');
    }
  };

  const fetchTabState = useCallback(async () => {
    try {
      const res = await fetch(`/api/v1/tasks/${taskId}/matrix-tab-state`, { cache: 'no-store' });
      const json = await res.json();
      const data = (json.data ?? json) as TabStatePayload;
      const state = (data.state || 'api_error') as TabState;
      setTabState(state === 'loading' ? 'api_error' : state);
      setMatrices(Array.isArray(data.matrices) ? data.matrices : []);
      setCanCreate(data.cta?.primary === 'create_matrix');
      setErrorMessage(data.error || (json.message && json.code !== 0 ? json.message : null));

      const flagExcel = data.flags?.dynamicMatrixExcelLikeViewEnabled;
      setExcelLike(typeof flagExcel === 'boolean' ? flagExcel : true);
      const flagFormula = data.flags?.dynamicMatrixFormulaEnabled;
      setFormulaEnabled(typeof flagFormula === 'boolean' ? flagFormula : true);
      const flagCellStyle = data.flags?.dynamicMatrixCellStyleEnabled;
      setCellStyleEnabled(typeof flagCellStyle === 'boolean' ? flagCellStyle : true);
      const flagHermes = data.flags?.hermesAgentGatewayEnabled;
      setHermesEnabled(typeof flagHermes === 'boolean' ? flagHermes : true);
      return data;
    } catch {
      setTabState('api_error');
      setErrorMessage('网络错误，无法加载数据矩阵状态');
      return null;
    }
  }, [taskId]);

  useEffect(() => {
    void fetchTabState().then((data) => {
      const currentMatrix = selectCurrentMatrix(data?.matrices ?? []);
      if (data?.state === 'ready' && currentMatrix) {
        setSelectedMatrixId((current) => current ?? currentMatrix.id);
      }
    });
  }, [fetchTabState]);

  const handleCreate = useCallback(async () => {
    const name = `${taskName} - 数据矩阵${matrices.length + 1}`;
    setCreating(true);
    setCreateError(null);
    try {
      const endpoint = excelLike
        ? `/api/v1/tasks/${taskId}/matrices`
        : `/api/tasks/${taskId}/matrices`;
      const body = excelLike
        ? { name, view_mode: 'excel_like_dynamic_matrix' }
        : { name };

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      const created = json.data;
      if (json.code === 0 && created?.id) {
        toast.success(excelLike ? '矩阵已创建，可直接录入' : '矩阵创建成功，请设计结构');
        setSelectedMatrixId(created.id);
        await fetchTabState();
      } else {
        toast.error(json.message || '创建失败');
        setCreateError(json.message || '创建失败，请重试');
        autoCreateStartedRef.current = false;
      }
    } catch {
      toast.error('创建失败，请重试');
      setCreateError('创建失败，请重试');
      autoCreateStartedRef.current = false;
    } finally {
      setCreating(false);
    }
  }, [excelLike, fetchTabState, matrices.length, taskId, taskName]);

  useEffect(() => {
    if (
      canCreate
      && (tabState === 'empty' || activeMatrixCount === 0)
      && !autoCreateStartedRef.current
    ) {
      autoCreateStartedRef.current = true;
      void handleCreate();
    }
  }, [activeMatrixCount, canCreate, handleCreate, tabState]);

  // ---- Selected matrix detail ----
  if (selectedMatrixId) {
    const matrix = matrices.find((m) => m.id === selectedMatrixId);
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <label className="sr-only" htmlFor="task-matrix-selector">切换数据矩阵</label>
          <select
            id="task-matrix-selector"
            aria-label="切换数据矩阵"
            className="h-9 max-w-[260px] rounded-md border border-input bg-background px-2 text-sm"
            value={selectedMatrixId}
            onChange={(event) => setSelectedMatrixId(event.target.value)}
          >
            {matrices.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name} · {STATUS_LABELS[item.status] ?? item.status}{item.meaningful ? ' · 有内容' : ''}
              </option>
            ))}
          </select>
          <Button variant="ghost" size="sm" onClick={() => setSelectedMatrixId(null)}>
            矩阵管理
          </Button>
          {matrix && (
            <>
              <span className="text-sm font-medium truncate max-w-[240px]">{matrix.name}</span>
              <Badge className={STATUS_COLORS[matrix.status] ?? 'bg-muted'} variant="outline">
                <span className="flex items-center gap-1">
                  {STATUS_ICONS[matrix.status]}
                  {STATUS_LABELS[matrix.status] ?? matrix.status}
                </span>
              </Badge>
              {matrix.status !== 'archived' && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="ml-auto h-8 w-8 text-muted-foreground hover:text-destructive"
                  title="清空并停用矩阵"
                  aria-label="清空并停用矩阵"
                  onClick={() => void handleLifecycle(matrix.id, 'clear_and_archive')}
                >
                  <Trash2 className="h-4 w-4" />
                  <span className="sr-only">清空并停用</span>
                </Button>
              )}
            </>
          )}
        </div>

        {excelLike ? (
          <MatrixV3Shell
            matrixId={selectedMatrixId}
            taskId={taskId}
            formulaEnabled={formulaEnabled}
            cellStyleEnabled={cellStyleEnabled}
            hermesEnabled={hermesEnabled}
            onBack={() => setSelectedMatrixId(null)}
          />
        ) : matrix?.status === 'designing' ? (
          <MatrixDesigner
            matrixId={selectedMatrixId}
            taskId={taskId}
            onBack={() => setSelectedMatrixId(null)}
            onConfirmed={() => { void fetchTabState(); }}
          />
        ) : (
          <MatrixInputShellV2 matrixId={selectedMatrixId} taskId={taskId} />
        )}
      </div>
    );
  }

  // ---- Status pages (PRD §13.1) ----
  if (tabState === 'loading') {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (tabState === 'feature_disabled') {
    return (
      <StatusCard
        icon={<Lock className="mx-auto h-8 w-8 mb-2 text-muted-foreground" />}
        title="数据矩阵功能未启用"
        description="管理员尚未开启数据矩阵 Tab。开启后可在此创建 Excel 型动态矩阵。"
      />
    );
  }

  if (tabState === 'forbidden') {
    return (
      <StatusCard
        icon={<Lock className="mx-auto h-8 w-8 mb-2 text-muted-foreground" />}
        title="无权限访问"
        description="当前账号无权查看或编辑本任务的数据矩阵。"
      />
    );
  }

  if (tabState === 'api_error') {
    return (
      <StatusCard
        icon={<AlertCircle className="mx-auto h-8 w-8 mb-2 text-destructive" />}
        title="加载失败"
        description={errorMessage || '无法获取数据矩阵状态'}
        action={
          <Button variant="outline" size="sm" onClick={() => void fetchTabState()}>
            重试
          </Button>
        }
      />
    );
  }

  if (tabState === 'empty' || activeMatrixCount === 0) {
    return (
      <Card>
        <CardContent className="py-5 flex items-center gap-3 text-sm text-muted-foreground">
          {creating ? <Loader2 className="h-4 w-4 animate-spin shrink-0" /> : <AlertCircle className="h-4 w-4 shrink-0" />}
          <span>{creating ? '正在初始化数据矩阵…' : createError || '正在准备数据矩阵…'}</span>
          {!creating && createError && (
            <Button
              variant="outline"
              size="sm"
              className="ml-auto shrink-0"
              onClick={() => {
                autoCreateStartedRef.current = true;
                void handleCreate();
              }}
            >
              重试
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }

  // ---- Matrix list ----
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold">数据矩阵</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {excelLike ? 'Excel 型动态矩阵 · 用户自定义层级与列' : '自定义设计矩阵'}
          </p>
        </div>
      </div>

      <div className="grid gap-3">
        {matrices.filter((matrix) => matrix.status !== 'archived').map((m) => (
          <Card
            key={m.id}
            className="cursor-pointer transition-shadow hover:shadow-md hover:border-primary/30"
            onClick={() => setSelectedMatrixId(m.id)}
          >
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <CardTitle className="text-base truncate">{m.name}</CardTitle>
                  <CardDescription className="mt-1">
                    {m.status === 'designing'
                      ? '设计未确认 — 点击进入设计器'
                      : excelLike
                        ? '点击进入 Excel 型矩阵录入'
                        : '点击进入矩阵录入'}
                  </CardDescription>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Badge className={STATUS_COLORS[m.status] ?? 'bg-muted'} variant="outline">
                    <span className="flex items-center gap-1">
                      {STATUS_ICONS[m.status]}
                      {STATUS_LABELS[m.status] ?? m.status}
                    </span>
                  </Badge>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5 text-destructive"
                    title="清空并停用矩阵"
                    aria-label={`清空并停用矩阵 ${m.name}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      void handleLifecycle(m.id, 'clear_and_archive');
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                    清空并停用
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-xs text-muted-foreground">
                更新于 {m.updatedAt ? new Date(m.updatedAt).toLocaleString('zh-CN') : '—'}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {matrices.some((matrix) => matrix.status === 'archived') && (
        <details className="rounded-md border bg-muted/10 px-3 py-2">
          <summary className="cursor-pointer text-sm font-medium">
            回收区（{matrices.filter((matrix) => matrix.status === 'archived').length}）
          </summary>
          <div className="mt-2 divide-y">
            {matrices.filter((matrix) => matrix.status === 'archived').map((matrix) => (
              <div key={matrix.id} className="flex items-center justify-between gap-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm">{matrix.name}</p>
                  <p className="text-xs text-muted-foreground">已删除，可恢复继续录入</p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="shrink-0"
                  onClick={() => void handleLifecycle(matrix.id, 'restore')}
                >
                  <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                  恢复
                </Button>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

function StatusCard({
  icon,
  title,
  description,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent className="py-12 text-center text-muted-foreground">
        {icon}
        <p className="font-medium text-foreground">{title}</p>
        <p className="text-sm mt-1 max-w-md mx-auto">{description}</p>
        {action && <div className="mt-4 flex justify-center">{action}</div>}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// V3 excel-like shell
// ---------------------------------------------------------------------------

function MatrixV3Shell({
  matrixId,
  taskId,
  formulaEnabled = true,
  cellStyleEnabled = true,
  hermesEnabled = true,
  onBack,
}: {
  matrixId: string;
  taskId: string;
  formulaEnabled?: boolean;
  cellStyleEnabled?: boolean;
  hermesEnabled?: boolean;
  onBack: () => void;
}) {
  const [projection, setProjection] = useState<V3MatrixProjection | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [bootstrapping, setBootstrapping] = useState(false);

  const fetchProjection = useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/matrices/${matrixId}/v3-projection`, { cache: 'no-store' });
      const json = await res.json();
      if (json.code === 0 && json.data) {
        setProjection(json.data);
      } else {
        setError(json.message || '加载 V3 投影失败');
      }
    } catch {
      setError('网络错误');
    } finally {
      if (!options?.silent) setLoading(false);
    }
  }, [matrixId]);

  useEffect(() => {
    void fetchProjection();
  }, [fetchProjection]);

  // If projection exists but has no view definition / empty columns, try ensure bootstrap via reopen create path is not needed —
  // ensure is server-side. For legacy matrices without view, show a one-click migrate.
  const needsBootstrap =
    projection &&
    !projection.viewDefinition &&
    projection.columns.length === 0 &&
    projection.hierarchy.length === 0;

  const handleBootstrap = async () => {
    setBootstrapping(true);
    try {
      // Re-create view by calling ensure endpoint via hierarchy-nodes noop is not available;
      // use a dedicated soft path: POST a sentinel then delete is too heavy.
      // Instead call create columns bootstrap through a lightweight internal fetch to v1 create is wrong.
      // Use ensure via temporary API: POST /api/v1/matrices/{id}/ensure-v3
      const res = await fetch(`/api/v1/matrices/${matrixId}/ensure-v3`, { method: 'POST' });
      const json = await res.json();
      if (json.code === 0) {
        toast.success('已切换为 Excel 型矩阵视图');
        await fetchProjection();
      } else {
        toast.error(json.message || '初始化失败');
      }
    } catch {
      toast.error('初始化失败');
    } finally {
      setBootstrapping(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="py-16 text-center text-muted-foreground">
          <Loader2 className="mx-auto h-8 w-8 animate-spin mb-2" />
          <p>加载矩阵数据…</p>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="py-16 text-center text-muted-foreground">
          <AlertCircle className="mx-auto h-8 w-8 mb-2 text-destructive" />
          <p>{error}</p>
          <div className="mt-3 flex justify-center gap-2">
            <Button variant="outline" size="sm" onClick={() => void fetchProjection()}>重试</Button>
            <Button variant="ghost" size="sm" onClick={onBack}>返回</Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (needsBootstrap) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Table2 className="mx-auto h-10 w-10 text-muted-foreground mb-3" />
          <h3 className="font-semibold mb-2">此矩阵尚未启用 Excel 型视图</h3>
          <p className="text-sm text-muted-foreground mb-4 max-w-md mx-auto">
            将初始化空白结构列（一级大类 / 细项 / 图片 / 对比类目 / 评价 / 问题点），不会预设业务字段。
          </p>
          <Button onClick={() => void handleBootstrap()} disabled={bootstrapping}>
            {bootstrapping ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            启用 Excel 型视图
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!projection) return null;

  return (
    <MatrixV3Grid
      matrixId={matrixId}
      taskId={taskId}
      projection={projection}
      formulaEnabled={formulaEnabled}
      cellStyleEnabled={cellStyleEnabled}
      hermesEnabled={hermesEnabled}
      onChanged={() => { void fetchProjection({ silent: true }); }}
    />
  );
}

// ---------------------------------------------------------------------------
// V2 input shell (fallback)
// ---------------------------------------------------------------------------

function MatrixInputShellV2({
  matrixId,
  taskId,
}: {
  matrixId: string;
  taskId: string;
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
      const res = await fetch(`/api/matrices/${matrixId}`, { cache: 'no-store' });
      const json = await res.json();
      if (json.code === 0 && json.data) setProjection(json.data);
      else setError(json.message || '加载失败');
    } catch {
      setError('网络错误');
    } finally {
      setLoading(false);
    }
  }, [matrixId]);

  useEffect(() => { void fetchProjection(); }, [fetchProjection]);

  if (loading) {
    return (
      <Card>
        <CardContent className="py-16 text-center text-muted-foreground">
          <Loader2 className="mx-auto h-8 w-8 animate-spin mb-2" />
          <p>加载矩阵数据…</p>
        </CardContent>
      </Card>
    );
  }
  if (error) {
    return (
      <Card>
        <CardContent className="py-16 text-center text-muted-foreground">
          <AlertCircle className="mx-auto h-8 w-8 mb-2 text-destructive" />
          <p>{error}</p>
        </CardContent>
      </Card>
    );
  }
  if (!projection) return null;

  return isMobile ? (
    <MobileMatrixCards projection={projection} taskId={taskId} onRefresh={fetchProjection} />
  ) : (
    <DesktopMatrixGrid projection={projection} taskId={taskId} onRefresh={fetchProjection} />
  );
}
