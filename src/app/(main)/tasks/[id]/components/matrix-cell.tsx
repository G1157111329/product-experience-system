'use client';

/**
 * Matrix cell components — the per-cell editors and read-only displays rendered
 * by <MatrixVirtualGrid> for each matrix row.
 *
 * This module is the leaf layer of the desktop input grid (Task 10):
 *   - ResultSlotCell      效果结论 (status select + summary textarea)
 *   - ProcessSlotCell     过程记录 (note textarea)
 *   - IssueSlotCell       关联问题 (count + severity dots; create = TODO)
 *   - ObservedMetricCell  观测指标 (number/duration/text/enum editor)
 *   - CalculatedMetricCell 计算指标 (read-only; optimistic "乐观" badge + error map)
 *   - EvidenceCell        证据 (MaterialPicker trigger + count)
 *
 * Editing model: cells are "dumb" — they own a local text draft (so the <input>
 * stays responsive) and call an `onCommit*` prop on a debounced 800ms timer.
 * The parent (<MatrixInputView>) is responsible for the optimistic calc + the
 * actual PATCH. 409 / readonly handling lives there; cells only report intents.
 *
 * Shared helpers (formatMetricDisplay / errorCodeToText / toMetricValue) are
 * exported so the parent can build the optimistic EvalContext from the same
 * read→MetricValue coercion the backend engine expects.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { ImagePlus, Loader2, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { MaterialPicker, type Material } from '@/components/material-picker';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { createCompositionController } from '@/lib/input-composition';
import type { DimensionBinding, ResultStatusOption, ValueKind } from '@/lib/matrix/types';
import type {
  MatrixMetricReadValue,
  MatrixReadRow,
} from '@/lib/matrix/projection';
import type { MetricValue } from '@/lib/matrix/formula-engine';

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/**
 * Platform-level default result-status options for the 效果结论 (result) slot.
 *
 * Result status options are platform-level semantics (the 效果结论 slot exists
 * on every data matrix regardless of schema), but a schema CAN override them
 * via `MatrixSchemaJson.resultStatusOptions`. Do NOT hardcode business-specific
 * status values here — read them from the schema, with this constant as the
 * fallback when the schema doesn't declare its own.
 *
 * Kept as a writable array (not `as const`) so callers can pass it straight
 * into a prop typed `ResultStatusOption[]`.
 */
export const DEFAULT_RESULT_STATUS_OPTIONS: ResultStatusOption[] = [
  { value: '达标', label: '达标' },
  { value: '待观察', label: '待观察' },
  { value: '不达标', label: '不达标' },
  { value: '不适用', label: '不适用' },
];

/**
 * Back-compat alias for the previous export name. Some callers (e.g. the
 * context bar) just want the default set; new callers should prefer the
 * explicitly-named `DEFAULT_RESULT_STATUS_OPTIONS` to make the fallback intent
 * clear, or compute effective options via {@link effectiveResultStatusOptions}.
 */
export const RESULT_STATUS_OPTIONS = DEFAULT_RESULT_STATUS_OPTIONS;

/**
 * Resolve the effective result-status options: schema-declared options win,
 * otherwise the platform default applies. Returns a stable reference when the
 * schema supplies nothing so downstream `useMemo`/render equality holds.
 */
export function effectiveResultStatusOptions(
  schemaOptions?: ResultStatusOption[],
): ResultStatusOption[] {
  return schemaOptions && schemaOptions.length > 0
    ? schemaOptions
    : DEFAULT_RESULT_STATUS_OPTIONS;
}

/**
 * Issue severity level → tailwind dot color.
 *
 * NOTE: issue severity (一类/二类/三类) is a PLATFORM-LEVEL issue taxonomy
 * (see the issues domain / `issues.level` column), NOT a matrix-schema-driven
 * dimension. It is intentionally NOT overridable via the matrix schema — unlike
 * result-status options, severity classifications belong to the issue-tracking
 * domain and are shared across all issue surfaces (matrix cells, issue rows,
 * reports). Do not confuse this map with schema-driven dimension enums, and do
 * not add a schema override for it.
 */
const SEVERITY_DOT_CLASS: Record<string, string> = {
  一类: 'bg-red-500',
  二类: 'bg-amber-500',
  三类: 'bg-muted-foreground/50',
  1: 'bg-red-500',
  2: 'bg-amber-500',
  3: 'bg-muted-foreground/50',
  high: 'bg-red-500',
  medium: 'bg-amber-500',
  low: 'bg-muted-foreground/50',
};

