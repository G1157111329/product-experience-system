/**
 * Field value service — CRUD for matrix field values with formula recalculation.
 * PRD V3.1 §3.8, §6.5–6.6, §12.3.
 *
 * Each value update triggers:
 * 1. Validate input against field definition constraints
 * 2. Write the value with optimistic lock (row_version check)
 * 3. Recalculate dependent formula fields in the same row
 * 4. Return recalculated results
 */

import { eq, and, asc, inArray } from 'drizzle-orm';
import { getDb } from '@/storage/database/pg-db';
import {
  matrixFieldValues,
  matrixFieldDefinitions,
  matrixRows,
  matrixFormulaDefinitions,
  matrixCalculationRuns,
  taskMatrices,
} from '@/storage/database/shared/schema';
import { compileFormula, evaluate, type CompiledFormula, type EvalContext, type MetricValue } from './formula-engine';
import type {
  MatrixFieldValue,
  MatrixFieldDefinition,
  UpdateFieldValueRequest,
  UpdateFieldValueResponse,
  ValueState,
} from './task-matrix-types';
import { createHash } from 'crypto';

// Cache compiled formulas per design version to avoid recompilation
const formulaCache = new Map<string, Map<string, { compiled: CompiledFormula; deps: string[] }>>();

// ---------------------------------------------------------------------------
// Value CRUD
// ---------------------------------------------------------------------------

export async function getFieldValues(rowId: string): Promise<MatrixFieldValue[]> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(matrixFieldValues)
    .where(eq(matrixFieldValues.rowId, rowId));
  return rows as unknown as MatrixFieldValue[];
}

export async function getFieldValue(
  rowId: string,
  fieldDefinitionId: string,
): Promise<MatrixFieldValue | null> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(matrixFieldValues)
    .where(and(
      eq(matrixFieldValues.rowId, rowId),
      eq(matrixFieldValues.fieldDefinitionId, fieldDefinitionId),
    ))
    .limit(1);
  return (rows[0] as unknown as MatrixFieldValue) ?? null;
}

/**
 * Update a single field value with optimistic locking and formula recalculation.
 * PRD §12.3 — returns updated field + recalculated fields.
 */
