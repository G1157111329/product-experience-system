'use client';

/**
 * MatrixV3Grid — desktop Excel-like dynamic matrix view (PRD V3.1.2.4 §7).
 *
 * Renders the V3 projection as a spreadsheet-style grid:
 *   - Frozen left columns (hierarchy A/B/C + primary_media D + comparison E)
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
import { useCallback, useEffect, useState } from 'react';
import { Plus, Table2, Loader2, Type, Hash, Clock, Image as ImageIcon, AlertCircle, Calculator, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { InlineEditable } from '@/components/inline-editable';
import { patchInlineValue } from '@/lib/inline-save-helpers';
import type {
  V3MatrixProjection,
  V3Column,
  V3LeafRow,
  V3HierarchyNode,
  V3CellValue,
  V3CellStyle,
  V3FormulaDefinition,
  V3CellMedia,
  ColumnZone,
} from '@/lib/matrix/v3-types';
import { cellKey, styleKey } from '@/lib/matrix/v3-types';
import { MatrixFormulaEditor } from './matrix-formula-editor';
import { MatrixV3MediaCell } from './matrix-v3-media-cell';
import { MatrixMaterialStagingRail } from './matrix-material-staging-rail';
import {
  MatrixSummarySuggestionsDialog,
  type SummarySuggestion,
} from './matrix-summary-suggestions-dialog';

interface MatrixV3GridProps {
  matrixId: string;
  taskId: string;
  projection: V3MatrixProjection;
  onChanged: () => void;
  /** When false, formula editor is hidden (feature flag). Default true for Wave 3. */
  formulaEnabled?: boolean;
  /** Wave 4 staging rail. */
  stagingEnabled?: boolean;
  /** Wave 5 Hermes matrix summary. */
  hermesEnabled?: boolean;
}