/**
 * Map a backend calc/read error code to a short Chinese label for display in a
 * calculated cell. Unknown codes fall back to the raw code.
 */
export function errorCodeToText(code?: string): string {
  switch (code) {
    case 'MATRIX_CALC_DIVIDE_BY_ZERO':
      return '除零错误';
    case 'MATRIX_CALC_INPUT_MISSING':
      return '缺少输入';
    case 'MATRIX_FORMULA_UNIT_MISMATCH':
      return '单位不匹配';
    case 'MATRIX_CALC_INVALID_OPERATION':
      return '无效运算';
    default:
      return code || '计算异常';
  }
}

/**
 * Map a batch-paste per-command error code to a short Chinese label for the
 * failure overlay on an observed cell. Covers the geometry/validation codes
 * from validateBatchRequest + executeBatchPaste's per-command outcomes. Unknown
 * codes fall back to the raw code so the user still sees something actionable.
 */
export function batchErrorCodeToText(code?: string): string {
  switch (code) {
    case 'MATRIX_BATCH_LIMIT_EXCEEDED':
      return '粘贴超出上限';
    case 'MATRIX_BATCH_ANCHOR_INVALID':
      return '锚点无效';
    case 'MATRIX_BATCH_COMMAND_OUT_OF_RANGE':
      return '目标越界';
    case 'MATRIX_BATCH_INVALID_SHAPE':
      return '粘贴格式错误';
    case 'MATRIX_CALCULATED_VALUE_READONLY':
      return '该列不可编辑';
    case 'MATRIX_METRIC_VERSION_CONFLICT':
      return '该单元格已被他人修改';
    case 'MATRIX_UNIT_INVALID':
      return '单位无效';
    case 'MATRIX_VALUE_INVALID':
      return '数值无效';
    case 'MATRIX_ROW_NOT_FOUND':
      return '目标行不存在';
    case 'MATRIX_VERSION_CONFLICT':
      return '版本冲突';
    default:
      return code || '粘贴失败';
  }
}

/**
 * Coerce a read DTO metric value into the engine's `MetricValue` union so the
 * optimistic EvalContext (frontend) reads inputs exactly as the authoritative
 * backend recompute does. Missing / N/A / pending → null (engine → INPUT_MISSING).
 */
export function toMetricValue(mv: MatrixMetricReadValue | undefined): MetricValue {
  if (!mv) return null;
  if (mv.state === 'missing' || mv.state === 'not_applicable' || mv.state === 'pending') {
    return null;
  }
  if (mv.value !== undefined && mv.value !== null) return { value: mv.value, unit: mv.unit ?? '' };
  if (mv.durationMs !== undefined && mv.durationMs !== null) return { durationMs: mv.durationMs };
  if (mv.text !== undefined && mv.text !== null) return { text: mv.text };
  return null;
}

/**
 * Format a numeric/duration/text value for read-only display, honouring the
 * dimension's displayFormat (decimals / mmss). Falls back to a plain string.
 */
export function formatMetricDisplay(
  mv: MatrixMetricReadValue | undefined,
  dim: DimensionBinding,
): string {
  if (!mv) return '';
  const fmt = dim.displayFormat;
  if (mv.durationMs !== undefined && mv.durationMs !== null) {
    if (fmt?.durationFormat === 'mmss') return msToMmss(mv.durationMs);
    const secs = mv.durationMs / 1000;
    return fmt?.decimals != null ? secs.toFixed(fmt.decimals) : String(secs);
  }
  if (mv.value !== undefined && mv.value !== null) {
    return fmt?.decimals != null ? mv.value.toFixed(fmt.decimals) : String(mv.value);
  }
  return mv.text ?? '';
}

