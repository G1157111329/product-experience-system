import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  deleteRecipeAtomically,
  deleteRecipeStepAtomically,
  deleteRecordAtomically,
  deleteIssueAtomically,
  type ContentDeleteKind,
  type ContentDeleteStore,
  type DeleteGraph,
  canDeleteTaskContent,
  resolveContentDeleteActorRole,
} from './content-delete-service';

type State = {
  records: string[];
  recipes: string[];
  steps: Array<{ id: string; recipeId: string }>;
  issues: Array<{ id: string; recordId?: string; recipeId?: string; stepId?: string }>;
  reEvaluations: Array<{ id: string; issueId: string }>;
  rectifications: Array<{ id: string; issueId: string }>;
  verifications: Array<{ id: string; issueId: string; actionId: string }>;
  occurrences: Array<{ id: string; issueId: string }>;
  links: Array<{ materialId: string; targetType: string; targetId: string }>;
  legacy: Array<{ materialId: string; recordId?: string | null; recipeId?: string | null; stepId?: string | null; issueId?: string | null; reEvaluationId?: string | null }>;
  statuses: Record<string, string>;
  audits: string[];
};

const initial = (): State => ({
  records: ['record-1'],
  recipes: ['recipe-1'],
  steps: [{ id: 'step-1', recipeId: 'recipe-1' }, { id: 'step-2', recipeId: 'recipe-1' }],
  issues: [
    { id: 'issue-record', recordId: 'record-1' },
    { id: 'issue-recipe', recipeId: 'recipe-1' },
    { id: 'issue-step', stepId: 'step-1' },
  ],
  reEvaluations: [{ id: 'retest-recipe', issueId: 'issue-recipe' }],
  rectifications: [{ id: 'action-recipe', issueId: 'issue-recipe' }],
  verifications: [{ id: 'verification-recipe', issueId: 'issue-recipe', actionId: 'action-recipe' }],
  occurrences: [{ id: 'occurrence-recipe', issueId: 'issue-recipe' }],
  links: [
    { materialId: 'material-record', targetType: 'record', targetId: 'record-1' },
    { materialId: 'material-step', targetType: 'recipe_step', targetId: 'step-1' },
    { materialId: 'material-recipe', targetType: 'recipe', targetId: 'recipe-1' },
    { materialId: 'material-shared', targetType: 'recipe', targetId: 'recipe-1' },
    { materialId: 'material-shared', targetType: 'comparison_cell', targetId: 'cell-1' },
    { materialId: 'material-issue', targetType: 'issue', targetId: 'issue-recipe' },
    { materialId: 'material-retest', targetType: 're_evaluation', targetId: 'retest-recipe' },
  ],
  legacy: [
    { materialId: 'material-record', recordId: 'record-1' },
    { materialId: 'material-step', stepId: 'step-1' },
    { materialId: 'material-recipe', recipeId: 'recipe-1' },
    { materialId: 'material-issue', issueId: 'issue-recipe' },
    { materialId: 'material-retest', reEvaluationId: 'retest-recipe' },
  ],
  statuses: {
    'material-record': 'bound', 'material-step': 'bound', 'material-recipe': 'bound',
    'material-shared': 'bound', 'material-issue': 'bound', 'material-retest': 'bound',
  },
  audits: [],
});

function graphFor(state: State, kind: ContentDeleteKind, id: string): DeleteGraph | null {
  if (kind === 'record' && !state.records.includes(id)) return null;
  if (kind === 'recipe_step' && !state.steps.some((step) => step.id === id)) return null;
  if (kind === 'recipe' && !state.recipes.includes(id)) return null;
  if (kind === 'issue' && !state.issues.some((issue) => issue.id === id)) return null;
  const stepIds = kind === 'recipe'
    ? state.steps.filter((step) => step.recipeId === id).map((step) => step.id)
    : kind === 'recipe_step' ? [id] : [];
  const issueIds = state.issues.filter((issue) => (
    (kind === 'issue' && issue.id === id)
    ||
    (kind === 'record' && issue.recordId === id)
    || (kind === 'recipe' && (issue.recipeId === id || Boolean(issue.stepId && stepIds.includes(issue.stepId))))
    || (kind === 'recipe_step' && issue.stepId === id)
  )).map((issue) => issue.id);
  const reEvaluationIds = state.reEvaluations.filter((item) => issueIds.includes(item.issueId)).map((item) => item.id);
  const targets = [
    ...(kind === 'issue' ? [] : [{ type: kind, id }]),
    ...stepIds.filter((stepId) => !(kind === 'recipe_step' && stepId === id)).map((stepId) => ({ type: 'recipe_step' as const, id: stepId })),
    ...issueIds.map((issueId) => ({ type: 'issue' as const, id: issueId })),
    ...reEvaluationIds.map((reEvaluationId) => ({ type: 're_evaluation' as const, id: reEvaluationId })),
  ];
  const materialIds = [...new Set([
    ...state.links.filter((link) => targets.some((target) => target.type === link.targetType && target.id === link.targetId)).map((link) => link.materialId),
    ...state.legacy.filter((item) => (
      (kind === 'record' && item.recordId === id)
      || (kind === 'issue' && item.issueId === id)
      || (kind === 'recipe' && (item.recipeId === id || Boolean(item.stepId && stepIds.includes(item.stepId))))
      || (kind === 'recipe_step' && item.stepId === id)
      || Boolean(item.issueId && issueIds.includes(item.issueId))
      || Boolean(item.reEvaluationId && reEvaluationIds.includes(item.reEvaluationId))
    )).map((item) => item.materialId),
  ])];
  return { kind, id, actorId: 'actor-1', stepIds, issueIds, reEvaluationIds, targets, materialIds };
}

