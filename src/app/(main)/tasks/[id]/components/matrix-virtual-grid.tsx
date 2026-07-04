'use client';

/**
 * MatrixVirtualGrid — the desktop three-slot input grid (Task 10).
 *
 * A table-fixed HTML <Table> mirroring ComparisonWorkspace's visual language,
 * with sticky left hierarchy columns and three slot columns (效果结论 / 过程记录
 * / 关联问题) grouped after the observed/calculated metric columns.
 *
 * Column order:
 *   [一级分组 | 二级规格 | 三级细项]   ← sticky left (sticky-rail + 3 cols)
 *   [observed metrics…]
 *   [calculated metrics…]
 *   [效果结论 | 过程记录 | 关联问题 | 证据]
 *
 * Stickiness: the action rail + 3 hierarchy columns share a cumulative left
 * offset (STICKY_OFFSETS). `position: sticky; left: Npx` pins them during
 * horizontal scroll; the header row also pins vertically via top-0 + z-30.
 *
 * No virtualization library for v1 — spec targets 50 groups × 10 rows = 500
 * rows; if perf bites, a follow-up can add @tanstack/react-virtual. Group band
 * rows render full-width (colSpan) above each group's rows.
 */
import { Fragment, useEffect } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { DimensionBinding, ResultStatusOption } from '@/lib/matrix/types';
import type { MatrixReadGroup, MatrixReadProjection, MatrixReadRow } from '@/lib/matrix/projection';
import {
  CalculatedMetricCell,
  type OptimisticMetric,
  EvidenceCell,
  IssueSlotCell,
  ObservedMetricCell,
  ProcessSlotCell,
  ResultSlotCell,
} from './matrix-cell';

// Column widths (px). Hierarchy columns are sticky; metric/evidence columns scroll.
const RAIL_WIDTH = 48;
const COL_GROUP_WIDTH = 120;
const COL_SPEC_WIDTH = 120;
const COL_ITEM_WIDTH = 140;
const COL_METRIC_WIDTH = 132;
const COL_SLOT_WIDTH = 168;

// Cumulative left offsets for the sticky columns (rail, 一级分组, 二级规格, 三级细项).
const STICKY_OFFSETS = {
  rail: 0,
  group: RAIL_WIDTH,
  spec: RAIL_WIDTH + COL_GROUP_WIDTH,
  item: RAIL_WIDTH + COL_GROUP_WIDTH + COL_SPEC_WIDTH,
  body: RAIL_WIDTH + COL_GROUP_WIDTH + COL_SPEC_WIDTH + COL_ITEM_WIDTH,
} as const;

interface SlotCommit {
  result?: { status?: string; summary?: string };
  process?: { note: string };
}

interface MetricCommit {
  parsed: { value?: number; durationMs?: number; text?: string } | null;
}

export interface MatrixVirtualGridHandlers {
  onSlotChange: (rowId: string, patch: SlotCommit) => void;
  onMetricChange: (row: MatrixReadRow, dimensionKey: string, commit: MetricCommit) => void;
  onFocusRow: (row: MatrixReadRow) => void;
  onAddRowToGroup: (groupId: string) => void;
  /**
   * Batch paste entrypoint. Optional: only the desktop grid sets this (the
   * mobile cards omit it, since mobile has no paste UX). The grid checks for
   * its presence before attaching the document paste listener, so mobile is
   * unaffected.
   */
  onBatchPaste?: (
    anchor: { rowId: string; dimensionKey: string },
    clipboardGrid: (string | number)[][],
  ) => void;
}

/** A focused observed cell — the paste anchor. */
export interface FocusedCell {
  rowId: string;
  dimensionKey: string;
}

/** A batch-paste per-cell failure surfaced as an overlay. */
export interface CellFailure {
  code: string;
  message?: string;
}