/** Format milliseconds as m:ss (or h:mm:ss for long durations). */
function msToMmss(ms: number): string {
  const totalSec = Math.round(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/**
 * Parse an editor draft string into the PATCH body fragment for a metric, per
 * the dimension's valueKind. Returns null when the draft is empty (→ clear).
 */
export function parseMetricDraft(
  draft: string,
  valueKind: ValueKind,
): { value?: number; durationMs?: number; text?: string } | null {
  const trimmed = draft.trim();
  if (trimmed === '') return null;
  if (valueKind === 'duration') {
    // Editor works in seconds (float); convert → ms for the API.
    const secs = Number(trimmed);
    if (!Number.isFinite(secs)) return { durationMs: 0 };
    return { durationMs: Math.round(secs * 1000) };
  }
  if (valueKind === 'text') return { text: trimmed };
  // number / enum / boolean → numeric column.
  const n = Number(trimmed);
  return Number.isFinite(n) ? { value: n } : null;
}

// ---------------------------------------------------------------------------
// Small debounce hook (used by text-based cells)
// ---------------------------------------------------------------------------

interface DebouncedSave {
  schedule: (value: string) => void;
  flush: () => void;
  cancel: () => void;
}

/**
 * Debounce a save by `delay` ms. Holds the latest value in a ref so a late
 * keystroke isn't lost, and exposes `flush` (blur / unmount) + `cancel`.
 */
function useDebouncedSave(save: (value: string) => void, delay = 800): DebouncedSave {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const valueRef = useRef<string>('');
  const saveRef = useRef(save);
  saveRef.current = save;

  const schedule = useCallback(
    (value: string) => {
      valueRef.current = value;
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        saveRef.current(valueRef.current);
        timerRef.current = null;
      }, delay);
    },
    [delay],
  );

  const flush = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
      saveRef.current(valueRef.current);
    }
  }, []);

  const cancel = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => () => flush(), [flush]);

  return { schedule, flush, cancel };
}

// ---------------------------------------------------------------------------
// Result slot — 效果结论 (status + summary)
// ---------------------------------------------------------------------------

