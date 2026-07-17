/**
 * Server-side authoritative recompute for V3 A1-style matrix formulas.
 *
 * PRD V3.1.2.4 §7.9 (ADR-02). Counterpart to the legacy {@link "./recompute"}
 * (which serves the V2 SELF/REF engine). This module:
 *
 *   1. Loads active {@link matrixFormulaDefinitionsV3} for the matrix, the
 *      ordered {@link matrixColumnDefinitions}, the active {@link matrixLeafRows}
 *      and all {@link matrixCellValues}.
 *   2. Builds a 2D numeric grid `values[rowIndex][colIndex]` where
 *      `rowIndex` is the leaf row's `visibleRowIndex` and `colIndex` is the
 *      column's position in displayOrder. This grid is the A1 coordinate space
 *      the formula engine evaluates against (A1 col G → colIndex 6, row 4 →
 *      rowIndex 3, matching `colToIndex`/`row-1` in the engine).
 *   3. For each formula column, for each leaf row: propagates the formula from
 *      its anchor row to the target row (PRD §7.9.5 relative references),
 *      evaluates it against the grid, upserts a {@link matrixFormulaRunsV3}
 *      audit row and updates the corresponding {@link matrixCellValues} cell
 *      (valueNumber + valueState + source run id).
 *
 * The engine is shared with the optimistic frontend path
 * ({@link "./formula-engine-a1"}), so authoritative and optimistic results
 * agree.
 */
import { eq, sql, and, asc, inArray } from 'drizzle-orm';
import { getDb } from '@/storage/database/pg-db';
import {
  matrixFormulaDefinitionsV3,
  matrixFormulaRunsV3,
  matrixColumnDefinitions,
  matrixLeafRows,
  matrixCellValues,
} from '@/storage/database/shared/schema';
import {
  compileA1Formula,
  evaluateA1,
  propagateToRow,
  type CompiledFormula,
  type EvalContext,
} from './formula-engine-a1';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Coerce a DB numeric value to a JS number. Drizzle returns `numeric(18,6)`
 * columns as STRINGS (e.g. `"558.700000"`) — a bare `typeof === 'number'`
 * check would silently drop every value in production.
 */
export function toFormulaNumber(v: unknown): number | null {
  if (typeof v === 'object' && v !== null) {
    const cell = v as {
      valueNumber?: unknown;
      valuePercentage?: unknown;
      valueText?: unknown;
    };
    return toFormulaNumber(cell.valueNumber ?? cell.valuePercentage ?? cell.valueText);
  }
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v.trim());
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/**
 * Formula A1 coordinates retain the optional level-3 hierarchy slot even when
 * it is visually collapsed. This keeps D/E and following references stable as
 * users add or remove third-level items. The retired primary image slot is the
 * only omitted column because it is no longer a matrix entry surface.
 */
export function getFormulaCoordinateColumns<T extends { archivedAt: unknown; zoneRole: string | null; columnZone: string }>(
  columns: T[],
): T[] {
  return columns.filter(
    (column) => column.archivedAt === null && column.columnZone !== 'primary_media',
  );
}

/** The A1 row index for a leaf row: 0-based, derived from visibleRowIndex. */
function rowIndexFor(leaf: { visibleRowIndex: number }): number {
  return leaf.visibleRowIndex;
}

