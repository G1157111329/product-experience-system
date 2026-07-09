/**
 * Matrix design service — CRUD for task_matrices, design versions,
 * sections, and field definitions (PRD V3.1 §3.4–3.7, §4.2–4.3).
 *
 * This is the authoritative service for creating and managing
 * user-designed task matrices.
 */

import { eq, and, asc, desc, sql, inArray } from 'drizzle-orm';
import { getDb } from '@/storage/database/pg-db';
import {
  taskMatrices,
  matrixDesignVersions,
  matrixSections,
  matrixFieldDefinitions,
  matrixGroups,
  matrixRows,
  matrixFieldValues,
  matrixNarratives,
  matrixFormulaDefinitions,
} from '@/storage/database/shared/schema';
import { compileFormula, type CompiledFormula } from './formula-engine';
import type {
  TaskMatrix,
  MatrixDesignVersion,
  MatrixSection,
  MatrixFieldDefinition,
  CreateMatrixRequest,
  CreateDesignVersionRequest,
  MatrixStatus,
  DesignChangeType,
  MatrixFeatureFlags,
} from './task-matrix-types';
import { createHash } from 'crypto';

// ---------------------------------------------------------------------------
// Matrix CRUD
// ---------------------------------------------------------------------------

export async function getTaskMatrices(taskId: string, userId: string): Promise<TaskMatrix[]> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(taskMatrices)
    .where(eq(taskMatrices.taskId, taskId))
    .orderBy(desc(taskMatrices.createdAt));
  return rows as unknown as TaskMatrix[];
}

export async function getMatrixById(matrixId: string): Promise<TaskMatrix | null> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(taskMatrices)
    .where(eq(taskMatrices.id, matrixId))
    .limit(1);
  return (rows[0] as unknown as TaskMatrix) ?? null;
}

export async function createMatrix(
  taskId: string,
  userId: string,
  req: CreateMatrixRequest,
): Promise<TaskMatrix> {
  const db = await getDb();

  // Check for duplicate name within task
  const existing = await db
    .select({ id: taskMatrices.id })
    .from(taskMatrices)
    .where(and(eq(taskMatrices.taskId, taskId), eq(taskMatrices.name, req.name)))
    .limit(1);

  if (existing.length > 0) {
    throw Object.assign(new Error('MATRIX_DESIGN_002'), { code: 'DESIGN_002' });
  }

  const [row] = await db
    .insert(taskMatrices)
    .values({
      taskId,
      name: req.name,
      description: req.description ?? null,
      status: 'designing',
      comparabilityStatus: 'not_applicable',
      createdBy: userId,
    })
    .returning();

  return row as unknown as TaskMatrix;
}

export async function updateMatrixMeta(
  matrixId: string,
  updates: {
    name?: string;
    description?: string;
    comparabilityStatus?: string;
    comparabilityStatement?: string;
    expectedVersion?: number;
  },
): Promise<TaskMatrix> {
  const db = await getDb();
  const whereClause = updates.expectedVersion != null
    ? and(eq(taskMatrices.id, matrixId), eq(taskMatrices.version, updates.expectedVersion))
    : eq(taskMatrices.id, matrixId);

  const [row] = await db
    .update(taskMatrices)
    .set({
      name: updates.name,
      description: updates.description,
      comparabilityStatus: updates.comparabilityStatus,
      comparabilityStatement: updates.comparabilityStatement,
      updatedAt: new Date().toISOString(),
      version: sql`${taskMatrices.version} + 1`,
    })
    .where(whereClause)
    .returning();

  if (!row) {
    throw Object.assign(new Error('SAVE_409'), { code: 'SAVE_409' });
  }

  return row as unknown as TaskMatrix;
}

export async function updateMatrixStatus(
  matrixId: string,
  status: MatrixStatus,
): Promise<void> {
  const db = await getDb();
  await db
    .update(taskMatrices)
    .set({ status, updatedAt: new Date().toISOString() })
    .where(eq(taskMatrices.id, matrixId));
}

