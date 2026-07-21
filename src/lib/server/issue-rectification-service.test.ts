import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { executeIssueCommand, resolveLockedIssueActorRole, type IssueCommandStore } from './issue-rectification-service';

type State = {
  issue: { id: string; status: string; version: number; improvePlan: string | null; note: string | null; description: string | null; isClosed: boolean; actualCompleteDate: string | null };
  actions: Array<{ issueId: string; actorId: string; plan: string }>;
  verifications: Array<{ issueId: string; actionId: string; result: string; note: string | null; actorId?: string }>;
  completedActions: string[];
  audits: Array<{ issueId: string; actorId: string; command: string }>;
  role: 'task_owner' | 'rectification_owner';
};

const initial = (): State => ({
  issue: { id: 'issue-1', status: 'open', version: 1, improvePlan: null, note: null, description: null, isClosed: false, actualCompleteDate: null },
  actions: [], verifications: [], completedActions: [], audits: [], role: 'task_owner',
});

function fakeStore(state: State, failAt?: 'lock' | 'issue' | 'action' | 'verification' | 'complete' | 'audit'): IssueCommandStore {
  return {
    async transaction(work) {
      const snapshot = structuredClone(state);
      try {
        return await work({
          async lockIssueAndAuthorize(issueId, actorId) {
            if (failAt === 'lock') throw new Error('injected lock failure');
            assert.equal(issueId, state.issue.id);
            assert.equal(actorId, 'actor-1');
            return { currentStatus: state.issue.status, actorRole: state.role, version: state.issue.version };
          },
          async updateIssue(issueId, patch) {
            if (failAt === 'issue') throw new Error('injected issue failure');
            assert.equal(issueId, state.issue.id);
            state.issue.status = patch.status;
            state.issue.version += 1;
            if (patch.plan !== undefined) state.issue.improvePlan = patch.plan;
            if (patch.note !== undefined) state.issue.note = patch.note;
            if (patch.description !== undefined) state.issue.description = patch.description;
            if (patch.isClosed !== undefined) state.issue.isClosed = patch.isClosed;
            if (patch.actualCompleteDate !== undefined) state.issue.actualCompleteDate = patch.actualCompleteDate;
          },
          async createAction(input) {
            if (failAt === 'action') throw new Error('injected action failure');
            state.actions.push({ issueId: input.issueId, actorId: input.actorId, plan: input.plan });
          },
          async getLatestRectificationAction() { return state.actions.length > 0 ? 'action-1' : null; },
          async createVerification(input) {
            if (failAt === 'verification') throw new Error('injected verification failure');
            state.verifications.push(input);
          },
          async completeRectificationAction(actionId) {
            if (failAt === 'complete') throw new Error('injected complete failure');
            state.completedActions.push(actionId);
          },
          async writeAudit(input) {
            if (failAt === 'audit') throw new Error('injected audit failure');
            state.audits.push(input);
          },
        });
      } catch (error) {
        Object.assign(state, snapshot);
        throw error;
      }
    },
  };
}

const startCommand = {
  issueId: 'issue-1', actorId: 'actor-1', command: 'start_rectify' as const,
  requestedStatus: 'rectifying' as const,
  fields: { improve_plan: 'replace seal' },
};

