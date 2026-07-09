'use client';

/**
 * MatrixFormulaEditor — point-and-click A1 formula editor (PRD §7.9).
 *
 * Users type `=G4/H5` or click cells in the matrix to append references.
 * P0: arithmetic only (+ - * / ()). On save: compile → PUT formula → recompute.
 */
import { useEffect, useMemo, useState } from 'react';
import { Calculator, Loader2, AlertCircle, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { compileA1Formula, indexToCol } from '@/lib/matrix/formula-engine-a1';
import type { V3Column, V3FormulaDefinition, V3LeafRow } from '@/lib/matrix/v3-types';

export type FormulaApplyScope = 'matrix' | 'level_1_group';

export interface FormulaEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  matrixId: string;
  column: V3Column;
  /** Existing formula for this column, if any. */
  formula?: V3FormulaDefinition | null;
  /** Ordered data columns (for A1 letter mapping in the picker hint). */
  columns: V3Column[];
  /** Ordered leaf rows (for row number hints / cross-group detection). */
  rows: V3LeafRow[];
  /** Optional: currently selected cell to append as reference. */
  pendingCellRef?: { colIndex: number; rowIndex: number } | null;
  onPendingCellConsumed?: () => void;
  /** When true, user is in "pick cell" mode from parent grid. */
  pickMode?: boolean;
  onPickModeChange?: (on: boolean) => void;
  onSaved: () => void;
}

function normalizeScope(scope: string | undefined): FormulaApplyScope {
  if (scope === 'group' || scope === 'level_1_group') return 'level_1_group';
  return 'matrix';
}