// ---------------------------------------------------------------------------
// Design Version CRUD
// ---------------------------------------------------------------------------

export async function getLatestDesignVersion(matrixId: string): Promise<MatrixDesignVersion | null> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(matrixDesignVersions)
    .where(eq(matrixDesignVersions.matrixId, matrixId))
    .orderBy(desc(matrixDesignVersions.versionNo))
    .limit(1);
  return (rows[0] as unknown as MatrixDesignVersion) ?? null;
}

export async function getDesignVersion(versionId: string): Promise<MatrixDesignVersion | null> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(matrixDesignVersions)
    .where(eq(matrixDesignVersions.id, versionId))
    .limit(1);
  return (rows[0] as unknown as MatrixDesignVersion) ?? null;
}

export async function createDesignVersion(
  matrixId: string,
  userId: string,
  req: CreateDesignVersionRequest,
): Promise<{ version: MatrixDesignVersion; sections: MatrixSection[]; fields: MatrixFieldDefinition[]; formulas: Array<{ fieldId: string; formulaDsl: string; compiledAst: unknown }> }> {
  const db = await getDb();

  // Get current max version number
  const latest = await getLatestDesignVersion(matrixId);
  const versionNo = (latest?.versionNo ?? 0) + 1;

  // Compute design hash from the request structure
  const designHash = computeDesignHash(req);

  const changeType: DesignChangeType = req.changeType ?? (versionNo === 1 ? 'initial' : 'safe_addition');

  // Insert design version
  const [version] = await db
    .insert(matrixDesignVersions)
    .values({
      matrixId,
      versionNo,
      status: 'draft',
      designHash,
      createdBy: userId,
      changeType,
      changeReason: req.changeReason ?? null,
    })
    .returning();

  const sectionResult = await insertSectionsAndFields(version.id, req);

  return {
    version: version as unknown as MatrixDesignVersion,
    sections: sectionResult.sections,
    fields: sectionResult.fields,
    formulas: sectionResult.formulas,
  };
}

