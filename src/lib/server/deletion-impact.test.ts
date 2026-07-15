import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  DeletionImpactAccessError,
  getDeletionImpactWithRepository,
  projectContentDeleteGraphImpact,
  type DeletionImpactKind,
  type DeletionImpactRepository,
  type DeletionImpactSnapshot,
} from './deletion-impact';

function repository(fixtures: Record<string, DeletionImpactSnapshot>): DeletionImpactRepository {
  return {
    async readSnapshot(input) {
      return fixtures[`${input.kind}:${input.id}:${input.actorId}`]
        ?? { state: 'missing', impact: null };
    },
  };
}

const sectionImpact = { records: 0, childNodes: 4, cells: 6, materialLinks: 5, issues: 2 };
const fixtures: Record<string, DeletionImpactSnapshot> = {
  'comparison_section:section-a:user-a': { state: 'authorized', impact: sectionImpact },
  'comparison_item:item-a:user-a': {
    state: 'authorized',
    impact: { records: 0, childNodes: 1, cells: 2, materialLinks: 2, issues: 1 },
  },
  'record:record-a:user-a': {
    state: 'authorized',
    impact: { records: 1, childNodes: 0, cells: 0, materialLinks: 3, issues: 1 },
  },
  'recipe:recipe-a:user-a': {
    state: 'authorized',
    impact: { records: 0, childNodes: 3, cells: 0, materialLinks: 4, issues: 2 },
  },
  'record:record-a:user-b': { state: 'forbidden', impact: null },
};

for (const [kind, id, expected] of [
  ['comparison_section', 'section-a', sectionImpact],
  ['comparison_item', 'item-a', fixtures['comparison_item:item-a:user-a'].impact],
  ['record', 'record-a', fixtures['record:record-a:user-a'].impact],
  ['recipe', 'recipe-a', fixtures['recipe:recipe-a:user-a'].impact],
] as Array<[DeletionImpactKind, string, typeof sectionImpact]>) {
  test(`returns the authoritative ${kind} impact snapshot`, async () => {
    assert.deepEqual(await getDeletionImpactWithRepository(
      { kind, id, actorId: 'user-a' },
      repository(fixtures),
    ), expected);
  });
}

test('fails closed for another user without leaking counts', async () => {
  await assert.rejects(
    () => getDeletionImpactWithRepository(
      { kind: 'record', id: 'record-a', actorId: 'user-b' },
      repository(fixtures),
    ),
    (error: unknown) => error instanceof DeletionImpactAccessError && error.code === 'forbidden',
  );
});

test('returns a stable not-found error for a missing resource', async () => {
  await assert.rejects(
    () => getDeletionImpactWithRepository(
      { kind: 'recipe', id: 'missing', actorId: 'user-a' },
      repository(fixtures),
    ),
    (error: unknown) => error instanceof DeletionImpactAccessError && error.code === 'not_found',
  );
});

test('rejects a section/item kind mismatch', async () => {
  const mismatched = repository({
    'comparison_section:item-a:user-a': { state: 'kind_mismatch', impact: null },
  });
  await assert.rejects(
    () => getDeletionImpactWithRepository(
      { kind: 'comparison_section', id: 'item-a', actorId: 'user-a' },
      mismatched,
    ),
    (error: unknown) => error instanceof DeletionImpactAccessError && error.code === 'not_found',
  );
});

test('database repository is contractually a single snapshot read', async () => {
  let reads = 0;
  const wrapped: DeletionImpactRepository = {
    async readSnapshot(input) {
      reads += 1;
      return repository(fixtures).readSnapshot(input);
    },
  };
  await getDeletionImpactWithRepository(
    { kind: 'comparison_section', id: 'section-a', actorId: 'user-a' },
    wrapped,
  );
  assert.equal(reads, 1);
});

