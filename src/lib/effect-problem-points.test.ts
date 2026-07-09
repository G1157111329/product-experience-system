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

  console.log('effect-problem-points tests passed');
}

void main();