export async function updateDesignVersionDraft(
  versionId: string,
  userId: string,
  req: CreateDesignVersionRequest,
): Promise<{ version: MatrixDesignVersion; sections: MatrixSection[]; fields: MatrixFieldDefinition[]; formulas: Array<{ fieldId: string; formulaDsl: string; compiledAst: unknown }> }> {
  const db = await getDb();

  const version = await getDesignVersion(versionId);
  if (!version) {
    throw Object.assign(new Error('MATRIX_DESIGN_404'), { code: 'DESIGN_404' });
  }
  if (version.status !== 'draft') {
    throw Object.assign(new Error('MATRIX_DESIGN_010: 已确认版本不可修改'), { code: 'DESIGN_010' });
  }
  if (!Array.isArray(req.sections) || req.sections.length === 0) {
    throw Object.assign(new Error('MATRIX_DESIGN_003: 请至少添加一个分区'), { code: 'DESIGN_003' });
  }

  const existingFields = await db
    .select({ id: matrixFieldDefinitions.id })
    .from(matrixFieldDefinitions)
    .where(eq(matrixFieldDefinitions.designVersionId, versionId));

  const existingFieldIds = existingFields.map((row) => row.id);
  if (existingFieldIds.length > 0) {
    await db
      .delete(matrixFormulaDefinitions)
      .where(inArray(matrixFormulaDefinitions.fieldDefinitionId, existingFieldIds));
  }

  await db
    .delete(matrixSections)
    .where(eq(matrixSections.designVersionId, versionId));

  const sectionResult = await insertSectionsAndFields(versionId, req);
  const designHash = computeDesignHash(req);

  const [updatedVersion] = await db
    .update(matrixDesignVersions)
    .set({
      designHash,
      changeType: req.changeType ?? version.changeType,
      changeReason: req.changeReason ?? version.changeReason,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(matrixDesignVersions.id, versionId))
    .returning();

  return {
    version: (updatedVersion as unknown as MatrixDesignVersion) ?? version,
    sections: sectionResult.sections,
    fields: sectionResult.fields,
    formulas: sectionResult.formulas,
  };
}

export async function validateDesignVersionDraft(versionId: string): Promise<{
  passed: boolean;
  errors: Array<{ code: string; message: string }>;
  warnings: Array<{ code: string; message: string }>;
}> {
  const db = await getDb();
  const errors: Array<{ code: string; message: string }> = [];
  const warnings: Array<{ code: string; message: string }> = [];

  const version = await getDesignVersion(versionId);
  if (!version) {
    return {
      passed: false,
      errors: [{ code: 'DESIGN_404', message: '设计版本不存在' }],
      warnings,
    };
  }

  const sections = await getSectionsByDesignVersion(versionId);
  if (sections.length === 0) {
    errors.push({ code: 'DESIGN_003', message: '请至少添加一个分区' });
  }

  const fields = await getFieldsByDesignVersion(versionId);
  const fieldsBySection = new Map<string, MatrixFieldDefinition[]>();
  for (const field of fields) {
    const list = fieldsBySection.get(field.sectionId) ?? [];
    list.push(field);
    fieldsBySection.set(field.sectionId, list);
  }

  const rowScopedFields = fields.filter((field) => field.scope === 'row' && !field.isArchived);
  if (rowScopedFields.length === 0) {
    errors.push({ code: 'DESIGN_005', message: '至少需要一个行级字段' });
  }

  for (const section of sections) {
    const sectionFields = fieldsBySection.get(section.id) ?? [];
    if (section.scope !== 'matrix' && sectionFields.length === 0) {
      errors.push({ code: 'DESIGN_004', message: `分区“${section.name}”未添加字段` });
      continue;
    }

    const labelSet = new Set<string>();
    for (const field of sectionFields) {
      const normalized = field.label.trim().toLowerCase();
      if (labelSet.has(normalized)) {
        errors.push({ code: 'DESIGN_006', message: `分区“${section.name}”内字段名重复：${field.label}` });
      }
      labelSet.add(normalized);
    }
  }

  const formulaFields = fields.filter((field) => field.fieldKind === 'formula' && !field.isArchived);
  if (formulaFields.length > 0) {
    const formulaRows = await db
      .select({
        fieldDefinitionId: matrixFormulaDefinitions.fieldDefinitionId,
        formulaDsl: matrixFormulaDefinitions.formulaDsl,
      })
      .from(matrixFormulaDefinitions)
      .where(inArray(matrixFormulaDefinitions.fieldDefinitionId, formulaFields.map((field) => field.id)));

    const formulaMap = new Map<string, string>();
    for (const row of formulaRows) {
      if (row.fieldDefinitionId) {
        formulaMap.set(row.fieldDefinitionId, row.formulaDsl);
      }
    }

    for (const field of formulaFields) {
      const dsl = formulaMap.get(field.id);
      if (!dsl) {
        errors.push({ code: 'DESIGN_007', message: `计算字段“${field.label}”缺少公式` });
        continue;
      }
      try {
        compileFormula(dsl);
      } catch (err) {
        errors.push({
          code: 'DESIGN_007',
          message: `计算字段“${field.label}”公式无效: ${(err as Error).message}`,
        });
      }
    }
  }

  if (fields.length > 40) {
    warnings.push({ code: 'DESIGN_W_001', message: '字段数量超过 40，建议拆分为多份矩阵' });
  }

  return {
    passed: errors.length === 0,
    errors,
    warnings,
  };
}

export async function confirmDesignVersion(
  versionId: string,
  userId: string,
): Promise<MatrixDesignVersion> {
  const db = await getDb();

  const version = await getDesignVersion(versionId);
  if (!version) throw Object.assign(new Error('MATRIX_DESIGN_010'), { code: 'DESIGN_010' });
  if (version.status === 'confirmed') {
    throw Object.assign(new Error('MATRIX_DESIGN_010: 设计版本已确认，请创建新版本'), { code: 'DESIGN_010' });
  }

  const [updated] = await db
    .update(matrixDesignVersions)
    .set({
      status: 'confirmed',
      confirmedBy: userId,
      confirmedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
    .where(eq(matrixDesignVersions.id, versionId))
    .returning();

  // Update matrix: set current_design_version_id and active status
  await db
    .update(taskMatrices)
    .set({
      currentDesignVersionId: versionId,
      status: 'active',
      updatedAt: new Date().toISOString(),
    })
    .where(eq(taskMatrices.id, version.matrixId));

  return updated as unknown as MatrixDesignVersion;
}

// ---------------------------------------------------------------------------
// Section & Field read helpers
// ---------------------------------------------------------------------------

export async function getSectionsByDesignVersion(designVersionId: string): Promise<MatrixSection[]> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(matrixSections)
    .where(eq(matrixSections.designVersionId, designVersionId))
    .orderBy(asc(matrixSections.sortOrder));
  return rows as unknown as MatrixSection[];
}

export async function getFieldsBySection(sectionId: string): Promise<MatrixFieldDefinition[]> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(matrixFieldDefinitions)
    .where(and(
      eq(matrixFieldDefinitions.sectionId, sectionId),
      eq(matrixFieldDefinitions.isArchived, false),
    ))
    .orderBy(asc(matrixFieldDefinitions.sortOrder));
  return rows as unknown as MatrixFieldDefinition[];
}

export async function getFieldsByDesignVersion(designVersionId: string): Promise<MatrixFieldDefinition[]> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(matrixFieldDefinitions)
    .where(and(
      eq(matrixFieldDefinitions.designVersionId, designVersionId),
      eq(matrixFieldDefinitions.isArchived, false),
    ))
    .orderBy(asc(matrixFieldDefinitions.sortOrder));
  return rows as unknown as MatrixFieldDefinition[];
}

