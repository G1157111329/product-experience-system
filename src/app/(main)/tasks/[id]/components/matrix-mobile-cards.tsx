'use client';

/**
 * MatrixMobileCards — the mobile (≤md) experience for the data matrix input
 * (Task 11). A horizontal Excel-style table is unusable on a phone, so per
 * spec §8.3 mobile renders a vertical stack of group → row cards, with the
 * three slots (效果结论 / 过程记录 / 关联问题) always pinned at the top of each
 * row, observed/calculated metrics in a collapsible list, and a bottom Sheet
 * ("维度抽屉") that lists all dimensions for a row without forcing horizontal
 * scroll.
 *
 * Architecture: this component shares the SAME state + write APIs as the
 * desktop <MatrixVirtualGrid> — it receives the identical props (projection,
 * handlers, optimistic, busyCells, …) from <MatrixInputView> and reuses the
 * SAME leaf cell components from matrix-cell.tsx. There is no duplicated
 * optimistic calc, no separate debounce, no second PATCH path. The leaf cells
 * (`ResultSlotCell`, `ObservedMetricCell`, …) render self-contained
 * `min-w-0` wrappers and work in any layout, so they are imported as-is.
 *
 * Responsive split is CSS-only: MatrixInputView renders this component inside
 * a `md:hidden` container and the grid inside `hidden md:block`.
 */
