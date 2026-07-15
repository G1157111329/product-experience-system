import { eq } from 'drizzle-orm';
import { canAccessMatrix, type AuthUser } from '@/lib/server/auth';
import { getDb } from '@/storage/database/pg-db';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { agentRuns, agentSuggestionBlocks, conversations, taskMatrices } from '@/storage/database/shared/schema';

type Resource = { matrixId: string };
type SuggestionResource = Resource & {
  suggestionBlockId: string;
  suggestionPayload: unknown;
  originUserId: string | null;
  conversationTaskId: string | null;
  matrixTaskId: string | null;
};

export interface AgentResourceRepository {
  findMatrix(matrixId: string): Promise<Resource | null>;
  findSuggestion(suggestionBlockId: string): Promise<SuggestionResource | null>;
}

export type MatrixAccessChecker = (user: AuthUser, matrixId: string) => Promise<boolean>;

export type AgentAccessDenial = {
  actorUserId: string;
  resourceType: 'matrix' | 'suggestion_block';
  resourceId: string;
  reason: 'not_found' | 'forbidden';
};

export type AgentAccessDenialWriter = (denial: AgentAccessDenial) => Promise<void>;

export class AgentResourceAccessError extends Error {
  constructor(public readonly code: 'not_found' | 'forbidden') { super(code); }
}

async function assertCanonicalMatrixAccess(
  user: AuthUser,
  resource: Resource | null,
  matrixAccess: MatrixAccessChecker,
) {
  if (!resource) throw new AgentResourceAccessError('not_found');
  if (!(await matrixAccess(user, resource.matrixId))) throw new AgentResourceAccessError('forbidden');
}

async function emitDenialSafely(onDenied: AgentAccessDenialWriter, denial: AgentAccessDenial) {
  try { await onDenied(denial); }
  catch { /* Audit storage must not replace the stable authorization rejection. */ }
}

export async function assertMatrixSkillAccessWithRepository(
  input: { user: AuthUser; matrixId: string },
  repository: AgentResourceRepository,
  matrixAccess: MatrixAccessChecker,
) {
  const resource = await repository.findMatrix(input.matrixId);
  await assertCanonicalMatrixAccess(input.user, resource, matrixAccess);
}

export async function assertSuggestionDecisionAccessWithRepository(
  input: { user: AuthUser; suggestionBlockId: string },
  repository: AgentResourceRepository,
  matrixAccess: MatrixAccessChecker,
) {
  const resource = await repository.findSuggestion(input.suggestionBlockId);
  if (!resource) throw new AgentResourceAccessError('not_found');
  if (!resource.originUserId
    || resource.originUserId !== input.user.id
    || !resource.conversationTaskId
    || !resource.matrixTaskId
    || resource.conversationTaskId !== resource.matrixTaskId) {
    throw new AgentResourceAccessError('forbidden');
  }
  await assertCanonicalMatrixAccess(input.user, resource, matrixAccess);
  return { matrixId: resource.matrixId, suggestionPayload: resource.suggestionPayload };
}

export async function authorizeMatrixSkillAccessWithRepository(
  input: { user: AuthUser; matrixId: string },
  repository: AgentResourceRepository,
  matrixAccess: MatrixAccessChecker,
  onDenied: AgentAccessDenialWriter,
) {
  try {
    await assertMatrixSkillAccessWithRepository(input, repository, matrixAccess);
  } catch (error) {
    if (error instanceof AgentResourceAccessError) {
      await emitDenialSafely(onDenied, {
        actorUserId: input.user.id,
        resourceType: 'matrix',
        resourceId: input.matrixId,
        reason: error.code,
      });
    }
    throw error;
  }
}

export async function authorizeSuggestionDecisionAccessWithRepository(
  input: { user: AuthUser; suggestionBlockId: string },
  repository: AgentResourceRepository,
  matrixAccess: MatrixAccessChecker,
  onDenied: AgentAccessDenialWriter,
) {
  try {
    return await assertSuggestionDecisionAccessWithRepository(input, repository, matrixAccess);
  } catch (error) {
    if (error instanceof AgentResourceAccessError) {
      await emitDenialSafely(onDenied, {
        actorUserId: input.user.id,
        resourceType: 'suggestion_block',
        resourceId: input.suggestionBlockId,
        reason: error.code,
      });
    }
    throw error;
  }
}

const databaseRepository: AgentResourceRepository = {
  async findMatrix(matrixId) {
    const db = await getDb();
    const rows = await db.select({ matrixId: taskMatrices.id })
      .from(taskMatrices).where(eq(taskMatrices.id, matrixId)).limit(1).execute();
    return rows[0] ?? null;
  },
  async findSuggestion(suggestionBlockId) {
    const db = await getDb();
    const rows = await db.select({
      id: agentSuggestionBlocks.id,
      payload: agentSuggestionBlocks.payload,
      targetType: agentSuggestionBlocks.targetEntityType,
      matrixId: agentSuggestionBlocks.targetEntityId,
      originUserId: conversations.platformUserId,
      conversationTaskId: conversations.taskId,
      matrixTaskId: taskMatrices.taskId,
    }).from(agentSuggestionBlocks)
      .innerJoin(agentRuns, eq(agentRuns.id, agentSuggestionBlocks.agentRunId))
      .innerJoin(conversations, eq(conversations.id, agentRuns.conversationId))
      .innerJoin(taskMatrices, eq(taskMatrices.id, agentSuggestionBlocks.targetEntityId))
      .where(eq(agentSuggestionBlocks.id, suggestionBlockId)).limit(1).execute();
    const suggestion = rows[0];
    if (!suggestion || suggestion.targetType !== 'matrix' || !suggestion.matrixId) return null;
    return {
      suggestionBlockId: suggestion.id,
      matrixId: suggestion.matrixId,
      suggestionPayload: suggestion.payload,
      originUserId: suggestion.originUserId,
      conversationTaskId: suggestion.conversationTaskId,
      matrixTaskId: suggestion.matrixTaskId,
    };
  },
};

const canonicalMatrixAccess: MatrixAccessChecker = (user, matrixId) =>
  canAccessMatrix(getSupabaseClient(), user, matrixId);

export async function assertMatrixSkillAccess(input: { user: AuthUser; matrixId: string }): Promise<void> {
  return assertMatrixSkillAccessWithRepository(input, databaseRepository, canonicalMatrixAccess);
}

export async function assertSuggestionDecisionAccess(input: {
  user: AuthUser;
  suggestionBlockId: string;
}): Promise<{ matrixId: string; suggestionPayload: unknown }> {
  return assertSuggestionDecisionAccessWithRepository(input, databaseRepository, canonicalMatrixAccess);
}

export async function authorizeMatrixSkillAccess(
  input: { user: AuthUser; matrixId: string },
  onDenied: AgentAccessDenialWriter,
): Promise<void> {
  return authorizeMatrixSkillAccessWithRepository(input, databaseRepository, canonicalMatrixAccess, onDenied);
}

export async function authorizeSuggestionDecisionAccess(
  input: { user: AuthUser; suggestionBlockId: string },
  onDenied: AgentAccessDenialWriter,
): Promise<{ matrixId: string; suggestionPayload: unknown }> {
  return authorizeSuggestionDecisionAccessWithRepository(input, databaseRepository, canonicalMatrixAccess, onDenied);
}
