'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Edit2, GitCompareArrows, Loader2, Plus, Save, Table2, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { MaterialPicker, type Material } from '@/components/material-picker';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';

type ComparisonAssembly = {
  id: string;
  name: string;
  layout_type?: string | null;
};

type ComparisonObject = {
  id: string;
  object_name: string;
  object_type?: string | null;
  model?: string | null;
};

type ComparisonItemNode = {
  id: string;
  node_label: string;
  node_type?: string | null;
};

type ComparisonCell = {
  id: string;
  item_node_id: string;
  object_id: string;
  params?: Record<string, unknown> | null;
  process_notes?: unknown;
  problem_points?: unknown;
  effect_summary?: string | null;
  manual_score?: string | null;
  conclusion_tag?: string | null;
};

type MatrixData = {
  assembly: ComparisonAssembly;
  objects: ComparisonObject[];
  item_nodes: ComparisonItemNode[];
  cells: ComparisonCell[];
  missing_cells: Array<Record<string, unknown>>;
};

type CellMediaResponse = {
  materials?: Material[];
  inline_media?: Material[];
  appendix_media?: Material[];
};

type ApiResponse<T> = {
  code: number;
  message?: string;
  data?: T;
};

type CellForm = {
  effect_summary: string;
  process_notes_text: string;
  problem_points_text: string;
  manual_score: string;
  conclusion_tag: string;
};

type CellDrafts = Record<string, CellForm>;
type CellMediaMap = Record<string, Material[]>;

const OBJECT_COLUMN_WIDTH = 260;
const LEFT_COLUMN_WIDTH = 220;

function cellKey(itemNodeId: string, objectId: string) {
  return `${itemNodeId}::${objectId}`;
}

function listToTextarea(value: unknown) {
  return Array.isArray(value)
    ? value.map((item) => (typeof item === 'string' ? item : JSON.stringify(item))).join('\n')
    : '';
}

function textareaToList(value: string) {
  return value.split('\n').map((line) => line.trim()).filter(Boolean);
}

function buildCellForm(cell: ComparisonCell): CellForm {
  return {
    effect_summary: cell.effect_summary || '',
    process_notes_text: listToTextarea(cell.process_notes),
    problem_points_text: listToTextarea(cell.problem_points),
    manual_score: cell.manual_score || '',
    conclusion_tag: cell.conclusion_tag || '',
  };
}

function scoreError(value: string) {
  if (!value.trim()) return '';
  const score = Number(value.trim());
  if (!Number.isFinite(score) || score < 0 || score > 10) return '评分必须是 0-10';
  return '';
}

function cellMediaFromResponse(data?: CellMediaResponse) {
  return data?.materials || [...(data?.inline_media || []), ...(data?.appendix_media || [])];
}

function getDroppedMaterialId(event: React.DragEvent<HTMLElement>) {
  return event.dataTransfer.getData('application/x-material-id') || event.dataTransfer.getData('text/plain');
}

