import { and, eq, inArray, ne, or } from 'drizzle-orm';
import { getDb } from '@/storage/database/pg-db';
import { hasPermission, isValidRole, Permission, type AuthRole } from '@/lib/server/rbac';
import {
  replaceMaterialTargetsWithRepository,
  lockMaterialTargetsForTransaction,
  type MaterialReplacementRepository,
  type MaterialReplacementTarget,
} from '@/lib/server/material-asset-service';
import {
  checkRecords,
  experienceTasks,
  issueOccurrences,
  issueReEvaluations,
  issues,
  materialLinks,
  materials,
  platformUsers,
  rectificationActions,
  recipes,
  recipeSteps,
  securityAuditLogs,
  verifications,
} from '@/storage/database/shared/schema';
import type {
  ContentDeleteKind,
  DeleteGraph,
  DeleteTarget,
} from '@/lib/server/content-delete-graph';

export type { ContentDeleteKind, DeleteGraph, DeleteTarget } from '@/lib/server/content-delete-graph';

export interface ContentDeleteTransaction {
  loadAndAuthorize(kind: ContentDeleteKind, id: string, actorId: string): Promise<DeleteGraph | null>;
  clearLegacyReferences(graph: DeleteGraph): Promise<void>;
  deleteMaterialLinks(graph: DeleteGraph): Promise<void>;
  deleteIssueChildren(graph: DeleteGraph): Promise<void>;
  deleteIssues(graph: DeleteGraph): Promise<void>;
  deleteChildren(graph: DeleteGraph): Promise<void>;
  deleteRoot(graph: DeleteGraph): Promise<void>;
  refreshMaterialStatuses(graph: DeleteGraph): Promise<void>;
  writeAudit(graph: DeleteGraph, actorId: string): Promise<void>;
}

export interface ContentDeleteStore {
  transaction<T>(work: (tx: ContentDeleteTransaction) => Promise<T>): Promise<T>;
}

type DatabaseTransaction = Parameters<Parameters<ReturnType<typeof getDb>['transaction']>[0]>[0];

export function resolveContentDeleteActorRole(rawRole: string): AuthRole {
  if (rawRole === 'user') return 'executor';
  return isValidRole(rawRole) ? rawRole : 'executor';
}

export function canDeleteTaskContent(input: {
  rawRole: string;
  actorId: string;
  ownerId: string | null;
  createdBy: string | null;
}): boolean {
  const role = resolveContentDeleteActorRole(input.rawRole);
  if (role === 'admin' || hasPermission(role, Permission.TASK_EDIT_ALL)) return true;
  return hasPermission(role, Permission.TASK_EDIT)
    && (input.ownerId === input.actorId || input.createdBy === input.actorId);
}

export class ContentDeletionForbiddenError extends Error {
  constructor() { super('forbidden content deletion'); }
}

export function isContentDeletionForbidden(error: unknown): error is ContentDeletionForbiddenError {
  return error instanceof ContentDeletionForbiddenError;
}

async function lockDeleteTargets(tx: DatabaseTransaction, targets: readonly MaterialReplacementTarget[]) {
  const sortedTargets = [...targets].sort((left, right) =>
    `${left.targetType}:${left.targetId}`.localeCompare(`${right.targetType}:${right.targetId}`));
  await lockMaterialTargetsForTransaction(tx, sortedTargets);
}

async function selectTaskId(tx: DatabaseTransaction, kind: ContentDeleteKind, id: string): Promise<string | null> {
  if (kind === 'record') {
    const rows = await tx.select({ taskId: checkRecords.taskId }).from(checkRecords).where(eq(checkRecords.id, id)).limit(1).execute();
    return rows[0]?.taskId ?? null;
  }
  if (kind === 'issue') {
    const rows = await tx.select({ taskId: issues.taskId }).from(issues).where(eq(issues.id, id)).for('update').limit(1).execute();
    return rows[0]?.taskId ?? null;
  }
  if (kind === 'recipe') {
    const rows = await tx.select({ taskId: recipes.taskId }).from(recipes).where(eq(recipes.id, id)).limit(1).execute();
    return rows[0]?.taskId ?? null;
  }
  const rows = await tx.select({ taskId: recipes.taskId }).from(recipeSteps)
    .innerJoin(recipes, eq(recipes.id, recipeSteps.recipeId))
    .where(eq(recipeSteps.id, id)).limit(1).execute();
  return rows[0]?.taskId ?? null;
}