test('record query contract includes issue/retest links and legacy columns with material de-duplication', () => {
  assert.deepEqual(projectContentDeleteGraphImpact({
    kind: 'record', rootId: 'record-a', stepIds: [], affectedRecordIds: ['record-a'],
    issueIds: ['issue-a'], reEvaluationIds: ['retest-a'],
    links: [
      { materialId: 'm-record', targetType: 'record', targetId: 'record-a' },
      { materialId: 'm-shared', targetType: 'issue', targetId: 'issue-a' },
      { materialId: 'm-retest', targetType: 're_evaluation', targetId: 'retest-a' },
      { materialId: 'm-other', targetType: 'issue', targetId: 'issue-other' },
    ],
    legacyMaterials: [
      { id: 'm-shared', issueId: 'issue-a' },
      { id: 'm-legacy-retest', reEvaluationId: 'retest-a' },
    ],
  }), { records: 1, childNodes: 0, cells: 0, materialLinks: 4, issues: 1 });
});

test('recipe query contract counts affected records, steps, issues, retests and every material target', () => {
  assert.deepEqual(projectContentDeleteGraphImpact({
    kind: 'recipe', rootId: 'recipe-a', stepIds: ['step-a', 'step-b'],
    affectedRecordIds: ['record-recipe', 'record-step'], issueIds: ['issue-recipe', 'issue-step'],
    reEvaluationIds: ['retest-recipe'],
    links: [
      { materialId: 'm-recipe', targetType: 'recipe', targetId: 'recipe-a' },
      { materialId: 'm-step', targetType: 'recipe_step', targetId: 'step-a' },
      { materialId: 'm-issue', targetType: 'issue', targetId: 'issue-step' },
      { materialId: 'm-retest', targetType: 're_evaluation', targetId: 'retest-recipe' },
    ],
    legacyMaterials: [
      { id: 'm-recipe', recipeId: 'recipe-a' },
      { id: 'm-legacy-step', recipeStepId: 'step-b' },
      { id: 'm-legacy-issue', issueId: 'issue-recipe' },
      { id: 'm-legacy-retest', reEvaluationId: 'retest-recipe' },
    ],
  }), { records: 2, childNodes: 2, cells: 0, materialLinks: 7, issues: 2 });
});

test('PostgreSQL projection covers descendants, cells, evidence and issues in one read-only statement', () => {
  const source = readFileSync(join(process.cwd(), 'src/lib/server/deletion-impact.ts'), 'utf8');
  assert.match(source, /projectDeleteGraphImpact/, 'impact fixture must reuse the execution graph projector');
  assert.match(source, /WITH RECURSIVE actor/);
  assert.match(source, /JOIN descendants parent ON child\.parent_id = parent\.id/);
  assert.match(source, /comparison_matrix_cells/);
  assert.match(source, /material_links/);
  assert.match(source, /FROM materials/);
  assert.match(source, /FROM issues/);
  assert.match(source, /affected_re_evaluations/);
  assert.match(source, /issue_id IN \(SELECT id FROM affected_issues\)/);
  assert.match(source, /re_evaluation_id IN \(SELECT id FROM affected_re_evaluations\)/);
  assert.match(source, /affected_records/);
  assert.match(source, /getPool\(\)\.query<ImpactRow>\(statement, values\)/);
  assert.doesNotMatch(source, /\.delete\(|DELETE\s+FROM/i);
});

test('v1 route authenticates, validates the resource kind and never deletes', () => {
  const source = readFileSync(join(process.cwd(), 'src/app/api/v1/deletion-impact/route.ts'), 'utf8');
  assert.match(source, /requireUser\(request, client\)/);
  assert.match(source, /KINDS\.has\(kind\)/);
  assert.match(source, /getDeletionImpact\(\{ kind, id, actorId: user\.id \}\)/);
  assert.match(source, /return ok\(data, traceId\)/);
  assert.doesNotMatch(source, /export async function (POST|PUT|PATCH|DELETE)/);
});
