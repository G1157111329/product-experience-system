/**
 * inline-values service — dispatch layer for PATCH /api/v1/inline-values/*.
 *
 * PRD V3.1.2.4 §13.7. Maps (entity_type, field_id) → a field-writer that
 * performs the optimistic-locked single-field update.
 *
 * Wave 0 registers the dispatch map. Each subsequent Wave registers concrete
 * writers via {@link registerInlineHandler} / {@link registerEntityHandler}.
 *
 * Optimistic locking convention:
 *   - ifMatch is the client's last-seen version (string, possibly quoted).
 *   - Writers with a `version` column compare; mismatch => conflict.
 *   - Tables without a version column use a timestamp-based pseudo-version.
 */
import { getDb } from '@/storage/database/pg-db';
import { eq, sql } from 'drizzle-orm';
import { normalizeEvaluationStatus } from '@/lib/evaluation-status';
import {
  checkRecords,
  recipes,
  comparisonMatrixCells,
  experienceTasks,
  matrixCellValues,
  matrixColumnDefinitions,
  matrixHierarchyNodes,
  matrixNarrativeBlocks,
  matrixIssuePoints,
} from '@/storage/database/shared/schema';

export type InlineEntityType =
  | 'record_item'
  | 'issue'
  | 'issue_occurrence'
  | 'rectification_action'
  | 'verification'
  | 'report_summary'
  | 'function_effect_record'
  | 'sensory_record'
  | 'comparison_matrix_cell'
  | 'dynamic_matrix_cell_value'
  | 'dynamic_matrix_column_definition'
  | 'dynamic_matrix_hierarchy_node'
  | 'dynamic_matrix_narrative_block'
  | 'matrix_issue_point';

export interface InlineUpdateInput {
  entityType: InlineEntityType;
  entityId: string;
  fieldId: string;
  value: unknown;
  ifMatch?: string;
  userId: string;
  isAdmin: boolean;
}

export type InlineUpdateResult =
  | { kind: 'success'; version: number | string; appliedValue: unknown }
  | { kind: 'conflict'; serverVersion: number | string }
  | { kind: 'not_found' }
  | { kind: 'forbidden' }
  | { kind: 'unsupported' };

type FieldWriter = (input: InlineUpdateInput) => Promise<InlineUpdateResult>;

const handlers = new Map<string, FieldWriter>();
const entityHandlers = new Map<InlineEntityType, FieldWriter>();

export function registerInlineHandler(
  entityType: InlineEntityType,
  fieldId: string,
  writer: FieldWriter,
): void {
  handlers.set(`${entityType}:${fieldId}`, writer);
}

export function registerEntityHandler(
  entityType: InlineEntityType,
  writer: FieldWriter,
): void {
  entityHandlers.set(entityType, writer);
}

export async function handleInlineValueUpdate(
  input: InlineUpdateInput,
): Promise<InlineUpdateResult> {
  const specific = handlers.get(`${input.entityType}:${input.fieldId}`);
  if (specific) return specific(input);
  const generic = entityHandlers.get(input.entityType);
  if (generic) return generic(input);
  return { kind: 'unsupported' };
}

function normalizeIfMatch(ifMatch: string | undefined): string | undefined {
  return ifMatch ? ifMatch.replace(/"/g, '') : undefined;
}

// ---------------------------------------------------------------------------
// Wave 0 built-in writers
// ---------------------------------------------------------------------------

function textareaToList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item ?? '').trim()).filter(Boolean);
  }
  if (typeof value !== 'string') return [];
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

// --- sensory_record (check_records) — no version column ---
registerEntityHandler('sensory_record', async (input) => {
  const db = await getDb();
  const patch: Record<string, unknown> = { updatedAt: sql`NOW()` };
  if (input.fieldId === 'problem_description') patch.problemDescription = input.value ?? null;
  else if (input.fieldId === 'sensory_dimension') patch.sensoryDimension = input.value ?? null;
  else if (input.fieldId === 'evaluation_result') patch.evaluationResult = input.value ?? null;
  else return { kind: 'unsupported' };

  const result = await db
    .update(checkRecords)
    .set(patch)
    .where(eq(checkRecords.id, input.entityId))
    .returning({
      id: checkRecords.id,
      taskId: checkRecords.taskId,
      checkItem: checkRecords.checkItem,
      evaluationResult: checkRecords.evaluationResult,
      problemLevel: checkRecords.problemLevel,
      standardCategory: checkRecords.standardCategory,
      problemDescription: checkRecords.problemDescription,
    })
    .execute();
  if (result.length === 0) return { kind: 'not_found' };
  return { kind: 'success', version: Date.now(), appliedValue: input.value };
});

