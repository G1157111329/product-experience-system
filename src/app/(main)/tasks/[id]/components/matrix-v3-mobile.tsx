'use client';

/**
 * MatrixV3Mobile — card-based entry for narrow screens (PRD §7.15).
 * Renders each leaf row as a card with hierarchy labels + editable fields.
 */
import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { InlineEditable } from '@/components/inline-editable';
import { putMatrixCellValue } from '@/lib/inline-save-helpers';
import type { V3MatrixProjection, V3Column, V3HierarchyNode } from '@/lib/matrix/v3-types';
import { cellKey } from '@/lib/matrix/v3-types';
import { MatrixV3MediaCell } from './matrix-v3-media-cell';

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

function editableColumns(columns: V3Column[]): V3Column[] {
  return columns.filter(
    (c) =>
      c.columnZone !== 'hierarchy' &&
      c.columnZone !== 'calculation_dimension',
  );
}

export function MatrixV3Mobile({ matrixId, taskId, projection, onChanged }: MatrixV3MobileProps) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const cols = useMemo(() => editableColumns(projection.columns), [projection.columns]);

  const rows = projection.rows;

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
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Badge variant="secondary">{rows.length} 行</Badge>
        <Badge variant="secondary">{cols.length} 可编辑列</Badge>
      </div>
      {rows.map((leaf) => {
        const l1 = findNode(projection.hierarchy, leaf.level1NodeId);
        const l2 = findNode(projection.hierarchy, leaf.level2NodeId);
        const l3 = findNode(projection.hierarchy, leaf.level3NodeId);
        const open = expanded[leaf.id] ?? true;
        return (
          <Card key={leaf.id} className="overflow-hidden">
            <CardHeader className="py-3 px-3">
              <button
                type="button"
                className="flex w-full items-start gap-2 text-left"
                onClick={() => setExpanded((s) => ({ ...s, [leaf.id]: !open }))}
              >
                {open ? <ChevronDown className="h-4 w-4 mt-0.5 shrink-0" /> : <ChevronRight className="h-4 w-4 mt-0.5 shrink-0" />}
                <div className="min-w-0 space-y-0.5">
                  <CardTitle className="text-sm font-medium truncate">{l1?.nodeLabel || '未命名大类'}</CardTitle>
                  <p className="text-xs text-muted-foreground truncate">
                    {[l2?.nodeLabel, l3?.nodeLabel].filter(Boolean).join(' / ') || '细项'}
                  </p>
                </div>
              </button>
            </CardHeader>
            {open && (
              <CardContent className="space-y-3 px-3 pb-3 pt-0">
                {cols.map((col) => {
                  const cell = projection.cells[cellKey(leaf.id, col.id)];
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
              </CardContent>
            )}
          </Card>
        );
      })}
    </div>
  );
}