export async function updateFieldValue(
  rowId: string,
  fieldDefinitionId: string,
  req: UpdateFieldValueRequest,
): Promise<UpdateFieldValueResponse> {
  const db = await getDb();

  // 1. Get the field definition
  const fieldRows = await db
    .select()
    .from(matrixFieldDefinitions)
    .where(eq(matrixFieldDefinitions.id, fieldDefinitionId))
    .limit(1);

  if (fieldRows.length === 0) {
    throw Object.assign(new Error('VALUE_001'), { code: 'VALUE_001' });
  }
  const fieldDef = fieldRows[0] as unknown as MatrixFieldDefinition;

  // 2. Get the row (for version check and matrix context)
  const rowRows = await db
    .select()
    .from(matrixRows)
    .where(eq(matrixRows.id, rowId))
    .limit(1);

  if (rowRows.length === 0) {
    throw new Error('Row not found');
  }
  const row = rowRows[0] as unknown as { id: string; matrixId: string; groupId: string; version: number };

  // 3. Optimistic lock: check row version
  if (req.rowVersion !== row.version) {
    throw Object.assign(new Error('SAVE_409'), { code: 'SAVE_409', currentVersion: row.version });
  }

  // 4. Validate value against field definition
  validateFieldValue(fieldDef, req);

  // 5. Determine value state
  const valueState = determineValueState(req, fieldDef);

  // 6. Write or update the field value
  const existing = await getFieldValue(rowId, fieldDefinitionId);

  let updatedValue: MatrixFieldValue;
  if (existing) {
    const [updated] = await db
      .update(matrixFieldValues)
      .set({
        valueState,
        numericValue: req.numericValue != null ? String(req.numericValue) : null,
        textValue: req.textValue ?? null,
        durationMs: req.durationMs ?? null,
        booleanValue: req.booleanValue ?? null,
        enumValue: req.enumValue ?? null,
        calculationMode: 'manual',
        errorCode: undefined,
        updatedAt: new Date().toISOString(),
        version: existing.version + 1,
      } as any)
      .where(eq(matrixFieldValues.id, existing.id))
      .returning();
    updatedValue = updated as unknown as MatrixFieldValue;
  } else {
    const [inserted] = await db
      .insert(matrixFieldValues)
      .values({
        rowId,
        fieldDefinitionId,
        valueState,
        numericValue: req.numericValue != null ? String(req.numericValue) : null,
        textValue: req.textValue ?? null,
        durationMs: req.durationMs ?? null,
        booleanValue: req.booleanValue ?? null,
        enumValue: req.enumValue ?? null,
        calculationMode: 'manual',
      })
      .returning();
    updatedValue = inserted as unknown as MatrixFieldValue;
  }

  // 7. Bump row version
  const [updatedRow] = await db
    .update(matrixRows)
    .set({ version: row.version + 1, updatedAt: new Date().toISOString() } as any)
    .where(eq(matrixRows.id, rowId))
    .returning();

  // 8. Recalculate dependent formulas in the same row
  const recalculated = await recalculateRowFormulas(rowId, row.matrixId, fieldDef.designVersionId, {
    triggerType: 'field_update',
  });

  // 9. Generate trace ID
  const traceId = `tr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  return {
    traceId,
    rowId,
    rowVersion: (updatedRow as unknown as { version: number }).version,
    updatedField: {
      fieldId: fieldDefinitionId,
      valueState: updatedValue.valueState,
      value: updatedValue.numericValue ?? undefined,
      textValue: updatedValue.textValue ?? undefined,
      durationMs: updatedValue.durationMs ?? undefined,
      booleanValue: updatedValue.booleanValue ?? undefined,
      enumValue: updatedValue.enumValue ?? undefined,
    },
    recalculatedFields: recalculated,
  };
}

// ---------------------------------------------------------------------------
// Formula recalculation (PRD §6.5–6.6)
// ---------------------------------------------------------------------------

async function recalculateRowFormulas(
  rowId: string,
  matrixId: string,
  designVersionId: string,
  options?: {
    triggerType?: string;
    traceId?: string;
  },
): Promise<UpdateFieldValueResponse['recalculatedFields']> {
  const db = await getDb();
  const results: UpdateFieldValueResponse['recalculatedFields'] = [];

  // Get all formula definitions for this design version
  const compiledFormulas = await getCompiledFormulas(designVersionId);
  if (compiledFormulas.size === 0) return results;

  // Get all field values for this row
  const allValues = await getFieldValues(rowId);
  const valueMap = new Map<string, MatrixFieldValue>();
  for (const v of allValues) {
    valueMap.set(v.fieldDefinitionId, v);
  }

  // Get all field definitions to know which are formulas
  const fieldDefs = await db
    .select()
    .from(matrixFieldDefinitions)
    .where(eq(matrixFieldDefinitions.designVersionId, designVersionId));

  const fieldDefMap = new Map<string, MatrixFieldDefinition>();
  for (const f of fieldDefs) {
    fieldDefMap.set(f.id, f as unknown as MatrixFieldDefinition);
  }

  // Build eval context from row values
  const evalCtx = buildEvalContext(valueMap, fieldDefMap);

  // Compute input hash for audit
  const inputHash = computeInputHash(evalCtx);
  const formulaHash = computeFormulaHash(compiledFormulas);

  // Evaluate each formula
  for (const [formulaFieldId, { compiled, deps }] of compiledFormulas) {
    const formulaDef = fieldDefMap.get(formulaFieldId);
    if (!formulaDef) continue;

    // Check if all dependencies have values
    const missingDeps: string[] = [];
    for (const dep of deps) {
      const depValue = valueMap.get(dep);
      if (!depValue || depValue.valueState === 'missing' || depValue.valueState === 'pending_input') {
        missingDeps.push(dep);
      }
    }

    if (missingDeps.length > 0) {
      results.push({
        fieldId: formulaFieldId,
        valueState: 'pending_input',
        reason: `MISSING_DEPENDENCY: ${missingDeps.join(', ')}`,
      });

      // Write pending_input state
      await upsertFieldValue(rowId, formulaFieldId, {
        valueState: 'pending_input',
        errorCode: 'MISSING_DEPENDENCY',
      });
      continue;
    }

    // Attempt calculation
    try {
      const result = evaluate(compiled, evalCtx);

      if (result === null || result === undefined || (typeof result === 'object' && !('value' in result || 'durationMs' in result || 'text' in result))) {
        results.push({
          fieldId: formulaFieldId,
          valueState: 'calculation_failed',
          errorCode: 'CALCULATION_FAILED',
        });
        await upsertFieldValue(rowId, formulaFieldId, {
          valueState: 'calculation_failed',
          errorCode: 'CALCULATION_FAILED',
          calculationMode: 'computed',
        });
        continue;
      }

      const metricResult = result as MetricValue | null;
      const numericValue = metricResult && 'value' in metricResult ? metricResult.value : undefined;
      const durationMs = metricResult && 'durationMs' in metricResult ? metricResult.durationMs : undefined;

      results.push({
        fieldId: formulaFieldId,
        valueState: 'filled',
        displayValue: numericValue,
      });

      await upsertFieldValue(rowId, formulaFieldId, {
        valueState: 'filled',
        numericValue,
        durationMs,
        calculationMode: 'computed',
        errorCode: undefined,
      });
    } catch (err) {
      results.push({
        fieldId: formulaFieldId,
        valueState: 'calculation_failed',
        errorCode: (err as Error).message,
        reason: (err as Error).message,
      });
      await upsertFieldValue(rowId, formulaFieldId, {
        valueState: 'calculation_failed',
        errorCode: (err as Error).message,
        calculationMode: 'computed',
      });
    }
  }

  // Write calculation run audit record
  await db.insert(matrixCalculationRuns).values({
    taskMatrixId: matrixId,
    triggerType: options?.triggerType ?? 'field_update',
    inputVersionHash: inputHash,
    formulaVersionHash: formulaHash,
    status: results.some((r) => r.valueState === 'calculation_failed') ? 'partial_failure' : 'success',
    traceId: options?.traceId ?? `calc_${Date.now()}`,
  });

  return results;
}

export async function recalculateMatrixValues(
  matrixId: string,
  input?: {
    rowIds?: string[];
    traceId?: string;
  },
): Promise<{
  rowsProcessed: number;
  fieldRecalculated: number;
  rows: Array<{
    rowId: string;
    recalculatedFields: number;
    failedFields: number;
  }>;
}> {
  const db = await getDb();

  const matrixRowsRaw = await db
    .select({ currentDesignVersionId: taskMatrices.currentDesignVersionId })
    .from(taskMatrices)
    .where(eq(taskMatrices.id, matrixId))
    .limit(1);

  if (matrixRowsRaw.length === 0) {
    throw Object.assign(new Error('MX-V-001'), { code: 'MX-V-001' });
  }

  const designVersionId = matrixRowsRaw[0]?.currentDesignVersionId;
  if (!designVersionId) {
    throw Object.assign(new Error('MX-V-001: matrix design not confirmed'), { code: 'MX-V-001' });
  }

  const rowFilter = Array.isArray(input?.rowIds) && input!.rowIds.length > 0
    ? and(
        eq(matrixRows.matrixId, matrixId),
        eq(matrixRows.isArchived, false),
        inArray(matrixRows.id, input!.rowIds),
      )
    : and(
        eq(matrixRows.matrixId, matrixId),
        eq(matrixRows.isArchived, false),
      );

  const rows = await db
    .select({ id: matrixRows.id })
    .from(matrixRows)
    .where(rowFilter)
    .orderBy(asc(matrixRows.sortOrder));

  const rowSummaries: Array<{ rowId: string; recalculatedFields: number; failedFields: number }> = [];
  let totalRecalculated = 0;

  for (const row of rows) {
    const recalculated = await recalculateRowFormulas(row.id, matrixId, designVersionId, {
      triggerType: 'api_recalculate',
      traceId: input?.traceId,
    });
    const failedFields = recalculated.filter((item) => item.valueState === 'calculation_failed').length;
    totalRecalculated += recalculated.length;
    rowSummaries.push({
      rowId: row.id,
      recalculatedFields: recalculated.length,
      failedFields,
    });
  }

  return {
    rowsProcessed: rows.length,
    fieldRecalculated: totalRecalculated,
    rows: rowSummaries,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function validateFieldValue(fieldDef: MatrixFieldDefinition, req: UpdateFieldValueRequest): void {
  // Check if calculated field (should not be manually edited)
  if (fieldDef.fieldKind === 'formula') {
    throw Object.assign(new Error('VALUE_001: 计算字段不能手动编辑'), { code: 'VALUE_001' });
  }

  // Check required fields
  if (fieldDef.requiredMode === 'required') {
    const hasValue = req.numericValue != null || req.textValue != null ||
      req.durationMs != null || req.booleanValue != null || req.enumValue != null;
    if (!hasValue) {
      throw Object.assign(new Error('VALUE_001: 该字段为必填'), { code: 'VALUE_001' });
    }
  }

  // Check numeric range
  if (req.numericValue != null) {
    if (fieldDef.minValue != null && req.numericValue < Number(fieldDef.minValue)) {
      throw Object.assign(new Error('VALUE_002'), { code: 'VALUE_002' });
    }
    if (fieldDef.maxValue != null && req.numericValue > Number(fieldDef.maxValue)) {
      throw Object.assign(new Error('VALUE_002'), { code: 'VALUE_002' });
    }
  }

  // Check enum value
  if (req.enumValue != null && fieldDef.enumOptions) {
    const options = typeof fieldDef.enumOptions === 'string'
      ? JSON.parse(fieldDef.enumOptions)
      : fieldDef.enumOptions;
    if (!options.includes(req.enumValue)) {
      throw Object.assign(new Error('VALUE_003'), { code: 'VALUE_003' });
    }
  }
}

function determineValueState(req: UpdateFieldValueRequest, _fieldDef: MatrixFieldDefinition): ValueState {
  void _fieldDef;
  const hasValue = req.numericValue != null || req.textValue != null ||
    req.durationMs != null || req.booleanValue != null ||
    req.dateTimeValue != null || req.enumValue != null;

  if (req.valueState) return req.valueState;
  if (hasValue) return 'filled';
  return 'missing';
}

function buildEvalContext(
  valueMap: Map<string, MatrixFieldValue>,
  _fieldDefMap: Map<string, MatrixFieldDefinition>,
): EvalContext {
  void _fieldDefMap;
  const metrics: Record<string, MetricValue> = {};

  for (const [fieldId, value] of valueMap) {
    if (value.numericValue != null) {
      metrics[fieldId] = { value: Number(value.numericValue), unit: value.unitCode ?? '' };
    } else if (value.durationMs != null) {
      metrics[fieldId] = { durationMs: value.durationMs };
    } else if (value.textValue != null) {
      metrics[fieldId] = { text: value.textValue };
    }
  }

  // The formula engine's EvalContext expects metrics as a flat Record
  const ctx = { SELF: (key: string) => metrics[key] ?? null, ROW: metrics } as unknown as EvalContext;
  return ctx;
}

function computeInputHash(ctx: EvalContext): string {
  const hash = createHash('sha256');
  hash.update(JSON.stringify((ctx as unknown as { ROW: Record<string, MetricValue> }).ROW));
  return hash.digest('hex').slice(0, 40);
}

function computeFormulaHash(formulas: Map<string, { compiled: CompiledFormula; deps: string[] }>): string {
  const hash = createHash('sha256');
  const entries = Array.from(formulas.entries()).sort(([a], [b]) => a.localeCompare(b));
  for (const [key, { compiled }] of entries) {
    hash.update(`${key}:${JSON.stringify(compiled.ast)}`);
  }
  return hash.digest('hex').slice(0, 40);
}

async function getCompiledFormulas(
  designVersionId: string,
): Promise<Map<string, { compiled: CompiledFormula; deps: string[] }>> {
  if (formulaCache.has(designVersionId)) {
    return formulaCache.get(designVersionId)!;
  }

  const db = await getDb();
  // Actually query by design version via field definitions
  const fieldDefs = await db
    .select({ id: matrixFieldDefinitions.id })
    .from(matrixFieldDefinitions)
    .where(and(
      eq(matrixFieldDefinitions.designVersionId, designVersionId),
      eq(matrixFieldDefinitions.fieldKind, 'formula'),
    ));

  const result = new Map<string, { compiled: CompiledFormula; deps: string[] }>();

  for (const fd of fieldDefs) {
    const formulaRows = await db
      .select()
      .from(matrixFormulaDefinitions)
      .where(eq(matrixFormulaDefinitions.fieldDefinitionId!, fd.id))
      .limit(1);

    if (formulaRows.length > 0) {
      const f = formulaRows[0] as unknown as { formulaDsl: string };
      try {
        const compiled = compileFormula(f.formulaDsl);
        result.set(fd.id, {
          compiled,
          deps: compiled.dependencies ?? [],
        });
      } catch {
        // Skip invalid formulas
      }
    }
  }

  formulaCache.set(designVersionId, result);
  return result;
}

async function upsertFieldValue(
  rowId: string,
  fieldDefinitionId: string,
  data: Partial<MatrixFieldValue> & { valueState: ValueState },
): Promise<void> {
  const db = await getDb();
  const existing = await getFieldValue(rowId, fieldDefinitionId);

  if (existing) {
    await db
      .update(matrixFieldValues)
      .set({
        valueState: data.valueState,
        numericValue: data.numericValue != null ? String(data.numericValue) : existing.numericValue,
        textValue: data.textValue ?? existing.textValue,
        durationMs: data.durationMs ?? existing.durationMs,
        booleanValue: data.booleanValue ?? existing.booleanValue,
        enumValue: data.enumValue ?? existing.enumValue,
        calculationMode: data.calculationMode ?? existing.calculationMode,
        formulaDefinitionId: data.formulaDefinitionId ?? existing.formulaDefinitionId,
        formulaVersion: data.formulaVersion ?? existing.formulaVersion,
        errorCode: data.errorCode ?? existing.errorCode,
        version: existing.version + 1,
        updatedAt: new Date().toISOString(),
      } as any)
      .where(eq(matrixFieldValues.id, existing.id));
  } else {
    await db
      .insert(matrixFieldValues)
      .values({
        rowId,
        fieldDefinitionId,
        valueState: data.valueState,
        numericValue: data.numericValue != null ? String(data.numericValue) : null,
        textValue: data.textValue ?? null,
        durationMs: data.durationMs ?? null,
        booleanValue: data.booleanValue ?? null,
        enumValue: data.enumValue ?? null,
        calculationMode: data.calculationMode ?? null,
        formulaDefinitionId: data.formulaDefinitionId ?? null,
        formulaVersion: data.formulaVersion ?? null,
        errorCode: data.errorCode ?? null,
      });
  }
}