export function MatrixFormulaEditor({
  open,
  onOpenChange,
  matrixId,
  column,
  formula,
  columns,
  rows,
  pendingCellRef,
  onPendingCellConsumed,
  pickMode,
  onPickModeChange,
  onSaved,
}: FormulaEditorProps) {
  const [expression, setExpression] = useState(formula?.expressionDisplay ?? '=');
  const [applyScope, setApplyScope] = useState<FormulaApplyScope>(
    normalizeScope(formula?.applyScope),
  );
  const [resultFormat, setResultFormat] = useState(formula?.resultFormat ?? 'number');
  const [decimalPlaces, setDecimalPlaces] = useState(formula?.decimalPlaces ?? 2);
  const [saving, setSaving] = useState(false);
  const [awaitingCrossGroup, setAwaitingCrossGroup] = useState(false);

  useEffect(() => {
    if (!open) return;
    setExpression(formula?.expressionDisplay ?? '=');
    setApplyScope(normalizeScope(formula?.applyScope));
    setResultFormat(formula?.resultFormat ?? 'number');
    setDecimalPlaces(formula?.decimalPlaces ?? 2);
    setAwaitingCrossGroup(false);
  }, [open, formula]);

  // Append pending cell ref from parent grid click.
  useEffect(() => {
    if (!pendingCellRef || !open) return;
    const ref = `${indexToCol(pendingCellRef.colIndex)}${pendingCellRef.rowIndex + 1}`;
    setExpression((prev) => {
      const base = prev.trim() === '' ? '=' : prev;
      if (/[=+\-*/(]$/.test(base.trim())) return `${base}${ref}`;
      return `${base}${ref}`;
    });
    onPendingCellConsumed?.();
    onPickModeChange?.(false);
  }, [pendingCellRef, open, onPendingCellConsumed, onPickModeChange]);

  const compilePreview = useMemo(() => compileA1Formula(expression), [expression]);

  const columnLetterHints = useMemo(
    () =>
      columns.map((c, i) => ({
        letter: indexToCol(i),
        label: c.columnLabel,
        zone: c.columnZone,
        id: c.id,
      })),
    [columns],
  );

  const insertOp = (op: string) => {
    setExpression((prev) => {
      const base = prev.trim() === '' ? '=' : prev;
      return `${base}${op}`;
    });
  };

  /** True when formula refs span more than one level_1 group. */
  const refsCrossGroups = (refs: Array<{ row: number }>): boolean => {
    if (refs.length < 2 || rows.length === 0) return false;
    const groups = new Set<string>();
    for (const r of refs) {
      const leaf = rows.find((row) => row.visibleRowIndex === r.row);
      if (leaf?.level1NodeId) groups.add(leaf.level1NodeId);
    }
    return groups.size > 1;
  };

  const persistFormula = async (scope: FormulaApplyScope) => {
    const compiled = compileA1Formula(expression);
    if (!compiled.ok) {
      toast.error(`公式无效：${compiled.code}`);
      return;
    }

    setSaving(true);
    try {
      const formulaId = formula?.id ?? crypto.randomUUID();
      const res = await fetch(`/api/v1/matrix-formulas/${formulaId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          matrixId,
          columnId: column.id,
          expressionDisplay: compiled.compiled.displayExpression,
          applyScope: scope,
          resultFormat,
          decimalPlaces,
        }),
      });
      const json = await res.json();
      if (json.code !== 0) {
        toast.error(json.message || '保存公式失败');
        return;
      }

      const recomputeRes = await fetch(`/api/v1/matrix-formulas/${formulaId}/recompute`, {
        method: 'POST',
      });
      const recomputeJson = await recomputeRes.json().catch(() => null);
      if (recomputeJson && recomputeJson.code !== 0) {
        toast.error(recomputeJson.message || '重算失败，公式已保存');
      } else {
        toast.success(
          scope === 'matrix' && awaitingCrossGroup
            ? '公式已保存并重算（允许跨组）'
            : '公式已保存并重算',
        );
      }
      setAwaitingCrossGroup(false);
      onOpenChange(false);
      onSaved();
    } catch {
      toast.error('保存失败，请重试');
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    const compiled = compileA1Formula(expression);
    if (!compiled.ok) {
      toast.error(`公式无效：${compiled.code}`);
      return;
    }

    // PRD §7.9.6 — cross-group confirm when refs span level_1 groups and scope is matrix.
    if (
      applyScope === 'matrix' &&
      !awaitingCrossGroup &&
      refsCrossGroups(compiled.compiled.references)
    ) {
      setAwaitingCrossGroup(true);
      return;
    }

    await persistFormula(applyScope);
  };

  return (
    <>
      {open && pickMode && (
        <div className="fixed bottom-4 left-1/2 z-[60] -translate-x-1/2 rounded-lg border border-primary/40 bg-background px-4 py-3 shadow-lg flex items-center gap-3 max-w-[min(92vw,520px)]">
          <Calculator className="h-4 w-4 text-primary shrink-0" />
          <div className="min-w-0 text-sm">
            <p className="font-medium">点选单元格中</p>
            <p className="font-mono text-xs text-muted-foreground truncate">{expression || '='}</p>
          </div>
          <Button size="sm" variant="outline" onClick={() => onPickModeChange?.(false)}>
            完成点选
          </Button>
        </div>
      )}

      <Dialog
        open={open && !pickMode}
        onOpenChange={(next) => {
          // Entering pick mode briefly closes the dialog visually — do not treat as dismiss.
          if (!next && pickMode) return;
          onOpenChange(next);
        }}
      >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calculator className="h-4 w-4" />
            编辑计算列公式
          </DialogTitle>
          <DialogDescription>
            列「{column.columnLabel}」· 仅支持四则运算与单元格引用（如 =G4/H5）
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">公式</Label>
            <Input
              value={expression}
              onChange={(e) => setExpression(e.target.value)}
              placeholder="=G4/H5"
              className="font-mono text-sm"
              autoFocus
            />
            <div className="flex flex-wrap gap-1">
              {['+', '-', '*', '/', '(', ')'].map((op) => (
                <Button
                  key={op}
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 w-8 px-0 font-mono"
                  onClick={() => insertOp(op)}
                >
                  {op}
                </Button>
              ))}
              <Button
                type="button"
                size="sm"
                variant={pickMode ? 'default' : 'outline'}
                className="h-7"
                onClick={() => onPickModeChange?.(true)}
              >
                点选单元格
              </Button>
            </div>
            {compilePreview.ok ? (
              <p className="text-[11px] text-emerald-600 flex items-center gap-1">
                <Check className="h-3 w-3" />
                {compilePreview.compiled.displayExpression}
                <span className="text-muted-foreground">
                  · {compilePreview.compiled.references.length} 个引用
                </span>
              </p>
            ) : (
              <p className="text-[11px] text-amber-600 flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />
                {expression.trim() === '' || expression.trim() === '='
                  ? '请输入公式'
                  : `编译错误：${compilePreview.code}`}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">应用范围</Label>
              <select
                value={applyScope}
                onChange={(e) => {
                  setApplyScope(e.target.value as FormulaApplyScope);
                  setAwaitingCrossGroup(false);
                }}
                className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              >
                <option value="matrix">整表相对下推</option>
                <option value="level_1_group">仅当前一级大类内</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">结果格式</Label>
              <select
                value={resultFormat}
                onChange={(e) => setResultFormat(e.target.value)}
                className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              >
                <option value="number">数字</option>
                <option value="percentage">百分比</option>
                <option value="decimal">小数</option>
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">小数位</Label>
            <Input
              type="number"
              min={0}
              max={10}
              value={decimalPlaces}
              onChange={(e) => setDecimalPlaces(Number(e.target.value) || 0)}
              className="h-9 w-24"
            />
          </div>

          {awaitingCrossGroup && (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm space-y-2">
              <p className="text-amber-900">
                该公式引用跨越多个一级大类。是否允许跨组计算？
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={saving}
                  onClick={() => {
                    setApplyScope('level_1_group');
                    setAwaitingCrossGroup(false);
                    void persistFormula('level_1_group');
                  }}
                >
                  仅在一级大类内应用
                </Button>
                <Button
                  size="sm"
                  disabled={saving}
                  onClick={() => void persistFormula('matrix')}
                >
                  {saving ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                  允许跨组应用
                </Button>
              </div>
            </div>
          )}

          <div className="rounded-md border bg-muted/30 p-2 max-h-28 overflow-y-auto">
            <p className="text-[10px] text-muted-foreground mb-1">列字母对照（点选时按此映射）</p>
            <div className="flex flex-wrap gap-1">
              {columnLetterHints.map((h) => (
                <Badge
                  key={h.id}
                  variant="outline"
                  className={cn(
                    'text-[10px] font-mono cursor-default',
                    h.zone === 'calculation_dimension' && 'border-primary/40',
                  )}
                  title={h.zone}
                >
                  {h.letter}={h.label}
                </Badge>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            取消
          </Button>
          <Button
            onClick={() => void handleSave()}
            disabled={saving || !compilePreview.ok || awaitingCrossGroup}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
            保存并重算
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}
