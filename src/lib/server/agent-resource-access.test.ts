import assert from 'node:assert/strict';
import * as agentAccess from './agent-resource-access';
import { readFileSync } from 'node:fs';
import * as materialAssets from './material-asset-service';
import { resolveUnassignedMaterialScope } from './material-asset-service';
import { canAccessMatrix, type AuthUser, type ClientLike } from './auth';

const repository = {
  async findMatrix(matrixId: string) {
    return matrixId === 'matrix-a' ? { matrixId } : null;
  },
  async findSuggestion(id: string) {
    return id === 'suggestion-a'
      ? {
        suggestionBlockId: id,
        matrixId: 'matrix-a',
        suggestionPayload: { content: 'x', matrixId: 'client-must-not-win' },
        originUserId: 'user-a',
        conversationTaskId: 'task-a',
        matrixTaskId: 'task-a',
      }
      : null;
  },
};

function user(id: string, role: AuthUser['role']): AuthUser {
  return { id, role, account: id, name: id };
}

function fakeClient(): ClientLike {
  const tables: Record<string, Array<Record<string, unknown>>> = {
    task_matrices: [{ id: 'matrix-a', task_id: 'task-a', created_by: 'old-matrix-creator' }],
    experience_tasks: [{ id: 'task-a', created_by: 'user-a', owner_id: 'user-a' }],
  };
  return {
    from(table: string) {
      return {
        select() {
          return {
            eq(field: string, value: unknown) {
              const data = tables[table]?.find((row) => row[field] === value) ?? null;
              return {
                maybeSingle: async () => ({ data }),
                single: async () => ({ data }),
              };
            },
          };
        },
      };
    },
  } as ClientLike;
}

const canonicalAccess = (currentUser: AuthUser, matrixId: string) => canAccessMatrix(fakeClient(), currentUser, matrixId);

type TestRepository = agentAccess.AgentResourceRepository;
type MatrixAssert = (input: { user: AuthUser; matrixId: string }, resourceRepository: TestRepository, access: typeof canonicalAccess) => Promise<void>;
type SuggestionAssert = (input: { user: AuthUser; suggestionBlockId: string }, resourceRepository: TestRepository, access: typeof canonicalAccess) => Promise<{ matrixId: string; suggestionPayload: unknown }>;
const assertMatrix = agentAccess.assertMatrixSkillAccessWithRepository as unknown as MatrixAssert;
const assertSuggestion = agentAccess.assertSuggestionDecisionAccessWithRepository as unknown as SuggestionAssert;