import { Fragment, useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Layers,
  Plus,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import type { DimensionBinding, ResultStatusOption } from '@/lib/matrix/types';
import type {
  MatrixReadGroup,
  MatrixReadRow,
} from '@/lib/matrix/projection';
import {
  CalculatedMetricCell,
  EvidenceCell,
  type OptimisticMetric,
  ObservedMetricCell,
} from './matrix-cell';
import { IssueSlotCell, ProcessSlotCell, ResultSlotCell } from './matrix-cell';
import type { MatrixVirtualGridHandlers, CellFailure } from './matrix-virtual-grid';

interface MatrixMobileCardsProps {
  /** The full read projection (same DTO the desktop grid consumes). */
  projection: {
    groups: MatrixReadGroup[];
  };
  taskId: string;
  observedDimensions: DimensionBinding[];
  calculatedDimensions: DimensionBinding[];
  /** Per-row optimistic calc results keyed by `${rowId}:${metricKey}`. */
  optimistic: Record<string, OptimisticMetric>;
  /** Per-row busy flags keyed by `${rowId}:${kind}`. */
  busyCells: Record<string, boolean>;
  collapsedGroups: Set<string>;
  onToggleGroup: (groupId: string) => void;
  /** Identical handler set the desktop grid receives (minus onBatchPaste). */
  handlers: MatrixVirtualGridHandlers;
  /** Schema-declared result-status options (undefined → platform default). */
  resultStatusOptions?: ResultStatusOption[];
  /** Batch-paste per-cell failures keyed by `${rowId}::${dimensionKey}`. */
  failedCells?: Record<string, CellFailure>;
  onClearCellFailure?: (key: string) => void;
}

/**
 * Metrics list toggle: 原始 (observed) | 计算 (calculated). Default to observed
 * since that is what users edit; the calculated view is read-only context.
 */
type MetricTab = 'observed' | 'calculated';

export function MatrixMobileCards({
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
  failedCells,
  onClearCellFailure,
}: MatrixMobileCardsProps) {
  if (projection.groups.length === 0) {
    return (
      <div className="p-6 text-center text-sm text-muted-foreground">
        暂无记录行。点击右上「新增大类」开始录入。
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 p-3">
      {projection.groups.map((group) => (
        <MobileGroupCard
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
          resultStatusOptions={resultStatusOptions}
          failedCells={failedCells}
          onClearCellFailure={onClearCellFailure}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Group card
// ---------------------------------------------------------------------------

interface MobileGroupCardProps {
  group: MatrixReadGroup;
  taskId: string;
  observedDimensions: DimensionBinding[];
  calculatedDimensions: DimensionBinding[];
  optimistic: Record<string, OptimisticMetric>;
  busyCells: Record<string, boolean>;
  collapsed: boolean;
  onToggleGroup: (id: string) => void;
  handlers: MatrixVirtualGridHandlers;
  resultStatusOptions?: ResultStatusOption[];
  failedCells?: Record<string, CellFailure>;
  onClearCellFailure?: (key: string) => void;
}

function MobileGroupCard({
  group,
  taskId,
  observedDimensions,
  calculatedDimensions,
  optimistic,
  busyCells,
  collapsed,
  onToggleGroup,
  handlers,
  resultStatusOptions,
  failedCells,
  onClearCellFailure,
}: MobileGroupCardProps) {
  return (
    <section className="overflow-hidden rounded-lg border bg-card shadow-xs">
      <header className="flex min-w-0 items-center gap-2 border-b bg-muted/30 px-3 py-2">
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7 shrink-0"
          onClick={() => onToggleGroup(group.id)}
          aria-label={collapsed ? '展开' : '折叠'}
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
        </Button>
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm font-semibold">{group.label}</span>
          {group.conditionSummary && (
            <span className="truncate text-xs text-muted-foreground">
              {group.conditionSummary}
            </span>
          )}
        </div>
        <span className="shrink-0 text-[10px] text-muted-foreground">
          {group.rows.length} 行
        </span>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 shrink-0 gap-1 text-[11px]"
          onClick={() => handlers.onAddRowToGroup(group.id)}
        >
          <Plus className="h-3.5 w-3.5" />
          行
        </Button>
      </header>

      {!collapsed && (
        <div className="flex flex-col gap-2 p-2">
          {group.rows.map((row) => (
            <MobileRowCard
              key={row.id}
              row={row}
              taskId={taskId}
              observedDimensions={observedDimensions}
              calculatedDimensions={calculatedDimensions}
              optimistic={optimistic}
              busyCells={busyCells}
              handlers={handlers}
              resultStatusOptions={resultStatusOptions}
              failedCells={failedCells}
              onClearCellFailure={onClearCellFailure}
            />
          ))}
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Row card — the core mobile unit
// ---------------------------------------------------------------------------

interface MobileRowCardProps {
  row: MatrixReadRow;
  taskId: string;
  observedDimensions: DimensionBinding[];
  calculatedDimensions: DimensionBinding[];
  optimistic: Record<string, OptimisticMetric>;
  busyCells: Record<string, boolean>;
  handlers: MatrixVirtualGridHandlers;
  resultStatusOptions?: ResultStatusOption[];
  failedCells?: Record<string, CellFailure>;
  onClearCellFailure?: (key: string) => void;
}

function MobileRowCard({
  row,
  taskId,
  observedDimensions,
  calculatedDimensions,
  optimistic,
  busyCells,
  handlers,
  resultStatusOptions,
  failedCells,
  onClearCellFailure,
}: MobileRowCardProps) {
  const [metricTab, setMetricTab] = useState<MetricTab>('observed');
  const [drawerOpen, setDrawerOpen] = useState(false);

  const slotBusy = busyCells[`${row.id}:slot`] ?? false;
  const hasCalculated = calculatedDimensions.length > 0;

  // The drawer shows ALL dimensions for the row (observed + calculated), full
  // labels, no horizontal scroll — the escape hatch for wide schemas.
  const allDimensions = [...observedDimensions, ...calculatedDimensions];

  // Metric-tab options, explicitly typed so SegmentToggle's generic resolves to
  // the MetricTab union rather than widening to string.
  const metricTabOptions: { value: MetricTab; label: string }[] = [
    { value: 'observed', label: '原始' },
    ...(hasCalculated ? [{ value: 'calculated' as const, label: '计算' }] : []),
  ];

  return (
    <article
      className="rounded-md border bg-background"
      onClick={() => handlers.onFocusRow(row)}
    >
      {/* Subject line */}
      <div className="flex min-w-0 items-center gap-2 border-b px-3 py-2">
        <span className="min-w-0 truncate text-sm font-medium" title={row.subject.label}>
          {row.subject.label || '未命名记录'}
        </span>
        {row.subject.key && (
          <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">
            {row.subject.key}
          </span>
        )}
      </div>

      {/* Three slots always at the top (spec §8.3) */}
      <div className="grid grid-cols-1 gap-px bg-border">
        <SlotRow label="效果结论">
          <div onClick={(e) => e.stopPropagation()}>
            <ResultSlotCell
              row={row}
              busy={slotBusy}
              resultStatusOptions={resultStatusOptions}
              onChange={(patch) =>
                handlers.onSlotChange(row.id, { result: patch })
              }
            />
          </div>
        </SlotRow>
        <SlotRow label="过程记录">
          <div onClick={(e) => e.stopPropagation()}>
            <ProcessSlotCell
              row={row}
              busy={slotBusy}
              onChange={(note) =>
                handlers.onSlotChange(row.id, { process: { note } })
              }
            />
          </div>
        </SlotRow>
        <SlotRow label="关联问题">
          <div onClick={(e) => e.stopPropagation()}>
            <IssueSlotCell row={row} />
          </div>
        </SlotRow>
      </div>

      {/* Metrics segment toggle + list */}
      {(observedDimensions.length > 0 || hasCalculated) && (
        <div className="border-t" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center gap-1 px-3 py-2">
            <SegmentToggle
              value={metricTab}
              onChange={setMetricTab}
              options={metricTabOptions}
            />
            <Button
              size="sm"
              variant="ghost"
              className="ml-auto h-7 shrink-0 gap-1 text-[11px]"
              onClick={() => setDrawerOpen(true)}
            >
              <Layers className="h-3.5 w-3.5" />
              全部维度
            </Button>
          </div>

          <div className="flex flex-col gap-px bg-border">
            {metricTab === 'observed' &&
              observedDimensions.map((d) => {
                const cellKey = `${row.id}::${d.dimensionKey}`;
                return (
                  <MetricRow key={d.dimensionKey} dimension={d}>
                    <ObservedMetricCell
                      dimension={d}
                      metric={row.metrics[d.dimensionKey]}
                      busy={busyCells[`${row.id}:${d.dimensionKey}`] ?? false}
                      onChange={(parsed) =>
                        handlers.onMetricChange(row, d.dimensionKey, { parsed })
                      }
                      failedError={failedCells?.[cellKey]}
                      onClearFailure={
                        onClearCellFailure
                          ? () => onClearCellFailure(cellKey)
                          : undefined
                      }
                    />
                  </MetricRow>
                );
              })}
            {metricTab === 'calculated' &&
              calculatedDimensions.map((d) => (
                <MetricRow key={d.dimensionKey} dimension={d} calculated>
                  <CalculatedMetricCell
                    dimension={d}
                    metric={row.metrics[d.dimensionKey]}
                    optimistic={optimistic[`${row.id}:${d.dimensionKey}`] ?? null}
                  />
                </MetricRow>
              ))}
          </div>
        </div>
      )}

      {/* Evidence / camera */}
      <div
        className="border-t px-3 py-2"
        onClick={(e) => e.stopPropagation()}
      >
        <EvidenceCell row={row} taskId={taskId} />
      </div>

      {/* Dimension drawer — bottom Sheet listing all dimensions */}
      <DimensionDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        row={row}
        taskId={taskId}
        dimensions={allDimensions}
        observedKeys={new Set(observedDimensions.map((d) => d.dimensionKey))}
        optimistic={optimistic}
        busyCells={busyCells}
        handlers={handlers}
        failedCells={failedCells}
        onClearCellFailure={onClearCellFailure}
      />
    </article>
  );
}

// ---------------------------------------------------------------------------
// Presentational sub-components
// ---------------------------------------------------------------------------

/** A labeled slot row inside the three-slots block. */
function SlotRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[84px_1fr] items-start bg-background">
      <span className="self-center px-3 py-2 text-[11px] text-muted-foreground">
        {label}
      </span>
      <div className="min-w-0 border-l">{children}</div>
    </div>
  );
}

/** A labeled metric row. Calculated rows get a muted background + "计算" tag. */
function MetricRow({
  dimension,
  calculated,
  children,
}: {
  dimension: DimensionBinding;
  calculated?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        'grid grid-cols-[96px_1fr] items-center bg-background',
        calculated && 'bg-muted/20',
      )}
    >
      <div className="flex min-w-0 items-center gap-1 px-3 py-1.5">
        <span
          className="min-w-0 truncate text-[11px]"
          title={dimension.displayName}
        >
          {dimension.displayName}
        </span>
        {dimension.unitCode && (
          <span className="shrink-0 text-[9px] text-muted-foreground">
            {dimension.unitCode}
          </span>
        )}
      </div>
      <div className="min-w-0 border-l">{children}</div>
    </div>
  );
}

/** A compact inline segment toggle for the metrics list. */
function SegmentToggle<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <div className="inline-flex overflow-hidden rounded-md border">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={cn(
            'px-3 py-1 text-[11px] transition-colors',
            value === opt.value
              ? 'bg-primary text-primary-foreground'
              : 'bg-background text-muted-foreground hover:bg-muted',
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dimension drawer (bottom Sheet) — the no-horizontal-scroll escape hatch
// ---------------------------------------------------------------------------

interface DimensionDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  row: MatrixReadRow;
  taskId: string;
  dimensions: DimensionBinding[];
  observedKeys: Set<string>;
  optimistic: Record<string, OptimisticMetric>;
  busyCells: Record<string, boolean>;
  handlers: MatrixVirtualGridHandlers;
  failedCells?: Record<string, CellFailure>;
  onClearCellFailure?: (key: string) => void;
}

function DimensionDrawer({
  open,
  onOpenChange,
  row,
  taskId,
  dimensions,
  observedKeys,
  optimistic,
  busyCells,
  handlers,
  failedCells,
  onClearCellFailure,
}: DimensionDrawerProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="max-h-[85vh] gap-0 p-0 sm:max-w-none"
      >
        <SheetHeader className="border-b px-4 py-3">
          <SheetTitle className="flex min-w-0 items-center gap-2 text-sm">
            <ClipboardList className="h-4 w-4 shrink-0" />
            <span className="truncate">{row.subject.label || '维度列表'}</span>
          </SheetTitle>
          <SheetDescription className="sr-only">
            该记录行的全部维度，可直接编辑观测值。
          </SheetDescription>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto">
          {dimensions.map((d) => {
            const isObserved = observedKeys.has(d.dimensionKey);
            return (
              <div
                key={d.dimensionKey}
                className="grid grid-cols-[96px_1fr] items-center border-b bg-background"
              >
                <div className="flex min-w-0 items-center gap-1 px-3 py-2">
                  <span
                    className="min-w-0 truncate text-[11px]"
                    title={d.displayName}
                  >
                    {d.displayName}
                  </span>
                </div>
                <div className="min-w-0 border-l">
                  {isObserved ? (
                    <ObservedMetricCell
                      dimension={d}
                      metric={row.metrics[d.dimensionKey]}
                      busy={
                        busyCells[`${row.id}:${d.dimensionKey}`] ?? false
                      }
                      onChange={(parsed) =>
                        handlers.onMetricChange(row, d.dimensionKey, { parsed })
                      }
                      failedError={failedCells?.[`${row.id}::${d.dimensionKey}`]}
                      onClearFailure={
                        onClearCellFailure
                          ? () =>
                              onClearCellFailure(`${row.id}::${d.dimensionKey}`)
                          : undefined
                      }
                    />
                  ) : (
                    <div className="flex items-center gap-1">
                      <CalculatedMetricCell
                        dimension={d}
                        metric={row.metrics[d.dimensionKey]}
                        optimistic={
                          optimistic[`${row.id}:${d.dimensionKey}`] ?? null
                        }
                      />
                      <Badge
                        variant="secondary"
                        className="shrink-0 text-[9px]"
                      >
                        计算
                      </Badge>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <div className="flex items-center justify-between gap-2 border-t px-4 py-2">
          <span className="text-[10px] text-muted-foreground">
            共 {dimensions.length} 个维度
          </span>
          <Button
            size="sm"
            variant="outline"
            className="h-7 gap-1 text-[11px]"
            onClick={() => onOpenChange(false)}
          >
            完成
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