/** Anchor row of a formula = the row of its first cell reference (the "home" row). */
function anchorRowOf(compiled: CompiledFormula): number | null {
  return compiled.references.length > 0 ? compiled.references[0]!.row : null;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Recompute every active V3 formula for `matrixId` and persist results.
 *
 * Idempotent in the sense that re-running with unchanged inputs produces the
 * same stored values (cells are upserted, runs are appended as fresh audit
 * rows). Throws on DB errors so the API route can map them to a 500.
 */
export async function recomputeMatrixFormulas(matrixId: string): Promise<void> {
  const db = await getDb();

  // --- 1. Load all the data for this matrix in parallel. ---
  const [formulaRows, columnRows, leafRows, cellRows] = await Promise.all([
    db
      .select()
      .from(matrixFormulaDefinitionsV3)
      .where(
        and(
          eq(matrixFormulaDefinitionsV3.matrixId, matrixId),
          eq(matrixFormulaDefinitionsV3.status, 'active'),
        ),
      )
      .execute(),
    db
      .select()
      .from(matrixColumnDefinitions)
      .where(
        and(
          eq(matrixColumnDefinitions.matrixId, matrixId),
          // archived columns have archivedAt set; active ones are null.
        ),
      )
      .orderBy(asc(matrixColumnDefinitions.displayOrder))
      .execute(),
    db
      .select()
      .from(matrixLeafRows)
      .where(eq(matrixLeafRows.matrixId, matrixId))
      .execute(),
    db
      .select()
      .from(matrixCellValues)
      .where(eq(matrixCellValues.matrixId, matrixId))
      .execute(),
  ]);

  // --- 2. Build the coordinate space. ---
  // Leaf rows: active only. Their visibleRowIndex IS the A1 row index (0-based).
  const activeLeafRows = leafRows.filter((r) => r.status === 'active');
  const leafById = new Map<string, (typeof activeLeafRows)[number]>();
  for (const r of activeLeafRows) leafById.set(r.id, r);

  // Columns: ordered by displayOrder and exactly aligned with the currently
  // visible grid. Their position in this array IS the A1 column index.
  const activeColumns = getFormulaCoordinateColumns(columnRows);
  const colIdToIndex = new Map<string, number>();
  activeColumns.forEach((c, i) => colIdToIndex.set(c.id, i));

  const totalCols = activeColumns.length;
  // The grid's row extent is max(visibleRowIndex)+1 (visibleRowIndex is dense
  // 0..N-1 for active rows in practice, but we size defensively).
  let maxRowIndex = -1;
  for (const r of activeLeafRows) {
    if (r.visibleRowIndex > maxRowIndex) maxRowIndex = r.visibleRowIndex;
  }
  const gridRows = Math.max(0, maxRowIndex + 1);

  // cellsByRowCol: leafRowId -> columnId -> numeric value.
  const numericByRowCol = new Map<string, Map<string, number>>();
  for (const c of cellRows) {
    const n = toFormulaNumber(c);
    if (n === null) continue;
    let rowMap = numericByRowCol.get(c.leafRowId);
    if (!rowMap) {
      rowMap = new Map();
      numericByRowCol.set(c.leafRowId, rowMap);
    }
    rowMap.set(c.columnId, n);
  }

  // Resolve a (colIndex, rowIndex) to a numeric value by locating the leaf row
  // whose visibleRowIndex === rowIndex, then the cell for that column.
  const leafByVisibleIndex = new Map<number, string>();
  for (const r of activeLeafRows) leafByVisibleIndex.set(r.visibleRowIndex, r.id);

  /**
   * getCellValue(col, row):
   *   row  → leafRowId via visibleRowIndex
   *   col  → columnId via the ordered column array
   *   cell → numeric value (or null if empty/non-numeric)
   */
  const getCellValue = (col: number, row: number): number | null => {
    const columnId = activeColumns[col]?.id;
    const leafRowId = leafByVisibleIndex.get(row);
    if (!columnId || !leafRowId) return null;
    return numericByRowCol.get(leafRowId)?.get(columnId) ?? null;
  };

  // --- 3. Compile formulas once. Skip any that fail to compile (log + leave
  //        their cells untouched — a later PUT with a valid expression will
  //        recompile). ---
  type Compiled = {
    formulaId: string;
    columnId: string;
    decimalPlaces: number;
    resultFormat: string | null;
    applyScope: string;
    anchorRow: number | null;
    /** When applyScope is level_1_group, only rows in this L1 group are filled. */
    anchorLevel1NodeId: string | null;
    compiled: CompiledFormula;
  };
  const compiledFormulas: Compiled[] = [];
  for (const f of formulaRows) {
    const result = compileA1Formula(f.expressionDisplay);
    if (!result.ok) {
      // Persist a failure run for every leaf row so the audit trail records
      // WHY the column is not producing values (parse/syntax error).
      await recordCompileFailure(db, matrixId, f.id, f.columnId, result.code, activeLeafRows);
      continue;
    }
    const anchorRow = anchorRowOf(result.compiled);
    const anchorLeafId =
      anchorRow === null ? null : leafByVisibleIndex.get(anchorRow) ?? null;
    const anchorLeaf = anchorLeafId ? leafById.get(anchorLeafId) : undefined;
    const scope = f.applyScope === 'group' ? 'level_1_group' : (f.applyScope ?? 'matrix');
    compiledFormulas.push({
      formulaId: f.id,
      columnId: f.columnId,
      decimalPlaces: f.decimalPlaces ?? 2,
      resultFormat: f.resultFormat ?? null,
      applyScope: scope,
      anchorRow,
      anchorLevel1NodeId: anchorLeaf?.level1NodeId ?? null,
      compiled: result.compiled,
    });
  }

  // --- 4. For each formula × leaf row: propagate, evaluate, persist. ---
  for (const f of compiledFormulas) {
    for (const leaf of activeLeafRows) {
      // PRD §7.9.6 — group scope: only fill rows in the same level_1 as the anchor.
      if (
        f.applyScope === 'level_1_group' &&
        f.anchorLevel1NodeId &&
        leaf.level1NodeId !== f.anchorLevel1NodeId
      ) {
        continue;
      }

      const targetRow = rowIndexFor(leaf);

      // Relative propagation (PRD §7.9.5): shift the formula from its anchor
      // row to the target leaf row so references track the current row.
      const delta = f.anchorRow === null ? 0 : targetRow - f.anchorRow;
      const effective = delta === 0 ? f.compiled : propagateToRow(f.compiled, delta);

      const ctx: EvalContext = {
        getCellValue,
        totalRows: gridRows,
        totalCols,
      };

      const evalResult = evaluateA1(effective, ctx);

      // Upsert a run audit row (success/failed + result/error). The run id is
      // not currently stored on matrix_cell_values (the schema has no
      // source_run_id column), but the run row itself is the audit link.
      await db
        .insert(matrixFormulaRunsV3)
        .values({
          formulaId: f.formulaId,
          matrixId,
          leafRowId: leaf.id,
          status: evalResult.ok ? 'success' : 'failed',
          resultValue: evalResult.ok ? String(round(evalResult.value, f.decimalPlaces)) : null,
          errorCode: evalResult.ok ? null : evalResult.code,
          createdAt: sql`NOW()`,
        })
        .execute();

      // Update the cell value: store the (rounded) number on success, or mark
      // calculation_failed with the error code on failure. Upsert keyed on
      // (matrixId, leafRowId, columnId) — same conflict target as the cells API.
      if (evalResult.ok) {
        const value = round(evalResult.value, f.decimalPlaces);
        await db
          .insert(matrixCellValues)
          .values({
            matrixId,
            leafRowId: leaf.id,
            columnId: f.columnId,
            valueNumber: String(value),
            valueState: 'filled',
            version: 1,
          })
          .onConflictDoUpdate({
            target: [
              matrixCellValues.matrixId,
              matrixCellValues.leafRowId,
              matrixCellValues.columnId,
            ],
            set: {
              valueNumber: String(value),
              displayText: null,
              errorCode: null,
              valueState: 'filled',
              version: sql`${matrixCellValues.version} + 1`,
              updatedAt: sql`NOW()`,
            },
          })
          .execute();
      } else {
        await db
          .insert(matrixCellValues)
          .values({
            matrixId,
            leafRowId: leaf.id,
            columnId: f.columnId,
            valueNumber: null,
            valueState: 'calculation_failed',
            errorCode: evalResult.code,
            version: 1,
          })
          .onConflictDoUpdate({
            target: [
              matrixCellValues.matrixId,
              matrixCellValues.leafRowId,
              matrixCellValues.columnId,
            ],
            set: {
              valueNumber: null,
              errorCode: evalResult.code,
              valueState: 'calculation_failed',
              version: sql`${matrixCellValues.version} + 1`,
              updatedAt: sql`NOW()`,
            },
          })
          .execute();
      }
    }
  }
}

/**
 * Round a value to `decimalPlaces` using round-half-away-from-zero (Excel
 * semantics, matching the legacy engine). Returns the raw double if
 * decimalPlaces is null/undefined.
 */
function round(value: number, decimalPlaces: number | null | undefined): number {
  if (decimalPlaces === null || decimalPlaces === undefined) return value;
  if (!Number.isFinite(value)) return value;
  const factor = Math.pow(10, decimalPlaces);
  return Math.sign(value) * (Math.round(Math.abs(value) * factor) / factor);
}

/**
 * Record a `failed` run for every leaf row when a formula failed to COMPILE
 * (so the audit trail explains a perpetually-blank column). The cells
 * themselves are left as-is; a subsequent recompute with a fixed expression
 * will repopulate them.
 */
async function recordCompileFailure(
  db: Awaited<ReturnType<typeof getDb>>,
  matrixId: string,
  formulaId: string,
  _columnId: string,
  errorCode: string,
  leafRows: { id: string }[],
): Promise<void> {
  if (leafRows.length === 0) return;
  // Batch a single multi-row insert (drizzle supports arrays of values).
  const rows = leafRows.map((r) => ({
    formulaId,
    matrixId,
    leafRowId: r.id,
    status: 'failed' as const,
    resultValue: null,
    errorCode,
    createdAt: sql`NOW()`,
  }));
  await db.insert(matrixFormulaRunsV3).values(rows).execute();

  // Mark the affected cells calculation_failed so the grid renders an error
  // state instead of a stale value.
  await db
    .update(matrixCellValues)
    .set({
      valueNumber: null,
      errorCode,
      valueState: 'calculation_failed',
      version: sql`${matrixCellValues.version} + 1`,
      updatedAt: sql`NOW()`,
    })
    .where(
      and(
        eq(matrixCellValues.matrixId, matrixId),
        eq(matrixCellValues.columnId, _columnId),
        inArray(
          matrixCellValues.leafRowId,
          leafRows.map((r) => r.id),
        ),
      ),
    )
    .execute();
}