async function main() {
  assert.equal(typeof agentAccess.authorizeMatrixSkillAccessWithRepository, 'function', 'matrix denial boundary must be injectable');
  assert.equal(typeof agentAccess.authorizeSuggestionDecisionAccessWithRepository, 'function', 'suggestion denial boundary must be injectable');
  const deniedAudits: Array<Record<string, unknown>> = [];
  let modelCalls = 0;
  let runWrites = 0;
  let narrativeWrites = 0;
  await assert.rejects(async () => {
    await agentAccess.authorizeMatrixSkillAccessWithRepository(
      { user: user('user-b', 'executor'), matrixId: 'matrix-a' },
      repository,
      canonicalAccess,
      async (denial) => { deniedAudits.push(denial); },
    );
    modelCalls += 1;
    runWrites += 1;
  }, /forbidden/);
  await assert.rejects(async () => {
    await agentAccess.authorizeSuggestionDecisionAccessWithRepository(
      { user: user('user-b', 'executor'), suggestionBlockId: 'suggestion-a' },
      repository,
      canonicalAccess,
      async (denial) => { deniedAudits.push(denial); },
    );
    narrativeWrites += 1;
  }, /forbidden/);
  assert.equal(deniedAudits.length, 2, 'each denied agent boundary emits one audit event');
  assert.deepEqual(deniedAudits.map((entry) => entry.resourceType), ['matrix', 'suggestion_block']);
  assert.deepEqual({ modelCalls, runWrites, narrativeWrites }, { modelCalls: 0, runWrites: 0, narrativeWrites: 0 });
  await assert.doesNotReject(() => assertMatrix({ user: user('admin-a', 'admin'), matrixId: 'matrix-a' }, repository, canonicalAccess));
  await assert.doesNotReject(() => assertMatrix({ user: user('portfolio-owner', 'task_owner'), matrixId: 'matrix-a' }, repository, canonicalAccess));
  await assert.doesNotReject(() => assertMatrix({ user: user('user-a', 'executor'), matrixId: 'matrix-a' }, repository, canonicalAccess));
  await assert.rejects(() => assertMatrix({ user: user('old-matrix-creator', 'executor'), matrixId: 'matrix-a' }, repository, canonicalAccess), /forbidden/, 'stale matrix.created_by cannot bypass current task RBAC');
  await assert.rejects(() => assertMatrix({ user: user('user-b', 'executor'), matrixId: 'matrix-a' }, repository, canonicalAccess), /forbidden/);
  await assert.rejects(() => assertSuggestion({ user: user('user-b', 'executor'), suggestionBlockId: 'suggestion-a' }, repository, canonicalAccess), /forbidden/);
  await assert.rejects(() => assertSuggestion({ user: user('admin-a', 'admin'), suggestionBlockId: 'suggestion-a' }, repository, canonicalAccess), /forbidden/, 'admin matrix rights cannot adopt another user conversation suggestion');
  await assert.rejects(() => assertSuggestion({ user: user('portfolio-owner', 'task_owner'), suggestionBlockId: 'suggestion-a' }, repository, canonicalAccess), /forbidden/, 'TASK_EDIT_ALL cannot adopt another user conversation suggestion');
  const access = await assertSuggestion({ user: user('user-a', 'executor'), suggestionBlockId: 'suggestion-a' }, repository, canonicalAccess);
  assert.equal(access.matrixId, 'matrix-a', 'persisted target wins over payload/client body');
  await assert.rejects(() => assertSuggestion(
    { user: user('user-a', 'executor'), suggestionBlockId: 'orphan' },
    { ...repository, async findSuggestion() { return null; } },
    canonicalAccess,
  ), /not_found/, 'orphan suggestion/run/conversation chain fails closed');
  await assert.rejects(() => assertSuggestion(
    { user: user('user-a', 'executor'), suggestionBlockId: 'suggestion-a' },
    { ...repository, async findSuggestion() { return { ...(await repository.findSuggestion('suggestion-a'))!, originUserId: null }; } },
    canonicalAccess,
  ), /forbidden/, 'null conversation user fails closed');
  await assert.rejects(() => assertSuggestion(
    { user: user('user-a', 'executor'), suggestionBlockId: 'suggestion-a' },
    { ...repository, async findSuggestion() { return { ...(await repository.findSuggestion('suggestion-a'))!, originUserId: 'user-b' }; } },
    canonicalAccess,
  ), /forbidden/, 'wrong conversation user fails closed');
  await assert.rejects(() => assertSuggestion(
    { user: user('user-a', 'executor'), suggestionBlockId: 'suggestion-a' },
    { ...repository, async findSuggestion() { return { ...(await repository.findSuggestion('suggestion-a'))!, conversationTaskId: 'task-b' }; } },
    canonicalAccess,
  ), /forbidden/, 'conversation task must match the persisted matrix task');
  await assert.rejects(() => agentAccess.authorizeMatrixSkillAccessWithRepository(
    { user: user('user-b', 'executor'), matrixId: 'matrix-a' }, repository, canonicalAccess,
    async () => { throw new Error('audit unavailable'); },
  ), /forbidden/, 'audit storage failure must preserve the stable authorization rejection');
  const skillSource = readFileSync('src/lib/server/hermes/skills.ts', 'utf8');
  assert.match(skillSource, /assertMatrixSkillAccess\(\{\s*user:\s*input\.user,/);
  assert.match(skillSource, /platformUserId:\s*input\.userId/);
  assert.match(skillSource, /executeHermesRun\(\{[\s\S]*conversationId,/);
  const accessSource = readFileSync('src/lib/server/agent-resource-access.ts', 'utf8');
  assert.match(accessSource, /canAccessMatrix/);
  assert.doesNotMatch(accessSource, /ownerIds|matrixCreator/, 'agent access must not fork canonical ownership semantics');
  assert.match(accessSource, /originUserId[\s\S]*conversationTaskId[\s\S]*matrixTaskId/, 'suggestion access binds run conversation and matrix task provenance');
  const decisionSource = readFileSync('src/app/api/v1/agent/suggestion-blocks/[id]/decide/route.ts', 'utf8');
  assert.ok(decisionSource.indexOf('authorizeSuggestionDecisionAccess') < decisionSource.indexOf('db.transaction'), 'authorization precedes narrative transaction');
  assert.match(decisionSource, /writeSecurityAudit\([\s\S]*?outcome:\s*'denied'/, 'suggestion denial is security-audited');
  assert.match(skillSource, /assertMatrixSkillAccess/, 'skill layer repeats persisted matrix authorization');
  const matrixRouteSource = readFileSync('src/app/api/v1/agent/skills/matrix-evaluation-summary/route.ts', 'utf8');
  assert.match(matrixRouteSource, /writeSecurityAudit\([\s\S]*?outcome:\s*'denied'/, 'matrix summary denial is security-audited');
  assert.deepEqual(resolveUnassignedMaterialScope({ userId: 'admin-a', isAdmin: true, globalRequested: false }), { includeGlobal: false, ownerId: 'admin-a' });
  assert.deepEqual(resolveUnassignedMaterialScope({ userId: 'admin-a', isAdmin: true, globalRequested: true }), { includeGlobal: true, ownerId: null });
  assert.throws(() => resolveUnassignedMaterialScope({ userId: 'user-a', isAdmin: false, globalRequested: true }), /forbidden/);
  assert.equal(typeof materialAssets.filterUnassignedMaterialsForScope, 'function', 'material scope predicate must be testable without a database');
  const pool = [
    { id: 'a', status: 'unassigned', projectId: null, createdBy: 'user-a', materialType: 'image', fileName: null, fileUrl: null, thumbnailUrl: null, createdAt: '2026-01-01' },
    { id: 'b', status: 'unassigned', projectId: null, createdBy: 'user-b', materialType: 'image', fileName: null, fileUrl: null, thumbnailUrl: null, createdAt: '2026-01-01' },
    { id: 'legacy', status: 'unassigned', projectId: null, createdBy: null, materialType: 'image', fileName: null, fileUrl: null, thumbnailUrl: null, createdAt: '2026-01-01' },
    { id: 'bound', status: 'bound', projectId: null, createdBy: 'user-a', materialType: 'image', fileName: null, fileUrl: null, thumbnailUrl: null, createdAt: '2026-01-01' },
    { id: 'project', status: 'unassigned', projectId: 'project-1', createdBy: 'user-a', materialType: 'image', fileName: null, fileUrl: null, thumbnailUrl: null, createdAt: '2026-01-01' },
  ];
  assert.deepEqual(materialAssets.filterUnassignedMaterialsForScope(pool, resolveUnassignedMaterialScope({ userId: 'user-a', isAdmin: false, globalRequested: false })).map((row) => row.id), ['a']);
  assert.deepEqual(materialAssets.filterUnassignedMaterialsForScope(pool, resolveUnassignedMaterialScope({ userId: 'user-b', isAdmin: false, globalRequested: false })).map((row) => row.id), ['b']);
  assert.deepEqual(materialAssets.filterUnassignedMaterialsForScope(pool, resolveUnassignedMaterialScope({ userId: 'admin-a', isAdmin: true, globalRequested: false })).map((row) => row.id), []);
  assert.deepEqual(materialAssets.filterUnassignedMaterialsForScope(pool, resolveUnassignedMaterialScope({ userId: 'admin-a', isAdmin: true, globalRequested: true })).map((row) => row.id), ['a', 'b', 'legacy']);
  assert.equal(typeof materialAssets.getUnassignedMaterialsWithRepository, 'function', 'service must expose an injectable repository boundary');
  const repositoryBoundary = { async find(scope: materialAssets.UnassignedMaterialScope) { return materialAssets.filterUnassignedMaterialsForScope(pool, scope); } };
  assert.deepEqual((await materialAssets.getUnassignedMaterialsWithRepository({ userId: 'user-a', isAdmin: false, globalRequested: false }, repositoryBoundary)).map((row) => row.id), ['a']);
  assert.deepEqual((await materialAssets.getUnassignedMaterialsWithRepository({ userId: 'user-b', isAdmin: false, globalRequested: false }, repositoryBoundary)).map((row) => row.id), ['b']);
  assert.deepEqual((await materialAssets.getUnassignedMaterialsWithRepository({ userId: 'admin-a', isAdmin: true, globalRequested: false }, repositoryBoundary)).map((row) => row.id), []);
  assert.deepEqual((await materialAssets.getUnassignedMaterialsWithRepository({ userId: 'admin-a', isAdmin: true, globalRequested: true }, repositoryBoundary)).map((row) => row.id), ['a', 'b', 'legacy']);
  const materialSource = readFileSync('src/lib/server/material-asset-service.ts', 'utf8');
  assert.match(materialSource, /scope\.includeGlobal\s*\?\s*undefined\s*:\s*eq\(materials\.createdBy, scope\.ownerId!/ , 'unknown legacy rows are absent from personal pools');
  const migration = readFileSync('src/storage/database/shared/migrations/0024_material_owner_and_wecom_replay.sql', 'utf8');
  const monolith = readFileSync('database-schema.sql', 'utf8');
  for (const token of ['material.upload', 're_evaluation_id', 'comparison_cell_id', "target_type='record'", "target_type='recipe'", "target_type='recipe_step'", "target_type='issue'", "target_type='re_evaluation'", "target_type='comparison_cell'", "target_type='dynamic_matrix_cell_value'"]) {
    assert.ok(migration.includes(token), `owner backfill covers ${token}`);
    assert.ok(monolith.includes(token), `monolithic backfill covers ${token}`);
  }
  console.log('agent resource access tests passed');
}

void main();
