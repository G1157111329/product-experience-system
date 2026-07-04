'use client';

/**
 * MatrixInputView (Task 10) — the orchestrator for the desktop three-slot input
 * grid. Replaces the Task 9 stub body while keeping the same export + props.
 *
 * Responsibilities:
 *   1. Fetch the task's matrix instance, then the read projection.
 *   2. Wire the optimistic calc engine (shared DSL: compileFormula/evaluate).
 *   3. Route slot/metric edits to their PATCH endpoints with 409 recovery.
 *   4. Compose <RecordContextBar> + <MatrixToolbar> + <MatrixVirtualGrid>.
 *
 * Optimistic calc strategy (frontend shares the SAME engine as the backend
 * recompute — src/lib/matrix/formula-engine.ts):
 *   - On an observed-metric edit, recompile all calculated formulas, build an
 *     EvalContext from the row's metrics + the edited override, evaluate each
 *     calculated dimension in formula order (so transitive deps see upstream
 *     optimistic values), and surface changed values with a "乐观" badge.
 *   - The authoritative PATCH response (authoritativeCalculations) replaces the
 *     optimistic values and clears the badge.
 *
 * Versioning note: the read projection (projection.ts) hardcodes row.version=1
 * and never exposes the _slot_version counter, and MatrixMetricReadValue has no
 * version field — so optimistic locking can't be wired from the read DTO. Slot
 * and metric writes therefore use last-write-wins (omit version/expectedVersion,
 * which both endpoints support), and 409 conflicts trigger a full refetch.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Table2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { DimensionBinding } from '@/lib/matrix/types';
import type {
  MatrixMetricReadValue,
  MatrixReadProjection,
  MatrixReadRow,
} from '@/lib/matrix/projection';
import {
  compileFormula,
  evaluate,
  type CompiledFormula,
  type EvalContext,
  type MetricValue,
} from '@/lib/matrix/formula-engine';
import { parseMetricDraft, toMetricValue } from './matrix-cell';
import type { OptimisticMetric } from './matrix-cell';
import { RecordContextBar } from './record-context-bar';
import { MatrixMobileCards } from './matrix-mobile-cards';
import { MatrixToolbar, type CalcStatus } from './matrix-toolbar';
import { MatrixVirtualGrid } from './matrix-virtual-grid';

interface MatrixInstance {
  id: string;
  name: string;
  matrixRole: string;
  matrixSchemaVersionId: string;
  status: string;
  comparabilityStatus: string;
  createdAt: string;
}

interface MatrixInputViewProps {
  taskId: string;
  taskName: string;
}

type ApiResponse<T> = { code: number; message?: string; data?: T };

// ---------------------------------------------------------------------------
// Small immutable-update helpers for the nested projection state.
// ---------------------------------------------------------------------------

/** Immutably replace one metric value on one row. */
function setRowMetric(
  proj: MatrixReadProjection,
  rowId: string,
  metricKey: string,
  value: MatrixMetricReadValue,
): MatrixReadProjection {
  return {
    ...proj,
    groups: proj.groups.map((g) => ({
      ...g,
      rows: g.rows.map((r) =>
        r.id === rowId ? { ...r, metrics: { ...r.metrics, [metricKey]: value } } : r,
      ),
    })),
  };
}

/** Convert a recompute authoritative update into a read-DTO metric value. */
function authoritativeToMetric(u: {
  value?: number;
  durationMs?: number;
  text?: string;
  errorCode?: string;
  status: string;
  formulaVersion?: string;
}): MatrixMetricReadValue {
  if (u.errorCode || u.status === 'calculation_failed') {
    return {
      state: 'calculation_failed',
      errorCode: u.errorCode,
      value: u.value,
      durationMs: u.durationMs,
      text: u.text,
    };
  }
  return {
    state: 'valid',
    value: u.value,
    durationMs: u.durationMs,
    text: u.text,
    formulaVersion: u.formulaVersion,
  };
}

/** Coerce a parsed metric edit into the engine's MetricValue union. */
function parsedToMetricValue(
  parsed: { value?: number; durationMs?: number; text?: string } | null,
  dim: DimensionBinding,
): MetricValue {
  if (!parsed) return null;
  if (parsed.durationMs != null) return { durationMs: parsed.durationMs };
  if (parsed.value != null) return { value: parsed.value, unit: dim.unitCode ?? '' };
  if (parsed.text != null) return { text: parsed.text };
  return null;
}

// ---------------------------------------------------------------------------
// Optimistic calc engine
// ---------------------------------------------------------------------------

