'use client';

/**
 * MatrixToolbar — the action rail above the matrix grid.
 *
 * Layout: a left-sticky rail (the "新增大类" button) + a right-aligned cluster
 * (calculation status badge, column chooser). The "新增大类" button MUST remain
 * visible during horizontal scroll, so it lives in a `position: sticky; left: 0`
 * rail OUTSIDE the scrollable grid header (spec UI-02). We render the toolbar as
 * a flex row whose left child is `sticky left-0 z-20` so it pins regardless of
 * how far the grid below has scrolled.
 */
import { useState } from 'react';
import { Columns3, Loader2, Plus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { DimensionBinding } from '@/lib/matrix/types';
import { cn } from '@/lib/utils';

type CalcStatus = 'succeeded' | 'failed' | 'partial' | 'unknown';

const CALC_BADGE: Record<CalcStatus, { label: string; className: string }> = {
  succeeded: { label: '计算完成', className: 'border-green-300 bg-green-50 text-green-700' },
  failed: { label: '计算失败', className: 'border-red-300 bg-red-50 text-red-700' },
  partial: { label: '部分计算', className: 'border-amber-300 bg-amber-50 text-amber-700' },
  unknown: { label: '尚未计算', className: 'border-border bg-muted/40 text-muted-foreground' },
};

interface MatrixToolbarProps {
  /** Called when the user confirms a new group; should POST and refresh. */
  onCreateGroup: (label: string, conditionSummary?: string) => Promise<void>;
  /** Whether a group-create request is in flight (disables the button). */
  creatingGroup: boolean;
  calcStatus: CalcStatus;
  /** All dimensions; the chooser toggles their visibility. */
  dimensions: DimensionBinding[];
  /** Currently visible dimension keys. */
  visibleKeys: string[];
  onVisibleKeysChange: (keys: string[]) => void;
  /** Editable rows permission (hides 新增大类 when false). */
  canEditRows: boolean;
}

export function MatrixToolbar({
  onCreateGroup,
  creatingGroup,
  calcStatus,
  dimensions,
  visibleKeys,
  onVisibleKeysChange,
  canEditRows,
}: MatrixToolbarProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [label, setLabel] = useState('');
  const [conditionSummary, setConditionSummary] = useState('');

  const badge = CALC_BADGE[calcStatus];

  const toggle = (key: string) => {
    if (visibleKeys.includes(key)) {
      // Don't allow hiding the last dimension.
      if (visibleKeys.length <= 1) return;
      onVisibleKeysChange(visibleKeys.filter((k) => k !== key));
    } else {
      onVisibleKeysChange([...visibleKeys, key]);
    }
  };

  const submit = async () => {
    const trimmed = label.trim();
    if (!trimmed) return;
    try {
      await onCreateGroup(trimmed, conditionSummary.trim() || undefined);
      setDialogOpen(false);
      setLabel('');
      setConditionSummary('');
    } catch {
      // onCreateGroup is responsible for its own toast on failure.
    }
  };

  return (
    <div className="relative flex items-center gap-2 border-b bg-card/95 px-3 py-1.5 backdrop-blur">
      {/* Left-sticky rail — pins during horizontal scroll (UI-02). */}
      <div className="sticky left-3 z-20 flex shrink-0 items-center gap-2 bg-card/95 pr-2">
        {canEditRows && (
          <Button
            size="sm"
            className="h-8 gap-1.5"
            onClick={() => setDialogOpen(true)}
            disabled={creatingGroup}
          >
            {creatingGroup ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            新增大类
          </Button>
        )}
      </div>

      <div className="ml-auto flex shrink-0 items-center gap-2">
        <Badge variant="outline" className={cn('gap-1 text-xs', badge.className)}>
          {badge.label}
        </Badge>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="outline" className="h-8 gap-1.5">
              <Columns3 className="h-3.5 w-3.5" />
              列
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="max-h-80 overflow-y-auto">
            <DropdownMenuLabel>显示指标列</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {dimensions.map((d) => (
              <DropdownMenuCheckboxItem
                key={d.dimensionKey}
                checked={visibleKeys.includes(d.dimensionKey)}
                onCheckedChange={() => toggle(d.dimensionKey)}
                className="text-xs"
              >
                <span className="flex items-center gap-2">
                  <span className="truncate">{d.displayName}</span>
                  <span className="text-[9px] text-muted-foreground">
                    {d.columnGroup === 'calculated' ? '计算' : '观测'}
                  </span>
                </span>
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>新增大类</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div className="space-y-1.5">
              <Label className="text-xs">大类名称</Label>
              <Input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="如：常温保存 / 4℃冷藏"
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">条件说明（可选）</Label>
              <Textarea
                value={conditionSummary}
                onChange={(e) => setConditionSummary(e.target.value)}
                rows={2}
                placeholder="如：温度 25±2℃，湿度 60%"
                className="resize-y text-xs"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={creatingGroup}>
              取消
            </Button>
            <Button onClick={submit} disabled={!label.trim() || creatingGroup}>
              {creatingGroup ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              创建
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Re-export so callers can pass a typed status without importing projection.
export type { CalcStatus };