// ---------------------------------------------------------------------------
// Feature flags (PRD §16.1)
// ---------------------------------------------------------------------------

export async function getMatrixFeatureFlags(): Promise<MatrixFeatureFlags> {
  try {
    const db = await getDb();
    // Feature flags stored in platform_settings table
    const rows = await db.execute(
      sql`SELECT value FROM platform_settings WHERE key = 'feature_flag_task_matrix' LIMIT 1`,
    );
    if (rows.rows.length > 0 && rows.rows[0].value) {
      // Cast through unknown since drizzle returns raw rows
      const value = rows.rows[0] as unknown as { value: unknown };
      const parsed = typeof value.value === 'string' ? JSON.parse(value.value) : value.value;
      return {
    taskMatrixEnabled: true,
    matrixRuntimeDesignerEnabled: true,
    matrixFormulaEnabled: true,
    matrixMobileEnabled: true,
    matrixBatchPasteEnabled: true,
    matrixReportProjectionEnabled: true,
    matrixStructuralRevisionEnabled: true,
    ...(parsed as Partial<MatrixFeatureFlags>),
  };
    }
  } catch {
    // Fall through to defaults
  }
  // Import DEFAULT_FEATURE_FLAGS at runtime to avoid circular deps
  return {
    taskMatrixEnabled: true,
    matrixRuntimeDesignerEnabled: true,
    matrixFormulaEnabled: true,
    matrixMobileEnabled: true,
    matrixBatchPasteEnabled: true,
    matrixReportProjectionEnabled: true,
    matrixStructuralRevisionEnabled: true,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function computeDesignHash(req: CreateDesignVersionRequest): string {
  const hash = createHash('sha256');
  const normalized = JSON.stringify({
    axes: req.axes,
    sections: req.sections.map((s) => ({
      name: s.name,
      scope: s.scope,
      fields: s.fields.map((f) => ({
        label: f.label,
        fieldKind: f.fieldKind,
        dataType: f.dataType,
      })),
    })),
  });
  hash.update(normalized);
  return hash.digest('hex');
}

async function insertSectionsAndFields(
  designVersionId: string,
  req: CreateDesignVersionRequest,
): Promise<{ sections: MatrixSection[]; fields: MatrixFieldDefinition[]; formulas: Array<{ fieldId: string; formulaDsl: string; compiledAst: unknown }> }> {
  const db = await getDb();
  const sections: MatrixSection[] = [];
  const allFields: MatrixFieldDefinition[] = [];
  const formulaEntries: Array<{ fieldId: string; formulaDsl: string; compiledAst: unknown }> = [];

  for (const sec of req.sections) {
    const [section] = await db
      .insert(matrixSections)
      .values({
        designVersionId,
        name: sec.name,
        scope: sec.scope,
        description: sec.description ?? null,
        sortOrder: sec.sortOrder,
        isCollapsible: sec.isCollapsible ?? true,
        defaultExpanded: sec.defaultExpanded ?? true,
      })
      .returning();
    sections.push(section as unknown as MatrixSection);

    for (const fld of sec.fields) {
      const fieldScope = fld.scope ?? sec.scope;

      const [field] = await db
        .insert(matrixFieldDefinitions)
        .values({
          designVersionId,
          sectionId: section.id,
          scope: fieldScope,
          label: fld.label,
          fieldKind: fld.fieldKind,
          dataType: fld.dataType,
          requiredMode: fld.requiredMode ?? 'optional',
          unitText: fld.unitText ?? null,
          displayFormat: fld.displayFormat ?? 'plain_number',
          decimalPlaces: fld.decimalPlaces ?? 1,
          minValue: fld.minValue != null ? String(fld.minValue) : null,
          maxValue: fld.maxValue != null ? String(fld.maxValue) : null,
          enumOptions: fld.enumOptions ? JSON.stringify(fld.enumOptions) : null,
          isResultStatusField: fld.isResultStatusField ?? false,
          resultStatusMapping: fld.resultStatusMapping ? JSON.stringify(fld.resultStatusMapping) : null,
          requiredCondition: fld.requiredCondition ? JSON.stringify(fld.requiredCondition) : null,
          maxMediaCount: fld.maxMediaCount ?? 10,
          allowedMediaTypes: fld.allowedMediaTypes ? JSON.stringify(fld.allowedMediaTypes) : null,
          isCriticalEvidence: fld.isCriticalEvidence ?? false,
          uploadInstructions: fld.uploadInstructions ?? null,
          showInDesktopGrid: fld.showInDesktopGrid ?? true,
          showInMobileCard: fld.showInMobileCard ?? false,
          showInReport: fld.showInReport ?? true,
          reportPriority: fld.reportPriority ?? 'secondary',
          sortOrder: fld.sortOrder,
        })
        .returning();

      const fieldDef = field as unknown as MatrixFieldDefinition;
      allFields.push(fieldDef);

      if (fld.fieldKind === 'formula' && fld.formulaDsl) {
        try {
          const compiled = compileFormula(fld.formulaDsl);
          formulaEntries.push({
            fieldId: field.id,
            formulaDsl: fld.formulaDsl,
            compiledAst: compiled.ast,
          });

          await db.insert(matrixFormulaDefinitions).values({
            fieldDefinitionId: field.id,
            outputDimensionKey: field.id,
            formulaDsl: fld.formulaDsl,
            compiledAst: JSON.stringify(compiled.ast),
            dependencyJson: JSON.stringify(compiled.dependencies),
            scope: 'row',
            formulaVersion: 'v1',
            status: 'draft',
          });
        } catch (err) {
          throw Object.assign(
            new Error(`DESIGN_007: 字段 "${fld.label}" 的公式无法解析: ${(err as Error).message}`),
            { code: 'DESIGN_007' },
          );
        }
      }
    }
  }

  return {
    sections,
    fields: allFields,
    formulas: formulaEntries,
  };
}