interface CompiledFormulaEntry {
  compiled: CompiledFormula;
  dim: DimensionBinding;
}

/**
 * Topologically sort compiled formulas so a formula is evaluated after all
 * formulas whose output it depends on. This matters for calculated→calculated
 * chains: if `C = SELF("B") + 1` and `B = SELF("x") * 2` but `C` sorts before
 * `B`, evaluating in insertion (sortOrder) order would read `B` from its stale
 * authoritative value and produce a wrong optimistic `C`.
 *
 * Only dependencies that are themselves formula outputs count as edges
 * (observed-metric deps have no ordering constraint). Falls back to the
 * original order on a cycle (which schema-publish already rejects, so this is
 * just defensive). Re-running per call is cheap for ≤30 formulas.
 */
function topoSortEntries(entries: CompiledFormulaEntry[]): CompiledFormulaEntry[] {
  const by = new Map<string, string[]>(); // output key -> [output keys that depend on it]
  const indeg = new Map<string, number>();
  const outputKeys = new Set(entries.map((e) => e.dim.dimensionKey));
  for (const e of entries) indeg.set(e.dim.dimensionKey, 0);
  for (const e of entries) {
    for (const dep of e.compiled.dependencies) {
      if (outputKeys.has(dep) && dep !== e.dim.dimensionKey) {
        const list = by.get(dep) ?? [];
        list.push(e.dim.dimensionKey);
        by.set(dep, list);
        indeg.set(e.dim.dimensionKey, (indeg.get(e.dim.dimensionKey) ?? 0) + 1);
      }
    }
  }
  const queue: string[] = entries
    .filter((e) => (indeg.get(e.dim.dimensionKey) ?? 0) === 0)
    .map((e) => e.dim.dimensionKey);
  const ordered: string[] = [];
  while (queue.length) {
    const k = queue.shift()!;
    ordered.push(k);
    for (const dependent of by.get(k) ?? []) {
      indeg.set(dependent, (indeg.get(dependent) ?? 0) - 1);
      if ((indeg.get(dependent) ?? 0) === 0) queue.push(dependent);
    }
  }
  // Defensive: cycle (rejected at schema-publish) → keep original order.
  if (ordered.length !== entries.length) return entries;
  const byEntry = new Map(entries.map((e) => [e.dim.dimensionKey, e]));
  return ordered.map((k) => byEntry.get(k)!).filter(Boolean);
}

/**
 * Pre-compile all calculated-dimension formulas once per schema. Parse failures
 * (a malformed DSL) are silently skipped — the authoritative calc still runs on
 * the server; we just can't preview it optimistically for that column.
 */
function useCompiledFormulas(
  formulas: MatrixReadProjection['schema']['formulas'],
  calculatedDimensions: DimensionBinding[],
): Map<string, CompiledFormulaEntry> {
  return useMemo(() => {
    const m = new Map<string, CompiledFormulaEntry>();
    for (const dim of calculatedDimensions) {
      const f = formulas.find((x) => x.outputDimensionKey === dim.dimensionKey);
      if (!f || !f.formulaDsl) continue;
      try {
        m.set(dim.dimensionKey, { compiled: compileFormula(f.formulaDsl), dim });
      } catch {
        // Skip — can't optimistically preview a formula that won't parse.
      }
    }
    return m;
  }, [formulas, calculatedDimensions]);
}

/**
 * Compute optimistic values for every calculated dimension on the edited row.
 *
 * Formulas are evaluated in topological (dependency) order so that a formula
 * depending on another calculated dimension picks up that dimension's freshly-
 * computed optimistic value (transitive optimism). Only values that DIFFER from the
 * authoritative value are returned, so unchanged cells don't flash a "乐观"
 * badge. Group-scope formulas aggregate over the group using the override.
 */
