import assert from 'node:assert/strict';
import { deleteIssueWithMaterialCleanup, type IssueDeletionStore } from './issue-delete-service';

type State = { issue: boolean; children: number; links: number; legacy: boolean; status: string; audits: number };

function storeFor(state: State, failStatus = false): IssueDeletionStore {
  return {
    async transaction(work) {
      const before = structuredClone(state);
      try {
        return await work({
          async loadAndAuthorize(kind, id, actorId) {
            assert.equal(kind, 'issue');
            assert.equal(actorId, 'actor-1');
            if (!state.issue) return null;
            return {
              kind: 'issue', id, actorId, stepIds: [], issueIds: [id], reEvaluationIds: ['retest-1'],
              targets: [{ type: 'issue', id }, { type: 're_evaluation', id: 'retest-1' }], materialIds: ['material-1'],
            };
          },
          async clearLegacyReferences() { state.legacy = false; },
          async deleteMaterialLinks() { state.links = 0; },
          async deleteIssueChildren() { state.children = 0; },
          async deleteIssues() { state.issue = false; },
          async deleteChildren() {},
          async deleteRoot() {},
          async refreshMaterialStatuses() {
            if (failStatus) throw new Error('status update failed');
            state.status = 'unassigned';
          },
          async writeAudit() { state.audits += 1; },
        });
      } catch (error) {
        Object.assign(state, before);
        throw error;
      }
    },
  };
}

void (async () => {
  const initial: State = { issue: true, children: 4, links: 2, legacy: true, status: 'bound', audits: 0 };
  const failed = structuredClone(initial);
  await assert.rejects(() => deleteIssueWithMaterialCleanup('issue-1', 'actor-1', storeFor(failed, true)), /status update failed/);
  assert.deepEqual(failed, initial, 'direct issue deletion rolls the whole descendant graph back');

  const state = structuredClone(initial);
  assert.equal(await deleteIssueWithMaterialCleanup('issue-1', 'actor-1', storeFor(state)), true);
  assert.deepEqual(state, { issue: false, children: 0, links: 0, legacy: false, status: 'unassigned', audits: 1 });
  assert.equal(await deleteIssueWithMaterialCleanup('issue-1', 'actor-1', storeFor(state)), false);
  console.log('shared atomic issue deletion tests passed');
})();