interface MatrixVirtualGridProps {
  projection: MatrixReadProjection;
  taskId: string;
  observedDimensions: DimensionBinding[];
  calculatedDimensions: DimensionBinding[];
  /** Per-row optimistic calc results keyed by `${rowId}:${metricKey}`. */
  optimistic: Record<string, OptimisticMetric>;
  /** Per-row busy flags keyed by `${rowId}:${kind}` (kind = metricKey | 'slot'). */
  busyCells: Record<string, boolean>;
  collapsedGroups: Set<string>;
  onToggleGroup: (groupId: string) => void;
  handlers: MatrixVirtualGridHandlers;
  /** Schema-declared result-status options (undefined → platform default). */
  resultStatusOptions?: ResultStatusOption[];
  /** Currently focused observed cell (paste anchor). null = none. */
  focusedCell?: FocusedCell | null;
  onFocusedCellChange?: (cell: FocusedCell | null) => void;
  /** Batch-paste per-cell failures keyed by `${rowId}::${dimensionKey}`. */
  failedCells?: Record<string, CellFailure>;
  onClearCellFailure?: (key: string) => void;
}

export function MatrixVirtualGrid({
  projection,
  taskId,
  observedDimensions,
  calculatedDimensions,
  optimistic,
  busyCells,
  collapsedGroups,
  onToggleGroup,
  handlers,
  resultStatusOptions,
  focusedCell,
  onFocusedCellChange,
  failedCells,
  onClearCellFailure,
}: MatrixVirtualGridProps) {
  const tableMinWidth =
    STICKY_OFFSETS.body +
    (observedDimensions.length + calculatedDimensions.length) * COL_METRIC_WIDTH +
    4 * COL_SLOT_WIDTH;
  // Total column count for the empty-state full-width row (4 sticky + metrics + 4 slots).
  const totalColCount = 4 + observedDimensions.length + calculatedDimensions.length + 4;

  const stickyCellClass = (left: number, z = 'z-10') =>
    cn('sticky bg-card', z);

  // Document-level paste listener for multi-cell (spreadsheet-style) paste.
  // Only attached when an onBatchPaste handler exists (mobile omits it). We
  // intentionally restrict the interception to MULTI-cell payloads (clipboard
  // contains a tab or a newline) so a normal single-value Ctrl+V into the
  // focused <Input> still flows to the input's own paste behaviour. The paste
  // anchor is `focusedCell`, which must currently be in the DOM (i.e. its row
  // isn't collapsed/filtered out) — otherwise we no-op rather than guess a row.
  useEffect(() => {
    if (!handlers.onBatchPaste) return;
    const onPaste = (e: ClipboardEvent) => {
      if (!handlers.onBatchPaste || !focusedCell) return;
      const text = e.clipboardData?.getData('text/plain') ?? '';
      if (!text) return;
      // Only intercept multi-cell pastes (Excel/sheets region). Single values
      // pasted into a focused input are left to the input itself.
      const isMultiCell = text.includes('\t') || text.includes('\n');
      if (!isMultiCell) return;
      // Only intercept when the paste is happening INSIDE the focused observed
      // cell itself. Without this guard, `focusedCell` is never cleared after
      // the first click on an observed cell, so every subsequent multi-line/tab
      // paste ANYWHERE on the page (过程记录/效果结论 textareas, toolbar search,
      // document body) would be hijacked into the grid as metric values — a
      // silent data-integrity hazard. By checking `e.target.closest(...)`,
      // pastes whose target is a different element fall through to native
      // behaviour.
      const target = e.target as HTMLElement | null;
      if (!target) return;
      const inFocusedCell = target.closest(
        `[data-row-id="${CSS.escape(focusedCell.rowId)}"][data-dimension-key="${CSS.escape(focusedCell.dimensionKey)}"]`,
      );
      if (!inFocusedCell) return; // paste target is elsewhere — let native handle it
      e.preventDefault();
      const rows = text.split(/\r?\n/).filter((r) => r.length > 0);
      const grid = rows.map((r) =>
        r.split('\t').map((cell) => {
          const trimmed = cell.trim();
          const n = Number(trimmed);
          // Empty string stays a string so the backend clears the cell rather
          // than writing NaN; finite numbers are sent as numbers, everything
          // else (text/enum) as a string for the backend's valueKind dispatch.
          if (trimmed === '') return '';
          return Number.isFinite(n) ? n : cell;
        }),
      );
      handlers.onBatchPaste!(focusedCell, grid);
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, [focusedCell, handlers]);

  return (
    <div className="w-full overflow-x-auto">
      <Table className="table-fixed border-separate border-spacing-0" style={{ minWidth: tableMinWidth }}>
        <MatrixHeader
          observedDimensions={observedDimensions}
          calculatedDimensions={calculatedDimensions}
          stickyCellClass={stickyCellClass}
        />
        <TableBody>
          {projection.groups.map((group) => (
            <GroupBlock
              key={group.id}
              group={group}
              taskId={taskId}
              observedDimensions={observedDimensions}
              calculatedDimensions={calculatedDimensions}
              optimistic={optimistic}
              busyCells={busyCells}
              collapsed={collapsedGroups.has(group.id)}
              onToggleGroup={onToggleGroup}
              handlers={handlers}
              stickyCellClass={stickyCellClass}
              resultStatusOptions={resultStatusOptions}
              focusedCell={focusedCell}
              onFocusedCellChange={onFocusedCellChange}
              failedCells={failedCells}
              onClearCellFailure={onClearCellFailure}
            />
          ))}
          {projection.groups.length === 0 && (
            <TableRow>
              <TableCell colSpan={totalColCount} className="p-8 text-center text-sm text-muted-foreground">
                暂无记录行。点击左上「新增大类」开始录入。
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------

function MatrixHeader({
  observedDimensions,
  calculatedDimensions,
  stickyCellClass,
}: {
  observedDimensions: DimensionBinding[];
  calculatedDimensions: DimensionBinding[];
  stickyCellClass: (left: number, z?: string) => string;
}) {
  return (
    <TableHeader>
      <TableRow className="hover:bg-transparent">
        <TableHead
          style={{ width: RAIL_WIDTH, left: STICKY_OFFSETS.rail }}
          className={cn(stickyCellClass(STICKY_OFFSETS.rail, 'z-30'), 'top-0 h-8 border-b text-center text-[10px]')}
        >
          #
        </TableHead>
        <TableHead
          style={{ width: COL_GROUP_WIDTH, left: STICKY_OFFSETS.group }}
          className={cn(stickyCellClass(STICKY_OFFSETS.group, 'z-30'), 'top-0 h-8 border-b text-[11px]')}
        >
          一级分组
        </TableHead>
        <TableHead
          style={{ width: COL_SPEC_WIDTH, left: STICKY_OFFSETS.spec }}
          className={cn(stickyCellClass(STICKY_OFFSETS.spec, 'z-30'), 'top-0 h-8 border-b text-[11px]')}
        >
          二级规格
        </TableHead>
        <TableHead
          style={{ width: COL_ITEM_WIDTH, left: STICKY_OFFSETS.item }}
          className={cn(stickyCellClass(STICKY_OFFSETS.item, 'z-30'), 'top-0 h-8 border-b text-[11px]')}
        >
          三级细项
        </TableHead>

        {observedDimensions.map((d) => (
          <TableHead
            key={d.dimensionKey}
            style={{ width: COL_METRIC_WIDTH }}
            className="top-0 h-8 border-b text-[11px]"
          >
            <div className="flex flex-col">
              <span className="truncate" title={d.displayName}>{d.displayName}</span>
              {d.unitCode && <span className="text-[9px] font-normal text-muted-foreground">{d.unitCode}</span>}
            </div>
          </TableHead>
        ))}
        {calculatedDimensions.map((d) => (
          <TableHead
            key={d.dimensionKey}
            style={{ width: COL_METRIC_WIDTH }}
            className="top-0 h-8 border-b bg-muted/30 text-[11px]"
          >
            <div className="flex flex-col">
              <span className="truncate" title={d.displayName}>{d.displayName}</span>
              <span className="text-[9px] font-normal text-muted-foreground">计算</span>
            </div>
          </TableHead>
        ))}

        <TableHead style={{ width: COL_SLOT_WIDTH }} className="top-0 h-8 border-b text-[11px]">效果结论</TableHead>
        <TableHead style={{ width: COL_SLOT_WIDTH }} className="top-0 h-8 border-b text-[11px]">过程记录</TableHead>
        <TableHead style={{ width: COL_SLOT_WIDTH }} className="top-0 h-8 border-b text-[11px]">关联问题</TableHead>
        <TableHead style={{ width: COL_SLOT_WIDTH }} className="top-0 h-8 border-b text-[11px]">证据</TableHead>
      </TableRow>
    </TableHeader>
  );
}

// ---------------------------------------------------------------------------
// Group block (band row + data rows)
// ---------------------------------------------------------------------------

function GroupBlock({
  group,
  taskId,
  observedDimensions,
  calculatedDimensions,
  optimistic,
  busyCells,
  collapsed,
  onToggleGroup,
  handlers,
  stickyCellClass,
  resultStatusOptions,
  focusedCell,
  onFocusedCellChange,
  failedCells,
  onClearCellFailure,
}: {
  group: MatrixReadGroup;
  taskId: string;
  observedDimensions: DimensionBinding[];
  calculatedDimensions: DimensionBinding[];
  optimistic: Record<string, OptimisticMetric>;
  busyCells: Record<string, boolean>;
  collapsed: boolean;
  onToggleGroup: (id: string) => void;
  handlers: MatrixVirtualGridHandlers;
  stickyCellClass: (left: number, z?: string) => string;
  resultStatusOptions?: ResultStatusOption[];
  focusedCell?: FocusedCell | null;
  onFocusedCellChange?: (cell: FocusedCell | null) => void;
  failedCells?: Record<string, CellFailure>;
  onClearCellFailure?: (key: string) => void;
}) {
  const totalCols = 4 + observedDimensions.length + calculatedDimensions.length + 4;

  return (
    <Fragment>
      {/* Group band row — full width, label + condition + collapse chevron. */}
      <TableRow className="bg-muted/20 hover:bg-muted/20">
        <TableCell
          colSpan={totalCols}
          className="sticky left-0 z-20 border-b border-t bg-muted/30 p-2"
        >
          <div className="flex min-w-0 items-center gap-2">
            <Button
              size="icon"
              variant="ghost"
              className="h-6 w-6 shrink-0"
              onClick={() => onToggleGroup(group.id)}
              aria-label={collapsed ? '展开' : '折叠'}
            >
              {collapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </Button>
            <span className="min-w-0 truncate text-sm font-semibold text-foreground">{group.label}</span>
            {group.conditionSummary && (
              <span className="min-w-0 truncate text-xs text-muted-foreground">{group.conditionSummary}</span>
            )}
            <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">{group.rows.length} 行</span>
            <Button
              size="sm"
              variant="ghost"
              className="h-6 shrink-0 text-[10px]"
              onClick={() => handlers.onAddRowToGroup(group.id)}
            >
              + 行
            </Button>
          </div>
        </TableCell>
      </TableRow>

      {!collapsed &&
        group.rows.map((row, idx) => (
          <MatrixDataRow
            key={row.id}
            row={row}
            index={idx}
            taskId={taskId}
            observedDimensions={observedDimensions}
            calculatedDimensions={calculatedDimensions}
            optimistic={optimistic}
            busyCells={busyCells}
            handlers={handlers}
            stickyCellClass={stickyCellClass}
            resultStatusOptions={resultStatusOptions}
            focusedCell={focusedCell}
            onFocusedCellChange={onFocusedCellChange}
            failedCells={failedCells}
            onClearCellFailure={onClearCellFailure}
          />
        ))}
    </Fragment>
  );
}

// ---------------------------------------------------------------------------
// Data row
// ---------------------------------------------------------------------------

function MatrixDataRow({
  row,
  index,
  taskId,
  observedDimensions,
  calculatedDimensions,
  optimistic,
  busyCells,
  handlers,
  stickyCellClass,
  resultStatusOptions,
  focusedCell,
  onFocusedCellChange,
  failedCells,
  onClearCellFailure,
}: {
  row: MatrixReadRow;
  index: number;
  taskId: string;
  observedDimensions: DimensionBinding[];
  calculatedDimensions: DimensionBinding[];
  optimistic: Record<string, OptimisticMetric>;
  busyCells: Record<string, boolean>;
  handlers: MatrixVirtualGridHandlers;
  stickyCellClass: (left: number, z?: string) => string;
  resultStatusOptions?: ResultStatusOption[];
  focusedCell?: FocusedCell | null;
  onFocusedCellChange?: (cell: FocusedCell | null) => void;
  failedCells?: Record<string, CellFailure>;
  onClearCellFailure?: (key: string) => void;
}) {
  const slotBusy = busyCells[`${row.id}:slot`] ?? false;

  return (
    <TableRow
      className="cursor-pointer"
      onClick={() => handlers.onFocusRow(row)}
    >
      {/* Rail */}
      <TableCell
        style={{ left: STICKY_OFFSETS.rail }}
        className={cn(stickyCellClass(STICKY_OFFSETS.rail), 'h-9 border-b text-center text-[10px] text-muted-foreground')}
      >
        {index + 1}
      </TableCell>
      {/* Hierarchy — group label repeats the band for context when scrolled right. */}
      <TableCell
        style={{ left: STICKY_OFFSETS.group }}
        className={cn(stickyCellClass(STICKY_OFFSETS.group), 'border-b text-[11px]')}
      >
        <span className="block truncate text-muted-foreground" title={row.subject.key}>
          {row.subject.key || '—'}
        </span>
      </TableCell>
      <TableCell
        style={{ left: STICKY_OFFSETS.spec }}
        className={cn(stickyCellClass(STICKY_OFFSETS.spec), 'border-b text-[11px]')}
      >
        <span className="block truncate text-muted-foreground">—</span>
      </TableCell>
      <TableCell
        style={{ left: STICKY_OFFSETS.item }}
        className={cn(stickyCellClass(STICKY_OFFSETS.item), 'border-b text-[11px] font-medium')}
      >
        <span className="block truncate" title={row.subject.label}>{row.subject.label}</span>
      </TableCell>

      {/* Observed metrics.
          The wrapper carries data-* attrs so the document paste listener can
          target the focused cell by rowId+dimensionKey, and an onClick that
          records this cell as the paste anchor (without stealing focus from the
          input below — the input keeps its native caret/focus). */}
      {observedDimensions.map((d) => {
        const cellKey = `${row.id}::${d.dimensionKey}`;
        const isFocused =
          focusedCell?.rowId === row.id && focusedCell?.dimensionKey === d.dimensionKey;
        return (
          <TableCell
            key={d.dimensionKey}
            data-row-id={row.id}
            data-dimension-key={d.dimensionKey}
            className={cn(
              'border-b p-0 align-top',
              isFocused && 'ring-2 ring-inset ring-primary/40',
            )}
            onClick={() => onFocusedCellChange?.({ rowId: row.id, dimensionKey: d.dimensionKey })}
          >
            <ObservedMetricCell
              dimension={d}
              metric={row.metrics[d.dimensionKey]}
              busy={busyCells[`${row.id}:${d.dimensionKey}`] ?? false}
              onChange={(parsed) => handlers.onMetricChange(row, d.dimensionKey, { parsed })}
              failedError={failedCells?.[cellKey]}
              onClearFailure={onClearCellFailure ? () => onClearCellFailure(cellKey) : undefined}
            />
          </TableCell>
        );
      })}

      {/* Calculated metrics */}
      {calculatedDimensions.map((d) => (
        <TableCell key={d.dimensionKey} className="border-b bg-muted/10 p-0 align-top">
          <CalculatedMetricCell
            dimension={d}
            metric={row.metrics[d.dimensionKey]}
            optimistic={optimistic[`${row.id}:${d.dimensionKey}`] ?? null}
          />
        </TableCell>
      ))}

      {/* Slots */}
      <TableCell className="border-b p-0 align-top" onClick={(e) => e.stopPropagation()}>
        <ResultSlotCell
          row={row}
          busy={slotBusy}
          resultStatusOptions={resultStatusOptions}
          onChange={(patch) => handlers.onSlotChange(row.id, { result: patch })}
        />
      </TableCell>
      <TableCell className="border-b p-0 align-top" onClick={(e) => e.stopPropagation()}>
        <ProcessSlotCell
          row={row}
          busy={slotBusy}
          onChange={(note) => handlers.onSlotChange(row.id, { process: { note } })}
        />
      </TableCell>
      <TableCell className="border-b p-0 align-top" onClick={(e) => e.stopPropagation()}>
        <IssueSlotCell row={row} />
      </TableCell>
      <TableCell className="border-b p-0 align-top" onClick={(e) => e.stopPropagation()}>
        <EvidenceCell row={row} taskId={taskId} />
      </TableCell>
    </TableRow>
  );
}