// --- function_effect_record (recipes) — no version column ---
registerEntityHandler('function_effect_record', async (input) => {
  const db = await getDb();
  const patch: Record<string, unknown> = { updatedAt: sql`NOW()` };
  if (input.fieldId === 'effect_description') patch.effectDescription = input.value ?? null;
  else if (input.fieldId === 'effect_status') patch.effectStatus = normalizeEvaluationStatus(input.value);
  else if (input.fieldId === 'name') patch.name = input.value ?? null;
  else return { kind: 'unsupported' };

  const result = await db
    .update(recipes)
    .set(patch)
    .where(eq(recipes.id, input.entityId))
    .returning({
      id: recipes.id,
      taskId: recipes.taskId,
      name: recipes.name,
      recipeType: recipes.recipeType,
      effectStatus: recipes.effectStatus,
    })
    .execute();
  if (result.length === 0) return { kind: 'not_found' };
  return { kind: 'success', version: Date.now(), appliedValue: input.value };
});

// --- comparison_matrix_cell — text + JSONB list fields ---
registerEntityHandler('comparison_matrix_cell', async (input) => {
  const ALLOWED = new Set(['effect_summary', 'process_notes_text', 'problem_points_text']);
  if (!ALLOWED.has(input.fieldId)) return { kind: 'unsupported' };

  const db = await getDb();
  const patch: Record<string, unknown> = { updatedAt: sql`NOW()` };
  if (input.fieldId === 'effect_summary') {
    patch.effectSummary = typeof input.value === 'string' ? input.value : null;
  } else if (input.fieldId === 'process_notes_text') {
    patch.processNotes = textareaToList(input.value);
  } else if (input.fieldId === 'problem_points_text') {
    patch.problemPoints = textareaToList(input.value);
  }

  const result = await db
    .update(comparisonMatrixCells)
    .set(patch)
    .where(eq(comparisonMatrixCells.id, input.entityId))
    .returning({ id: comparisonMatrixCells.id })
    .execute();
  if (result.length === 0) return { kind: 'not_found' };
  return { kind: 'success', version: Date.now(), appliedValue: input.value };
});

// --- report_summary / basic info (experience_tasks) — has version column ---
registerEntityHandler('report_summary', async (input) => {
  const db = await getDb();
  const existing = await db
    .select({ id: experienceTasks.id, version: experienceTasks.version })
    .from(experienceTasks)
    .where(eq(experienceTasks.id, input.entityId))
    .limit(1)
    .execute();
  if (existing.length === 0) return { kind: 'not_found' };

  const current = existing[0];
  const ifMatch = normalizeIfMatch(input.ifMatch);
  if (ifMatch !== undefined && String(current.version) !== ifMatch) {
    return { kind: 'conflict', serverVersion: current.version };
  }

  const patch: Record<string, unknown> = {
    version: (current.version ?? 0) + 1,
    updatedAt: sql`NOW()`,
  };
  if (input.fieldId === 'task_name') patch.taskName = input.value ?? null;
  else if (input.fieldId === 'product_category') patch.productCategory = input.value ?? null;
  else if (input.fieldId === 'product') patch.product = input.value ?? null;
  else if (input.fieldId === 'product_model') patch.productModel = input.value ?? null;
  else if (input.fieldId === 'project_number') patch.projectNumber = input.value ?? null;
  else if (input.fieldId === 'project_type') patch.projectType = input.value ?? null;
  else if (input.fieldId === 'project_phase') patch.projectPhase = input.value ?? null;
  else if (input.fieldId === 'test_date') patch.testDate = input.value ?? null;
  else if (input.fieldId === 'organizer') patch.organizer = input.value ?? null;
  else if (input.fieldId === 'target_user') patch.targetUser = input.value ?? null;
  else if (input.fieldId === 'test_purpose') patch.testPurpose = input.value ?? null;
  else if (input.fieldId === 'test_method') patch.testMethod = input.value ?? null;
  else if (input.fieldId === 'status') patch.status = input.value ?? null;
  else return { kind: 'unsupported' };

  await db
    .update(experienceTasks)
    .set(patch)
    .where(eq(experienceTasks.id, input.entityId))
    .execute();

  return { kind: 'success', version: patch.version as number, appliedValue: input.value };
});