// Zone display labels (PRD §7 / 附录 A).
const ZONE_LABELS: Record<ColumnZone, string> = {
  hierarchy: '层级',
  primary_media: '图片素材',
  comparison_category: '一级对比类目',
  detail_dimension: '详细对比维度',
  calculation_dimension: '计算列',
  effect_media: '效果素材',
  evaluation: '效果评价',
  issue_point: '问题点',
};

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
      return <span className="text-[10px] font-mono">fx</span>;
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
  const indexTree = (nodes: V3HierarchyNode[]) => {
    for (const n of nodes) {
      nodeById.set(n.id, n);
      indexTree(n.children);
    }
  };
  indexTree(projection.hierarchy);

  return projection.rows.map((leaf) => {
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
  stagingEnabled = true,
  hermesEnabled = true,
}: MatrixV3GridProps) {
  const [gridRows, setGridRows] = useState<GridRow[]>([]);
  const [addingNode, setAddingNode] = useState(false);
  const [newNodeLabel, setNewNodeLabel] = useState('');
  const [showAddLevel1, setShowAddLevel1] = useState(false);
  const [addingColumn, setAddingColumn] = useState(false);
  const [newColumnLabel, setNewColumnLabel] = useState('');
  const [newColumnZone, setNewColumnZone] = useState<ColumnZone>('detail_dimension');

  // Wave 3 formula editor state
  const [formulaColumn, setFormulaColumn] = useState<V3Column | null>(null);
  const [pickMode, setPickMode] = useState(false);
  const [pendingCellRef, setPendingCellRef] = useState<{
    colIndex: number;
    rowIndex: number;
  } | null>(null);

  // Wave 5 Hermes summary
  const [summaryBusy, setSummaryBusy] = useState(false);
  const [summarySuggestions, setSummarySuggestions] = useState<SummarySuggestion[]>([]);
  const [summaryDialogOpen, setSummaryDialogOpen] = useState(false);

  useEffect(() => {
    setGridRows(buildGridRows(projection));
  }, [projection]);

  const columns = projection.columns;
  const frozenColumns = columns.filter((c) => c.isPinned || c.columnZone === 'hierarchy' || c.columnZone === 'primary_media' || c.columnZone === 'comparison_category');
  const scrollableColumns = columns.filter((c) => !frozenColumns.includes(c));

  // Group frozen + scrollable for header rendering.
  const allColumns = [...frozenColumns, ...scrollableColumns];

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
      const colIndex = columns.findIndex((c) => c.id === columnId);
      if (colIndex < 0) return;
      setPendingCellRef({ colIndex, rowIndex });
    },
    [pickMode, formulaColumn, columns],
  );

  // Hierarchy merge computation: for each grid row, determine if it's the
  // first row of its level1/level2/level3 group (rowspan start) and the span.
  const mergeInfo = computeMerges(gridRows);

  const handleGenerateSummary = useCallback(async () => {
    if (!hermesEnabled) {
      toast.message('助手功能未启用');
      return;
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
        return;
      }
      const suggestions = (json.data?.suggestions ?? []) as SummarySuggestion[];
      if (suggestions.length === 0) {
        toast.message('未生成可用建议，请补充矩阵数据后重试');
        return;
      }
      setSummarySuggestions(suggestions);
      setSummaryDialogOpen(true);
    } catch {
      toast.error('助手暂不可用');
    } finally {
      setSummaryBusy(false);
    }
  }, [hermesEnabled, matrixId]);

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

  const handleAddLevel2 = useCallback(async (parentId: string) => {
    const label = window.prompt('二级细项名称：', '新细项');
    if (!label?.trim()) return;
    try {
      const res = await fetch(`/api/v1/matrices/${matrixId}/hierarchy-nodes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ level: 2, parentId, nodeLabel: label.trim() }),
      });
      const json = await res.json();
      if (json.code === 0) {
        toast.success('二级细项已创建');
        onChanged();
      } else {
        toast.error(json.message || '创建失败');
      }
    } catch {
      toast.error('创建失败，请重试');
    }
  }, [matrixId, onChanged]);

  const handleAddColumn = useCallback(async () => {
    if (!newColumnLabel.trim()) return;
    setAddingColumn(true);
    try {
      const res = await fetch(`/api/v1/matrices/${matrixId}/columns`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          columnZone: newColumnZone,
          columnLabel: newColumnLabel.trim(),
          dataType: newColumnZone === 'calculation_dimension' ? 'formula' : 'text',
        }),
      });
      const json = await res.json();
      if (json.code === 0) {
        toast.success('列已创建');
        setNewColumnLabel('');
        onChanged();
      } else {
        toast.error(json.message || '创建失败');
      }
    } catch {
      toast.error('创建失败，请重试');
    } finally {
      setAddingColumn(false);
    }
  }, [matrixId, newColumnLabel, newColumnZone, onChanged]);

  const summaryBlock = projection.narratives.find((n) => n.blockType === 'summary');
  const noteBlocks = projection.narratives.filter((n) => n.blockType !== 'summary');

  // Empty matrix: show the "create first level_1" prompt.
  if (gridRows.length === 0 && projection.hierarchy.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Table2 className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">空白动态数据矩阵</h3>
          <p className="text-muted-foreground mb-6 max-w-md mx-auto">
            从添加第一个一级大类开始。系统会自动创建对应的二级细项和数据行，
            您可以立即录入数据。
          </p>
          <div className="flex items-center justify-center gap-2">
            <Input
              value={newNodeLabel}
              onChange={(e) => setNewNodeLabel(e.target.value)}
              placeholder="一级大类名称（如：产品、食材、场景）"
              className="max-w-xs"
              onKeyDown={(e) => e.key === 'Enter' && handleAddLevel1()}
            />
            <Button onClick={handleAddLevel1} disabled={addingNode || !newNodeLabel.trim()}>
              {addingNode ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              添加一级大类
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {/* Summary bar */}
      <div className="flex items-center gap-3 text-sm text-muted-foreground flex-wrap">
        <Badge variant="secondary">{projection.summary.activeLeafRows} 行</Badge>
        <Badge variant="secondary">{columns.length} 列</Badge>
        <Badge variant="secondary">{projection.summary.filledCells} 已填</Badge>
        {projection.summary.totalIssues > 0 && (
          <Badge variant="outline">{projection.summary.totalIssues} 问题</Badge>
        )}
      </div>

      <div className={cn('gap-3', stagingEnabled ? 'lg:grid lg:grid-cols-[1fr_200px]' : '')}>
        <div className="space-y-3 min-w-0">
      {/* Grid */}
      <div className="border rounded-lg overflow-auto max-h-[70vh]" style={{ minWidth: 0 }}>
        <table className="border-collapse text-sm" style={{ tableLayout: 'fixed' }}>
          {/* Header */}
          <thead className="sticky top-0 z-20 bg-muted/80 backdrop-blur">
            <tr>
              {allColumns.map((col) => (
                <th
                  key={col.id}
                  className={cn(
                    'border-b border-r px-2 py-1.5 text-left font-medium whitespace-nowrap',
                    frozenColumns.includes(col) && 'sticky bg-muted z-10',
                  )}
                  style={{
                    width: col.desktopWidthPx,
                    left: frozenColumns.includes(col)
                      ? `${frozenColumnOffset(frozenColumns, col)}px`
                      : undefined,
                  }}
                >
                  <div className="flex items-center gap-1">
                    {zoneIcon(col.columnZone)}
                    <span>{col.columnLabel}</span>
                    {col.unitText && <span className="text-muted-foreground text-xs">({col.unitText})</span>}
                    {col.columnZone === 'calculation_dimension' && formulaEnabled && (
                      <button
                        type="button"
                        className="inline-flex items-center gap-0.5 text-[10px] font-mono text-primary hover:underline ml-0.5"
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
                      <span className="text-[10px] font-mono text-muted-foreground">fx</span>
                    )}
                  </div>
                </th>
              ))}
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
                    return (
                      <td
                        key={col.id}
                        className={cn(
                          'border-b border-r px-1 py-0.5 align-top',
                          frozenColumns.includes(col) && 'sticky bg-background z-[1]',
                          styleToClass(style),
                          pickMode && 'cursor-crosshair hover:bg-primary/10',
                        )}
                        style={{
                          left: frozenColumns.includes(col)
                            ? `${frozenColumnOffset(frozenColumns, col)}px`
                            : undefined,
                        }}
                        rowSpan={span && span > 1 ? span : undefined}
                        onClick={
                          pickMode
                            ? (e) => {
                                e.stopPropagation();
                                handleCellPick(col.id, grow.leaf.visibleRowIndex);
                              }
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
                          hierarchyContext={{ level1: grow.level1, level2: grow.level2, level3: grow.level3 }}
                          mergeInfo={merges}
                          onAddLevel2={handleAddLevel2}
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
        <Input
          value={newColumnLabel}
          onChange={(e) => setNewColumnLabel(e.target.value)}
          placeholder="新列名称（如：耗时、重量、温度）"
          className="max-w-[200px] h-8"
          onKeyDown={(e) => e.key === 'Enter' && void handleAddColumn()}
        />
        <select
          value={newColumnZone}
          onChange={(e) => setNewColumnZone(e.target.value as ColumnZone)}
          className="h-8 rounded-md border border-input bg-background px-2 text-sm"
        >
          <option value="detail_dimension">详细对比维度</option>
          <option value="calculation_dimension">计算列</option>
          <option value="evaluation">效果评价</option>
          <option value="issue_point">问题点</option>
        </select>
        <Button size="sm" variant="outline" onClick={() => void handleAddColumn()} disabled={addingColumn || !newColumnLabel.trim()}>
          {addingColumn ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
          新增列
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
          hermesEnabled={hermesEnabled}
          summaryBusy={summaryBusy}
          onGenerateSummary={() => void handleGenerateSummary()}
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

        {stagingEnabled && (
          <MatrixMaterialStagingRail taskId={taskId} className="hidden lg:flex sticky top-2 self-start" />
        )}
      </div>

      {stagingEnabled && (
        <div className="lg:hidden">
          <MatrixMaterialStagingRail taskId={taskId} />
        </div>
      )}

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
          columns={columns}
          rows={projection.rows}
          pendingCellRef={pendingCellRef}
          onPendingCellConsumed={() => setPendingCellRef(null)}
          pickMode={pickMode}
          onPickModeChange={setPickMode}
          onSaved={onChanged}
        />
      )}

      <MatrixSummarySuggestionsDialog
        open={summaryDialogOpen}
        onOpenChange={setSummaryDialogOpen}
        matrixId={matrixId}
        suggestions={summarySuggestions}
        onApplied={onChanged}
      />
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
  hierarchyContext: { level1: V3HierarchyNode; level2: V3HierarchyNode | null; level3: V3HierarchyNode | null };
  mergeInfo?: MergeInfo;
  onAddLevel2?: (parentId: string) => void;
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
  hierarchyContext,
  mergeInfo,
  onAddLevel2,
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
          {onAddLevel2 && (
            <button
              type="button"
              className="text-[10px] text-muted-foreground hover:text-primary"
              onClick={() => onAddLevel2(hierarchyContext.level1.id)}
            >
              + 二级细项
            </button>
          )}
        </div>
      );
    }
    if (role === 'B') {
      if (mergeInfo && !mergeInfo.isLevel2Start) return null;
      if (!hierarchyContext.level2) {
        return <span className="text-muted-foreground text-xs px-1">—</span>;
      }
      return (
        <div className="px-1 py-1">
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
      );
    }
    if (role === 'C') {
      if (mergeInfo && !mergeInfo.isLevel3Start) return null;
      if (!hierarchyContext.level3) {
        return <span className="text-muted-foreground text-xs px-1">—</span>;
      }
      return (
        <div className="px-1 py-1">
          <InlineEditable.Text
            value={hierarchyContext.level3.nodeLabel}
            placeholder="三级细项"
            onSave={async (v) => {
              await patchInlineValue('dynamic_matrix_hierarchy_node', hierarchyContext.level3!.id, 'node_label', v);
              onChanged();
            }}
            inputClassName="h-7 text-xs"
          />
        </div>
      );
    }
    return <span className="text-muted-foreground text-xs px-1">{cell?.valueText ?? ''}</span>;
  }

  // Calculation columns: show computed value; click opens formula editor (Wave 3).
  if (column.columnZone === 'calculation_dimension') {
    const display = cell?.valueNumber ?? cell?.displayText ?? '';
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

  // Issue point column.
  if (column.columnZone === 'issue_point') {
    return (
      <div className="px-1 py-0.5 min-h-[28px]">
        <InlineEditable.Text
          value={cell?.valueText ?? ''}
          placeholder="问题点…"
          onSave={async (v) => {
            await patchInlineValue('matrix_issue_point', leafRowId, 'issue_text', v);
            onChanged();
          }}
          inputClassName="h-7 text-xs"
        />
      </div>
    );
  }

  // Numeric / duration / percentage / temperature / volume → number input.
  if (['number', 'duration', 'percentage', 'temperature', 'volume'].includes(column.dataType)) {
    return (
      <div className="px-1 py-0.5">
        <InlineCellNumber
          leafRowId={leafRowId}
          columnId={column.id}
          value={cell?.valueNumber ?? ''}
          unit={column.unitText}
          onChanged={onChanged}
        />
      </div>
    );
  }

  // Default: text / long_text → inline editable.
  return (
    <div className="px-1 py-0.5">
      <InlineEditable.Text
        value={cell?.valueText ?? ''}
        placeholder="…"
        onSave={async (v) => {
          await patchInlineValue('dynamic_matrix_cell_value', cellKey(leafRowId, column.id), 'value', v);
          onChanged();
        }}
        inputClassName="h-7 text-xs"
      />
    </div>
  );
}

function InlineCellNumber({
  leafRowId,
  columnId,
  value,
  unit,
  onChanged,
}: {
  leafRowId: string;
  columnId: string;
  value: string;
  unit: string | null;
  onChanged: () => void;
}) {
  // Use a simple controlled Input with blur-save (numeric fields benefit from
  // explicit commit rather than debounce to avoid partial-number saves).
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  useEffect(() => setDraft(value), [value]);

  const save = async () => {
    if (draft === value) return;
    setSaving(true);
    try {
      await patchInlineValue('dynamic_matrix_cell_value', cellKey(leafRowId, columnId), 'value', draft);
      onChanged();
    } catch {
      toast.error('保存失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex items-center gap-1">
      <Input
        type="text"
        inputMode="decimal"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={save}
        className="h-7 text-xs font-mono"
        disabled={saving}
      />
      {unit && <span className="text-muted-foreground text-xs whitespace-nowrap">{unit}</span>}
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
  hermesEnabled,
  summaryBusy,
  onGenerateSummary,
}: {
  matrixId: string;
  block: V3MatrixProjection['narratives'][number] | undefined;
  blockType: string;
  label: string;
  placeholder: string;
  onChanged: () => void;
  hermesEnabled?: boolean;
  summaryBusy?: boolean;
  onGenerateSummary?: () => void;
}) {
  const [content, setContent] = useState(block?.content ?? '');
  const [saving, setSaving] = useState(false);
  useEffect(() => setContent(block?.content ?? ''), [block]);

  const save = async () => {
    if (content === (block?.content ?? '')) return;
    setSaving(true);
    try {
      if (block) {
        // Update existing block content.
        await patchInlineValue('dynamic_matrix_narrative_block', block.id, 'content', content);
      } else {
        // Create new block.
        const res = await fetch(`/api/v1/matrices/${matrixId}/narrative-blocks`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ blockType, scope: 'matrix', content, showInReport: content.trim() !== '' }),
        });
        const json = await res.json();
        if (json.code !== 0) throw new Error(json.message);
      }
      onChanged();
    } catch {
      toast.error('保存失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="flex items-center gap-2 mb-1">
        <span className="text-sm font-medium">{label}</span>
        {saving && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
        {blockType === 'summary' && hermesEnabled && onGenerateSummary && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 gap-1 text-xs ml-auto"
            disabled={summaryBusy}
            onClick={onGenerateSummary}
            title="AI 生成小结建议"
          >
            {summaryBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
            AI 小结
          </Button>
        )}
      </div>
      <Textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        onBlur={save}
        placeholder={placeholder}
        rows={blockType === 'summary' ? 3 : 2}
        className="text-sm"
      />
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
  if (col.zoneRole === 'C') return merges.isLevel3Start ? merges.level3RowSpan : 0;
  void grow;
  return undefined;
}

function frozenColumnOffset(frozenColumns: V3Column[], col: V3Column): number {
  let offset = 0;
  for (const c of frozenColumns) {
    if (c.id === col.id) break;
    offset += c.desktopWidthPx;
  }
  return offset;
}