type FailAt = 'authorize' | 'legacy' | 'links' | 'issue_children' | 'issues' | 'children' | 'root' | 'statuses' | 'audit';

function fakeStore(state: State, failAt?: FailAt): ContentDeleteStore {
  return {
    async transaction(work) {
      const snapshot = structuredClone(state);
      try {
        return await work({
          async loadAndAuthorize(kind, id, actorId) {
            if (failAt === 'authorize') throw new Error('injected authorize failure');
            assert.equal(actorId, 'actor-1');
            return graphFor(state, kind, id);
          },
          async clearLegacyReferences(graph) {
            if (failAt === 'legacy') throw new Error('injected legacy failure');
            for (const item of state.legacy) {
              if (graph.kind === 'record' && item.recordId === graph.id) item.recordId = null;
              if (graph.kind === 'recipe' && item.recipeId === graph.id) item.recipeId = null;
              if (item.stepId && graph.stepIds.includes(item.stepId)) item.stepId = null;
              if (item.issueId && graph.issueIds.includes(item.issueId)) item.issueId = null;
              if (item.reEvaluationId && graph.reEvaluationIds.includes(item.reEvaluationId)) item.reEvaluationId = null;
            }
          },
          async deleteIssueChildren(graph) {
            if (failAt === 'issue_children') throw new Error('injected issue_children failure');
            state.reEvaluations = state.reEvaluations.filter((item) => !graph.reEvaluationIds.includes(item.id));
            state.verifications = state.verifications.filter((item) => !graph.issueIds.includes(item.issueId));
            state.rectifications = state.rectifications.filter((item) => !graph.issueIds.includes(item.issueId));
            state.occurrences = state.occurrences.filter((item) => !graph.issueIds.includes(item.issueId));
          },
          async deleteMaterialLinks(graph) {
            if (failAt === 'links') throw new Error('injected links failure');
            state.links = state.links.filter((link) => !graph.targets.some((target) => target.type === link.targetType && target.id === link.targetId));
          },
          async deleteIssues(graph) {
            if (failAt === 'issues') throw new Error('injected issues failure');
            state.issues = state.issues.filter((issue) => !graph.issueIds.includes(issue.id));
          },
          async deleteChildren(graph) {
            if (failAt === 'children') throw new Error('injected children failure');
            if (graph.kind === 'recipe') state.steps = state.steps.filter((step) => !graph.stepIds.includes(step.id));
          },
          async deleteRoot(graph) {
            if (failAt === 'root') throw new Error('injected root failure');
            if (graph.kind === 'record') state.records = state.records.filter((id) => id !== graph.id);
            if (graph.kind === 'recipe_step') state.steps = state.steps.filter((step) => step.id !== graph.id);
            if (graph.kind === 'recipe') state.recipes = state.recipes.filter((id) => id !== graph.id);
          },
          async refreshMaterialStatuses(graph) {
            if (failAt === 'statuses') throw new Error('injected statuses failure');
            for (const materialId of graph.materialIds) {
              if (state.statuses[materialId] !== 'archived') {
                state.statuses[materialId] = state.links.some((link) => link.materialId === materialId) ? 'bound' : 'unassigned';
              }
            }
          },
          async writeAudit(graph) {
            if (failAt === 'audit') throw new Error('injected audit failure');
            state.audits.push(`${graph.kind}:${graph.id}`);
          },
        });
      } catch (error) {
        Object.assign(state, snapshot);
        throw error;
      }
    },
  };
}

