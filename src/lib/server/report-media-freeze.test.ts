import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import test from 'node:test';

type FreezeMediaModule = {
  freezeReportMediaAtSource(input: {
    records: Array<Record<string, unknown>>;
    recipes: Array<Record<string, unknown>>;
    issues: Array<Record<string, unknown>>;
    reEvaluations: Array<Record<string, unknown>>;
    materials: Array<Record<string, unknown>>;
    materialLinks: Array<Record<string, unknown>>;
  }): { records: Array<Record<string, unknown>>; recipes: Array<Record<string, unknown>>; issues: Array<Record<string, unknown>> };
  mergeTargetMaterials(input: {
    legacy: Array<Record<string, unknown>>;
    materials: Array<Record<string, unknown>>;
    materialLinks: Array<Record<string, unknown>>;
    targetType: string;
    targetId: string;
  }): Array<Record<string, unknown>>;
};

async function loadModule(): Promise<FreezeMediaModule | null> {
  try {
    return await import(pathToFileURL(resolve(process.cwd(), 'src/lib/server/report-media-freeze.ts')).href) as FreezeMediaModule;
  } catch {
    return null;
  }
}

const media = (id: string, extra: Record<string, unknown> = {}) => ({
  id, file_name: `${id}.mp4`, file_path: `task/${id}.mp4`, file_url: `/uploads/task/${id}.mp4`,
  material_type: 'video', thumbnail_url: `/uploads/task/${id}.jpg`, duration_sec: 12, ...extra,
});

test('freezes legacy and material_links evidence at every original ordinary-report source position', async () => {
  const loadedModule = await loadModule();
  assert.ok(loadedModule, 'report media freeze aggregator must exist');
  const materials = [
    media('record-legacy', { record_id: 'record-1' }), media('record-link'),
    media('recipe-legacy', { recipe_id: 'recipe-1' }), media('recipe-link'),
    media('step-legacy', { recipe_step_id: 'step-1' }), media('step-link'),
    media('issue-legacy', { issue_id: 'issue-1' }), media('issue-link'),
    media('retest-legacy', { re_evaluation_id: 'retest-1' }), media('retest-link'),
  ];
  const materialLinks = [
    ['record-link', 'record', 'record-1'], ['recipe-link', 'recipe', 'recipe-1'],
    ['step-link', 'recipe_step', 'step-1'], ['issue-link', 'issue', 'issue-1'],
    ['retest-link', 're_evaluation', 'retest-1'],
  ].map(([material_id, target_type, target_id], index) => ({ material_id, target_type, target_id, binding_order: index + 1 }));

  const frozen = loadedModule.freezeReportMediaAtSource({
    records: [{ id: 'record-1' }],
    recipes: [{ id: 'recipe-1', recipe_steps: [{ id: 'step-1' }] }],
    issues: [{ id: 'issue-1' }],
    reEvaluations: [{ id: 'retest-1', issue_id: 'issue-1' }],
    materials,
    materialLinks,
  });

  const list = (value: unknown) => Array.isArray(value) ? value as Array<Record<string, unknown>> : [];
  assert.deepEqual(list(frozen.records[0]?.materials).map((item) => item.id), ['record-link', 'record-legacy']);
  assert.deepEqual(list(frozen.recipes[0]?.effect_materials).map((item) => item.id), ['recipe-link', 'recipe-legacy']);
  assert.deepEqual(list(list(frozen.recipes[0]?.recipe_steps)[0]?.materials).map((item) => item.id), ['step-link', 'step-legacy']);
  assert.deepEqual(list(frozen.issues[0]?.materials).map((item) => item.id), ['issue-link', 'issue-legacy']);
  assert.deepEqual(list(list(frozen.issues[0]?._reEvaluations)[0]?.materials).map((item) => item.id), ['retest-link', 'retest-legacy']);
  assert.deepEqual(list(frozen.recipes[0]?.effect_materials)[0], media('recipe-link'), 'the frozen source descriptor keeps poster and duration data');
});

test('keeps comparison-cell media bound through material_links in deterministic source order without duplicates', async () => {
  const loadedModule = await loadModule();
  assert.ok(loadedModule, 'report media freeze aggregator must exist');
  const materials = [media('legacy', { comparison_cell_id: 'cell-1', media_display_order: 2 }), media('linked-first'), media('linked-second')];
  const merged = loadedModule.mergeTargetMaterials({
    legacy: [materials[0]!], materials,
    materialLinks: [
      { material_id: 'linked-second', target_type: 'comparison_cell', target_id: 'cell-1', binding_order: 2 },
      { material_id: 'linked-first', target_type: 'comparison_cell', target_id: 'cell-1', binding_order: 1 },
      { material_id: 'legacy', target_type: 'comparison_cell', target_id: 'cell-1', binding_order: 3 },
    ],
    targetType: 'comparison_cell', targetId: 'cell-1',
  });
  assert.deepEqual(merged.map((item) => item.id), ['linked-first', 'linked-second', 'legacy']);
});

test('uses bound time, material creation time and id as stable fallbacks for equal binding order', async () => {
  const loadedModule = await loadModule();
  assert.ok(loadedModule);
  const materials = [
    media('created-b', { created_at: '2026-07-15T12:00:00.000Z' }),
    media('created-a', { created_at: '2026-07-15T12:00:00.000Z' }),
    media('bound-later', { created_at: '2026-07-15T08:00:00.000Z' }),
    media('bound-earlier', { created_at: '2026-07-15T09:00:00.000Z' }),
  ];
  const merged = loadedModule.mergeTargetMaterials({
    legacy: [], materials,
    materialLinks: [
      { id: 'l4', material_id: 'created-b', target_type: 'record', target_id: 'r1', binding_order: 0 },
      { id: 'l3', material_id: 'created-a', target_type: 'record', target_id: 'r1', binding_order: 0 },
      { id: 'l2', material_id: 'bound-later', target_type: 'record', target_id: 'r1', binding_order: 0, bound_at: '2026-07-15T11:00:00.000Z' },
      { id: 'l1', material_id: 'bound-earlier', target_type: 'record', target_id: 'r1', binding_order: 0, bound_at: '2026-07-15T10:00:00.000Z' },
    ],
    targetType: 'record', targetId: 'r1',
  });
  assert.deepEqual(merged.map((item) => item.id), ['bound-earlier', 'bound-later', 'created-a', 'created-b']);
});
