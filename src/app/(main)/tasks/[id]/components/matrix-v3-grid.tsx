'use client';

/**
 * MatrixV3Grid — desktop Excel-like dynamic matrix view (PRD V3.1.2.4 §7).
 *
 * Renders the V3 projection as a spreadsheet-style grid:
 *   - Frozen left columns (hierarchy A/B/C + comparison E)
 *   - Horizontally-scrollable detail/calculation/effect/evaluation/issue zones
 *   - Merged row headers (rowspan) for level_1/level_2/level_3 hierarchy
 *   - Inline cell editing via the unified /api/v1/inline-values PATCH
 *   - Basic cell styles (font color/bold/italic/size tokens)
 *   - Bottom summary + notes narrative area
 *
 * NOT a full spreadsheet engine (PRD S-02): no macros, no arbitrary functions,
 * no cross-matrix refs. Calculation columns open the A1 formula editor (Wave 3);
 * relative fill-down is handled server-side by recompute-v3.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Plus, Loader2, Type, Hash, Image as ImageIcon, AlertCircle, Calculator, Sparkles, Settings2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { formatMatrixNumber } from '@/lib/matrix/number-format';
import { InlineEditable } from '@/components/inline-editable';
import { patchInlineValue, putMatrixCellValue } from '@/lib/inline-save-helpers';
import { flushInlineSave, markInlineSaveDirty } from '@/lib/inline-save-registry';
import type {
  V3MatrixProjection,
  V3Column,
  V3LeafRow,
  V3HierarchyNode,
  V3CellValue,
  V3CellStyle,
  V3FormulaDefinition,
  V3CellMedia,
  V3IssuePoint,
  ColumnZone,
} from '@/lib/matrix/v3-types';
import { cellKey, styleKey } from '@/lib/matrix/v3-types';
import { MatrixFormulaEditor } from './matrix-formula-editor';
import { MatrixV3MediaCell } from './matrix-v3-media-cell';
import { MatrixV3Mobile } from './matrix-v3-mobile';
import { MatrixStyleToolbar, type StyleTarget } from './matrix-style-toolbar';
import { MatrixColumnConfigDialog, type ColumnConfigValues } from './matrix-column-config-dialog';
import { MatrixZoneNavigator } from './matrix-zone-navigator';
import {
  getMatrixColumnDisplayWidth,
  getMatrixZoneAnchors,
  getPinnedHierarchyBoundaryId,
  getPinnedHierarchyOffsets,
} from '@/lib/matrix/matrix-zone-layout';
import { orderRowsByHierarchy } from '@/lib/matrix/hierarchy-row-order';

type MatrixSummarySuggestion = {
  id: string;
  content: string;
  scopeNodeId?: string | null;
};

type ChildNodeDialogState = {
  level: 2;
  parentId: string;
  label: string;
};

interface MatrixV3GridProps {
  matrixId: string;
  taskId: string;
  projection: V3MatrixProjection;
  onChanged: () => void;
  /** When false, formula editor is hidden (feature flag). Default true for Wave 3. */
  formulaEnabled?: boolean;
  /** Wave 5 Hermes matrix summary. */
  hermesEnabled?: boolean;
  /** P1 cell/column-header style toolbar. Default true. */
  cellStyleEnabled?: boolean;
  attemptNavigation: (next: () => void) => Promise<void>;
}

function registerMatrixSave<T>(key: string, operation: () => Promise<T>): Promise<T> {
  const registryKey = `matrix-v3:${key}`;
  markInlineSaveDirty(registryKey, operation);
  return flushInlineSave(registryKey) as Promise<T>;
}

function markMatrixSaveDirty<T>(key: string, operation: () => Promise<T>): void {
  markInlineSaveDirty(`matrix-v3:${key}`, operation);
}

const CONFIGURABLE_COLUMN_ZONES = new Set<ColumnZone>([
  'detail_dimension',
  'calculation_dimension',
  'evaluation',
  'issue_point',
]);

// Style token → tailwind class (safe whitelist, PRD §8.8 / 附录 C).
const FONT_COLOR_CLASS: Record<string, string> = {
  font_color_default: '',
  font_color_red: 'text-red-600',
  font_color_orange: 'text-orange-600',
  font_color_blue: 'text-blue-600',
};
const FONT_SIZE_CLASS: Record<string, string> = {
  xs: 'text-xs',
  sm: 'text-sm',
  md: 'text-base',
  lg: 'text-lg',
  xl: 'text-xl',
};

function styleToClass(style?: V3CellStyle): string {
  if (!style) return '';
  const parts: string[] = [];
  if (style.fontColorToken && FONT_COLOR_CLASS[style.fontColorToken]) {
    parts.push(FONT_COLOR_CLASS[style.fontColorToken]);
  }
  if (style.fontSizeToken && FONT_SIZE_CLASS[style.fontSizeToken]) {
    parts.push(FONT_SIZE_CLASS[style.fontSizeToken]);
  }
  if (style.bold) parts.push('font-bold');
  if (style.italic) parts.push('italic');
  return parts.join(' ');
}

// Column zone → icon helper.
function zoneIcon(zone: ColumnZone) {
  switch (zone) {
    case 'hierarchy':
    case 'comparison_category':
      return <Type className="h-3 w-3" />;
    case 'detail_dimension':
      return <Hash className="h-3 w-3" />;
    case 'calculation_dimension':
      return <span className="text-xs font-mono">fx</span>;
    case 'primary_media':
    case 'effect_media':
      return <ImageIcon className="h-3 w-3" />;
    default:
      return null;
  }
}

/**
 * Build a flat rendering model: for each leaf row, attach its hierarchy
 * ancestry (level1/2/3 nodes) so the grid can compute rowspan merges.
 */
interface GridRow {
  leaf: V3LeafRow;
  level1: V3HierarchyNode;
  level2: V3HierarchyNode | null;
  level3: V3HierarchyNode | null;
}

function buildGridRows(projection: V3MatrixProjection): GridRow[] {
  const nodeById = new Map<string, V3HierarchyNode>();
  const sortOrderByNodeId = new Map<string, number>();
  const indexTree = (nodes: V3HierarchyNode[]) => {
    for (const n of nodes) {
      nodeById.set(n.id, n);
      sortOrderByNodeId.set(n.id, n.sortOrder);
      indexTree(n.children);
    }
  };
  indexTree(projection.hierarchy);

  return orderRowsByHierarchy(projection.rows, sortOrderByNodeId).map((leaf) => {
    const level3 = leaf.level3NodeId ? nodeById.get(leaf.level3NodeId) ?? null : null;
    const level2 = leaf.level2NodeId ? nodeById.get(leaf.level2NodeId) ?? null : null;
    const level1 = nodeById.get(leaf.level1NodeId)!;
    return { leaf, level1, level2, level3 };
  });
}

