import assert from 'node:assert/strict';
import { comparisonAssemblyCleanupPlan } from './comparison-assembly-deactivation';
import { assertAssemblyCanBuildSnapshot } from './comparison-assembly';

assert.deepEqual(comparisonAssemblyCleanupPlan(), {
  unbindMaterialFields: ['comparisonCellId', 'comparisonAssemblyId'],
  deleteTables: [
    'metricThresholdRules',
    'matrixCalculationRuns',
    'materialLinks',
    'comparisonAiResults',
    'comparisonMatrixCells',
    'comparisonItemNodes',
    'comparisonObjects',
  ],
  materialLinkTargetType: 'comparison_assembly',
  archiveAssembly: true,
});

assert.throws(
  () => assertAssemblyCanBuildSnapshot({ status: 'archived' }),
  /对比矩阵已停用/,
);
assert.doesNotThrow(() => assertAssemblyCanBuildSnapshot({ status: 'published' }));

console.log('comparison assembly deactivation tests passed');
