import assert from 'node:assert/strict';
import { projectDeleteGraphImpact, type DeleteGraph } from './content-delete-graph';

const graph: DeleteGraph = {
  kind: 'recipe',
  id: 'recipe-1',
  actorId: 'actor-1',
  stepIds: ['step-1', 'step-2'],
  affectedRecordIds: ['record-recipe', 'record-step'],
  issueIds: ['issue-recipe', 'issue-step'],
  reEvaluationIds: ['retest-1'],
  targets: [],
  materialIds: ['material-1', 'material-2', 'material-1'],
};

assert.deepEqual(projectDeleteGraphImpact(graph), {
  records: 2,
  childNodes: 2,
  cells: 0,
  materialLinks: 2,
  issues: 2,
});

assert.deepEqual(projectDeleteGraphImpact({
  ...graph,
  kind: 'record',
  id: 'record-1',
  stepIds: [],
  affectedRecordIds: ['record-1'],
}), {
  records: 1,
  childNodes: 0,
  cells: 0,
  materialLinks: 2,
  issues: 2,
});

console.log('content delete graph projection tests passed');
