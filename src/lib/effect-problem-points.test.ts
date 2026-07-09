import assert from 'node:assert/strict';

async function main() {
  const helpers = await import('./effect-problem-points').catch(() => null);
  assert.ok(helpers, 'effect problem-point state helpers should exist');

  const serverPoints = [
    { text: '已有问题一', material_ids: ['m1'] },
    { text: '已有问题二', material_ids: ['m2'] },
  ];
  const recipe = { id: 'recipe-1', effect_problem_points: serverPoints };

  const initialized = helpers.initializeEffectProblemPoints({}, [recipe]);
  assert.deepEqual(initialized['recipe-1'], serverPoints);

  const localDraft = { 'recipe-1': [{ text: '本地草稿', material_ids: [] }] };
  assert.deepEqual(
    helpers.initializeEffectProblemPoints(localDraft, [recipe]),
    localDraft,
    'server refresh must not overwrite an active local draft',
  );

  const edited = helpers.updateEffectProblemPoints({}, recipe, (points) =>
    points.map((point, index) => index === 0 ? { ...point, text: '编辑后问题一' } : point),
  );
  assert.deepEqual(edited['recipe-1'], [
    { text: '编辑后问题一', material_ids: ['m1'] },
    { text: '已有问题二', material_ids: ['m2'] },
  ]);

  const payload = helpers.buildEffectAutosavePayload(
    {
      id: 'recipe-1',
      name: '烘烤',
      ingredients: '200℃',
      recipe_type: '功能',
      problem_count: 2,
      effect_description: '表面均匀',
    },
    [
      { text: '  边缘偏焦  ', material_ids: ['m2', 'm3'] },
      { text: '   ', material_ids: ['unused'] },
    ],
    ['m1', 'm2'],
  );
  assert.equal(
    payload.effect_problem_point,
    JSON.stringify([{ text: '边缘偏焦', material_ids: ['m2', 'm3'] }]),
  );
  assert.deepEqual(payload.effect_material_ids, ['m1', 'm2', 'm3']);

  console.log('effect-problem-points tests passed');
}

void main();
