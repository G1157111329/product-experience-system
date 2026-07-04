export const BATCH_LIMIT = 500;

export interface BatchSetMetricCommand {
  type: 'setMetric';
  rowId: string;
  dimensionKey: string;
  value: number | string;
  unitCode?: string;
}
export type BatchCommand = BatchSetMetricCommand;

export interface BatchAnchor {
  rowId: string;
  dimensionKey: string;
}

export interface BatchPasteRequest {
  clientOperationId: string;
  baseVersion: number;
  anchor: BatchAnchor;
  commands: BatchCommand[];
}

export interface BatchCommandResult {
  index: number;
  status: 'succeeded' | 'conflict' | 'validation_failed' | 'row_not_found';
  rowId: string;
  dimensionKey: string;
  newVersion?: number;
  error?: { code: string; message?: string; latestVersion?: number; latestValue?: unknown };
}

export interface AuthoritativeCalc {
  rowId: string;
  metricKey: string;
  value?: number;
  unit?: string;
  formulaVersion?: string;
  status: string;
  errorCode?: string;
}

export interface BatchPasteResult {
  operationId: string;
  status: 'succeeded' | 'partially_succeeded' | 'failed';
  results: BatchCommandResult[];
  authoritativeCalculations: AuthoritativeCalc[];
  calculationRunIds: string[];
  warnings: string[];
}

export type BatchValidationError =
  | { valid: true }
  | { valid: false; code: 'MATRIX_BATCH_INVALID_SHAPE' | 'MATRIX_BATCH_ANCHOR_INVALID' | 'MATRIX_BATCH_COMMAND_OUT_OF_RANGE' | 'MATRIX_BATCH_LIMIT_EXCEEDED'; message?: string };

export interface ValidationContext {
  observedSortOrder: string[];   // dimension_keys of observed+editable columns in sort_order
  groupRows: string[];            // row ids of the anchor's group in sort_order ascending
}

/**
 * Pure-function validation of the request shape, anchor, and command geometry
 * against the schema's observed-dimension order and the anchor's group rows.
 * Does NOT touch the DB.
 */
export function validateBatchRequest(req: BatchPasteRequest, ctx: ValidationContext): BatchValidationError {
  if (!req.anchor || !req.anchor.rowId || !req.anchor.dimensionKey) {
    return { valid: false, code: 'MATRIX_BATCH_INVALID_SHAPE', message: 'anchor 缺失' };
  }

  const anchorColIdx = ctx.observedSortOrder.indexOf(req.anchor.dimensionKey);
  if (anchorColIdx < 0) {
    return { valid: false, code: 'MATRIX_BATCH_ANCHOR_INVALID', message: 'anchor 列不是原始指标' };
  }
  const anchorRowIdx = ctx.groupRows.indexOf(req.anchor.rowId);
  if (anchorRowIdx < 0) {
    return { valid: false, code: 'MATRIX_BATCH_ANCHOR_INVALID', message: 'anchor 行不在当前组内' };
  }

  if (!Array.isArray(req.commands) || req.commands.length === 0) {
    return { valid: false, code: 'MATRIX_BATCH_INVALID_SHAPE', message: 'commands 为空' };
  }
  if (req.commands.length > BATCH_LIMIT) {
    return { valid: false, code: 'MATRIX_BATCH_LIMIT_EXCEEDED', message: `粘贴超出 ${BATCH_LIMIT} 单元格上限` };
  }

  for (const cmd of req.commands) {
    if (cmd.type !== 'setMetric') {
      return { valid: false, code: 'MATRIX_BATCH_INVALID_SHAPE', message: `不支持的命令类型 ${cmd.type}` };
    }
    const cmdColIdx = ctx.observedSortOrder.indexOf(cmd.dimensionKey);
    if (cmdColIdx < 0) {
      return { valid: false, code: 'MATRIX_BATCH_COMMAND_OUT_OF_RANGE', message: `命令列 ${cmd.dimensionKey} 不是原始指标` };
    }
    if (cmdColIdx < anchorColIdx) {
      return { valid: false, code: 'MATRIX_BATCH_COMMAND_OUT_OF_RANGE', message: `命令列 ${cmd.dimensionKey} 在 anchor 之前` };
    }
    const cmdRowIdx = ctx.groupRows.indexOf(cmd.rowId);
    if (cmdRowIdx < 0) {
      return { valid: false, code: 'MATRIX_BATCH_COMMAND_OUT_OF_RANGE', message: `命令行 ${cmd.rowId} 不在当前组内（跨组禁止）` };
    }
    if (cmdRowIdx < anchorRowIdx) {
      return { valid: false, code: 'MATRIX_BATCH_COMMAND_OUT_OF_RANGE', message: `命令行 ${cmd.rowId} 在 anchor 之前` };
    }
  }
  return { valid: true };
}