function computeOptimistic(
  proj: MatrixReadProjection,
  compiled: Map<string, CompiledFormulaEntry>,
  editedRowId: string,
  editedKey: string,
  override: MetricValue,
): Record<string, OptimisticMetric> {
  // Locate the edited row + its group.
  let editedRow: MatrixReadRow | undefined;
  let group: MatrixReadProjection['groups'][number] | undefined;
  for (const g of proj.groups) {
    const r = g.rows.find((x) => x.id === editedRowId);
    if (r) {
      editedRow = r;
      group = g;
      break;
    }
  }
  if (!editedRow || !group) return {};

  const rowsBySubject = new Map<string, MatrixReadRow>();
  for (const r of group.rows) rowsBySubject.set(r.subject.key, r);

  const optimisticNums = new Map<string, number>();

  /** Read a metric value for a row, honouring the optimistic overrides + edit. */
  const rowValue = (row: MatrixReadRow, key: string): MetricValue => {
    if (row.id === editedRow!.id) {
      if (optimisticNums.has(key)) return { value: optimisticNums.get(key)!, unit: '' };
      if (key === editedKey) return override;
    }
    return toMetricValue(row.metrics[key]);
  };

  /** Numeric extraction from a MetricValue for aggregation. */
  const toNum = (mv: MetricValue): number | null => {
    if (!mv) return null;
    if ('value' in mv) return mv.value;
    if ('durationMs' in mv) return mv.durationMs;
    return null;
  };

  const ctx: EvalContext = {
    self: (key) => rowValue(editedRow!, key),
    refSameGroup: (subjectKey, key) => {
      const r = rowsBySubject.get(subjectKey);
      return r ? rowValue(r, key) : null;
    },
    groupAggregate: (fn, key) => {
      const nums = group!.rows
        .map((r) => toNum(rowValue(r, key)))
        .filter((n): n is number => n != null && Number.isFinite(n));
      if (nums.length === 0) return null;
      let v: number;
      switch (fn) {
        case 'SUM':
          v = nums.reduce((a, b) => a + b, 0);
          break;
        case 'AVG':
          v = nums.reduce((a, b) => a + b, 0) / nums.length;
          break;
        case 'MIN':
          v = Math.min(...nums);
          break;
        case 'MAX':
          v = Math.max(...nums);
          break;
        case 'COUNT':
          v = nums.length;
          break;
        default:
          return null;
      }
      return { value: v, unit: '' };
    },
  };

  const out: Record<string, OptimisticMetric> = {};
  // Iterate in TOPOLOGICAL (dependency) order, not insertion/sortOrder order,
  // so a calculated→calculated chain sees its upstream formula's freshly-
  // computed optimistic value rather than the stale authoritative one.
  for (const { dim, compiled: c } of topoSortEntries([...compiled.values()])) {
    const outKey = dim.dimensionKey;
    // Skip formulas that don't (transitively) involve the edited key. We
    // approximate transitivity by re-evaluating everything in order; if a
    // formula's result is unchanged, we drop it from the badge set below.
    const res = evaluate(c, ctx);
    const current = editedRow.metrics[outKey];
    if (res.ok) {
      optimisticNums.set(outKey, res.value);
      const currentNum = current?.value ?? current?.durationMs;
      // Only flag as optimistic if the value actually changed.
      if (currentNum !== res.value) {
        out[`${editedRow.id}:${outKey}`] = { value: res.value };
      }
    } else {
      // Error state — flag optimistically only if the authoritative cell isn't
      // already in the same error.
      if (current?.errorCode !== res.code) {
        out[`${editedRow.id}:${outKey}`] = { error: true };
      }
    }
  }
  return out;
}

// ===========================================================================
// Component
// ===========================================================================

