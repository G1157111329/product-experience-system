import assert from 'node:assert/strict';
import { createMaterialLinkWritePlan } from './server/material-asset-service';

function run() {
  const plan = createMaterialLinkWritePlan([
    { materialId: 'm1', targetType: 'recipe', targetId: 'r1', bindingMethod: 'click_select', boundBy: 'u1' },
    { materialId: 'm1', targetType: 'recipe_step', targetId: 's1', bindingMethod: 'click_select', boundBy: 'u1' },
    { materialId: 'm1', targetType: 'dynamic_matrix_cell_value', targetId: 'c1', bindingMethod: 'click_select', boundBy: 'u1' },
  ]);

  assert.equal(plan.length, 3, 'one asset may retain one link per distinct target');
  assert.deepEqual(
    plan.map((link) => `${link.targetType}:${link.targetId}`),
    ['recipe:r1', 'recipe_step:s1', 'dynamic_matrix_cell_value:c1'],
  );

  const idempotentPlan = createMaterialLinkWritePlan([
    ...plan,
    { materialId: 'm1', targetType: 'recipe', targetId: 'r1', bindingMethod: 'drag_attach', boundBy: 'u1' },
  ]);
  assert.equal(idempotentPlan.length, 3, 'the same asset and target is idempotent');
  assert.throws(
    () => createMaterialLinkWritePlan([
      { materialId: 'm1', targetType: 'unknown_target', targetId: 'x1', bindingMethod: 'click_select', boundBy: 'u1' },
    ]),
    /unsupported material link target type/,
  );

  console.log('material link multi-target contract passed');
}

run();
