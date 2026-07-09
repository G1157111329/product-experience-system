import type {
  MatrixMetricReadValue,
  MatrixReadProjection,
  MatrixReadRow,
} from './projection';
import type {
  MatrixFieldDefinition,
  MatrixFieldValue,
  MatrixReadProjectionV2,
} from './task-matrix-types';
import type { DimensionBinding, FormulaDefinition, ValueKind } from './types';

type ReportMatrixProjection = MatrixReadProjection & {
  comparabilityStatus?: string | null;
  matrixSchemaVersionId?: string | null;
};

function asNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function asText(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function mediaUrlOf(material: Record<string, unknown>): string {
  return asText(material.fileUrl)
    ?? asText(material.file_url)
    ?? asText(material.filePath)
    ?? asText(material.file_path)
    ?? '';
}

function mediaNameOf(material: Record<string, unknown>): string {
  return asText(material.fileName)
    ?? asText(material.file_name)
    ?? asText(material.id)
    ?? '数据矩阵证据';
}

function mediaTypeOf(material: Record<string, unknown>): string {
  return asText(material.materialType)
    ?? asText(material.material_type)
    ?? 'image';
}

function mediaItemsOf(materials: Array<Record<string, unknown>> | undefined) {
  return (materials || [])
    .map((material) => ({
      id: asText(material.id) ?? mediaUrlOf(material),
      name: mediaNameOf(material),
      type: mediaTypeOf(material),
      url: mediaUrlOf(material),
      role: asText(material.mediaRole) ?? asText(material.media_role) ?? 'data_matrix_evidence',
      owner: '数据矩阵',
    }))
    .filter((item) => item.id && item.url);
}

function fieldValueKind(field: MatrixFieldDefinition): ValueKind {
  if (field.dataType === 'duration' || field.dataType === 'calculated_duration') return 'duration';
  if (field.dataType === 'single_select' || field.dataType === 'multi_select') return 'enum';
  if (field.dataType === 'boolean') return 'boolean';
  if (
    field.dataType === 'number' ||
    field.dataType === 'percentage' ||
    field.dataType === 'calculated_number' ||
    field.dataType === 'calculated_percentage'
  ) {
    return 'number';
  }
  return 'text';
}

function metricState(value: MatrixFieldValue | undefined): MatrixMetricReadValue['state'] {
  if (!value) return 'missing';
  if (value.valueState === 'filled') return 'valid';
  if (value.valueState === 'calculation_failed') return 'calculation_failed';
  if (value.valueState === 'not_applicable' || value.valueState === 'not_tested') return 'not_applicable';
  if (value.valueState === 'pending_input') return 'pending';
  return 'missing';
}

function formatMetric(value: MatrixFieldValue | undefined, field: MatrixFieldDefinition): string | undefined {
  if (!value) return undefined;
  const numericValue = asNumber(value.numericValue);
  if (numericValue !== undefined) {
    const decimalPlaces = Number(field.decimalPlaces ?? 1);
    const formatted = Number.isFinite(decimalPlaces) ? numericValue.toFixed(decimalPlaces) : String(numericValue);
    return field.unitText ? `${formatted} ${field.unitText}` : formatted;
  }
  const durationMs = asNumber(value.durationMs);
  if (durationMs !== undefined) {
    const totalSeconds = Math.floor(durationMs / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }
  return asText(value.textValue) ?? asText(value.enumValue);
}

function metricValue(value: MatrixFieldValue | undefined, field: MatrixFieldDefinition): MatrixMetricReadValue {
  const numericValue = asNumber(value?.numericValue);
  const durationMs = asNumber(value?.durationMs);
  const textValue = asText(value?.textValue) ?? asText(value?.enumValue);
  return {
    state: metricState(value),
    ...(numericValue !== undefined ? { value: numericValue } : {}),
    ...(durationMs !== undefined ? { durationMs } : {}),
    ...(textValue ? { text: textValue } : {}),
    ...(field.unitText ? { unit: field.unitText } : {}),
    ...(formatMetric(value, field) ? { display: formatMetric(value, field) } : {}),
    ...(value?.formulaVersion ? { formulaVersion: value.formulaVersion } : {}),
    ...(value?.errorCode ? { errorCode: value.errorCode } : {}),
  };
}

function fieldDimensions(fields: MatrixFieldDefinition[]): DimensionBinding[] {
  return fields
    .filter((field) => field.showInReport !== false && field.reportPriority !== 'hidden')
    .map((field, index) => ({
      dimensionKey: field.id,
      displayName: field.label,
      columnGroup: field.fieldKind === 'formula' ? 'calculated' : 'observed',
      valueKind: fieldValueKind(field),
      unitCode: field.unitText || undefined,
      required: field.requiredMode === 'required',
      editable: field.fieldKind !== 'formula',
      sortOrder: Number(field.sortOrder ?? index),
      displayFormat: { decimals: field.decimalPlaces ?? undefined },
      validation: {
        min: asNumber(field.minValue),
        max: asNumber(field.maxValue),
        enumValues: Array.isArray(field.enumOptions) ? field.enumOptions : undefined,
      },
    }));
}

function formulaDefinitions(fields: MatrixFieldDefinition[]): FormulaDefinition[] {
  return fields
    .filter((field) => field.fieldKind === 'formula')
    .map((field) => ({
      outputDimensionKey: field.id,
      formulaDsl: field.label,
      scope: 'row',
      formulaVersion: 'v1',
    }));
}

function textFromFields(
  values: Record<string, MatrixFieldValue | undefined>,
  fields: MatrixFieldDefinition[],
): string[] {
  return fields
    .map((field) => formatMetric(values[field.id], field))
    .filter((value): value is string => Boolean(value));
}

export function adaptTaskMatrixProjectionForReport(
  source: MatrixReadProjectionV2,
): ReportMatrixProjection {
  const fields = source.designVersion.sections
    .flatMap((section) => section.fields)
    .filter((field) => !field.isArchived)
    .sort((left, right) => Number(left.sortOrder ?? 0) - Number(right.sortOrder ?? 0));

  const evidenceFields = fields.filter((field) => field.fieldKind === 'evidence_slot');
  const issueFields = fields.filter((field) => field.fieldKind === 'issue_slot');
  const resultStatusField = fields.find((field) => field.isResultStatusField);
  const dimensions = fieldDimensions(fields);

  const groups = source.groups.map((group) => ({
    id: group.id,
    label: group.groupLabel,
    conditionSummary: group.description ?? undefined,
    rows: group.rows.map((row) => {
      const rowEvidenceMedia = mediaItemsOf(row.evidenceMaterials);
      const metrics = Object.fromEntries(
        dimensions.map((dimension) => {
          const field = fields.find((item) => item.id === dimension.dimensionKey);
          return [dimension.dimensionKey, field ? metricValue(row.values[field.id], field) : { state: 'missing' }];
        }),
      ) as MatrixReadRow['metrics'];
      const issueTexts = textFromFields(row.values, issueFields);
      const evidenceTexts = textFromFields(row.values, evidenceFields);
      const resultStatus = resultStatusField ? formatMetric(row.values[resultStatusField.id], resultStatusField) : undefined;
      return {
        id: row.id,
        version: row.version,
        subject: { key: row.id, label: row.rowLabel },
        slots: {
          result: {
            status: resultStatus ?? row.completionStatus,
            summary: issueTexts[0] ?? undefined,
          },
          process: {
            note: evidenceTexts.join('；') || undefined,
          },
          issues: {
            count: issueTexts.length,
            severitySummary: issueTexts,
          },
        },
        metrics,
        evidence: {
          primaryCount: Math.max(evidenceTexts.length, rowEvidenceMedia.length),
          previewIds: rowEvidenceMedia.map((item) => item.id),
          media: rowEvidenceMedia,
        },
      } satisfies MatrixReadRow;
    }),
  }));

  return {
    matrixId: source.matrix.id,
    taskId: source.matrix.taskId,
    schema: {
      key: source.matrix.id,
      version: source.designVersion.version.versionNo ?? source.matrix.version,
      name: source.matrix.name,
      dimensions,
      formulas: formulaDefinitions(fields),
      resultStatusOptions: resultStatusField && Array.isArray(resultStatusField.enumOptions)
        ? resultStatusField.enumOptions.map((option) => ({ value: option, label: option }))
        : undefined,
    },
    permissions: {
      canEditRows: false,
      canEditObservedMetrics: false,
      canEditFormula: false,
    },
    viewport: {
      totalGroups: groups.length,
      totalRows: groups.reduce((total, group) => total + group.rows.length, 0),
    },
    groups,
    calculation: {
      status: source.summary.anomalousRows > 0 ? 'partial' : 'succeeded',
    },
    version: source.matrix.version,
    comparabilityStatus: source.matrix.comparabilityStatus,
    matrixSchemaVersionId: source.matrix.currentDesignVersionId,
  };
}
