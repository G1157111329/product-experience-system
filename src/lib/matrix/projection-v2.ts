/**
 * Read projection for task matrix model (V2).
 * PRD V3.1 §5.4, §8.3–8.5, §11.3.
 *
 * Produces MatrixReadProjectionV2 with groups, rows, values,
 * evidence counts, issue counts, and summary statistics.
 */

import { eq, and, asc, inArray } from 'drizzle-orm';
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
  materials,
} from '@/storage/database/shared/schema';
import type {
  TaskMatrix,
  MatrixDesignVersion,
  MatrixSection,
  MatrixFieldDefinition,
  MatrixGroup,
  MatrixRow,
  MatrixFieldValue,
  MatrixNarrative,
  SectionWithFields,
  DesignVersionProjection,
  GroupWithRows,
  MatrixRowProjection,
  MatrixReadProjectionV2,
  MatrixSummary,
} from './task-matrix-types';

// ---------------------------------------------------------------------------
// Full read projection
// ---------------------------------------------------------------------------

export async function getMatrixReadProjection(matrixId: string): Promise<MatrixReadProjectionV2 | null> {
  const db = await getDb();

  // Get matrix
  const matrixRows_data = await db
    .select()
    .from(taskMatrices)
    .where(eq(taskMatrices.id, matrixId))
    .limit(1);

  if (matrixRows_data.length === 0) return null;
  const matrix = matrixRows_data[0] as unknown as TaskMatrix;

  // Get design version
  let designVersion: DesignVersionProjection | null = null;
  if (matrix.currentDesignVersionId) {
    designVersion = await getDesignVersionProjection(matrix.currentDesignVersionId);
  }

  // Get groups with rows
  const groups = await getGroupsWithRows(matrixId, designVersion);

  // Get matrix-level narratives
  const narratives = await getNarrativesForScope(matrixId);

  // Compute summary
  const summary = computeSummary(groups);

  return {
    matrix,
    designVersion: designVersion ?? {
      version: {} as MatrixDesignVersion,
      sections: [],
      narrativeSections: [],
    },
    groups,
    narratives,
    summary,
  };
}

async function getDesignVersionProjection(versionId: string): Promise<DesignVersionProjection> {
  const db = await getDb();

  const versionRows = await db
    .select()
    .from(matrixDesignVersions)
    .where(eq(matrixDesignVersions.id, versionId))
    .limit(1);

  const version = (versionRows[0] ?? {}) as unknown as MatrixDesignVersion;

  const sectionRows = await db
    .select()
    .from(matrixSections)
    .where(eq(matrixSections.designVersionId, versionId))
    .orderBy(asc(matrixSections.sortOrder));

  const sections: SectionWithFields[] = [];
  let resultStatusFieldId: string | undefined;
  const narrativeSections: MatrixSection[] = [];

  for (const sec of sectionRows) {
    const section = sec as unknown as MatrixSection;

    if (section.scope === 'matrix') {
      narrativeSections.push(section);
      continue;
    }

    const fieldRows = await db
      .select()
      .from(matrixFieldDefinitions)
      .where(and(
        eq(matrixFieldDefinitions.sectionId, section.id),
        eq(matrixFieldDefinitions.isArchived, false),
      ))
      .orderBy(asc(matrixFieldDefinitions.sortOrder));

    const fields = fieldRows as unknown as MatrixFieldDefinition[];

    // Find result status field
    for (const f of fields) {
      if (f.isResultStatusField) {
        resultStatusFieldId = f.id;
      }
    }

    sections.push({
      ...section,
      fields,
    });
  }

  return {
    version,
    sections,
    resultStatusFieldId,
    narrativeSections,
  };
}