async function assertTaskDeleteAccess(tx: DatabaseTransaction, taskId: string, actorId: string) {
  const rows = await tx.select({
    role: platformUsers.role,
    ownerId: experienceTasks.ownerId,
    createdBy: experienceTasks.createdBy,
  }).from(platformUsers)
    .innerJoin(experienceTasks, eq(experienceTasks.id, taskId))
    .where(eq(platformUsers.id, actorId)).limit(1).execute();
  const row = rows[0];
  if (!row || !canDeleteTaskContent({
    rawRole: row.role,
    actorId,
    ownerId: row.ownerId,
    createdBy: row.createdBy,
  })) {
    throw new ContentDeletionForbiddenError();
  }
}

async function loadDeleteGraph(tx: DatabaseTransaction, kind: ContentDeleteKind, id: string, actorId: string): Promise<DeleteGraph | null> {
  await lockDeleteTargets(tx, [{ targetType: kind, targetId: id }]);
  const taskId = await selectTaskId(tx, kind, id);
  if (!taskId) return null;
  await assertTaskDeleteAccess(tx, taskId, actorId);

  const stepIds = kind === 'recipe'
    ? (await tx.select({ id: recipeSteps.id }).from(recipeSteps).where(eq(recipeSteps.recipeId, id)).orderBy(recipeSteps.id).for('update').execute()).map((row) => row.id)
    : kind === 'recipe_step' ? [id] : [];
  await lockDeleteTargets(tx, stepIds.map((stepId) => ({ targetType: 'recipe_step', targetId: stepId })));
  const affectedRecordIds = kind === 'issue'
    ? []
    : (await tx.select({ id: checkRecords.id }).from(checkRecords).where(
      kind === 'record'
        ? eq(checkRecords.id, id)
        : kind === 'recipe_step'
          ? eq(checkRecords.recipeStepId, id)
          : stepIds.length > 0
            ? or(eq(checkRecords.recipeId, id), inArray(checkRecords.recipeStepId, stepIds))
            : eq(checkRecords.recipeId, id),
    ).orderBy(checkRecords.id).for('update').execute()).map((row) => row.id);
  const issuePredicate = kind === 'issue'
    ? eq(issues.id, id)
    : kind === 'record'
    ? eq(issues.recordId, id)
    : kind === 'recipe_step'
      ? eq(issues.recipeStepId, id)
      : stepIds.length > 0
        ? or(eq(issues.recipeId, id), inArray(issues.recipeStepId, stepIds))
        : eq(issues.recipeId, id);
  const issueIds = (await tx.select({ id: issues.id }).from(issues).where(issuePredicate).orderBy(issues.id).for('update').execute()).map((row) => row.id);
  await lockDeleteTargets(tx, issueIds.map((issueId) => ({ targetType: 'issue', targetId: issueId })));
  const reEvaluationIds = issueIds.length > 0
    ? (await tx.select({ id: issueReEvaluations.id }).from(issueReEvaluations).where(inArray(issueReEvaluations.issueId, issueIds)).orderBy(issueReEvaluations.id).for('update').execute()).map((row) => row.id)
    : [];
  await lockDeleteTargets(tx, reEvaluationIds.map((reEvaluationId) => ({ targetType: 're_evaluation', targetId: reEvaluationId })));
  const targets: DeleteTarget[] = [
    ...(kind === 'issue' ? [] : [{ type: kind, id }]),
    ...(kind === 'recipe' ? stepIds.map((stepId) => ({ type: 'recipe_step' as const, id: stepId })) : []),
    ...issueIds.map((issueId) => ({ type: 'issue' as const, id: issueId })),
    ...reEvaluationIds.map((reEvaluationId) => ({ type: 're_evaluation' as const, id: reEvaluationId })),
  ];

  const linkedMaterialRows: Array<{ materialId: string }> = [];
  for (const target of targets) {
    linkedMaterialRows.push(...await tx.select({ materialId: materialLinks.materialId }).from(materialLinks)
      .where(and(eq(materialLinks.targetType, target.type), eq(materialLinks.targetId, target.id))).execute());
  }
  const legacyPredicate = kind === 'record'
    ? or(
      eq(materials.recordId, id),
      ...(issueIds.length > 0 ? [inArray(materials.issueId, issueIds)] : []),
      ...(reEvaluationIds.length > 0 ? [inArray(materials.reEvaluationId, reEvaluationIds)] : []),
    )
    : kind === 'issue'
      ? or(
        eq(materials.issueId, id),
        ...(reEvaluationIds.length > 0 ? [inArray(materials.reEvaluationId, reEvaluationIds)] : []),
      )
      : kind === 'recipe_step'
      ? or(
        eq(materials.recipeStepId, id),
        ...(issueIds.length > 0 ? [inArray(materials.issueId, issueIds)] : []),
        ...(reEvaluationIds.length > 0 ? [inArray(materials.reEvaluationId, reEvaluationIds)] : []),
      )
      : or(
        eq(materials.recipeId, id),
        ...(stepIds.length > 0 ? [inArray(materials.recipeStepId, stepIds)] : []),
        ...(issueIds.length > 0 ? [inArray(materials.issueId, issueIds)] : []),
        ...(reEvaluationIds.length > 0 ? [inArray(materials.reEvaluationId, reEvaluationIds)] : []),
      );
  const legacyRows = await tx.select({ materialId: materials.id }).from(materials).where(legacyPredicate).execute();
  return {
    kind, id, actorId, stepIds, affectedRecordIds, issueIds, reEvaluationIds, targets,
    materialIds: [...new Set([...linkedMaterialRows.map((row) => row.materialId), ...legacyRows.map((row) => row.materialId)])],
  };
}