// --- dynamic_matrix_cell_value (V3) — optimistic lock on version ---
registerEntityHandler('dynamic_matrix_cell_value', async (input) => {
  const db = await getDb();
  const existing = await db
    .select({ id: matrixCellValues.id, version: matrixCellValues.version })
    .from(matrixCellValues)
    .where(eq(matrixCellValues.id, input.entityId))
    .limit(1)
    .execute();
  if (existing.length === 0) return { kind: 'not_found' };

  const current = existing[0];
  const ifMatch = normalizeIfMatch(input.ifMatch);
  if (ifMatch !== undefined && String(current.version) !== ifMatch) {
    return { kind: 'conflict', serverVersion: current.version };
  }

  const nextVersion = current.version + 1;
  const value = input.value;
  const isNum = typeof value === 'number';
  const isStr = typeof value === 'string';

  await db
    .update(matrixCellValues)
    .set({
      valueText: isStr ? value : null,
      valueNumber: isNum ? String(value) : null,
      valueState: value === null || value === '' ? 'empty' : 'filled',
      version: nextVersion,
      updatedBy: input.userId,
      updatedAt: sql`NOW()`,
    })
    .where(eq(matrixCellValues.id, input.entityId))
    .execute();

  return { kind: 'success', version: nextVersion, appliedValue: value };
});

// --- dynamic_matrix_hierarchy_node (row/column headers) ---
registerEntityHandler('dynamic_matrix_hierarchy_node', async (input) => {
  if (input.fieldId !== 'node_label') return { kind: 'unsupported' };
  return updateSimpleRow({
    table: matrixHierarchyNodes,
    id: input.entityId,
    column: matrixHierarchyNodes.nodeLabel,
    value: input.value,
  });
});

registerEntityHandler('dynamic_matrix_column_definition', async (input) => {
  if (input.fieldId !== 'column_label') return { kind: 'unsupported' };
  return updateSimpleRow({
    table: matrixColumnDefinitions,
    id: input.entityId,
    column: matrixColumnDefinitions.columnLabel,
    value: input.value,
  });
});

registerEntityHandler('dynamic_matrix_narrative_block', async (input) => {
  if (input.fieldId !== 'content') return { kind: 'unsupported' };
  return updateSimpleRow({
    table: matrixNarrativeBlocks,
    id: input.entityId,
    column: matrixNarrativeBlocks.content,
    value: input.value,
  });
});

registerEntityHandler('matrix_issue_point', async (input) => {
  if (input.fieldId !== 'issue_text') return { kind: 'unsupported' };
  return updateSimpleRow({
    table: matrixIssuePoints,
    id: input.entityId,
    column: matrixIssuePoints.issueText,
    value: input.value,
  });
});

// ---------------------------------------------------------------------------
// Shared writer helpers
// ---------------------------------------------------------------------------

/**
 * Update a single column on a table without optimistic locking.
 */
async function updateSimpleRow(opts: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  table: any;
  id: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  column: any;
  value: unknown;
}): Promise<InlineUpdateResult> {
  const db = await getDb();
  const { table, id, column, value } = opts;

  // Resolve the JS property name used by Drizzle `.set()` (camelCase),
  // not the SQL column name (snake_case).
  const fieldKey =
    (typeof column.key === 'string' && column.key) ||
    Object.keys(table).find((key) => table[key] === column);
  if (!fieldKey) return { kind: 'unsupported' };

  const result = await db
    .update(table)
    .set({ [fieldKey]: value ?? null, updatedAt: sql`NOW()` })
    .where(eq(table.id, id))
    .returning({ id: table.id })
    .execute();
  if (result.length === 0) return { kind: 'not_found' };
  return { kind: 'success', version: Date.now(), appliedValue: value };
}