async function getGroupsWithRows(
  matrixId: string,
  designVersion: DesignVersionProjection | null,
): Promise<GroupWithRows[]> {
  const db = await getDb();

  const groupRows = await db
    .select()
    .from(matrixGroups)
    .where(and(
      eq(matrixGroups.matrixId, matrixId),
      eq(matrixGroups.isArchived, false),
    ))
    .orderBy(asc(matrixGroups.sortOrder));

  const result: GroupWithRows[] = [];

  // Collect all row fields for primary field identification
  const allFields: MatrixFieldDefinition[] = [];
  if (designVersion) {
    for (const section of designVersion.sections) {
      for (const f of section.fields) {
        if (f.scope === 'row') {
          allFields.push(f);
        }
      }
    }
  }

  const primaryFields = allFields
    .filter((f) => f.reportPriority === 'primary' || f.isResultStatusField)
    .slice(0, 3);

  for (const gr of groupRows) {
    const group = gr as unknown as MatrixGroup;

    const rowData = await db
      .select()
      .from(matrixRows)
      .where(and(
        eq(matrixRows.groupId, group.id),
        eq(matrixRows.isArchived, false),
      ))
      .orderBy(asc(matrixRows.sortOrder));

    const rowIds = rowData.map((row) => String(row.id));
    const materialRows = rowIds.length > 0
      ? await db
        .select()
        .from(materials)
        .where(inArray(materials.comparisonCellId, rowIds))
        .orderBy(asc(materials.mediaDisplayOrder), asc(materials.createdAt))
      : [];
    const materialsByRowId = new Map<string, Array<Record<string, unknown>>>();
    for (const material of materialRows) {
      const rowId = String(material.comparisonCellId || '');
      if (!rowId) continue;
      const bucket = materialsByRowId.get(rowId) || [];
      bucket.push(material as unknown as Record<string, unknown>);
      materialsByRowId.set(rowId, bucket);
    }

    const rows: MatrixRowProjection[] = [];

    for (const rr of rowData) {
      const row = rr as unknown as MatrixRow;

      const valueRows = await db
        .select()
        .from(matrixFieldValues)
        .where(eq(matrixFieldValues.rowId, row.id));

      const values = valueRows as unknown as MatrixFieldValue[];
      const valueMap: Record<string, MatrixFieldValue | undefined> = {};
      for (const v of values) {
        valueMap[v.fieldDefinitionId] = v;
      }

      const hasCalculationFailures = values.some((v) => v.valueState === 'calculation_failed');
      const hasMissingRequired = allFields
        .filter((f) => f.requiredMode === 'required')
        .some((f) => !isFieldValueFilled(valueMap[f.id]));

      // Build primary fields for mobile card
      const primaryFieldDisplays = primaryFields.map((pf) => {
        const val = valueMap[pf.id];
        return {
          label: pf.label,
          displayValue: formatFieldDisplay(val, pf),
        };
      }).filter((p) => p.displayValue !== '—');

      const evidenceCounts: Record<string, number> = {};
      const issueCounts: Record<string, number> = {};
      for (const f of allFields) {
        if (f.fieldKind === 'evidence_slot') {
          evidenceCounts[f.id] = isFieldValueFilled(valueMap[f.id]) ? 1 : 0;
        }
        if (f.fieldKind === 'issue_slot') {
          issueCounts[f.id] = isFieldValueFilled(valueMap[f.id]) ? 1 : 0;
        }
      }

      rows.push({
        ...row,
        values: valueMap,
        primaryFields: primaryFieldDisplays,
        evidenceCounts,
        evidenceMaterials: materialsByRowId.get(row.id) || [],
        issueCounts,
        hasCalculationFailures,
        hasMissingRequired,
      });
    }

    // Group narratives
    const narratives = await getNarrativesForScope(group.id);

    result.push({
      ...group,
      rows,
      narratives,
    });
  }

  return result;
}

async function getNarrativesForScope(scopeId: string): Promise<MatrixNarrative[]> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(matrixNarratives)
    .where(eq(matrixNarratives.matrixId!, scopeId));
  return rows as unknown as MatrixNarrative[];
}

function computeSummary(groups: GroupWithRows[]): MatrixSummary {
  let totalRows = 0;
  let completedRows = 0;
  let anomalousRows = 0;
  let pendingIssueRows = 0;
  let totalIssues = 0;
  let totalEvidence = 0;

  for (const g of groups) {
    for (const r of g.rows) {
      totalRows++;
      if (r.completionStatus === 'completed') completedRows++;
      if (r.hasCalculationFailures || r.hasMissingRequired) anomalousRows++;
      // Count issues (simplified)
      totalIssues += Object.values(r.issueCounts).reduce((a, b) => a + b, 0);
      if (Object.values(r.issueCounts).some((c) => c > 0) && r.completionStatus !== 'completed') {
        pendingIssueRows++;
      }
      totalEvidence += Object.values(r.evidenceCounts).reduce((a, b) => a + b, 0);
    }
  }

  return {
    totalRows,
    completedRows,
    anomalousRows,
    pendingIssueRows,
    totalIssues,
    totalEvidence,
  };
}

function formatFieldDisplay(
  value: MatrixFieldValue | undefined,
  field: MatrixFieldDefinition,
): string {
  if (!value) return '—';
  if (value.valueState === 'missing') return '—';
  if (value.valueState === 'not_tested') return '未测试';
  if (value.valueState === 'not_applicable') return '不适用';
  if (value.valueState === 'pending_input') return '待补充';
  if (value.valueState === 'calculation_failed') return value.errorCode ?? '计算失败';

  if (value.numericValue != null) {
    const n = Number(value.numericValue);
    const decimals = field.decimalPlaces ?? 1;
    const formatted = n.toFixed(decimals);
    return field.unitText ? `${formatted} ${field.unitText}` : formatted;
  }
  if (value.durationMs != null) {
    const totalSeconds = Math.floor(value.durationMs / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }
  if (value.textValue != null) return value.textValue;
  if (value.booleanValue != null) return value.booleanValue ? '是' : '否';
  if (value.enumValue != null) return value.enumValue;

  return '—';
}

export function formatMetricDisplayV2(
  value: MatrixFieldValue | undefined,
  fieldDef: MatrixFieldDefinition | undefined,
): string {
  if (!fieldDef) return '—';
  return formatFieldDisplay(value, fieldDef);
}

function isFieldValueFilled(value: MatrixFieldValue | undefined): boolean {
  if (!value) return false;
  if (value.valueState === 'missing' || value.valueState === 'pending_input') return false;
  if (value.valueState === 'not_tested' || value.valueState === 'not_applicable') return false;
  return value.numericValue != null
    || value.durationMs != null
    || value.booleanValue != null
    || textHasValue(value.textValue)
    || textHasValue(value.enumValue)
    || value.valueState === 'filled';
}

function textHasValue(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}