function createDeletionMaterialRepository(tx: DatabaseTransaction): MaterialReplacementRepository {
  return {
    transaction: async (work) => work(createDeletionMaterialRepository(tx)),
    async assertMaterialAccess() { /* Parent content graph has already been locked and authorized. */ },
    async lockMaterials(materialIds) {
      if (materialIds.length > 0) await tx.select({ id: materials.id }).from(materials)
        .where(inArray(materials.id, [...materialIds])).orderBy(materials.id).for('update').execute();
    },
    async assertTargetAccess() { /* Parent content graph authorization covers every descendant target. */ },
    async addLinks() { throw new Error('deletion repository cannot add links'); },
    async removeLinks(materialId, targets) {
      for (const target of targets) await tx.delete(materialLinks).where(and(
        eq(materialLinks.materialId, materialId),
        eq(materialLinks.targetType, target.targetType),
        eq(materialLinks.targetId, target.targetId),
      )).execute();
    },
    async syncLegacyTargets(materialId, targetTypes) {
      const columns = {
        record: materials.recordId,
        recipe: materials.recipeId,
        recipe_step: materials.recipeStepId,
        issue: materials.issueId,
        re_evaluation: materials.reEvaluationId,
      } as const;
      for (const targetType of targetTypes) {
        if (!(targetType in columns)) continue;
        const column = columns[targetType as keyof typeof columns];
        const remaining = await tx.select({ targetId: materialLinks.targetId }).from(materialLinks)
          .where(and(eq(materialLinks.materialId, materialId), eq(materialLinks.targetType, targetType)))
          .orderBy(materialLinks.bindingOrder, materialLinks.boundAt, materialLinks.id).limit(1).execute();
        await tx.update(materials).set({ [column.name]: remaining[0]?.targetId ?? null }).where(eq(materials.id, materialId)).execute();
      }
    },
    async listLinks(materialId) {
      return (await tx.select({ id: materialLinks.id, targetType: materialLinks.targetType, targetId: materialLinks.targetId, bindingMethod: materialLinks.bindingMethod })
        .from(materialLinks).where(eq(materialLinks.materialId, materialId)).execute())
        .map((row) => ({ ...row, targetType: row.targetType as MaterialReplacementTarget['targetType'], bindingMethod: row.bindingMethod as 'click_select' }));
    },
    async updateDerivedStatus(materialId, status) {
      await tx.update(materials).set({ status }).where(and(eq(materials.id, materialId), ne(materials.status, 'archived'))).execute();
    },
  };
}