export function ResultSlotCell({
  row,
  onChange,
  busy,
  resultStatusOptions,
}: {
  row: MatrixReadRow;
  onChange: (patch: { status?: string; summary?: string }) => void;
  busy: boolean;
  /**
   * Schema-declared result-status options. When omitted (or empty), the
   * platform default {@link DEFAULT_RESULT_STATUS_OPTIONS} applies. Threaded
   * down from <MatrixInputView> via projection.schema.resultStatusOptions.
   */
  resultStatusOptions?: ResultStatusOption[];
}) {
  const [summary, setSummary] = useState(row.slots.result.summary ?? '');
  const summaryComposition = useRef(createCompositionController());
  // Reset the draft when the authoritative summary changes (refetch / 409 revert).
  useEffect(() => {
    setSummary(row.slots.result.summary ?? '');
  }, [row.slots.result.summary]);

  const { schedule, flush } = useDebouncedSave((v) => onChange({ summary: v }));

  // Schema options override the platform default; see DEFAULT_RESULT_STATUS_OPTIONS.
  const options = effectiveResultStatusOptions(resultStatusOptions);

  return (
    <div className="flex min-w-0 flex-col gap-1 p-1.5">
      <Select
        value={row.slots.result.status ?? undefined}
        onValueChange={(v) => onChange({ status: v })}
        disabled={busy}
      >
        <SelectTrigger size="sm" className="h-7 w-full text-xs">
          <SelectValue placeholder="结论" />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value} className="text-xs">
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Textarea
        value={summary}
        onChange={(e) => {
          setSummary(e.target.value);
          const committed = summaryComposition.current.change(e.target.value);
          if (committed !== null) schedule(committed);
        }}
        onCompositionStart={() => summaryComposition.current.start()}
        onCompositionEnd={(e) => schedule(summaryComposition.current.end(e.currentTarget.value))}
        onBlur={() => {
          if (summaryComposition.current.blur(summary) !== null) flush();
        }}
        rows={2}
        placeholder="效果结论"
        className="min-h-12 resize-y text-xs"
        disabled={busy}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Process slot — 过程记录 (note)
// ---------------------------------------------------------------------------

export function ProcessSlotCell({
  row,
  onChange,
  busy,
}: {
  row: MatrixReadRow;
  onChange: (note: string) => void;
  busy: boolean;
}) {
  const [note, setNote] = useState(row.slots.process.note ?? '');
  const noteComposition = useRef(createCompositionController());
  useEffect(() => {
    setNote(row.slots.process.note ?? '');
  }, [row.slots.process.note]);

  const { schedule, flush } = useDebouncedSave(onChange);

  return (
    <div className="min-w-0 p-1.5">
      <Textarea
        value={note}
        onChange={(e) => {
          setNote(e.target.value);
          const committed = noteComposition.current.change(e.target.value);
          if (committed !== null) schedule(committed);
        }}
        onCompositionStart={() => noteComposition.current.start()}
        onCompositionEnd={(e) => schedule(noteComposition.current.end(e.currentTarget.value))}
        onBlur={() => {
          if (noteComposition.current.blur(note) !== null) flush();
        }}
        rows={2}
        placeholder="过程记录"
        className="min-h-12 resize-y text-xs"
        disabled={busy}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Issue slot — 关联问题 (count + severity; create = TODO)
// ---------------------------------------------------------------------------

export function IssueSlotCell({ row }: { row: MatrixReadRow }) {
  const { count, severitySummary } = row.slots.issues;
  return (
    <div className="flex min-w-0 flex-col gap-1 p-1.5">
      <div className="flex items-center gap-1.5">
        <Badge variant={count > 0 ? 'destructive' : 'secondary'} className="h-5 text-[10px]">
          {count} 个问题
        </Badge>
        <div className="flex items-center gap-1">
          {severitySummary.map((lvl) => (
            <span
              key={lvl}
              title={`${lvl}类问题`}
              className={cn(
                'inline-block h-2 w-2 rounded-full',
                SEVERITY_DOT_CLASS[lvl] ?? 'bg-muted-foreground/40',
              )}
            />
          ))}
        </div>
      </div>
      <Button
        size="sm"
        variant="outline"
        className="h-6 w-full gap-1 text-[10px]"
        onClick={() => toast.info('问题创建将在后续任务接入')}
      >
        <Plus className="h-3 w-3" />
        新增问题
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Observed metric cell — 观测指标 (editable)
// ---------------------------------------------------------------------------

export function ObservedMetricCell({
  dimension,
  metric,
  onChange,
  busy,
  failedError,
  onClearFailure,
}: {
  dimension: DimensionBinding;
  metric: MatrixMetricReadValue | undefined;
  /** Receives the parsed draft (null = cleared). */
  onChange: (parsed: { value?: number; durationMs?: number; text?: string } | null) => void;
  busy: boolean;
  /**
   * Batch-paste failure overlay for this cell. When set, the cell renders a red
   * ring + tooltip; it clears (via {@link onClearFailure}) once the user starts
   * editing the cell again (focus/keydown), since they are about to overwrite
   * the failed value.
   */
  failedError?: { code: string; message?: string };
  onClearFailure?: () => void;
}) {
  // Seed the draft from the authoritative value; reset on authoritative change.
  const seed = (() => {
    if (!metric) return '';
    if (dimension.valueKind === 'duration' && metric.durationMs != null) {
      return String(metric.durationMs / 1000);
    }
    if (metric.value != null) return String(metric.value);
    return metric.text ?? '';
  })();
  const [draft, setDraft] = useState(seed);
  const metricComposition = useRef(createCompositionController());
  useEffect(() => {
    setDraft(seed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metric?.value, metric?.durationMs, metric?.text, dimension.valueKind]);

  const { schedule, flush } = useDebouncedSave((v) => {
    onChange(parseMetricDraft(v, dimension.valueKind));
  });

  const unit = dimension.unitCode ? <span className="text-[10px] text-muted-foreground">{dimension.unitCode}</span> : null;

  // Batch-paste failure overlay: red ring + native tooltip with the error text.
  // Clears once the user focuses/edits the cell — they are about to overwrite
  // the failed value, so the stale error signal should not linger.
  const failureTitle = failedError
    ? failedError.message || batchErrorCodeToText(failedError.code)
    : undefined;
  const failureClass = failedError ? 'ring-2 ring-destructive rounded' : '';
  const clearFailure = () => {
    if (failedError) onClearFailure?.();
  };

  // enum → Select over validation.enumValues (stored as numeric).
  if (dimension.valueKind === 'enum' && dimension.validation?.enumValues?.length) {
    return (
      <div className={cn('min-w-0 p-1.5', failureClass)} title={failureTitle}>
        <Select
          value={draft}
          onValueChange={(v) => {
            setDraft(v);
            onChange(parseMetricDraft(v, 'enum'));
            clearFailure();
          }}
          disabled={busy}
        >
          <SelectTrigger size="sm" className="h-7 w-full text-xs">
            <SelectValue placeholder="选择" />
          </SelectTrigger>
          <SelectContent>
            {dimension.validation.enumValues.map((opt) => (
              <SelectItem key={opt} value={opt} className="text-xs">
                {opt}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  }

  return (
    <div
      className={cn('flex min-w-0 items-center gap-1 p-1.5', failureClass)}
      title={failureTitle}
    >
      <Input
        type={dimension.valueKind === 'text' ? 'text' : 'number'}
        inputMode={dimension.valueKind === 'text' ? 'text' : 'decimal'}
        step={dimension.valueKind === 'duration' ? '0.1' : 'any'}
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value);
          const committed = metricComposition.current.change(e.target.value);
          if (committed !== null) schedule(committed);
          clearFailure();
        }}
        onCompositionStart={() => metricComposition.current.start()}
        onCompositionEnd={(e) => schedule(metricComposition.current.end(e.currentTarget.value))}
        onFocus={clearFailure}
        onKeyDown={clearFailure}
        onBlur={() => {
          if (metricComposition.current.blur(draft) !== null) flush();
        }}
        placeholder="—"
        disabled={busy}
        className="h-7 min-w-0 text-xs"
      />
      {unit}
      {busy && <Loader2 className="h-3 w-3 shrink-0 animate-spin text-muted-foreground" />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Calculated metric cell — 计算指标 (read-only; optimistic + error map)
// ---------------------------------------------------------------------------

export interface OptimisticMetric {
  value?: number;
  durationMs?: number;
  text?: string;
  error?: boolean;
}

export function CalculatedMetricCell({
  dimension,
  metric,
  optimistic,
}: {
  dimension: DimensionBinding;
  metric: MatrixMetricReadValue | undefined;
  /** When set, show this with a "乐观" badge instead of the authoritative value. */
  optimistic?: OptimisticMetric | null;
}) {
  // Error state (authoritative) takes precedence unless we have an optimistic value.
  if (optimistic) {
    const disp =
      optimistic.durationMs != null
        ? formatMetricDisplay({ state: 'valid', durationMs: optimistic.durationMs }, dimension)
        : optimistic.value != null
          ? formatMetricDisplay({ state: 'valid', value: optimistic.value }, dimension)
          : (optimistic.text ?? '');
    return (
      <div className="flex min-w-0 items-center gap-1 px-2 py-1.5">
        <span className={cn('text-xs font-medium', optimistic.error ? 'text-destructive' : 'text-amber-700')}>
          {optimistic.error ? '计算异常' : (disp || '—')}
        </span>
        <Badge variant="outline" className="h-4 shrink-0 border-amber-300 bg-amber-50 px-1 text-[9px] text-amber-700">
          乐观
        </Badge>
      </div>
    );
  }

  if (metric?.errorCode) {
    return (
      <div className="min-w-0 px-2 py-1.5">
        <span className="text-xs text-destructive" title={metric.errorCode}>
          {errorCodeToText(metric.errorCode)}
        </span>
      </div>
    );
  }

  if (!metric || metric.state === 'missing' || metric.state === 'pending') {
    return (
      <div className="min-w-0 px-2 py-1.5">
        <span className="text-xs text-muted-foreground">{metric?.state === 'pending' ? '待计算' : '—'}</span>
      </div>
    );
  }

  return (
    <div className="min-w-0 px-2 py-1.5">
      <span className="block truncate text-xs font-medium" title={metric.display}>
        {formatMetricDisplay(metric, dimension) || '—'}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Evidence cell — 证据 (MaterialPicker trigger + count)
// ---------------------------------------------------------------------------

export function EvidenceCell({
  row,
  taskId,
}: {
  row: MatrixReadRow;
  taskId: string;
}) {
  const [open, setOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>(row.evidence.previewIds);
  const [materials, setMaterials] = useState<Material[]>([]);

  useEffect(() => {
    setSelectedIds(row.evidence.previewIds);
  }, [row.evidence.previewIds]);

  return (
    <div className="flex min-w-0 items-center gap-1 p-1.5">
      <Button
        size="sm"
        variant="outline"
        className="h-7 gap-1 text-[10px]"
        onClick={() => setOpen(true)}
        title="选择/上传证据素材"
      >
        <ImagePlus className="h-3 w-3" />
        证据 {row.evidence.primaryCount}
      </Button>
      <MaterialPicker
        taskId={taskId}
        comparisonCellId={row.id}
        open={open}
        onOpenChange={setOpen}
        selectedIds={selectedIds}
        initialMaterials={materials}
        onSelectionChange={(ids, mats) => {
          setSelectedIds(ids);
          setMaterials(mats);
        }}
        selectedPreviewSize="sm"
      />
    </div>
  );
}
