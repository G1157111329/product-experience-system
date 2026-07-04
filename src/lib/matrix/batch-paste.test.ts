import assert from 'node:assert/strict';
import {
  validateBatchRequest,
  type BatchCommand,
  type BatchPasteRequest,
  BATCH_LIMIT,
} from './batch-paste';

const observedOrder = ['duration', 'ingredient_weight', 'juice_weight', 'pulp_weight'];

// Geometry: commands inside the anchor rectangle (same group, cols >= anchor col, rows >= anchor row)
{
  const req: BatchPasteRequest = {
    clientOperationId: 'op1',
    baseVersion: 1,
    anchor: { rowId: 'r1', dimensionKey: 'ingredient_weight' },
    commands: [
      { type: 'setMetric', rowId: 'r1', dimensionKey: 'ingredient_weight', value: 100 },
      { type: 'setMetric', rowId: 'r1', dimensionKey: 'juice_weight', value: 50 },
      { type: 'setMetric', rowId: 'r2', dimensionKey: 'ingredient_weight', value: 200 },
    ],
  };
  const groupRows = ['r1', 'r2', 'r3'];  // sort_order ascending
  const result = validateBatchRequest(req, { observedSortOrder: observedOrder, groupRows });
  assert.equal(result.valid, true);
}

// Anchor invalid: dimensionKey is not observed
{
  const req: BatchPasteRequest = {
    clientOperationId: 'op1', baseVersion: 1,
    anchor: { rowId: 'r1', dimensionKey: 'juice_yield' },  // calculated, not in observedOrder
    commands: [],
  };
  const result = validateBatchRequest(req, { observedSortOrder: observedOrder, groupRows: ['r1'] });
  assert.equal(result.valid, false);
  if (!result.valid) assert.equal(result.code, 'MATRIX_BATCH_ANCHOR_INVALID');
}

// Command out of range: row in different group
{
  const req: BatchPasteRequest = {
    clientOperationId: 'op1', baseVersion: 1,
    anchor: { rowId: 'r1', dimensionKey: 'ingredient_weight' },
    commands: [
      { type: 'setMetric', rowId: 'rX', dimensionKey: 'ingredient_weight', value: 100 },  // not in groupRows
    ],
  };
  const result = validateBatchRequest(req, { observedSortOrder: observedOrder, groupRows: ['r1', 'r2'] });
  assert.equal(result.valid, false);
  if (!result.valid) assert.equal(result.code, 'MATRIX_BATCH_COMMAND_OUT_OF_RANGE');
}

// Command out of range: column before anchor (跳列)
{
  const req: BatchPasteRequest = {
    clientOperationId: 'op1', baseVersion: 1,
    anchor: { rowId: 'r1', dimensionKey: 'juice_weight' },  // index 2
    commands: [
      { type: 'setMetric', rowId: 'r1', dimensionKey: 'ingredient_weight', value: 100 },  // index 1 < 2
    ],
  };
  const result = validateBatchRequest(req, { observedSortOrder: observedOrder, groupRows: ['r1'] });
  assert.equal(result.valid, false);
  if (!result.valid) assert.equal(result.code, 'MATRIX_BATCH_COMMAND_OUT_OF_RANGE');
}

// Limit exceeded
{
  const commands: BatchCommand[] = Array.from({ length: BATCH_LIMIT + 1 }, (_, i) => ({
    type: 'setMetric' as const, rowId: 'r1', dimensionKey: 'ingredient_weight', value: i,
  }));
  const req: BatchPasteRequest = {
    clientOperationId: 'op1', baseVersion: 1,
    anchor: { rowId: 'r1', dimensionKey: 'ingredient_weight' },
    commands,
  };
  const result = validateBatchRequest(req, { observedSortOrder: observedOrder, groupRows: ['r1'] });
  assert.equal(result.valid, false);
  if (!result.valid) assert.equal(result.code, 'MATRIX_BATCH_LIMIT_EXCEEDED');
}

// Empty commands
{
  const req: BatchPasteRequest = {
    clientOperationId: 'op1', baseVersion: 1,
    anchor: { rowId: 'r1', dimensionKey: 'ingredient_weight' },
    commands: [],
  };
  const result = validateBatchRequest(req, { observedSortOrder: observedOrder, groupRows: ['r1'] });
  assert.equal(result.valid, false);
  if (!result.valid) assert.equal(result.code, 'MATRIX_BATCH_INVALID_SHAPE');
}

console.log('batch-paste validation tests passed');