export function MatrixInputView({ taskId, taskName }: MatrixInputViewProps) {
  const [instances, setInstances] = useState<MatrixInstance[] | null>(null);
  const [instanceId, setInstanceId] = useState<string | null>(null);
  const [projection, setProjection] = useState<MatrixReadProjection | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [focusedRow, setFocusedRow] = useState<MatrixReadRow | null>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [visibleKeys, setVisibleKeys] = useState<string[] | null>(null);
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [busyCells, setBusyCells] = useState<Record<string, boolean>>({});
  const [optimistic, setOptimistic] = useState<Record<string, OptimisticMetric>>({});
  // Desktop paste: the focused observed cell is the paste anchor; failedCells
  // carries per-cell batch-paste errors rendered as a red overlay. The grid
  // reports focus via onFocusedCellChange and consumes these for the overlay.
  const [focusedCell, setFocusedCell] = useState<{ rowId: string; dimensionKey: string } | null>(null);
  const [failedCells, setFailedCells] = useState<Record<string, { code: string; message?: string }>>({});
  const projectionRef = useRef<MatrixReadProjection | null>(null);
  projectionRef.current = projection;

  // ----- Fetch the task's matrix instance list. -----
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/tasks/${taskId}/matrices`, { cache: 'no-store' });
        const json = (await res.json()) as ApiResponse<MatrixInstance[]>;
        if (cancelled) return;
        if (json.code !== 0) throw new Error(json.message || '加载失败');
        const list = Array.isArray(json.data) ? json.data : [];
        setInstances(list);
        if (list.length > 0) setInstanceId(list[0]!.id);
      } catch (err) {
        if (cancelled) return;
        setLoadError(err instanceof Error ? err.message : '加载失败');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [taskId]);

  // ----- Fetch the read projection once an instance is selected. -----
  const refetchProjection = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/task-matrices/${id}`, { cache: 'no-store' });
      const json = (await res.json()) as ApiResponse<MatrixReadProjection>;
      if (json.code !== 0) throw new Error(json.message || '加载矩阵投影失败');
      setProjection(json.data ?? null);
      // Clear stale optimistic badges + drafts on a fresh authoritative load.
      setOptimistic({});
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : '加载矩阵投影失败');
    }
  }, []);

  useEffect(() => {
    if (!instanceId) return;
    void refetchProjection(instanceId);
  }, [instanceId, refetchProjection]);

  // ----- Derived: dimensions split by column group. -----
  const { observedDimensions, calculatedDimensions } = useMemo(() => {
    const dims = projection?.schema.dimensions ?? [];
    return {
      observedDimensions: dims.filter((d) => d.columnGroup !== 'calculated'),
      calculatedDimensions: dims.filter((d) => d.columnGroup === 'calculated'),
    };
  }, [projection?.schema.dimensions]);

  const compiled = useCompiledFormulas(
    projection?.schema.formulas ?? [],
    calculatedDimensions,
  );

  // Initialize visible-keys to all dimensions once the projection loads.
  useEffect(() => {
    if (projection && visibleKeys === null) {
      setVisibleKeys(projection.schema.dimensions.map((d) => d.dimensionKey));
    }
  }, [projection, visibleKeys]);

  // ----- Handlers -----

  const setCellBusy = (key: string, busy: boolean) => {
    setBusyCells((cur) => {
      if (!busy) {
        const { [key]: _omit, ...rest } = cur;
        return rest;
      }
      return { ...cur, [key]: true };
    });
  };

  /** PATCH a slot; on 409 refetch + toast. */
  const handleSlotChange = useCallback(
    async (rowId: string, patch: { result?: { status?: string; summary?: string }; process?: { note: string } }) => {
      if (!instanceId) return;
      setCellBusy(`${rowId}:slot`, true);
      try {
        const res = await fetch(`/api/matrix-rows/${rowId}/slots`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(patch),
        });
        if (res.status === 409) {
          toast.error('该行已被他人修改，已自动刷新');
          await refetchProjection(instanceId);
          return;
        }
        const json = (await res.json()) as ApiResponse<{ rowId: string; version: number }>;
        if (json.code !== 0) throw new Error(json.message || '保存失败');
        toast.success('已保存');
      } catch (err) {
        toast.error(err instanceof Error ? err.message : '保存失败');
      } finally {
        setCellBusy(`${rowId}:slot`, false);
      }
    },
    [instanceId, refetchProjection],
  );

  /** PATCH a metric with optimistic calc; on 409 refetch + toast. */
  const handleMetricChange = useCallback(
    async (
      row: MatrixReadRow,
      dimensionKey: string,
      commit: { parsed: { value?: number; durationMs?: number; text?: string } | null },
    ) => {
      const proj = projectionRef.current;
      const dim = observedDimensions.find((d) => d.dimensionKey === dimensionKey);
      if (!proj || !dim) return;

      // 1. Optimistic calc preview (shared engine).
      const override = parsedToMetricValue(commit.parsed, dim);
      const optimisticForEdit = computeOptimistic(proj, compiled, row.id, dimensionKey, override);
      setOptimistic((cur) => ({ ...cur, ...optimisticForEdit }));

      // 2. PATCH.
      setCellBusy(`${row.id}:${dimensionKey}`, true);
      try {
        const body: Record<string, unknown> = {};
        if (commit.parsed) {
          if (commit.parsed.durationMs != null) body.durationMs = commit.parsed.durationMs;
          else if (commit.parsed.value != null) {
            body.value = commit.parsed.value;
            body.unitCode = dim.unitCode ?? null;
          } else if (commit.parsed.text != null) body.text = commit.parsed.text;
        } else {
          // Cleared → mark missing (the API rejects an all-null body otherwise).
          body.inputState = 'missing';
        }

        const res = await fetch(`/api/matrix-rows/${row.id}/metrics/${dimensionKey}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...body, valueKind: dim.valueKind }),
        });

        if (res.status === 409) {
          const errJson = (await res.json().catch(() => ({}))) as ApiResponse<unknown>;
          const code = (errJson.data as { code?: string })?.code;
          if (code === 'MATRIX_CALCULATED_VALUE_READONLY') {
            toast.error('该列为计算指标，不可直接编辑');
          } else {
            toast.error('该单元格已被他人修改，已自动刷新');
          }
          if (instanceId) await refetchProjection(instanceId);
          return;
        }

        const json = (await res.json()) as ApiResponse<{
          metricEvaluationId: string;
          version: number;
          authoritativeCalculations: Array<{
            rowId: string;
            metricKey: string;
            value?: number;
            durationMs?: number;
            text?: string;
            errorCode?: string;
            status: string;
            formulaVersion?: string;
          }>;
        }>;

        if (json.code !== 0) throw new Error(json.message || '保存指标失败');

        // 3. Apply authoritative values: the edited observed cell + all recalc'd cells.
        // Use the FUNCTIONAL updater so concurrent in-flight metric PATCHes don't
        // clobber each other: building on `proj` (a snapshot captured at the start
        // of this call) would revert an already-resolved concurrent edit until the
        // next refetch. Building on `prev` (the latest committed state) avoids
        // that lost-update.
        setProjection((prev) => {
          // A concurrent refetch could have cleared the projection; nothing to
          // patch then (the next render will show the authoritative load).
          if (!prev) return prev;
          let next = setRowMetric(prev, row.id, dimensionKey, {
            state: commit.parsed ? 'valid' : 'missing',
            value: commit.parsed?.value,
            durationMs: commit.parsed?.durationMs,
            text: commit.parsed?.text,
            unit: dim.unitCode,
          });
          for (const u of json.data?.authoritativeCalculations ?? []) {
            next = setRowMetric(next, u.rowId, u.metricKey, authoritativeToMetric(u));
          }
          return next;
        });
      } catch (err) {
        toast.error(err instanceof Error ? err.message : '保存指标失败');
        if (instanceId) await refetchProjection(instanceId);
      } finally {
        setCellBusy(`${row.id}:${dimensionKey}`, false);
        // Clear the optimistic badges for this edit (keep others if any).
        setOptimistic((cur) => {
          const next = { ...cur };
          for (const k of Object.keys(optimisticForEdit)) delete next[k];
          return next;
        });
      }
    },
    [compiled, observedDimensions, instanceId, refetchProjection],
  );

  /**
   * Batch paste (desktop only). Aligns the pasted clipboard grid against the
   * observed-dimension sort order + the anchor's group row order, sends one
   * POST /batch-commands, then applies authoritative values + a per-cell failure
   * overlay. Mirrors handleMetricChange's optimistic-calc + functional-updater
   * pattern, generalized to a region.
   *
   * Value coercion: the frontend sends raw clipboard values (number | string)
   * and lets executeBatchPaste do the per-valueKind Number()/string dispatch —
   * same boundary the single-cell PATCH relies on. Empty strings are sent so the
   * backend can clear cells rather than write NaN.
   */
  const handleBatchPaste = useCallback(
    async (
      anchor: { rowId: string; dimensionKey: string },
      clipboardGrid: (string | number)[][],
    ) => {
      const proj = projectionRef.current;
      if (!proj || !instanceId) return;

      // 1. Observed+editable dims in sort order, the anchor's group, and the
      //    anchor's row/col indices within them. Geometry is validated again
      //    server-side (validateBatchRequest), so this is best-effort alignment.
      const observedDims = proj.schema.dimensions
        .filter((d) => d.columnGroup === 'observed' && d.editable !== false)
        .sort((a, b) => a.sortOrder - b.sortOrder);
      const anchorColIdx = observedDims.findIndex((d) => d.dimensionKey === anchor.dimensionKey);
      if (anchorColIdx < 0) {
        toast.error('错点不是原始指标列');
        return;
      }
      let group: MatrixReadProjection['groups'][number] | undefined;
      for (const g of proj.groups) {
        if (g.rows.some((r) => r.id === anchor.rowId)) {
          group = g;
          break;
        }
      }
      if (!group) {
        toast.error('错点行不在任何分组内');
        return;
      }
      const anchorRowIdx = group.rows.findIndex((r) => r.id === anchor.rowId);
      if (anchorRowIdx < 0) return;

      // 2. Build commands by aligning the clipboard grid against observed dims +
      //    group rows (clip may extend past the available rows/cols — those are
      //    dropped here; the backend re-validates).
      const commands: {
        type: 'setMetric';
        rowId: string;
        dimensionKey: string;
        value: number | string;
      }[] = [];
      for (let r = 0; r < clipboardGrid.length; r++) {
        for (let c = 0; c < clipboardGrid[r].length; c++) {
          const targetDim = observedDims[anchorColIdx + c];
          const targetRow = group.rows[anchorRowIdx + r];
          if (!targetDim || !targetRow) continue;
          commands.push({
            type: 'setMetric',
            rowId: targetRow.id,
            dimensionKey: targetDim.dimensionKey,
            value: clipboardGrid[r][c],
          });
        }
      }
      if (commands.length === 0) return;

      // 3. Optimistic calc preview. computeOptimistic honours a single override
      //    per call and reads the rest of a row's observed values from its
      //    authoritative metrics — so for a multi-cell-per-row paste we first
      //    fold the pasted observed values into a transient projection, then run
      //    computeOptimistic once per affected row (seeded with that row's first
      //    pasted cell) so calculated cells preview against ALL the new inputs.
      const commandsByRow = new Map<string, typeof commands>();
      for (const cmd of commands) {
        const list = commandsByRow.get(cmd.rowId) ?? [];
        list.push(cmd);
        commandsByRow.set(cmd.rowId, list);
      }
      let transient = proj;
      const parsedByCmdKey = new Map<string, { value?: number; durationMs?: number; text?: string }>();
      for (const cmd of commands) {
        const dim = observedDims.find((d) => d.dimensionKey === cmd.dimensionKey)!;
        // Reuse parseMetricDraft so the optimistic coercion matches the single-cell
        // editor's draft→parsed path. Numbers/durations land as numbers, text as text.
        const parsed =
          typeof cmd.value === 'number'
            ? dim.valueKind === 'duration'
              ? { durationMs: cmd.value * 1000 }
              : dim.valueKind === 'text'
                ? { text: String(cmd.value) }
                : { value: cmd.value }
            : parseMetricDraft(String(cmd.value), dim.valueKind);
        parsedByCmdKey.set(`${cmd.rowId}:${cmd.dimensionKey}`, parsed ?? {});
        if (parsed) {
          transient = setRowMetric(transient, cmd.rowId, cmd.dimensionKey, {
            state: 'valid',
            value: parsed.value,
            durationMs: parsed.durationMs,
            text: parsed.text,
            unit: dim.unitCode,
          });
        } else {
          transient = setRowMetric(transient, cmd.rowId, cmd.dimensionKey, {
            state: 'missing',
            unit: dim.unitCode,
          });
        }
      }
      const optimisticBatch: Record<string, OptimisticMetric> = {};
      for (const [rowId, rowCmds] of commandsByRow) {
        const first = rowCmds[0]!;
        const firstDim = observedDims.find((d) => d.dimensionKey === first.dimensionKey)!;
        const firstParsed = parsedByCmdKey.get(`${first.rowId}:${first.dimensionKey}`)!;
        const override = parsedToMetricValue(firstParsed, firstDim);
        const rowOptimistic = computeOptimistic(transient, compiled, rowId, first.dimensionKey, override);
        Object.assign(optimisticBatch, rowOptimistic);
      }
      setOptimistic((cur) => ({ ...cur, ...optimisticBatch }));

      // 4. POST batch-commands.
      try {
        const res = await fetch(`/api/task-matrices/${instanceId}/batch-commands`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            clientOperationId: `op_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            baseVersion: proj.version,
            anchor,
            commands,
          }),
        });
        const json = (await res.json()) as ApiResponse<{
          status: string;
          results: Array<{
            index: number;
            status: string;
            rowId: string;
            dimensionKey: string;
            error?: { code: string; message?: string };
          }>;
          authoritativeCalculations: Array<{
            rowId: string;
            metricKey: string;
            value?: number;
            unit?: string;
            formulaVersion?: string;
            status: string;
            errorCode?: string;
          }>;
        }>;
        if (json.code !== 0) {
          toast.error(json.message || '批量粘贴失败');
          setOptimistic((cur) => {
            const next = { ...cur };
            for (const k of Object.keys(optimisticBatch)) delete next[k];
            return next;
          });
          return;
        }
        const data = json.data!;

        // 5. Apply authoritative observed values + authoritative calculations
        //    using the FUNCTIONAL updater (race-safe, same as handleMetricChange).
        setProjection((prev) => {
          if (!prev) return prev;
          let next = prev;
          // Apply each succeeded command's observed value authoritatively.
          for (const r of data.results) {
            if (r.status !== 'succeeded') continue;
            const dim = observedDims.find((d) => d.dimensionKey === r.dimensionKey);
            if (!dim) continue;
            const parsed = parsedByCmdKey.get(`${r.rowId}:${r.dimensionKey}`);
            next = setRowMetric(next, r.rowId, r.dimensionKey, {
              state: parsed ? 'valid' : 'missing',
              value: parsed?.value,
              durationMs: parsed?.durationMs,
              text: parsed?.text,
              unit: dim.unitCode,
            });
          }
          // Apply authoritative calculated values (authoritativeCalculations may
          // also include observed cells the recompute touched; authoritativeToMetric
          // handles the calc-failed vs valid shape).
          for (const calc of data.authoritativeCalculations) {
            next = setRowMetric(next, calc.rowId, calc.metricKey, authoritativeToMetric(calc));
          }
          return next;
        });

        // 6. Per-cell failure overlay (only non-succeeded results with an error).
        const newFailed: Record<string, { code: string; message?: string }> = {};
        for (const r of data.results) {
          if (r.status !== 'succeeded' && r.error) {
            newFailed[`${r.rowId}::${r.dimensionKey}`] = { code: r.error.code, message: r.error.message };
          }
        }
        setFailedCells(newFailed);

        // 7. Clear optimistic badges for every paste-touched cell + its dependent
        //    authoritative calcs (functional updater, same pattern as handleMetricChange).
        setOptimistic((cur) => {
          const next = { ...cur };
          for (const k of Object.keys(optimisticBatch)) delete next[k];
          for (const calc of data.authoritativeCalculations) {
            delete next[`${calc.rowId}:${calc.metricKey}`];
          }
          return next;
        });

        // 8. Toast feedback.
        if (data.status === 'succeeded') {
          toast.success(`粘贴完成：${data.results.length} 个单元格`);
        } else if (data.status === 'partially_succeeded') {
          const ok = data.results.filter((r) => r.status === 'succeeded').length;
          toast.message(`粘贴部分成功：${ok}/${data.results.length}`);
        } else {
          toast.error('批量粘贴失败');
        }
      } catch {
        toast.error('批量粘贴失败');
        setOptimistic((cur) => {
          const next = { ...cur };
          for (const k of Object.keys(optimisticBatch)) delete next[k];
          return next;
        });
      }
    },
    [compiled, instanceId],
  );

  /** Create a new group via the toolbar. */
  const handleCreateGroup = useCallback(
    async (label: string, conditionSummary?: string) => {
      if (!instanceId) return;
      setCreatingGroup(true);
      try {
        const res = await fetch(`/api/task-matrices/${instanceId}/groups`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ label, conditionSummary }),
        });
        const json = (await res.json()) as ApiResponse<{ groupId: string }>;
        if (json.code !== 0) throw new Error(json.message || '新增大类失败');
        toast.success('已新增大类');
        await refetchProjection(instanceId);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : '新增大类失败');
        throw err;
      } finally {
        setCreatingGroup(false);
      }
    },
    [instanceId, refetchProjection],
  );

  const handleToggleGroup = useCallback((groupId: string) => {
    setCollapsedGroups((cur) => {
      const next = new Set(cur);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  }, []);

  const handleAddRowToGroup = useCallback(
    async (groupId: string) => {
      if (!instanceId) return;
      // First version: auto-create a blank row; full subject picker is a follow-up.
      const subjectKey = `s_${Date.now().toString(36)}`;
      const subjectLabel = `记录行`;
      try {
        const res = await fetch(`/api/task-matrices/${instanceId}/rows`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ groupId, subjectKey, subjectLabel }),
        });
        const json = (await res.json()) as ApiResponse<{ rowId: string }>;
        if (json.code !== 0) throw new Error(json.message || '新增行失败');
        await refetchProjection(instanceId);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : '新增行失败');
      }
    },
    [instanceId, refetchProjection],
  );

  // ----- Render guards -----

  if (loadError) {
    return <div className="p-4 text-sm text-destructive">数据矩阵加载失败：{loadError}</div>;
  }
  if (instances === null) {
    return <div className="p-4 text-sm text-muted-foreground">加载中…</div>;
  }
  if (instances.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Table2 className="h-4 w-4" />
            数据矩阵
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            当前任务尚未应用数据矩阵模式。任务负责人需在标准管理中发布模式后，从已发布模式库应用到此任务。
          </p>
          <p className="text-xs">
            （模式选择器将在标准管理流程接入后可用；如已发布，请刷新或联系管理员。）
          </p>
        </CardContent>
      </Card>
    );
  }
  if (!projection) {
    return (
      <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        正在加载矩阵投影…
      </div>
    );
  }

  // Filter visible dimensions for the grid.
  const visibleObserved = observedDimensions.filter((d) => visibleKeys?.includes(d.dimensionKey));
  const visibleCalculated = calculatedDimensions.filter((d) => visibleKeys?.includes(d.dimensionKey));

  const calcStatus: CalcStatus = projection.calculation.status;
  const canEdit = projection.permissions.canEditRows;

  // When no dimensions are toggled visible, fall back to all (so a fresh load
  // isn't blank). Shared by both desktop grid and mobile cards.
  const effectiveObserved = visibleObserved.length > 0 ? visibleObserved : observedDimensions;
  const effectiveCalculated =
    visibleCalculated.length > 0 ? visibleCalculated : calculatedDimensions;

  // Shared handler bundle for both the desktop grid and the mobile cards so
  // the two views route edits through the exact same PATCH + optimistic path.
  // onBatchPaste is desktop-only; it's omitted from the bundle passed to mobile
  // (the grid's paste listener no-ops when onBatchPaste is absent).
  const sharedHandlers: {
    onSlotChange: typeof handleSlotChange;
    onMetricChange: typeof handleMetricChange;
    onFocusRow: (row: MatrixReadRow) => void;
    onAddRowToGroup: typeof handleAddRowToGroup;
    onBatchPaste: typeof handleBatchPaste;
  } = {
    onSlotChange: handleSlotChange,
    onMetricChange: handleMetricChange,
    onFocusRow: (row) => {
      // Resolve the row from the latest projection so the context bar reflects
      // authoritative values rather than a stale row object.
      const fresh = projection.groups
        .flatMap((g) => g.rows)
        .find((r) => r.id === row.id);
      setFocusedRow(fresh ?? row);
    },
    onAddRowToGroup: handleAddRowToGroup,
    onBatchPaste: handleBatchPaste,
  };

  // Mobile handler bundle: same as desktop MINUS onBatchPaste (mobile has no
  // paste UX). The grid's MatrixVirtualGridHandlers type makes onBatchPaste
  // optional, so this narrower bundle type-checks against mobile's prop.
  const mobileHandlers: Omit<typeof sharedHandlers, 'onBatchPaste'> = {
    onSlotChange: sharedHandlers.onSlotChange,
    onMetricChange: sharedHandlers.onMetricChange,
    onFocusRow: sharedHandlers.onFocusRow,
    onAddRowToGroup: sharedHandlers.onAddRowToGroup,
  };

  const clearCellFailure = useCallback((key: string) => {
    setFailedCells((prev) => {
      if (!(key in prev)) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, []);

  return (
    <div className="flex min-w-0 flex-col gap-0">
      <RecordContextBar
        focusedRow={focusedRow}
        schemaName={projection.schema.name}
        resultStatusOptions={projection.schema.resultStatusOptions}
      />
      <MatrixToolbar
        onCreateGroup={handleCreateGroup}
        creatingGroup={creatingGroup}
        calcStatus={calcStatus}
        dimensions={projection.schema.dimensions}
        visibleKeys={visibleKeys ?? projection.schema.dimensions.map((d) => d.dimensionKey)}
        onVisibleKeysChange={setVisibleKeys}
        canEditRows={canEdit}
      />
      <div className="hidden md:block">
        <MatrixVirtualGrid
          projection={projection}
          taskId={taskId}
          observedDimensions={effectiveObserved}
          calculatedDimensions={effectiveCalculated}
          optimistic={optimistic}
          busyCells={busyCells}
          collapsedGroups={collapsedGroups}
          onToggleGroup={handleToggleGroup}
          handlers={sharedHandlers}
          resultStatusOptions={projection.schema.resultStatusOptions}
          focusedCell={focusedCell}
          onFocusedCellChange={setFocusedCell}
          failedCells={failedCells}
          onClearCellFailure={clearCellFailure}
        />
      </div>
      <div className="md:hidden">
        <MatrixMobileCards
          projection={projection}
          taskId={taskId}
          observedDimensions={effectiveObserved}
          calculatedDimensions={effectiveCalculated}
          optimistic={optimistic}
          busyCells={busyCells}
          collapsedGroups={collapsedGroups}
          onToggleGroup={handleToggleGroup}
          handlers={mobileHandlers}
          resultStatusOptions={projection.schema.resultStatusOptions}
          failedCells={failedCells}
          onClearCellFailure={clearCellFailure}
        />
      </div>
      <div className="px-3 py-1.5 text-[10px] text-muted-foreground">
        {taskName} · {projection.schema.name} · {projection.viewport.totalGroups} 大类 · {projection.viewport.totalRows} 行
      </div>
    </div>
  );
}