export function MatrixV3Grid({
  matrixId,
  taskId,
  projection,
  onChanged,
  formulaEnabled = true,
  hermesEnabled = true,
  cellStyleEnabled = true,
  attemptNavigation,
}: MatrixV3GridProps) {
  const gridScrollRef = useRef<HTMLDivElement>(null);
  const [gridRows, setGridRows] = useState<GridRow[]>([]);
  const [addingNode, setAddingNode] = useState(false);
  const [newNodeLabel, setNewNodeLabel] = useState('');
  const [showAddLevel1, setShowAddLevel1] = useState(false);
  const [nodeDialog, setNodeDialog] = useState<ChildNodeDialogState | null>(null);
  const [nodeDialogSaving, setNodeDialogSaving] = useState(false);

  // P1 cell style toolbar
  const [styleTarget, setStyleTarget] = useState<StyleTarget | null>(null);
  const [styleSaving, setStyleSaving] = useState(false);

  // P1 column config dialog
  const [columnDialogOpen, setColumnDialogOpen] = useState(false);
  const [columnDialogMode, setColumnDialogMode] = useState<'create' | 'edit'>('create');
  const [editingColumn, setEditingColumn] = useState<V3Column | null>(null);
  const [columnSaving, setColumnSaving] = useState(false);
  const [editingHeaderId, setEditingHeaderId] = useState<string | null>(null);

  // Wave 3 formula editor state
  const [formulaColumn, setFormulaColumn] = useState<V3Column | null>(null);
  const [pickMode, setPickMode] = useState(false);
  const [pendingCellRef, setPendingCellRef] = useState<{
    colIndex: number;
    rowIndex: number;
  } | null>(null);

  // Wave 5 Hermes summary
  const [summaryBusy, setSummaryBusy] = useState(false);

  useEffect(() => {
    setGridRows(buildGridRows(projection));
  }, [projection]);

  // Keep the historical primary-media slot in the formula coordinate model so
  // existing expressions keep their references, but do not render that
  // redundant image column. The later effect-media column is the sole matrix
  // material entry point.
  const formulaColumns = projection.columns.filter((column) => column.columnZone !== 'primary_media');
  const columns = formulaColumns;
  const allColumns = columns;
  const tableWidth = allColumns.reduce(
    (total, column) => total + getMatrixColumnDisplayWidth(column),
    0,
  );
  const zoneAnchors = getMatrixZoneAnchors(allColumns);
  const pinnedHierarchyOffsets = getPinnedHierarchyOffsets(allColumns);
  const frozenHierarchyBoundaryId = getPinnedHierarchyBoundaryId(allColumns);

  const scrollToZone = useCallback((scrollLeft: number) => {
    gridScrollRef.current?.scrollTo({ left: scrollLeft, behavior: 'smooth' });
  }, []);

  const formulaByColumnId = useCallback(
    (columnId: string): V3FormulaDefinition | undefined =>
      projection.formulas.find((f) => f.columnId === columnId && f.status === 'active'),
    [projection.formulas],
  );

  const openFormulaEditor = useCallback((col: V3Column) => {
    if (!formulaEnabled) {
      toast.message('公式功能未启用');
      return;
    }
    setFormulaColumn(col);
    setPickMode(false);
    setPendingCellRef(null);
  }, [formulaEnabled]);

  const handleCellPick = useCallback(
    (columnId: string, rowIndex: number) => {
      if (!pickMode || !formulaColumn) return;
      const colIndex = formulaColumns.findIndex((c) => c.id === columnId);
      if (colIndex < 0) return;
      setPendingCellRef({ colIndex, rowIndex });
    },
    [pickMode, formulaColumn, formulaColumns],
  );

  // Hierarchy merge computation: for each grid row, determine if it's the
  // first row of its level1/level2/level3 group (rowspan start) and the span.
  const mergeInfo = computeMerges(gridRows);

  const handleGenerateSummary = useCallback(async (): Promise<string | null> => {
    if (!hermesEnabled) {
      toast.message('助手功能未启用');
      return null;
    }
    setSummaryBusy(true);
    try {
      const res = await fetch('/api/v1/agent/skills/matrix-evaluation-summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matrixId, scope: 'by_level_1_group' }),
      });
      const json = await res.json();
      if (json.code !== 0) {
        toast.error(json.message || '助手暂不可用');
        return null;
      }
      const suggestions = (json.data?.suggestions ?? []) as MatrixSummarySuggestion[];
      if (suggestions.length === 0) {
        toast.message('未生成可用建议，请补充矩阵数据后重试');
        return null;
      }
      const suggestion = suggestions.find((item) => !item.scopeNodeId) ?? suggestions[0];
      if (!suggestion?.content?.trim()) {
        toast.message('未生成可用小结，请补充矩阵数据后重试');
        return null;
      }
      // The skill persists suggestions for audit. Accept it immediately so this
      // direct-input interaction does not leave invisible pending suggestions.
      const accept = await fetch(`/api/v1/agent/suggestion-blocks/${suggestion.id}/decide`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision: 'accepted', matrixId }),
      });
      const accepted = await accept.json();
      if (accepted.code !== 0) {
        toast.error(accepted.message || 'AI 小结写入失败');
        return null;
      }
      onChanged();
      return suggestion.content.trim();
    } catch {
      toast.error('助手暂不可用');
      return null;
    } finally {
      setSummaryBusy(false);
    }
  }, [hermesEnabled, matrixId, onChanged]);

  const handleAddLevel1 = useCallback(async () => {
    if (!newNodeLabel.trim()) return;
    setAddingNode(true);
    try {
      const res = await fetch(`/api/v1/matrices/${matrixId}/hierarchy-nodes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ level: 1, nodeLabel: newNodeLabel.trim() }),
      });
      const json = await res.json();
      if (json.code === 0) {
        toast.success('一级大类已创建');
        setNewNodeLabel('');
        setShowAddLevel1(false);
        onChanged();
      } else {
        toast.error(json.message || '创建失败');
      }
    } catch {
      toast.error('创建失败，请重试');
    } finally {
      setAddingNode(false);
    }
  }, [matrixId, newNodeLabel, onChanged]);

  const openChildNodeDialog = useCallback((parentId: string) => {
    setNodeDialog({
      level: 2,
      parentId,
      label: '新细项',
    });
  }, []);

  const createChildNode = useCallback(async () => {
    if (!nodeDialog?.label.trim()) return;
    setNodeDialogSaving(true);
    try {
      const res = await fetch(`/api/v1/matrices/${matrixId}/hierarchy-nodes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          level: nodeDialog.level,
          parentId: nodeDialog.parentId,
          nodeLabel: nodeDialog.label.trim(),
        }),
      });
      const json = await res.json();
      if (json.code === 0) {
        toast.success(nodeDialog.level === 2 ? '二级细项已创建' : '三级细项已创建');
        setNodeDialog(null);
        onChanged();
      } else {
        toast.error(json.message || '创建失败');
      }
    } catch {
      toast.error('创建失败，请重试');
    } finally {
      setNodeDialogSaving(false);
    }
  }, [matrixId, nodeDialog, onChanged]);

  const handleDeleteHierarchyNode = useCallback(async (nodeId: string) => {
    const remove = async (confirmArchive: boolean) => {
      const response = await fetch(`/api/v1/matrices/${matrixId}/hierarchy-nodes`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nodeId, confirmArchive }),
      });
      return { response, json: await response.json() };
    };

    try {
      let result = await remove(false);
      if (result.response.status === 409 && result.json?.details?.errorCode === 'MX-HIER-003') {
        const confirmed = window.confirm('该层级包含数据、素材或问题。继续后会归档该层级及其下级，已冻结报告不受影响。确认继续？');
        if (!confirmed) return;
        result = await remove(true);
      }
      if (result.json.code !== 0) {
        toast.error(result.json.message || '删除层级失败');
        return;
      }
      toast.success(result.json.data?.mode === 'archive' ? '层级已归档' : '空层级已删除');
      onChanged();
    } catch {
      toast.error('删除层级失败，请重试');
    }
  }, [matrixId, onChanged]);

  const openCreateColumnDialog = useCallback(() => {
    setEditingColumn(null);
    setColumnDialogMode('create');
    setColumnDialogOpen(true);
  }, []);

  const openEditColumnDialog = useCallback((col: V3Column) => {
    setEditingColumn(col);
    setColumnDialogMode('edit');
    setColumnDialogOpen(true);
  }, []);

  const handleColumnHeaderClick = useCallback(
    (col: V3Column) => {
      if (!cellStyleEnabled) return;
      setStyleTarget({
        type: 'column_header',
        id: col.id,
        label: col.columnLabel,
      });
    },
    [cellStyleEnabled],
  );

  const persistColumnHeader = useCallback(async (column: V3Column, columnLabel: string) => {
    try {
      const response = await fetch(`/api/v1/matrix-columns/${column.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ columnLabel }),
      });
      const json = await response.json();
      if (json.code !== 0) throw new Error(json.message || '保存失败');
      onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '列名保存失败');
      throw error;
    }
  }, [onChanged]);

  const saveColumnHeader = useCallback((column: V3Column, value: string) => {
    const columnLabel = value.trim();
    setEditingHeaderId(null);
    if (!columnLabel || columnLabel === column.columnLabel) return;
    return registerMatrixSave(`column-header:${column.id}`, () => persistColumnHeader(column, columnLabel));
  }, [persistColumnHeader]);

  const handleApplyStyle = useCallback(
    async (patch: {
      fontColorToken?: string | null;
      fontSizeToken?: string | null;
      bold?: boolean;
      italic?: boolean;
    }) => {
      if (!styleTarget) return;
      const currentKey = styleKey(styleTarget.type, styleTarget.id);
      const current = projection.styles[currentKey];
      const merged = {
        fontColorToken:
          patch.fontColorToken !== undefined ? patch.fontColorToken : (current?.fontColorToken ?? null),
        fontSizeToken:
          patch.fontSizeToken !== undefined ? patch.fontSizeToken : (current?.fontSizeToken ?? null),
        bold: patch.bold !== undefined ? patch.bold : (current?.bold ?? false),
        italic: patch.italic !== undefined ? patch.italic : (current?.italic ?? false),
      };
      setStyleSaving(true);
      try {
        const res = await fetch(
          `/api/v1/matrix-cell-styles/${styleTarget.type}/${encodeURIComponent(styleTarget.id)}`,
          {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ matrixId, ...merged }),
          },
        );
        const json = await res.json();
        if (json.code !== 0) {
          toast.error(json.message || '保存样式失败');
          return;
        }
        onChanged();
      } catch {
        toast.error('保存样式失败');
      } finally {
        setStyleSaving(false);
      }
    },
    [styleTarget, projection.styles, matrixId, onChanged],
  );

  const handleCreateColumn = useCallback(
    async (values: ColumnConfigValues) => {
      setColumnSaving(true);
      try {
        const res = await fetch(`/api/v1/matrices/${matrixId}/columns`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            columnZone: values.columnZone,
            columnLabel: values.columnLabel.trim(),
            dataType: values.dataType,
            unitText: values.unitText.trim() || null,
            desktopWidthPx: values.desktopWidthPx,
            isRequired: values.isRequired,
            showInReport: values.showInReport,
            decimalPlaces: values.decimalPlaces,
          }),
        });
        const json = await res.json();
        if (json.code !== 0) {
          toast.error(json.message || '创建失败');
          return;
        }
        toast.success('列已创建');
        setColumnDialogOpen(false);
        onChanged();
      } catch {
        toast.error('创建失败，请重试');
      } finally {
        setColumnSaving(false);
      }
    },
    [matrixId, onChanged],
  );

  const handleEditColumn = useCallback(
    async (values: ColumnConfigValues) => {
      if (!editingColumn) return;
      setColumnSaving(true);
      try {
        const res = await fetch(`/api/v1/matrix-columns/${editingColumn.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            columnLabel: values.columnLabel.trim(),
            unitText: values.unitText.trim() || null,
            desktopWidthPx: values.desktopWidthPx,
            isRequired: values.isRequired,
            showInReport: values.showInReport,
            decimalPlaces: values.decimalPlaces,
            dataType: values.dataType,
          }),
        });
        const json = await res.json();
        if (json.code !== 0) {
          toast.error(json.message || '保存失败');
          return;
        }
        toast.success('列配置已保存');
        setColumnDialogOpen(false);
        onChanged();
      } catch {
        toast.error('保存失败，请重试');
      } finally {
        setColumnSaving(false);
      }
    },
    [editingColumn, onChanged],
  );

  const handleArchiveColumn = useCallback(async (column: V3Column | null = editingColumn) => {
    if (!column) return;
    if (!window.confirm(`确定删除列「${column.columnLabel}」？`)) return;
    setColumnSaving(true);
    try {
      const res = await fetch(`/api/v1/matrix-columns/${column.id}`, {
        method: 'DELETE',
      });
      const json = await res.json();
      if (json.code !== 0) {
        toast.error(json.message || '归档失败');
        return;
      }
      toast.success('列已归档');
      setColumnDialogOpen(false);
      setEditingColumn(null);
      if (styleTarget?.type === 'column_header' && styleTarget.id === column.id) {
        setStyleTarget(null);
      }
      onChanged();
    } catch {
      toast.error('归档失败，请重试');
    } finally {
      setColumnSaving(false);
    }
  }, [editingColumn, styleTarget, onChanged]);

  const summaryBlock = projection.narratives.find((n) => n.blockType === 'summary');
  const noteBlocks = projection.narratives.filter((n) => n.blockType !== 'summary');

  const currentStyle = styleTarget
    ? projection.styles[styleKey(styleTarget.type, styleTarget.id)]
    : undefined;

  return (
    <div className="space-y-3">
      {cellStyleEnabled && (
        <MatrixStyleToolbar
          target={styleTarget}
          current={currentStyle}
          saving={styleSaving}
          onApply={(patch) => void handleApplyStyle(patch)}
          onClearSelection={() => setStyleTarget(null)}
        />
      )}

      {/* Summary bar */}
      <div className="flex items-center gap-3 text-sm text-muted-foreground flex-wrap">
        <Badge variant="secondary">{projection.summary.activeLeafRows} 行</Badge>
        <Badge variant="secondary">{columns.length} 列</Badge>
        <Badge variant="secondary">{projection.summary.filledCells} 已填</Badge>
        {projection.summary.totalIssues > 0 && (
          <Badge variant="outline">{projection.summary.totalIssues} 问题</Badge>
        )}
      </div>

      <div>
        <div className="space-y-3 min-w-0">
      {/* Mobile card layout (PRD §7.15) */}
      <MatrixV3Mobile
        matrixId={matrixId}
        taskId={taskId}
        projection={projection}
        onChanged={onChanged}
        attemptNavigation={attemptNavigation}
      />

      {/* Desktop grid */}
      <MatrixZoneNavigator anchors={zoneAnchors} onSelect={scrollToZone} />
      <div
        ref={gridScrollRef}
        data-testid="matrix-v3-desktop-grid"
        className="border rounded-lg overflow-auto max-h-[70vh] hidden md:block"
        style={{ minWidth: 0 }}
      >
        <table className="border-collapse text-sm" style={{ tableLayout: 'fixed', minWidth: tableWidth }}>
          {/* Header */}
          <thead className="sticky top-0 z-20 bg-muted/80 backdrop-blur">
            <tr>
              {allColumns.map((col) => {
                const headerStyle = projection.styles[styleKey('column_header', col.id)];
                const isHeaderSelected =
                  styleTarget?.type === 'column_header' && styleTarget.id === col.id;
                const isPinnedHierarchy = col.columnZone === 'hierarchy';
                const isFrozenHierarchyBoundary = col.id === frozenHierarchyBoundaryId;
                return (
                <th
                  key={col.id}
                  data-matrix-column-id={col.id}
                  data-frozen-hierarchy-boundary={isFrozenHierarchyBoundary || undefined}
                  className={cn(
                    'border-b border-r px-2 py-1.5 text-left font-medium whitespace-nowrap',
                    isPinnedHierarchy && 'sticky z-30 bg-muted/95',
                    isFrozenHierarchyBoundary &&
                      'after:pointer-events-none after:absolute after:inset-y-0 after:right-0 after:w-px after:bg-border shadow-[4px_0_8px_-6px_rgb(15_23_42_/_0.35)]',
                    styleToClass(headerStyle),
                    cellStyleEnabled && 'cursor-pointer',
                    isHeaderSelected && 'ring-2 ring-inset ring-primary/50',
                  )}
                  style={{
                    width: getMatrixColumnDisplayWidth(col),
                    left: isPinnedHierarchy ? pinnedHierarchyOffsets[col.id] : undefined,
                  }}
                  onClick={() => handleColumnHeaderClick(col)}
                >
                  <div className="flex items-center gap-1">
                    {zoneIcon(col.columnZone)}
                    {editingHeaderId === col.id ? (
                      <Input
                        autoFocus
                        defaultValue={col.columnLabel}
                        aria-label={`编辑列名 ${col.columnLabel}`}
                        className="h-7 min-w-0 text-xs"
                        onClick={(event) => event.stopPropagation()}
                        onChange={(event) => {
                          const next = event.target.value.trim();
                          if (next && next !== col.columnLabel) {
                            markMatrixSaveDirty(`column-header:${col.id}`, () => persistColumnHeader(col, next));
                          }
                        }}
                        onBlur={(event) => void saveColumnHeader(col, event.currentTarget.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') event.currentTarget.blur();
                          if (event.key === 'Escape') {
                            setEditingHeaderId(null);
                            event.currentTarget.blur();
                          }
                        }}
                      />
                    ) : (
                      <button
                        type="button"
                        className="min-w-0 truncate text-left hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        onClick={(event) => {
                          event.stopPropagation();
                          setEditingHeaderId(col.id);
                        }}
                      >
                        {col.columnLabel}
                      </button>
                    )}
                    {col.unitText && <span className="text-muted-foreground text-xs">({col.unitText})</span>}
                    {col.columnZone === 'calculation_dimension' && formulaEnabled && (
                      <button
                        type="button"
                        className="inline-flex items-center gap-0.5 text-xs font-mono text-primary hover:underline ml-0.5"
                        title="编辑公式"
                        onClick={(e) => {
                          e.stopPropagation();
                          openFormulaEditor(col);
                        }}
                      >
                        <Calculator className="h-3 w-3" />
                        fx
                      </button>
                    )}
                    {col.columnZone === 'calculation_dimension' && !formulaEnabled && (
                      <span className="text-xs font-mono text-muted-foreground">fx</span>
                    )}
                    {CONFIGURABLE_COLUMN_ZONES.has(col.columnZone) && (
                      <button
                        type="button"
                        className="inline-flex items-center text-muted-foreground hover:text-foreground ml-auto shrink-0"
                        title="列配置"
                        onClick={(e) => {
                          e.stopPropagation();
                          openEditColumnDialog(col);
                        }}
                      >
                        <Settings2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                    {allColumns.length > 1 && (
                      <button
                        type="button"
                        className="ml-auto inline-flex h-4 w-4 shrink-0 items-center justify-center rounded text-sm leading-none text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        title={`删除列 ${col.columnLabel}`}
                        aria-label={`删除列 ${col.columnLabel}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          void handleArchiveColumn(col);
                        }}
                      >−</button>
                    )}
                  </div>
                </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {gridRows.map((grow, rowIdx) => {
              const merges = mergeInfo[rowIdx];
              return (
                <tr key={grow.leaf.id} className="hover:bg-muted/30">
                  {allColumns.map((col) => {
                    const span = getRowSpanForColumn(col, merges, grow);
                    // Skip non-start cells in a rowspan merge group.
                    if (span === 0) return null;
                    const cell = projection.cells[cellKey(grow.leaf.id, col.id)];
                    const style = projection.styles[styleKey('cell', cellKey(grow.leaf.id, col.id))];
                    const cellId = cellKey(grow.leaf.id, col.id);
                    const isCellSelected =
                      styleTarget?.type === 'cell' && styleTarget.id === cellId;
                    const isPinnedHierarchy = col.columnZone === 'hierarchy';
                    const isFrozenHierarchyBoundary = col.id === frozenHierarchyBoundaryId;
                    return (
                      <td
                        key={col.id}
                        data-frozen-hierarchy-boundary={isFrozenHierarchyBoundary || undefined}
                        className={cn(
                          'border-b border-r px-1 py-0.5 align-top',
                          isPinnedHierarchy && 'sticky z-10 bg-background',
                          isFrozenHierarchyBoundary &&
                            'after:pointer-events-none after:absolute after:inset-y-0 after:right-0 after:w-px after:bg-border shadow-[4px_0_8px_-6px_rgb(15_23_42_/_0.35)]',
                          styleToClass(style),
                          pickMode && 'cursor-crosshair hover:bg-primary/10',
                          !pickMode && cellStyleEnabled && 'cursor-pointer',
                          isCellSelected && 'ring-2 ring-inset ring-primary/50',
                        )}
                        style={{
                          left: isPinnedHierarchy ? pinnedHierarchyOffsets[col.id] : undefined,
                        }}
                        rowSpan={span && span > 1 ? span : undefined}
                        onClick={
                          pickMode
                            ? (e) => {
                                e.stopPropagation();
                                handleCellPick(col.id, grow.leaf.visibleRowIndex);
                              }
                            : cellStyleEnabled
                              ? () =>
                                  setStyleTarget({
                                    type: 'cell',
                                    id: cellId,
                                    label: `${col.columnLabel} · 行${grow.leaf.visibleRowIndex}`,
                                  })
                              : undefined
                        }
                      >
                        <MatrixV3Cell
                          matrixId={matrixId}
                          taskId={taskId}
                          leafRowId={grow.leaf.id}
                          column={col}
                          cell={cell}
                          media={projection.cellMedia?.[cellKey(grow.leaf.id, col.id)] ?? []}
                          issuePoint={
                            projection.issuePoints.find(
                              (ip) => ip.leafRowId === grow.leaf.id && ip.columnId === col.id,
                            ) ?? null
                          }
                          hierarchyContext={{ level1: grow.level1, level2: grow.level2, level3: grow.level3 }}
                          mergeInfo={merges}
                          onAddLevel2={openChildNodeDialog}
                          onDeleteNode={handleDeleteHierarchyNode}
                          onChanged={onChanged}
                          formulaEnabled={formulaEnabled}
                          formula={formulaByColumnId(col.id)}
                          onEditFormula={
                            col.columnZone === 'calculation_dimension'
                              ? () => openFormulaEditor(col)
                              : undefined
                          }
                        />
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Add column / hierarchy bar */}
      <div className="flex items-center gap-2 flex-wrap">
        {showAddLevel1 ? (
          <>
            <Input
              value={newNodeLabel}
              onChange={(e) => setNewNodeLabel(e.target.value)}
              placeholder="一级大类名称（如：产品、食材、场景）"
              className="max-w-[220px] h-8"
              onKeyDown={(e) => e.key === 'Enter' && void handleAddLevel1()}
              autoFocus
            />
            <Button size="sm" onClick={() => void handleAddLevel1()} disabled={addingNode || !newNodeLabel.trim()}>
              {addingNode ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
              确认
            </Button>
            <Button size="sm" variant="ghost" onClick={() => { setShowAddLevel1(false); setNewNodeLabel(''); }}>
              取消
            </Button>
          </>
        ) : (
          <Button size="sm" variant="outline" onClick={() => setShowAddLevel1(true)}>
            <Plus className="h-3 w-3" /> 一级大类
          </Button>
        )}
        <div className="h-4 w-px bg-border" />
        <Button size="sm" variant="outline" onClick={openCreateColumnDialog}>
          <Plus className="h-3 w-3" /> 新增列
        </Button>
      </div>

      {/* Summary + notes narrative area (PRD §7.13-7.14) */}
      <div className="space-y-2 pt-2 border-t">
        <NarrativeEditor
          matrixId={matrixId}
          block={summaryBlock}
          blockType="summary"
          label="小结"
          placeholder="总结本矩阵结果（可点击 AI 生成建议）"
          onChanged={onChanged}
          summaryBusy={summaryBusy}
          onGenerateSummary={handleGenerateSummary}
        />
        {noteBlocks.map((nb) => (
          <NarrativeEditor
            key={nb.id}
            matrixId={matrixId}
            block={nb}
            blockType={nb.blockType}
            label="备注"
            placeholder="备注（测试口径、公式说明、异常条件等）"
            onChanged={onChanged}
          />
        ))}
      </div>
        </div>

      </div>

      {pickMode && formulaColumn && (
        <div className="sticky bottom-0 z-30 rounded-md border border-primary/40 bg-primary/5 px-3 py-2 text-sm flex items-center justify-between gap-2">
          <span>
            点选模式：点击任意单元格将引用追加到「{formulaColumn.columnLabel}」公式
          </span>
          <Button size="sm" variant="ghost" onClick={() => setPickMode(false)}>
            取消点选
          </Button>
        </div>
      )}

      {formulaColumn && (
        <MatrixFormulaEditor
          open={!!formulaColumn}
          onOpenChange={(open) => {
            if (!open) {
              setFormulaColumn(null);
              setPickMode(false);
              setPendingCellRef(null);
            }
          }}
          matrixId={matrixId}
          column={formulaColumn}
          formula={formulaByColumnId(formulaColumn.id) ?? null}
          columns={formulaColumns}
          rows={projection.rows}
          pendingCellRef={pendingCellRef}
          onPendingCellConsumed={() => setPendingCellRef(null)}
          pickMode={pickMode}
          onPickModeChange={setPickMode}
          onSaved={onChanged}
        />
      )}

      <MatrixColumnConfigDialog
        open={columnDialogOpen}
        mode={columnDialogMode}
        initial={columnDialogMode === 'edit' ? editingColumn : undefined}
        saving={columnSaving}
        onOpenChange={setColumnDialogOpen}
        onSubmit={(values) =>
          void (columnDialogMode === 'create' ? handleCreateColumn(values) : handleEditColumn(values))
        }
        onArchive={columnDialogMode === 'edit' ? () => void handleArchiveColumn() : undefined}
      />

      <Dialog
        open={nodeDialog !== null}
        onOpenChange={(open) => {
          if (!open && !nodeDialogSaving) setNodeDialog(null);
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>新增二级细项</DialogTitle>
          </DialogHeader>
          <Input
            aria-label="细项名称"
            value={nodeDialog?.label ?? ''}
            onChange={(event) => {
              setNodeDialog((current) => current ? { ...current, label: event.target.value } : current);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
                event.preventDefault();
                void createChildNode();
              }
            }}
            autoFocus
            disabled={nodeDialogSaving}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setNodeDialog(null)} disabled={nodeDialogSaving}>取消</Button>
            <Button onClick={() => void createChildNode()} disabled={nodeDialogSaving || !nodeDialog?.label.trim()}>
              {nodeDialogSaving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              创建
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Cell renderer
// ---------------------------------------------------------------------------

interface MatrixV3CellProps {
  matrixId: string;
  taskId: string;
  leafRowId: string;
  column: V3Column;
  cell: V3CellValue | undefined;
  media: V3CellMedia[];
  issuePoint: V3IssuePoint | null;
  hierarchyContext: { level1: V3HierarchyNode; level2: V3HierarchyNode | null; level3: V3HierarchyNode | null };
  mergeInfo?: MergeInfo;
  onAddLevel2?: (parentId: string) => void;
  onDeleteNode?: (nodeId: string) => void;
  onChanged: () => void;
  formulaEnabled?: boolean;
  formula?: V3FormulaDefinition;
  onEditFormula?: () => void;
}

function MatrixV3Cell({
  matrixId,
  taskId,
  leafRowId,
  column,
  cell,
  media,
  issuePoint,
  hierarchyContext,
  mergeInfo,
  onAddLevel2,
  onDeleteNode,
  onChanged,
  formulaEnabled,
  formula,
  onEditFormula,
}: MatrixV3CellProps) {
  // Hierarchy columns: render merged labels + inline rename.
  if (column.columnZone === 'hierarchy') {
    const role = column.zoneRole || 'A';
    if (role === 'A') {
      if (mergeInfo && !mergeInfo.isLevel1Start) return null;
      return (
        <div className="px-1 py-1 space-y-1 min-w-0">
          <InlineEditable.Text
            value={hierarchyContext.level1.nodeLabel}
            placeholder="一级大类"
            onSave={async (v) => {
              await patchInlineValue('dynamic_matrix_hierarchy_node', hierarchyContext.level1.id, 'node_label', v);
              onChanged();
            }}
            inputClassName="h-7 text-xs font-medium"
          />
          <div className="flex items-center justify-between gap-1">
            {onAddLevel2 && (
              <button
                type="button"
                className="text-xs text-muted-foreground hover:text-primary"
                onClick={(event) => {
                  event.stopPropagation();
                  onAddLevel2(hierarchyContext.level1.id);
                }}
              >
                + 二级细项
              </button>
            )}
            {onDeleteNode && (
              <button
                type="button"
                className="ml-auto inline-flex h-6 w-6 items-center justify-center text-muted-foreground hover:text-destructive"
                title="删除一级大类"
                aria-label="删除一级大类"
                onClick={(event) => {
                  event.stopPropagation();
                  onDeleteNode(hierarchyContext.level1.id);
                }}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      );
    }
    if (role === 'B') {
      if (mergeInfo && !mergeInfo.isLevel2Start) return null;
      if (!hierarchyContext.level2) {
        return <span className="text-muted-foreground text-xs px-1">—</span>;
      }
      return (
        <div className="flex min-w-[200px] items-start gap-1 px-1 py-1">
          <div className="min-w-0 flex-1 space-y-1">
          <InlineEditable.Text
            value={hierarchyContext.level2.nodeLabel}
            placeholder="二级细项"
            onSave={async (v) => {
              await patchInlineValue('dynamic_matrix_hierarchy_node', hierarchyContext.level2!.id, 'node_label', v);
              onChanged();
            }}
            inputClassName="h-7 text-xs"
          />
          </div>
          {onDeleteNode && (
            <button
              type="button"
              className="inline-flex h-7 w-7 shrink-0 items-center justify-center text-muted-foreground hover:text-destructive"
              title="删除二级细项"
              aria-label="删除二级细项"
              onClick={(event) => {
                event.stopPropagation();
                onDeleteNode(hierarchyContext.level2!.id);
              }}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      );
    }
    if (role === 'C') {
      if (mergeInfo && !mergeInfo.isLevel3Start) return null;
      if (!hierarchyContext.level3) {
        return <span className="text-muted-foreground text-xs px-1">—</span>;
      }
      return (
        <div className="flex items-start gap-1 px-1 py-1">
          <InlineEditable.Text
            value={hierarchyContext.level3.nodeLabel}
            placeholder="三级细项"
            onSave={async (v) => {
              await patchInlineValue('dynamic_matrix_hierarchy_node', hierarchyContext.level3!.id, 'node_label', v);
              onChanged();
            }}
            inputClassName="h-7 text-xs"
          />
          {onDeleteNode && (
            <button
              type="button"
              className="inline-flex h-7 w-7 shrink-0 items-center justify-center text-muted-foreground hover:text-destructive"
              title="删除三级细项"
              aria-label="删除三级细项"
              onClick={(event) => {
                event.stopPropagation();
                onDeleteNode(hierarchyContext.level3!.id);
              }}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      );
    }
    return <span className="text-muted-foreground text-xs px-1">{cell?.valueText ?? ''}</span>;
  }

  // Calculation columns: show computed value; click opens formula editor (Wave 3).
  if (column.columnZone === 'calculation_dimension') {
    const display = cell?.valueNumber != null
      ? formatMatrixNumber(cell.valueNumber, column.decimalPlaces)
      : cell?.displayText ?? '';
    if (cell?.valueState === 'calculation_pending') {
      return <span className="text-muted-foreground text-xs italic px-1">计算中…</span>;
    }
    if (cell?.valueState === 'calculation_failed') {
      return (
        <button
          type="button"
          className="text-red-600 text-xs px-1 inline-flex items-center gap-1 hover:underline"
          title={cell.errorCode ?? '计算失败，点击编辑公式'}
          onClick={onEditFormula}
          disabled={!formulaEnabled}
        >
          <AlertCircle className="h-3 w-3" /> 计算失败
        </button>
      );
    }
    return (
      <button
        type="button"
        className={cn(
          'w-full text-left px-1 py-0.5 font-mono text-xs rounded hover:bg-muted/60',
          !display && 'text-muted-foreground italic',
        )}
        title={formula?.expressionDisplay ?? '点击编辑公式'}
        onClick={onEditFormula}
        disabled={!formulaEnabled}
      >
        {display !== '' && display !== null && display !== undefined
          ? String(display)
          : formula?.expressionDisplay || (formulaEnabled ? '设置公式…' : '—')}
      </button>
    );
  }

  // Media columns — D/O slots via material_links (Wave 4).
  if (column.columnZone === 'primary_media' || column.columnZone === 'effect_media') {
    return (
      <MatrixV3MediaCell
        matrixId={matrixId}
        taskId={taskId}
        leafRowId={leafRowId}
        column={column}
        media={media}
        onChanged={onChanged}
      />
    );
  }

  // Issue point column — upsert matrix_issue_points then optional convert.
  if (column.columnZone === 'issue_point') {
    return (
      <MatrixV3IssueCell
        matrixId={matrixId}
        leafRowId={leafRowId}
        columnId={column.id}
        issuePoint={issuePoint}
        onChanged={onChanged}
      />
    );
  }

  // Numeric / duration / percentage / temperature / volume → number input.
  if (['number', 'duration', 'percentage', 'temperature', 'volume'].includes(column.dataType)) {
    return (
      <div className="px-1 py-0.5">
        <InlineCellNumber
          matrixId={matrixId}
          leafRowId={leafRowId}
          columnId={column.id}
          cellId={cell?.id}
          value={cell?.valueNumber ?? ''}
          unit={column.unitText}
          onChanged={onChanged}
        />
      </div>
    );
  }

  // Default: text / long_text → inline editable via cells PUT (creates row if missing).
  return (
    <div className="px-1 py-0.5">
      <InlineCellText
        matrixId={matrixId}
        leafRowId={leafRowId}
        columnId={column.id}
        value={cell?.valueText ?? ''}
        onChanged={onChanged}
      />
    </div>
  );
}

function InlineCellText({
  matrixId,
  leafRowId,
  columnId,
  value,
  onChanged,
}: {
  matrixId: string;
  leafRowId: string;
  columnId: string;
  value: string;
  onChanged: () => void;
}) {
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  useEffect(() => setDraft(value), [value]);

  const saveKey = `text:${leafRowId}:${columnId}`;
  const persist = async (next: string) => {
      setSaving(true);
      try {
        await putMatrixCellValue({ matrixId, leafRowId, columnId, valueText: next });
        onChanged();
      } catch (error) {
        toast.error('保存失败');
        throw error;
      } finally {
        setSaving(false);
      }
  };
  const save = () => {
    if (draft === value) return;
    return registerMatrixSave(saveKey, () => persist(draft));
  };

  return (
    <div className="flex items-center gap-1">
      <Input
        value={draft}
        onChange={(event) => {
          const next = event.target.value;
          setDraft(next);
          markMatrixSaveDirty(saveKey, () => persist(next));
        }}
        onBlur={() => void save()}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.nativeEvent.isComposing) event.currentTarget.blur();
        }}
        className="h-7 text-xs"
        aria-label="矩阵单元格"
      />
      {saving && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
    </div>
  );
}

function InlineCellNumber({
  matrixId,
  leafRowId,
  columnId,
  cellId,
  value,
  unit,
  onChanged,
}: {
  matrixId: string;
  leafRowId: string;
  columnId: string;
  cellId?: string;
  value: string;
  unit: string | null;
  onChanged: () => void;
}) {
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  useEffect(() => setDraft(value), [value]);

  const saveKey = `number:${leafRowId}:${columnId}`;
  const persist = async (next: string) => {
      setSaving(true);
      try {
        const num = next.trim() === '' ? null : Number(next);
        if (cellId && next.trim() !== '' && !Number.isNaN(num)) {
          await patchInlineValue('dynamic_matrix_cell_value', cellId, 'value', next);
        } else {
          await putMatrixCellValue({
            matrixId,
            leafRowId,
            columnId,
            valueNumber: next.trim() === '' || Number.isNaN(num as number) ? null : num,
            valueText: next.trim() === '' ? '' : undefined,
          });
        }
        onChanged();
      } catch (error) {
        toast.error('保存失败');
        throw error;
      } finally {
        setSaving(false);
      }
  };
  const save = () => {
    if (draft === value) return;
    return registerMatrixSave(saveKey, () => persist(draft));
  };

  return (
    <div className="flex items-center gap-1">
      <Input
        type="text"
        inputMode="decimal"
        value={draft}
        onChange={(event) => {
          const next = event.target.value;
          setDraft(next);
          markMatrixSaveDirty(saveKey, () => persist(next));
        }}
        onBlur={() => void save()}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.nativeEvent.isComposing) event.currentTarget.blur();
        }}
        className="h-7 text-xs font-mono"
        disabled={saving}
      />
      {unit && <span className="text-muted-foreground text-xs whitespace-nowrap">{unit}</span>}
      {saving && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
    </div>
  );
}

function MatrixV3IssueCell({
  matrixId,
  leafRowId,
  columnId,
  issuePoint,
  onChanged,
}: {
  matrixId: string;
  leafRowId: string;
  columnId: string;
  issuePoint: V3IssuePoint | null;
  onChanged: () => void;
}) {
  const [draft, setDraft] = useState(issuePoint?.issueText ?? '');
  const [saving, setSaving] = useState(false);
  useEffect(() => setDraft(issuePoint?.issueText ?? ''), [issuePoint?.issueText]);

  const saveKey = `issue:${leafRowId}:${columnId}`;
  const persist = async (next: string) => {
      setSaving(true);
      try {
        if (issuePoint?.id) {
          const res = await fetch(`/api/v1/matrices/${matrixId}/issue-points/${issuePoint.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ issueText: next }),
          });
          const json = await res.json();
          if (json.code !== 0) throw new Error(json.message || '保存问题点失败');
        } else if (next.trim()) {
          const res = await fetch(`/api/v1/matrices/${matrixId}/issue-points`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ leafRowId, columnId, issueText: next }),
          });
          const json = await res.json();
          if (json.code !== 0) throw new Error(json.message || '保存问题点失败');
        }
        onChanged();
      } catch (error) {
        toast.error('保存问题点失败');
        throw error;
      } finally {
        setSaving(false);
      }
  };
  const saveText = () => {
    if (draft === (issuePoint?.issueText ?? '')) return;
    return registerMatrixSave(saveKey, () => persist(draft));
  };

  return (
    <div className="px-1 py-0.5 min-h-[28px] space-y-1">
      <Input
        value={draft}
        onChange={(event) => {
          const next = event.target.value;
          setDraft(next);
          markMatrixSaveDirty(saveKey, () => persist(next));
        }}
        placeholder="问题点…"
        onBlur={() => void saveText()}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.nativeEvent.isComposing) event.currentTarget.blur();
        }}
        className="h-7 text-xs"
        aria-label="矩阵问题点"
      />
      {saving && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Narrative editor (summary + notes)
// ---------------------------------------------------------------------------

function NarrativeEditor({
  matrixId,
  block,
  blockType,
  label,
  placeholder,
  onChanged,
  summaryBusy,
  onGenerateSummary,
}: {
  matrixId: string;
  block: V3MatrixProjection['narratives'][number] | undefined;
  blockType: string;
  label: string;
  placeholder: string;
  onChanged: () => void;
  summaryBusy?: boolean;
  onGenerateSummary?: () => Promise<string | null>;
}) {
  const [content, setContent] = useState(block?.content ?? '');
  const [saving, setSaving] = useState(false);
  useEffect(() => setContent(block?.content ?? ''), [block]);

  const saveKey = `narrative:${block?.id ?? blockType}`;
  const persist = async (next: string) => {
      setSaving(true);
      try {
        if (block) {
          // Update existing block content.
          await patchInlineValue('dynamic_matrix_narrative_block', block.id, 'content', next);
        } else {
          // Create new block.
          const res = await fetch(`/api/v1/matrices/${matrixId}/narrative-blocks`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ blockType, scope: 'matrix', content: next, showInReport: next.trim() !== '' }),
          });
          const json = await res.json();
          if (json.code !== 0) throw new Error(json.message);
        }
        onChanged();
      } catch (error) {
        toast.error('保存失败');
        throw error;
      } finally {
        setSaving(false);
      }
  };
  const save = () => {
    if (content === (block?.content ?? '')) return;
    return registerMatrixSave(saveKey, () => persist(content));
  };

  return (
    <div>
      <div className="flex items-center gap-2 mb-1">
        <span className="text-sm font-medium">{label}</span>
        {saving && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
        </div>
        <div className="relative">
          <Textarea
            value={content}
            onChange={(event) => {
              const next = event.target.value;
              setContent(next);
              markMatrixSaveDirty(saveKey, () => persist(next));
            }}
            onBlur={save}
            placeholder={placeholder}
            rows={blockType === 'summary' ? 3 : 2}
            className="resize-y pr-9 text-sm"
          />
          {blockType === 'summary' && onGenerateSummary && (
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="absolute bottom-1.5 right-1.5 h-7 w-7 text-muted-foreground hover:text-primary"
              disabled={summaryBusy}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => void onGenerateSummary().then((result) => {
                if (result !== null) setContent(result);
              })}
              aria-label="AI 填充小结"
              title="AI 填充小结"
            >
              {summaryBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            </Button>
          )}
        </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Merge computation helpers
// ---------------------------------------------------------------------------

interface MergeInfo {
  level1RowSpan: number;
  level2RowSpan: number;
  level3RowSpan: number;
  isLevel1Start: boolean;
  isLevel2Start: boolean;
  isLevel3Start: boolean;
}

function computeMerges(rows: GridRow[]): MergeInfo[] {
  const result: MergeInfo[] = [];
  for (let i = 0; i < rows.length; i++) {
    const cur = rows[i];
    // level1 start = first row of this level1 group.
    const isLevel1Start = i === 0 || rows[i - 1].level1.id !== cur.level1.id;
    const isLevel2Start =
      i === 0 || rows[i - 1].level2?.id !== cur.level2?.id || rows[i - 1].level1.id !== cur.level1.id;
    const isLevel3Start =
      i === 0 || rows[i - 1].level3?.id !== cur.level3?.id || rows[i - 1].level2?.id !== cur.level2?.id;

    // Compute spans by looking ahead.
    let level1RowSpan = 0;
    let level2RowSpan = 0;
    let level3RowSpan = 0;
    for (let j = i; j < rows.length; j++) {
      if (rows[j].level1.id !== cur.level1.id) break;
      level1RowSpan++;
      if (rows[j].level2?.id === cur.level2?.id && rows[j].level1.id === cur.level1.id) {
        level2RowSpan++;
      }
      if (rows[j].level3?.id === cur.level3?.id) {
        level3RowSpan++;
      }
    }

    result.push({
      level1RowSpan: isLevel1Start ? level1RowSpan : 0,
      level2RowSpan: isLevel2Start ? level2RowSpan : 0,
      level3RowSpan: isLevel3Start ? level3RowSpan : 0,
      isLevel1Start,
      isLevel2Start,
      isLevel3Start,
    });
  }
  return result;
}

function getRowSpanForColumn(
  col: V3Column,
  merges: MergeInfo,
  grow: GridRow,
): number | undefined {
  // Hierarchy zone columns get merged headers based on which level they represent.
  if (col.columnZone !== 'hierarchy') return undefined;
  // A column at hierarchy zone representing level_1:
  if (col.zoneRole === 'A') return merges.isLevel1Start ? merges.level1RowSpan : 0;
  if (col.zoneRole === 'B') return merges.isLevel2Start ? merges.level2RowSpan : 0;
  if (col.zoneRole === 'C' && !grow.level3) return undefined;
  if (col.zoneRole === 'C') return merges.isLevel3Start ? merges.level3RowSpan : 0;
  void grow;
  return undefined;
}