const operations = [
  { kind: 'record' as const, run: (store: ContentDeleteStore) => deleteRecordAtomically({ recordId: 'record-1', actorId: 'actor-1' }, store) },
  { kind: 'recipe_step' as const, run: (store: ContentDeleteStore) => deleteRecipeStepAtomically({ stepId: 'step-1', actorId: 'actor-1' }, store) },
  { kind: 'recipe' as const, run: (store: ContentDeleteStore) => deleteRecipeAtomically({ recipeId: 'recipe-1', actorId: 'actor-1' }, store) },
  { kind: 'issue' as const, run: (store: ContentDeleteStore) => deleteIssueAtomically({ issueId: 'issue-recipe', actorId: 'actor-1' }, store) },
];

void (async () => {
  assert.equal(resolveContentDeleteActorRole('user'), 'executor');
  assert.equal(canDeleteTaskContent({ rawRole: 'user', actorId: 'owner-1', ownerId: 'owner-1', createdBy: null }), true);
  assert.equal(canDeleteTaskContent({ rawRole: 'user', actorId: 'other-1', ownerId: 'owner-1', createdBy: null }), false);
  assert.equal(canDeleteTaskContent({ rawRole: 'admin', actorId: 'admin-1', ownerId: null, createdBy: null }), true);

  const source = readFileSync('src/lib/server/content-delete-service.ts', 'utf8');
  assert.ok(
    (source.match(/inArray\(materials\.reEvaluationId, reEvaluationIds\)/g) || []).length >= 3,
    'record, recipe-step and recipe graph discovery must all include legacy re-evaluation materials',
  );
  for (const route of [
    'src/app/api/records/[id]/route.ts',
    'src/app/api/recipe-steps/[id]/route.ts',
    'src/app/api/recipes/[id]/route.ts',
  ]) {
    const routeSource = readFileSync(route, 'utf8');
    assert.match(routeSource, /isContentDeletionForbidden\(error\)[\s\S]*?403/, `${route} maps transaction authorization failures to 403`);
  }
  for (const operation of operations) {
    for (const failAt of ['authorize', 'legacy', 'links', 'issue_children', 'issues', 'children', 'root', 'statuses', 'audit'] as const) {
      const state = initial();
      const before = structuredClone(state);
      await assert.rejects(() => operation.run(fakeStore(state, failAt)), new RegExp(`injected ${failAt} failure`));
      assert.deepEqual(state, before, `${operation.kind}/${failAt} must leave the complete graph unchanged`);
    }
  }

  const recipeState = initial();
  assert.equal(await deleteRecipeAtomically({ recipeId: 'recipe-1', actorId: 'actor-1' }, fakeStore(recipeState)), true);
  assert.deepEqual(recipeState.recipes, []);
  assert.deepEqual(recipeState.steps, []);
  assert.deepEqual(recipeState.issues, [{ id: 'issue-record', recordId: 'record-1' }]);
  assert.deepEqual(recipeState.reEvaluations, []);
  assert.deepEqual(recipeState.rectifications, []);
  assert.deepEqual(recipeState.verifications, []);
  assert.deepEqual(recipeState.occurrences, []);
  assert.equal(recipeState.links.some((link) => ['recipe', 'recipe_step', 'issue', 're_evaluation'].includes(link.targetType)), false);
  assert.equal(recipeState.statuses['material-shared'], 'bound', 'shared material remains bound to the comparison cell');
  assert.equal(recipeState.statuses['material-recipe'], 'unassigned');
  assert.equal(recipeState.statuses['material-retest'], 'unassigned');
  assert.deepEqual(recipeState.audits, ['recipe:recipe-1']);
  assert.equal(await deleteRecipeAtomically({ recipeId: 'recipe-1', actorId: 'actor-1' }, fakeStore(recipeState)), false, 'repeat is idempotent');

  const stepState = initial();
  assert.equal(await deleteRecipeStepAtomically({ stepId: 'step-1', actorId: 'actor-1' }, fakeStore(stepState)), true);
  assert.equal(stepState.steps.some((step) => step.id === 'step-1'), false);
  assert.equal(stepState.steps.some((step) => step.id === 'step-2'), true);
  assert.equal(stepState.recipes.includes('recipe-1'), true);

  const recordState = initial();
  assert.equal(await deleteRecordAtomically({ recordId: 'record-1', actorId: 'actor-1' }, fakeStore(recordState)), true);
  assert.deepEqual(recordState.records, []);
  assert.equal(recordState.recipes.includes('recipe-1'), true);

  console.log('atomic content deletion tests passed');
})();