function createDatabaseStore(): ContentDeleteStore {
  const db = getDb();
  return {
    transaction: (work) => db.transaction(async (tx) => work({
      loadAndAuthorize: (kind, id, actorId) => loadDeleteGraph(tx, kind, id, actorId),
      async clearLegacyReferences(graph) {
        if (graph.kind === 'recipe_step' && graph.affectedRecordIds.length > 0) {
          await tx.update(checkRecords).set({ recipeStepId: null })
            .where(inArray(checkRecords.id, graph.affectedRecordIds)).execute();
        }
        if (graph.kind === 'recipe' && graph.affectedRecordIds.length > 0) {
          await tx.update(checkRecords).set({ recipeId: null, recipeStepId: null })
            .where(inArray(checkRecords.id, graph.affectedRecordIds)).execute();
        }
        if (graph.kind === 'record') await tx.update(materials).set({ recordId: null }).where(eq(materials.recordId, graph.id)).execute();
        if (graph.kind === 'recipe_step') await tx.update(materials).set({ recipeStepId: null }).where(eq(materials.recipeStepId, graph.id)).execute();
        if (graph.kind === 'recipe') {
          await tx.update(materials).set({ recipeId: null }).where(eq(materials.recipeId, graph.id)).execute();
          if (graph.stepIds.length > 0) await tx.update(materials).set({ recipeStepId: null }).where(inArray(materials.recipeStepId, graph.stepIds)).execute();
        }
        if (graph.issueIds.length > 0) await tx.update(materials).set({ issueId: null }).where(inArray(materials.issueId, graph.issueIds)).execute();
        if (graph.reEvaluationIds.length > 0) await tx.update(materials).set({ reEvaluationId: null }).where(inArray(materials.reEvaluationId, graph.reEvaluationIds)).execute();
      },
      async deleteMaterialLinks(graph) {
        const repository = createDeletionMaterialRepository(tx);
        const remove = graph.targets.map((target) => ({ targetType: target.type, targetId: target.id } as MaterialReplacementTarget));
        for (const materialId of graph.materialIds) {
          await replaceMaterialTargetsWithRepository({ materialId, actorId: graph.actorId, add: [], remove }, repository);
        }
      },
      async deleteIssueChildren(graph) {
        if (graph.issueIds.length === 0) return;
        await tx.delete(verifications).where(inArray(verifications.issueId, graph.issueIds)).execute();
        await tx.delete(rectificationActions).where(inArray(rectificationActions.issueId, graph.issueIds)).execute();
        await tx.delete(issueOccurrences).where(inArray(issueOccurrences.issueId, graph.issueIds)).execute();
        if (graph.reEvaluationIds.length > 0) await tx.delete(issueReEvaluations).where(inArray(issueReEvaluations.id, graph.reEvaluationIds)).execute();
      },
      async deleteIssues(graph) {
        if (graph.issueIds.length > 0) await tx.delete(issues).where(inArray(issues.id, graph.issueIds)).execute();
      },
      async deleteChildren(graph) {
        if (graph.kind === 'recipe' && graph.stepIds.length > 0) await tx.delete(recipeSteps).where(inArray(recipeSteps.id, graph.stepIds)).execute();
      },
      async deleteRoot(graph) {
        if (graph.kind === 'record') await tx.delete(checkRecords).where(eq(checkRecords.id, graph.id)).execute();
        if (graph.kind === 'recipe_step') await tx.delete(recipeSteps).where(eq(recipeSteps.id, graph.id)).execute();
        if (graph.kind === 'recipe') await tx.delete(recipes).where(eq(recipes.id, graph.id)).execute();
      },
      async refreshMaterialStatuses(graph) {
        for (const materialId of graph.materialIds) {
          const remaining = await tx.select({ id: materialLinks.id }).from(materialLinks).where(eq(materialLinks.materialId, materialId)).limit(1).execute();
          await tx.update(materials).set({ status: remaining.length > 0 ? 'bound' : 'unassigned' })
            .where(and(eq(materials.id, materialId), ne(materials.status, 'archived'))).execute();
        }
      },
      async writeAudit(graph, actorId) {
        await tx.insert(securityAuditLogs).values({
          action: `${graph.kind}.deleted`, actorUserId: actorId, targetType: graph.kind,
          targetId: graph.id, outcome: 'success',
          metadata: { issueCount: graph.issueIds.length, stepCount: graph.stepIds.length },
        }).execute();
      },
    })),
  };
}

async function deleteContentAtomically(
  input: { kind: ContentDeleteKind; id: string; actorId: string },
  store: ContentDeleteStore,
): Promise<boolean> {
  return store.transaction(async (tx) => {
    const graph = await tx.loadAndAuthorize(input.kind, input.id, input.actorId);
    if (!graph) return false;
    await tx.clearLegacyReferences(graph);
    await tx.deleteMaterialLinks(graph);
    await tx.deleteIssueChildren(graph);
    await tx.deleteIssues(graph);
    await tx.deleteChildren(graph);
    await tx.deleteRoot(graph);
    await tx.refreshMaterialStatuses(graph);
    await tx.writeAudit(graph, input.actorId);
    return true;
  });
}

export async function deleteRecordAtomically(input: { recordId: string; actorId: string }, store: ContentDeleteStore = createDatabaseStore()) {
  return deleteContentAtomically({ kind: 'record', id: input.recordId, actorId: input.actorId }, store);
}

export async function deleteRecipeStepAtomically(input: { stepId: string; actorId: string }, store: ContentDeleteStore = createDatabaseStore()) {
  return deleteContentAtomically({ kind: 'recipe_step', id: input.stepId, actorId: input.actorId }, store);
}

export async function deleteRecipeAtomically(input: { recipeId: string; actorId: string }, store: ContentDeleteStore = createDatabaseStore()) {
  return deleteContentAtomically({ kind: 'recipe', id: input.recipeId, actorId: input.actorId }, store);
}

export async function deleteIssueAtomically(input: { issueId: string; actorId: string }, store: ContentDeleteStore = createDatabaseStore()) {
  return deleteContentAtomically({ kind: 'issue', id: input.issueId, actorId: input.actorId }, store);
}
