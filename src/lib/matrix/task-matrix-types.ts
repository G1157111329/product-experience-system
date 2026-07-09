/**
 * Type definitions for the PRD V3.1 task-matrix user-designed model.
 *
 * Aligned with PRD §3.4–3.8, 4.2, 5.3, 6.2, 7.1–7.3, 10.1–10.3, 14.1–14.4.
 *
 * These types describe the runtime task-matrix instance that users design
 * per-task, distinct from the schema-registry model (matrix_schemas etc.)
 * which is reserved for Wave 2 reusable-design-library.
 */

// ---------------------------------------------------------------------------
// Enums — matching CHECK constraints in migration 0003
// ---------------------------------------------------------------------------

export type MatrixStatus =
  | 'designing'
  | 'active'
  | 'review_locked'
  | 'completed'
  | 'archived';

export type ComparabilityStatus =
  | 'not_applicable'
  | 'pending'
  | 'comparable'
  | 'partially_comparable'
  | 'not_comparable';

export type DesignVersionStatus = 'draft' | 'confirmed' | 'superseded' | 'retired';

export type DesignChangeType = 'initial' | 'safe_addition' | 'safe_presentation_change';

export type SectionScope = 'row' | 'group' | 'matrix';

export type FieldKind = 'manual_value' | 'formula' | 'evidence_slot' | 'issue_slot';

export type FieldDataType =
  | 'short_text'
  | 'long_text'
  | 'number'
  | 'percentage'
  | 'duration'
  | 'single_select'
  | 'multi_select'
  | 'boolean'
  | 'date_time'
  | 'calculated_number'
  | 'calculated_percentage'
  | 'calculated_duration'
  | 'image_slot'
  | 'video_slot'
  | 'file_slot'
  | 'issue_slot';

export type RequiredMode = 'optional' | 'required' | 'required_when_condition_met';

export type DisplayFormat =
  | 'plain_number'
  | 'percentage'
  | 'duration'
  | 'text'
  | 'date_time';

export type ReportPriority = 'primary' | 'secondary' | 'hidden';

export type ValueState =
  | 'missing'
  | 'not_tested'
  | 'not_applicable'
  | 'pending_input'
  | 'filled'
  | 'calculation_failed';

export type CompletionStatus =
  | 'pending'
  | 'in_progress'
  | 'completed'
  | 'not_applicable'
  | 'test_invalid';

export type CalculationMode = 'manual' | 'computed';

// Result status mapping (PRD §5.3.5)
export type ResultStatusMappingValue = 'pass' | 'observe' | 'fail' | 'not_applicable';

export interface ResultStatusMapping {
  [optionValue: string]: ResultStatusMappingValue;
}

// ---------------------------------------------------------------------------
// Core domain types
// ---------------------------------------------------------------------------

export interface TaskMatrix {
  id: string;
  taskId: string;
  name: string;
  description?: string;
  status: MatrixStatus;
  currentDesignVersionId?: string;
  comparabilityStatus: ComparabilityStatus;
  comparabilityStatement?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  version: number;
  archivedAt?: string;
  archivedReason?: string;
}

export interface MatrixDesignVersion {
  id: string;
  matrixId: string;
  versionNo: number;
  status: DesignVersionStatus;
  designHash?: string;
  createdBy?: string;
  confirmedBy?: string;
  confirmedAt?: string;
  changeType: DesignChangeType;
  changeReason?: string;
  createdAt: string;
  updatedAt: string;
}

export interface MatrixSection {
  id: string;
  designVersionId: string;
  name: string;
  scope: SectionScope;
  description?: string;
  sortOrder: number;
  isCollapsible: boolean;
  defaultExpanded: boolean;
  createdAt: string;
}

export interface RequiredCondition {
  dependsOnFieldId: string;
  whenValue: string;
}

