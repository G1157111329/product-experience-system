'use client';

/**
 * MatrixV3Mobile — card-based entry for narrow screens (PRD §7.15).
 * Renders each leaf row as a card with hierarchy labels + editable fields.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { InlineEditable } from '@/components/inline-editable';
import { putMatrixCellValue } from '@/lib/inline-save-helpers';
import { waitForPendingInlineSavesOrThrow } from '@/lib/inline-save-registry';
import { toast } from 'sonner';
import type { V3MatrixProjection, V3HierarchyNode } from '@/lib/matrix/v3-types';
import { cellKey } from '@/lib/matrix/v3-types';
import { MatrixV3MediaCell } from './matrix-v3-media-cell';
import {
  buildMatrixMobileGroups,
  getAdjacentMatrixRowIndex,
} from '@/lib/matrix/matrix-mobile-model';

interface MatrixV3MobileProps {
  matrixId: string;
  taskId: string;
  projection: V3MatrixProjection;
  onChanged: () => void;
}

function findNode(nodes: V3HierarchyNode[], id: string | null | undefined): V3HierarchyNode | null {
  if (!id) return null;
  for (const n of nodes) {
    if (n.id === id) return n;
    const child = findNode(n.children, id);
    if (child) return child;
  }
  return null;
}

export function MatrixV3Mobile({ matrixId, taskId, projection, onChanged }: MatrixV3MobileProps) {
  const rows = projection.rows;
  const [currentRowIndex, setCurrentRowIndex] = useState(0);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setCurrentRowIndex((index) => Math.min(index, Math.max(rows.length - 1, 0)));
  }, [rows.length]);

  const leaf = rows[currentRowIndex];
  const groups = useMemo(
    () => leaf
      ? buildMatrixMobileGroups({
          columns: projection.columns,
          cells: projection.cells,
          cellMedia: projection.cellMedia ?? {},
          issuePoints: projection.issuePoints,
          leafRowId: leaf.id,
        })
      : [],
    [leaf, projection.cellMedia, projection.cells, projection.columns, projection.issuePoints],
  );

  const changeRow = useCallback(async (direction: -1 | 1) => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    window.dispatchEvent(new Event('inline-save:flush'));
    try {
      await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
      await waitForPendingInlineSavesOrThrow();
      setCurrentRowIndex((index) => getAdjacentMatrixRowIndex(index, direction, rows.length));
    } catch {
      toast.error('当前行保存失败，请修复后再切换');
    }
  }, [rows.length]);

  if (rows.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          暂无数据行。请在桌面端添加一级大类后继续录入。
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3 md:hidden">
      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <Badge variant="secondary">当前行 {currentRowIndex + 1} / {rows.length}</Badge>
        <div className="flex items-center gap-1">
          <Button type="button" size="sm" variant="outline" className="h-7 px-2" disabled={currentRowIndex === 0} onClick={() => void changeRow(-1)}><ChevronLeft className="mr-1 h-3.5 w-3.5" />上一行</Button>
          <Button type="button" size="sm" variant="outline" className="h-7 px-2" disabled={currentRowIndex === rows.length - 1} onClick={() => void changeRow(1)}>下一行<ChevronRight className="ml-1 h-3.5 w-3.5" /></Button>
        </div>
      </div>
      {leaf && (() => {
        const l1 = findNode(projection.hierarchy, leaf.level1NodeId);
        const l2 = findNode(projection.hierarchy, leaf.level2NodeId);
        const l3 = findNode(projection.hierarchy, leaf.level3NodeId);
        return (
          <Card className="overflow-hidden">
            <CardHeader className="py-3 px-3">
              <CardTitle className="text-sm font-medium truncate">{l1?.nodeLabel || '未命名大类'}</CardTitle>
              <p className="text-xs text-muted-foreground truncate mt-0.5">
                {[l2?.nodeLabel, l3?.nodeLabel].filter(Boolean).join(' / ') || '细项'}
              </p>
            </CardHeader>
            <CardContent className="space-y-2 px-3 pb-3 pt-0">
              {groups.map((group) => {
                const groupKey = `${leaf.id}:${group.id}`;
                const open = expandedGroups[groupKey] ?? group.defaultExpanded;
                return (
                  <section key={group.id} className="rounded-md border">
                    <button type="button" className="flex w-full items-center gap-2 px-2.5 py-2 text-left text-xs font-medium" onClick={() => setExpandedGroups((state) => ({ ...state, [groupKey]: !open }))}>
                      {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                      {group.label}
                    </button>
                    {open && <div className="space-y-3 border-t px-2.5 py-3">
                {group.columns.map((col) => {
                  const cell = projection.cells[cellKey(leaf.id, col.id)];
                  if (col.columnZone === 'calculation_dimension') {
                    return <div key={col.id} className="space-y-1"><p className="text-xs font-medium text-muted-foreground">{col.columnLabel}</p><p className="rounded bg-muted px-2 py-1.5 text-sm font-mono">{cell?.valueNumber ?? cell?.displayText ?? '—'}</p></div>;
                  }
                  if (col.columnZone === 'primary_media' || col.columnZone === 'effect_media') {
                    return (
                      <div key={col.id} className="space-y-1">
                        <p className="text-xs font-medium text-muted-foreground">{col.columnLabel}</p>
                        <MatrixV3MediaCell
                          matrixId={matrixId}
                          taskId={taskId}
                          leafRowId={leaf.id}
                          column={col}
                          media={projection.cellMedia?.[cellKey(leaf.id, col.id)] ?? []}
                          targetLabel={[
                            l1?.nodeLabel,
                            l2?.nodeLabel,
                            l3?.nodeLabel,
                            col.columnLabel,
                          ].filter(Boolean).join(' / ')}
                          onChanged={onChanged}
                        />
                      </div>
                    );
                  }
                  if (['number', 'duration', 'percentage', 'temperature', 'volume'].includes(col.dataType)) {
                    return (
                      <div key={col.id} className="space-y-1">
                        <p className="text-xs font-medium text-muted-foreground">
                          {col.columnLabel}
                          {col.unitText ? ` (${col.unitText})` : ''}
                        </p>
                        <InlineEditable.Text
                          value={cell?.valueNumber ?? ''}
                          placeholder="数值…"
                          onSave={async (v) => {
                            const num = v.trim() === '' ? null : Number(v);
                            await putMatrixCellValue({
                              matrixId,
                              leafRowId: leaf.id,
                              columnId: col.id,
                              valueNumber: num != null && !Number.isNaN(num) ? num : null,
                            });
                            onChanged();
                          }}
                          inputClassName="h-8 text-sm font-mono"
                        />
                      </div>
                    );
                  }
                  return (
                    <div key={col.id} className="space-y-1">
                      <p className="text-xs font-medium text-muted-foreground">{col.columnLabel}</p>
                      <InlineEditable.Textarea
                        value={cell?.valueText ?? ''}
                        placeholder="…"
                        rows={2}
                        onSave={async (v) => {
                          await putMatrixCellValue({
                            matrixId,
                            leafRowId: leaf.id,
                            columnId: col.id,
                            valueText: v,
                          });
                          onChanged();
                        }}
                        inputClassName="text-sm"
                      />
                    </div>
                  );
                })}
                    </div>}
                  </section>
                );
              })}
            </CardContent>
          </Card>
        );
      })()}
    </div>
  );
}