export function ComparisonWorkspace({
  taskId,
  taskName,
}: {
  taskId: string;
  taskName: string;
  initialLayoutType?: string | null;
}) {
  const [assembly, setAssembly] = useState<ComparisonAssembly | null>(null);
  const [matrix, setMatrix] = useState<MatrixData | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [newObjectName, setNewObjectName] = useState('');
  const [newNodeLabel, setNewNodeLabel] = useState('');
  const [editingObjectId, setEditingObjectId] = useState('');
  const [editingObjectName, setEditingObjectName] = useState('');
  const [editingNodeId, setEditingNodeId] = useState('');
  const [editingNodeLabel, setEditingNodeLabel] = useState('');
  const [cellDrafts, setCellDrafts] = useState<CellDrafts>({});
  const [cellMediaById, setCellMediaById] = useState<CellMediaMap>({});
  const [cellMediaSavingId, setCellMediaSavingId] = useState('');
  const [savingCellId, setSavingCellId] = useState('');

  const cellsByKey = useMemo(() => {
    const next = new Map<string, ComparisonCell>();
    for (const cell of matrix?.cells || []) next.set(cellKey(cell.item_node_id, cell.object_id), cell);
    return next;
  }, [matrix?.cells]);

  const tableMinWidth = Math.max(720, LEFT_COLUMN_WIDTH + Math.max(1, matrix?.objects.length || 1) * OBJECT_COLUMN_WIDTH);

  const loadMatrix = useCallback(async (assemblyId: string) => {
    const res = await fetch(`/api/comparison-matrix?assembly_id=${assemblyId}`);
    const data = await res.json() as ApiResponse<MatrixData>;
    if (data.code === 0 && data.data) {
      setMatrix(data.data);
      setCellDrafts((current) => {
        const next: CellDrafts = {};
        for (const cell of data.data?.cells || []) {
          next[cell.id] = current[cell.id] || buildCellForm(cell);
        }
        return next;
      });

      const mediaEntries = await Promise.all(
        (data.data.cells || []).map(async (cell) => {
          const mediaRes = await fetch(`/api/comparison-cells/${cell.id}/media`);
          const mediaData = await mediaRes.json() as ApiResponse<CellMediaResponse>;
          return [cell.id, cellMediaFromResponse(mediaData.data)] as const;
        })
      );
      setCellMediaById(Object.fromEntries(mediaEntries));
    } else {
      toast.error(data.message || '加载对比矩阵失败');
    }
  }, []);

  const loadAssembly = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/tasks/${taskId}/comparison/init`);
      const data = await res.json() as ApiResponse<ComparisonAssembly | null>;
      if (data.code === 0 && data.data) {
        setAssembly(data.data);
        await loadMatrix(data.data.id);
      }
    } finally {
      setLoading(false);
    }
  }, [loadMatrix, taskId]);

  useEffect(() => {
    void loadAssembly();
  }, [loadAssembly]);

  const initializeAssembly = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/tasks/${taskId}/comparison/init`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: `${taskName} - 对比矩阵`, layout_type: 'image_matrix' }),
      });
      const data = await res.json() as ApiResponse<ComparisonAssembly>;
      if (data.code === 0 && data.data) {
        setAssembly(data.data);
        await loadMatrix(data.data.id);
        toast.success('对比矩阵已初始化');
      } else {
        toast.error(data.message || '初始化失败');
      }
    } finally {
      setBusy(false);
    }
  };

  const refreshMatrix = async () => {
    if (assembly?.id) await loadMatrix(assembly.id);
  };

  const createObject = async () => {
    if (!assembly?.id || !newObjectName.trim()) return;
    const res = await fetch('/api/comparison-objects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        assembly_id: assembly.id,
        task_id: taskId,
        object_name: newObjectName.trim(),
        object_type: 'product_model',
        sort_order: matrix?.objects.length || 0,
      }),
    });
    const data = await res.json() as ApiResponse<unknown>;
    if (data.code === 0) {
      setNewObjectName('');
      await refreshMatrix();
    } else {
      toast.error(data.message || '新增对比对象失败');
    }
  };

  const createNode = async () => {
    if (!assembly?.id || !newNodeLabel.trim()) return;
    const res = await fetch('/api/comparison-item-nodes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        assembly_id: assembly.id,
        node_label: newNodeLabel.trim(),
        node_type: 'item',
        sort_order: matrix?.item_nodes.length || 0,
      }),
    });
    const data = await res.json() as ApiResponse<unknown>;
    if (data.code === 0) {
      setNewNodeLabel('');
      await refreshMatrix();
    } else {
      toast.error(data.message || '新增对比项目失败');
    }
  };

  const completeMatrixCells = async () => {
    if (!assembly?.id) return;
    const res = await fetch('/api/comparison-matrix', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assembly_id: assembly.id }),
    });
    const data = await res.json() as ApiResponse<unknown>;
    if (data.code === 0) await refreshMatrix();
    else toast.error(data.message || '补齐单元格失败');
  };

  const updateObject = async (objectId: string) => {
    if (!editingObjectName.trim()) return;
    const res = await fetch(`/api/comparison-objects/${objectId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ object_name: editingObjectName.trim() }),
    });
    const data = await res.json() as ApiResponse<unknown>;
    if (data.code === 0) {
      setEditingObjectId('');
      await refreshMatrix();
    } else {
      toast.error(data.message || '更新对象失败');
    }
  };

  const deleteObject = async (objectId: string) => {
    const res = await fetch(`/api/comparison-objects/${objectId}`, { method: 'DELETE' });
    const data = await res.json() as ApiResponse<unknown>;
    if (data.code === 0) await refreshMatrix();
    else toast.error(data.message || '删除对象失败');
  };

  const updateNode = async (nodeId: string) => {
    if (!editingNodeLabel.trim()) return;
    const res = await fetch(`/api/comparison-item-nodes/${nodeId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ node_label: editingNodeLabel.trim() }),
    });
    const data = await res.json() as ApiResponse<unknown>;
    if (data.code === 0) {
      setEditingNodeId('');
      await refreshMatrix();
    } else {
      toast.error(data.message || '更新项目失败');
    }
  };

  const deleteNode = async (nodeId: string) => {
    const res = await fetch(`/api/comparison-item-nodes/${nodeId}`, { method: 'DELETE' });
    const data = await res.json() as ApiResponse<unknown>;
    if (data.code === 0) await refreshMatrix();
    else toast.error(data.message || '删除项目失败');
  };

  const updateCellDraft = (cellId: string, field: keyof CellForm, value: string) => {
    setCellDrafts((current) => ({
      ...current,
      [cellId]: {
        ...(current[cellId] || {
          effect_summary: '',
          process_notes_text: '',
          problem_points_text: '',
          manual_score: '',
          conclusion_tag: '',
        }),
        [field]: value,
      },
    }));
  };

  const saveCell = async (cell: ComparisonCell) => {
    const draft = cellDrafts[cell.id] || buildCellForm(cell);
    const error = scoreError(draft.manual_score);
    if (error) {
      toast.error(error);
      return;
    }
    setSavingCellId(cell.id);
    try {
      const res = await fetch(`/api/comparison-cells/${cell.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          effect_summary: draft.effect_summary.trim() || null,
          process_notes: textareaToList(draft.process_notes_text),
          problem_points: textareaToList(draft.problem_points_text),
          manual_score: draft.manual_score.trim() || null,
          conclusion_tag: draft.conclusion_tag || null,
        }),
      });
      const data = await res.json() as ApiResponse<unknown>;
      if (data.code === 0) {
        toast.success('单元格已保存');
        await refreshMatrix();
      } else {
        toast.error(data.message || '保存失败');
      }
    } finally {
      setSavingCellId('');
    }
  };

  const syncCellMedia = async (cellId: string, ids: string[]) => {
    setCellMediaSavingId(cellId);
    try {
      const res = await fetch(`/api/comparison-cells/${cellId}/media`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ material_ids: ids }),
      });
      const data = await res.json() as ApiResponse<CellMediaResponse>;
      if (data.code === 0) {
        const next = cellMediaFromResponse(data.data);
        setCellMediaById((current) => ({ ...current, [cellId]: next }));
        toast.success('素材已关联到矩阵单元格');
      } else {
        toast.error(data.message || '素材关联失败');
      }
    } finally {
      setCellMediaSavingId('');
    }
  };

  const dropMaterialToCell = async (event: React.DragEvent<HTMLElement>, cell: ComparisonCell | null) => {
    const materialId = getDroppedMaterialId(event);
    if (!materialId || !cell) return;
    event.preventDefault();
    event.stopPropagation();
    const res = await fetch(`/api/comparison-cells/${cell.id}/media`);
    const data = await res.json() as ApiResponse<CellMediaResponse>;
    const current = cellMediaFromResponse(data.data);
    const ids = Array.from(new Set([...current.map((item) => item.id), materialId]));
    await syncCellMedia(cell.id, ids);
  };

  const renderCellEditor = (cell: ComparisonCell | null) => {
    if (!cell) {
      return (
        <div className="flex min-h-[280px] items-center justify-center rounded-md border border-dashed bg-muted/20 p-3 text-center text-xs text-muted-foreground">
          补齐单元格后录入
        </div>
      );
    }

    const draft = cellDrafts[cell.id] || buildCellForm(cell);
    const cellMedia = cellMediaById[cell.id] || [];
    const cellSaving = savingCellId === cell.id;
    const mediaSaving = cellMediaSavingId === cell.id;

    return (
      <div
        className="min-h-[320px] space-y-3 rounded-md border bg-card p-3"
        onDragOver={(event) => { if (getDroppedMaterialId(event)) event.preventDefault(); }}
        onDrop={(event) => void dropMaterialToCell(event, cell)}
      >
        <div className="rounded-md border border-dashed bg-muted/20 p-2">
          <div className="mb-2 flex items-center justify-between gap-2">
            <Label className="text-xs">图片/视频</Label>
            {mediaSaving && <span className="text-[10px] text-muted-foreground">保存中...</span>}
          </div>
          <MaterialPicker
            taskId={taskId}
            comparisonCellId={cell.id}
            selectedIds={cellMedia.map((material) => material.id)}
            initialMaterials={cellMedia}
            onSelectionChange={(ids) => void syncCellMedia(cell.id, ids)}
            selectedPreviewSize="sm"
          />
        </div>

        <div className="space-y-2">
          <Textarea
            value={draft.effect_summary}
            onChange={(event) => updateCellDraft(cell.id, 'effect_summary', event.target.value)}
            rows={3}
            placeholder="输入效果结论"
            className="min-h-20 resize-y text-xs"
          />
          <Textarea
            value={draft.process_notes_text}
            onChange={(event) => updateCellDraft(cell.id, 'process_notes_text', event.target.value)}
            rows={2}
            placeholder="过程记录，一行一条"
            className="min-h-16 resize-y text-xs"
          />
          <Textarea
            value={draft.problem_points_text}
            onChange={(event) => updateCellDraft(cell.id, 'problem_points_text', event.target.value)}
            rows={2}
            placeholder="问题点，一行一条"
            className="min-h-16 resize-y text-xs"
          />
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <Input
            value={draft.manual_score}
            onChange={(event) => updateCellDraft(cell.id, 'manual_score', event.target.value)}
            placeholder="评分 0-10"
            className="h-8 text-xs"
          />
          <Input
            value={draft.conclusion_tag}
            onChange={(event) => updateCellDraft(cell.id, 'conclusion_tag', event.target.value)}
            placeholder="结论标签"
            className="h-8 text-xs"
          />
        </div>

        <div className="flex justify-end">
          <Button size="sm" onClick={() => void saveCell(cell)} disabled={cellSaving} className="h-8 gap-1.5 whitespace-nowrap">
            {cellSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            保存
          </Button>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          正在加载对比矩阵...
        </CardContent>
      </Card>
    );
  }

  if (!assembly) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <GitCompareArrows className="h-4 w-4" />
            对比矩阵
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">当前任务尚未录入对比矩阵。初始化后可按多型号/多材质/多对象录入。</p>
          <Button onClick={initializeAssembly} disabled={busy} className="gap-2">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            初始化对比矩阵
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="space-y-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <Table2 className="h-4 w-4" />
              对比矩阵
            </CardTitle>
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary">{matrix?.objects.length || 0} 个对象</Badge>
              <Badge variant="secondary">{matrix?.item_nodes.length || 0} 个项目</Badge>
              <Badge variant={(matrix?.missing_cells.length || 0) > 0 ? 'outline' : 'secondary'}>
                缺 {matrix?.missing_cells.length || 0} 格
              </Badge>
            </div>
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            <div className="flex gap-2">
              <Input value={newObjectName} onChange={(event) => setNewObjectName(event.target.value)} placeholder="新增对比对象，如 A 型号 / 304 材质" />
              <Button onClick={createObject} disabled={!newObjectName.trim()} className="shrink-0">
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex gap-2">
              <Input value={newNodeLabel} onChange={(event) => setNewNodeLabel(event.target.value)} placeholder="新增对比项目，如 出汁率 / 噪音 / 握持" />
              <Button onClick={createNode} disabled={!newNodeLabel.trim()} className="shrink-0">
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>
          {(matrix?.missing_cells.length || 0) > 0 && (
            <Button variant="outline" size="sm" onClick={completeMatrixCells} className="w-fit">
              补齐矩阵单元格
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {!matrix?.objects.length || !matrix?.item_nodes.length ? (
            <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
              先新增对比对象和对比项目，再补齐单元格开始录入。
            </div>
          ) : (
            <ScrollArea className="w-full">
              <Table className="table-fixed" style={{ minWidth: tableMinWidth }}>
                <TableHeader>
                  <TableRow>
                    <TableHead style={{ width: LEFT_COLUMN_WIDTH }}>对比项目</TableHead>
                    {matrix.objects.map((object) => (
                      <TableHead key={object.id} style={{ width: OBJECT_COLUMN_WIDTH }}>
                        {editingObjectId === object.id ? (
                          <div className="flex gap-1">
                            <Input value={editingObjectName} onChange={(event) => setEditingObjectName(event.target.value)} className="h-8" />
                            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => void updateObject(object.id)}><Check className="h-4 w-4" /></Button>
                            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setEditingObjectId('')}><X className="h-4 w-4" /></Button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-between gap-2">
                            <span className="truncate">{object.object_name}</span>
                            <span className="flex shrink-0 gap-1">
                              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { setEditingObjectId(object.id); setEditingObjectName(object.object_name); }}><Edit2 className="h-3.5 w-3.5" /></Button>
                              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => void deleteObject(object.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                            </span>
                          </div>
                        )}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {matrix.item_nodes.map((node) => (
                    <TableRow key={node.id}>
                      <TableCell className="align-top">
                        {editingNodeId === node.id ? (
                          <div className="flex gap-1">
                            <Input value={editingNodeLabel} onChange={(event) => setEditingNodeLabel(event.target.value)} className="h-8" />
                            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => void updateNode(node.id)}><Check className="h-4 w-4" /></Button>
                            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setEditingNodeId('')}><X className="h-4 w-4" /></Button>
                          </div>
                        ) : (
                          <div className="flex items-start justify-between gap-2">
                            <span className="text-sm font-medium">{node.node_label}</span>
                            <span className="flex shrink-0 gap-1">
                              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { setEditingNodeId(node.id); setEditingNodeLabel(node.node_label); }}><Edit2 className="h-3.5 w-3.5" /></Button>
                              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => void deleteNode(node.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                            </span>
                          </div>
                        )}
                      </TableCell>
                      {matrix.objects.map((object) => {
                        const cell = cellsByKey.get(cellKey(node.id, object.id)) || null;
                        return (
                          <TableCell key={object.id} className="align-top p-2">
                            {renderCellEditor(cell)}
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <ScrollBar orientation="horizontal" />
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