export interface MatrixFieldDefinition {
  id: string;
  designVersionId: string;
  sectionId: string;
  scope: SectionScope;
  label: string;
  fieldKind: FieldKind;
  dataType: FieldDataType;
  requiredMode: RequiredMode;
  unitText?: string;
  displayFormat: DisplayFormat;
  decimalPlaces: number;
  minValue?: number;
  maxValue?: number;
  allowNotTested: boolean;
  allowNotApplicable: boolean;
  showInDesktopGrid: boolean;
  showInMobileCard: boolean;
  showInReport: boolean;
  reportPriority: ReportPriority;
  enumOptions?: string[];
  isResultStatusField: boolean;
  resultStatusMapping?: ResultStatusMapping;
  requiredCondition?: RequiredCondition;
  maxMediaCount: number;
  allowedMediaTypes: string[];
  isCriticalEvidence: boolean;
  uploadInstructions?: string;
  sortOrder: number;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MatrixGroup {
  id: string;
  matrixId: string;
  groupLabel: string;
  description?: string;
  sortOrder: number;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MatrixRow {
  id: string;
  groupId: string;
  matrixId: string;
  rowLabel: string;
  description?: string;
  sortOrder: number;
  completionStatus: CompletionStatus;
  testInvalidReason?: string;
  isArchived: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface MatrixFieldValue {
  id: string;
  rowId: string;
  fieldDefinitionId: string;
  valueState: ValueState;
  numericValue?: number;
  textValue?: string;
  durationMs?: number;
  booleanValue?: boolean;
  dateTimeValue?: string;
  enumValue?: string;
  unitCode?: string;
  calculationMode?: CalculationMode;
  formulaDefinitionId?: string;
  formulaVersion?: string;
  sourceCalculationRunId?: string;
  errorCode?: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface MatrixNarrative {
  id: string;
  scope: SectionScope;
  matrixId?: string;
  groupId?: string;
  narrativeKey: string;
  content?: string;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Composite / projection types
// ---------------------------------------------------------------------------

/** A section with its fields — used in design version read projection */
export interface SectionWithFields extends MatrixSection {
  fields: MatrixFieldDefinition[];
}

/** Full design version projection */
export interface DesignVersionProjection {
  version: MatrixDesignVersion;
  sections: SectionWithFields[];
  /** Result status field ID (if configured) */
  resultStatusFieldId?: string;
  /** Narrative sections (scope=matrix or scope=group) */
  narrativeSections: MatrixSection[];
}

/** A group with its rows — used in read projection */
export interface GroupWithRows extends MatrixGroup {
  rows: MatrixRowProjection[];
  /** Group-level narratives */
  narratives: MatrixNarrative[];
}

/** A row with its field values */
export interface MatrixRowProjection extends MatrixRow {
  values: Record<string, MatrixFieldValue | undefined>;
  /** Computed display: key fields for mobile card (PRD §8.4) */
  primaryFields: Array<{ label: string; displayValue: string }>;
  /** Evidence count per slot */
  evidenceCounts: Record<string, number>;
  evidenceMaterials?: Array<Record<string, unknown>>;
  /** Issue count per slot */
  issueCounts: Record<string, number>;
  /** Has any calculation_failed values */
  hasCalculationFailures: boolean;
  /** Has any missing required values */
  hasMissingRequired: boolean;
}

/** Full matrix read projection (PRD §5.4) */
export interface MatrixReadProjectionV2 {
  matrix: TaskMatrix;
  designVersion: DesignVersionProjection;
  groups: GroupWithRows[];
  /** Matrix-level narratives */
  narratives: MatrixNarrative[];
  /** Summary statistics */
  summary: MatrixSummary;
}

export interface MatrixSummary {
  totalRows: number;
  completedRows: number;
  anomalousRows: number;
  pendingIssueRows: number;
  totalIssues: number;
  totalEvidence: number;
}

// ---------------------------------------------------------------------------
// API request/response types
// ---------------------------------------------------------------------------

/** Create matrix payload */
export interface CreateMatrixRequest {
  name: string;
  description?: string;
}

/** Create design version payload — contains full design structure */
export interface CreateDesignVersionRequest {
  axes: {
    groupAxisLabel: string;  // e.g. "食材"
    rowAxisLabel: string;     // e.g. "口径"
  };
  sections: Array<{
    name: string;
    scope: SectionScope;
    description?: string;
    sortOrder: number;
    isCollapsible?: boolean;
    defaultExpanded?: boolean;
    fields: Array<{
      label: string;
      fieldKind: FieldKind;
      dataType: FieldDataType;
      scope?: SectionScope;
      requiredMode?: RequiredMode;
      unitText?: string;
      displayFormat?: DisplayFormat;
      decimalPlaces?: number;
      minValue?: number;
      maxValue?: number;
      enumOptions?: string[];
      isResultStatusField?: boolean;
      resultStatusMapping?: ResultStatusMapping;
      requiredCondition?: RequiredCondition;
      maxMediaCount?: number;
      allowedMediaTypes?: string[];
      isCriticalEvidence?: boolean;
      uploadInstructions?: string;
      showInDesktopGrid?: boolean;
      showInMobileCard?: boolean;
      showInReport?: boolean;
      reportPriority?: ReportPriority;
      sortOrder: number;
      /** For formula fields: DSL expression */
      formulaDsl?: string;
    }>;
  }>;
  /** Change type for this version */
  changeType?: DesignChangeType;
  changeReason?: string;
}

/** Update field value payload (PRD §12.3) */
export interface UpdateFieldValueRequest {
  rowVersion: number;
  valueState?: ValueState;
  numericValue?: number;
  textValue?: string;
  durationMs?: number;
  booleanValue?: boolean;
  dateTimeValue?: string;
  enumValue?: string;
}

/** Field value update response — includes recalculated fields */
export interface UpdateFieldValueResponse {
  traceId: string;
  rowId: string;
  rowVersion: number;
  updatedField: {
    fieldId: string;
    valueState: ValueState;
    value?: number;
    textValue?: string;
    durationMs?: number;
    booleanValue?: boolean;
    enumValue?: string;
  };
  recalculatedFields: Array<{
    fieldId: string;
    valueState: ValueState;
    displayValue?: number;
    errorCode?: string;
    reason?: string;
  }>;
}

/** Validation result (PRD §10) */
export interface ValidationResult {
  passed: boolean;
  blockingItems: ValidationItem[];
  warningItems: ValidationItem[];
}

export interface ValidationItem {
  code: string;
  message: string;
  groupId?: string;
  groupLabel?: string;
  rowId?: string;
  rowLabel?: string;
  fieldId?: string;
  fieldLabel?: string;
  /** Deep-link URL fragment */
  targetUrl?: string;
}

/** Feature flags (PRD §16.1) */
export interface MatrixFeatureFlags {
  taskMatrixEnabled: boolean;
  matrixRuntimeDesignerEnabled: boolean;
  matrixFormulaEnabled: boolean;
  matrixMobileEnabled: boolean;
  matrixBatchPasteEnabled: boolean;
  matrixReportProjectionEnabled: boolean;
  matrixStructuralRevisionEnabled: boolean;
}

export const DEFAULT_FEATURE_FLAGS: MatrixFeatureFlags = {
  taskMatrixEnabled: true,
  matrixRuntimeDesignerEnabled: true,
  matrixFormulaEnabled: true,
  matrixMobileEnabled: true,
  matrixBatchPasteEnabled: true,
  matrixReportProjectionEnabled: true,
  matrixStructuralRevisionEnabled: true,
};

// ---------------------------------------------------------------------------
// Error codes (PRD §14)
// ---------------------------------------------------------------------------

export const MATRIX_ERROR_CODES = {
  // Design errors (§14.1)
  DESIGN_001: '矩阵名称不能为空',
  DESIGN_002: '该任务中已存在同名矩阵',
  DESIGN_003: '请至少添加一个分区',
  DESIGN_004: '分区 "{name}" 中未添加任何字段',
  DESIGN_005: '未指定分组轴或行轴名称',
  DESIGN_006: '同一分区的 "{name}" 字段已存在',
  DESIGN_007: '计算公式不完整或无法解析',
  DESIGN_008: '计算结果字段必须绑定一个计算公式',
  DESIGN_009: '公式存在循环引用或依赖不可用字段',
  DESIGN_010: '当前设计版本已被确认，请创建新版本后再修改',

  // Formula errors (§14.2)
  FORMULA_001: '无法计算：公式引用不存在的字段',
  FORMULA_002: '无法计算：除数不能为0',
  FORMULA_003: '无法计算：输入值超出允许范围',
  FORMULA_004: '公式执行超时',
  FORMULA_005: '公式解析失败，请联系管理员',
  FORMULA_006: '公式版本与当前设计不符，请刷新后重试',

  // Data / concurrency / permission errors (§14.3)
  ROW_001: '该分组中已存在相同记录',
  ROW_002: '该行已有关联数据，不能删除，只能归档',
  VALUE_001: '请输入有效数值',
  VALUE_002: '数值超出建议范围，请确认',
  VALUE_003: '该选项不存在，请重新选择',
  SAVE_409: '该记录已被其他用户更新',
  SAVE_403: '你的编辑权限已失效',
  LOCK_001: '任务正在审核，矩阵暂不可编辑',
  FLAG_001: '数据矩阵功能当前未启用',

  // Media errors (§14.4)
  MEDIA_001: '该文件类型不支持上传',
  MEDIA_002: '文件超过当前槽位允许大小',
  MEDIA_003: '上传失败，可重试',
  MEDIA_004: '文件安全扫描失败，不能作为证据使用',
  MEDIA_005: '视频处理失败，可保留原文件并重试',
  MEDIA_006: '当前文件尚未保存到服务器，请恢复网络后重新上传',
} as const;

export type MatrixErrorCode = keyof typeof MATRIX_ERROR_CODES;

export function matrixErrorMessage(code: string, context?: Record<string, string>): string {
  let msg = (MATRIX_ERROR_CODES as Record<string, string>)[code] ?? code;
  if (context) {
    for (const [key, value] of Object.entries(context)) {
      msg = msg.replace(`{${key}}`, value);
    }
  }
  return msg;
}