void (async () => {
  assert.equal(resolveLockedIssueActorRole({ rawRole: 'user', actorId: 'owner-1', taskOwnerId: 'owner-1', taskCreatedBy: null, responsiblePerson: null, actorAccount: 'u', actorName: 'U' }), 'task_owner');
  assert.equal(resolveLockedIssueActorRole({ rawRole: 'user', actorId: 'dev-1', taskOwnerId: 'owner-1', taskCreatedBy: null, responsiblePerson: 'dev-1', actorAccount: 'dev', actorName: 'Dev' }), 'rectification_owner');
  assert.equal(resolveLockedIssueActorRole({ rawRole: 'user', actorId: 'other', taskOwnerId: 'owner-1', taskCreatedBy: null, responsiblePerson: 'dev-1', actorAccount: 'other', actorName: 'Other' }), 'executor');
  assert.equal(resolveLockedIssueActorRole({ rawRole: 'admin', actorId: 'admin', taskOwnerId: null, taskCreatedBy: null, responsiblePerson: null, actorAccount: 'admin', actorName: 'Admin' }), 'admin');

  for (const failAt of ['lock', 'issue', 'action', 'audit'] as const) {
    const state = initial();
    const before = structuredClone(state);
    await assert.rejects(() => executeIssueCommand(startCommand, fakeStore(state, failAt)), new RegExp(`injected ${failAt} failure`));
    assert.deepEqual(state, before, `${failAt} failure rolls back status, action and audit`);
  }

  const state = initial();
  assert.equal(await executeIssueCommand(startCommand, fakeStore(state)), 'rectifying');
  assert.equal(state.issue.status, 'rectifying');
  assert.deepEqual(state.actions, [{ issueId: 'issue-1', actorId: 'actor-1', plan: 'replace seal' }]);

  await executeIssueCommand({ ...startCommand, fields: { improve_plan: 'replace seal', description: 'updated in same command' } }, fakeStore(state));
  assert.equal(state.issue.description, 'updated in same command', 'ordinary fields are committed inside the command transaction');
  assert.equal(state.actions.length, 1, 'repeating start while already rectifying is idempotent for action creation');

  await executeIssueCommand({
    issueId: 'issue-1', actorId: 'actor-1', command: 'submit_verification',
    requestedStatus: 'rectifying', fields: { verification_note: 'ready for QA' },
  }, fakeStore(state));
  assert.equal(state.actions.length, 1, 'submit_verification must not create another rectification action');
  assert.equal(state.issue.note, 'ready for QA');
  assert.deepEqual(state.verifications, [{ issueId: 'issue-1', actionId: 'action-1', result: 'partial', note: 'ready for QA', actorId: 'actor-1' }]);

  await executeIssueCommand({
    issueId: 'issue-1', actorId: 'actor-1', command: 'verify',
    requestedStatus: 'verified_closed', fields: { verification_note: 'passed' },
  }, fakeStore(state));
  assert.equal(state.issue.status, 'verified_closed');
  assert.deepEqual(state.verifications.at(-1), { issueId: 'issue-1', actionId: 'action-1', result: 'passed', note: 'passed', actorId: 'actor-1' });
  assert.deepEqual(state.completedActions, ['action-1']);
  assert.equal(state.issue.isClosed, true);
  assert.ok(state.issue.actualCompleteDate);

  for (const failAt of ['verification', 'complete'] as const) {
    const failing = initial();
    await executeIssueCommand(startCommand, fakeStore(failing));
    const before = structuredClone(failing);
    await assert.rejects(() => executeIssueCommand({
      issueId: 'issue-1', actorId: 'actor-1', command: 'verify', requestedStatus: 'verified_closed', fields: { verification_note: 'passed' },
    }, fakeStore(failing, failAt)), new RegExp(`injected ${failAt} failure`));
    assert.deepEqual(failing, before, `${failAt} failure rolls back status and verification side effects`);
  }

  const waived = initial();
  await executeIssueCommand({
    issueId: 'issue-1', actorId: 'actor-1', command: 'waive', requestedStatus: 'waived',
    fields: { no_improve_reason: 'not applicable' },
  }, fakeStore(waived));
  assert.equal(waived.issue.status, 'waived');
  assert.equal(waived.issue.isClosed, true);
  assert.equal(waived.actions.length, 0);
  assert.equal(waived.verifications.length, 0);
  const closed = structuredClone(state);
  await executeIssueCommand({
    ...startCommand,
    fields: { improve_plan: 'restart without a forced sequence' },
  }, fakeStore(state));
  assert.equal(state.issue.status, 'rectifying', 'a completed issue can be switched directly back to rectifying');
  await executeIssueCommand({
    issueId: 'issue-1', actorId: 'actor-1', command: 'triage', requestedStatus: 'open', fields: {},
  }, fakeStore(state));
  assert.equal(state.issue.status, 'open', 'a rectifying issue can be switched directly back to pending');
  await executeIssueCommand({
    issueId: 'issue-1', actorId: 'actor-1', command: 'waive', requestedStatus: 'waived', fields: { no_improve_reason: 'not applicable now' },
  }, fakeStore(state));
  assert.equal(state.issue.status, 'waived', 'a pending issue can be switched directly to waived');
  assert.notDeepEqual(state, closed, 'direct status selections persist their canonical state instead of being rejected by sequence rules');

  const directlyCompleted = initial();
  await executeIssueCommand({
    issueId: 'issue-1', actorId: 'actor-1', command: 'verify', requestedStatus: 'verified_closed',
    fields: { verification_note: 'completed without a prior status selection' },
  }, fakeStore(directlyCompleted));
  assert.equal(directlyCompleted.issue.status, 'verified_closed', 'a pending issue can be marked complete directly');
  assert.equal(directlyCompleted.actions.length, 1, 'direct completion creates the required audit action');
  assert.equal(directlyCompleted.completedActions.length, 1, 'direct completion closes its created audit action');

  const staleVersion = initial();
  staleVersion.issue.version = 2;
  await assert.rejects(() => executeIssueCommand({ ...startCommand, expectedVersion: 1 }, fakeStore(staleVersion)), /issue version conflict/);
  assert.equal(staleVersion.issue.status, 'open');

  const dialogSource = readFileSync('src/components/issues/issue-rectification-dialog.tsx', 'utf8');
  assert.match(dialogSource, /transition:\s*'start_rectify'/, 'dialog starts rectification with an explicit command');
  assert.match(dialogSource, /transition:\s*'verify'/, 'dialog verifies with an explicit command');
  assert.match(dialogSource, /transition:\s*'waive'/, 'dialog waives with an explicit command');
  assert.doesNotMatch(dialogSource, /JSON\.stringify\(\{\s*status:/, 'dialog never sends a status-only mutation');
  assert.match(dialogSource, /setCurrent\(data\.data\)/, 'dialog trusts canonical server data after commands');
  assert.doesNotMatch(dialogSource, /disabled=\{/, 'all four rectification states remain selectable without a forced sequence');
  assert.match(dialogSource, /aria-pressed=/, 'the persisted status is visibly selected after saving');
  assert.doesNotMatch(dialogSource, /已重开/, 'dialog exposes only the canonical four-state labels');
  assert.doesNotMatch(dialogSource, /整改历史/, 'dialog retains only the current rectification fields instead of loading a history timeline');
  assert.doesNotMatch(dialogSource, /\/rectifications/, 'dialog does not request rectification-history data when opened');

  console.log('atomic locked issue command tests passed');
})();
