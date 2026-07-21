import { and, eq } from 'drizzle-orm';
import { getDb } from '@/storage/database/pg-db';
import {
  experienceTasks, issues, platformUsers, rectificationActions, securityAuditLogs, verifications,
} from '@/storage/database/shared/schema';
import {
  resolveIssueStatusChange,
  type AuthRole,
  type IssueStatus,
  type IssueTransition,
} from '@/lib/server/issue-state-machine';

export type IssueCommandInput = {
  issueId: string;
  actorId: string;
  command: IssueTransition;
  requestedStatus?: IssueStatus;
  expectedVersion?: number;
  fields?: Record<string, unknown>;
};

export type LockedIssueCommand = {
  currentStatus: string;
  actorRole: AuthRole;
  version: number;
  improvePlan?: string | null;
};

export type IssueCommandPatch = {
  status: IssueStatus;
  plan?: string | null;
  dueAt?: string | null;
  responsiblePerson?: string | null;
  responsibleDept?: string | null;
  note?: string | null;
  noImproveReason?: string | null;
  isImprove?: boolean | null;
  actualCompleteDate?: string | null;
  isClosed?: boolean;
  title?: string;
  productModel?: string | null;
  category?: string | null;
  subCategory?: string | null;
  severity?: string | null;
  priority?: string | null;
  level?: string | null;
  description?: string | null;
};

export interface IssueCommandTransaction {
  lockIssueAndAuthorize(issueId: string, actorId: string): Promise<LockedIssueCommand>;
  updateIssue(issueId: string, patch: IssueCommandPatch, lockedVersion: number): Promise<void>;
  createAction(input: {
    issueId: string; actorId: string; plan: string; dueAt: string | null;
    responsiblePerson: string | null; responsibleDept: string | null; note: string | null;
  }): Promise<void>;
  getLatestRectificationAction(issueId: string): Promise<string | null>;
  createVerification(input: { issueId: string; actionId: string; result: 'partial' | 'passed'; note: string | null; actorId?: string }): Promise<void>;
  completeRectificationAction(actionId: string, actualCompleteDate: string): Promise<void>;
  writeAudit(input: { issueId: string; actorId: string; command: string }): Promise<void>;
}

export interface IssueCommandStore {
  transaction<T>(work: (tx: IssueCommandTransaction) => Promise<T>): Promise<T>;
}

function optionalString(fields: Record<string, unknown>, key: string): string | null | undefined {
  if (!(key in fields)) return undefined;
  return typeof fields[key] === 'string' ? fields[key].trim() || null : null;
}

export function resolveLockedIssueActorRole(input: {
  rawRole: string;
  actorId: string;
  taskOwnerId: string | null;
  taskCreatedBy: string | null;
  responsiblePerson: string | null;
  actorAccount: string | null;
  actorName: string | null;
}): AuthRole {
  if (input.rawRole === 'admin') return 'admin';
  if (input.taskOwnerId === input.actorId || input.taskCreatedBy === input.actorId) return 'task_owner';
  const responsible = input.responsiblePerson?.trim();
  if (responsible && [input.actorId, input.actorAccount, input.actorName].some((value) => value === responsible)) return 'rectification_owner';
  if (input.rawRole === 'product_manager' || input.rawRole === 'reviewer' || input.rawRole === 'executive_viewer') return input.rawRole;
  return 'executor';
}

function createDatabaseStore(): IssueCommandStore {
  const db = getDb();
  return {
    transaction: (work) => db.transaction(async (tx) => work({
      async lockIssueAndAuthorize(issueId, actorId) {
        const rows = await tx.select({
          issueId: issues.id,
          status: issues.status,
          version: issues.version,
          improvePlan: issues.improvePlan,
          responsiblePerson: issues.responsiblePerson,
          taskOwnerId: experienceTasks.ownerId,
          taskCreatedBy: experienceTasks.createdBy,
          actorRole: platformUsers.role,
          actorAccount: platformUsers.account,
          actorName: platformUsers.name,
        }).from(issues)
          .innerJoin(experienceTasks, eq(experienceTasks.id, issues.taskId))
          .innerJoin(platformUsers, eq(platformUsers.id, actorId))
          .where(eq(issues.id, issueId))
          .for('update', { of: issues })
          .limit(1).execute();
        const row = rows[0];
        if (!row) throw new Error('issue not found');
        const actorRole = resolveLockedIssueActorRole({
          rawRole: row.actorRole,
          actorId,
          taskOwnerId: row.taskOwnerId,
          taskCreatedBy: row.taskCreatedBy,
          responsiblePerson: row.responsiblePerson,
          actorAccount: row.actorAccount,
          actorName: row.actorName,
        });
        return {
          currentStatus: row.status,
          actorRole,
          version: row.version,
          improvePlan: row.improvePlan,
        };
      },
      async updateIssue(issueId, patch, lockedVersion) {
        const updated = await tx.update(issues).set({
          status: patch.status,
          ...(patch.plan !== undefined ? { improvePlan: patch.plan } : {}),
          ...(patch.dueAt !== undefined ? { dueAt: patch.dueAt, planCompleteDate: patch.dueAt?.slice(0, 10) ?? null } : {}),
          ...(patch.responsiblePerson !== undefined ? { responsiblePerson: patch.responsiblePerson } : {}),
          ...(patch.responsibleDept !== undefined ? { responsibleDept: patch.responsibleDept } : {}),
          ...(patch.note !== undefined ? { verificationNote: patch.note } : {}),
          ...(patch.noImproveReason !== undefined ? { noImproveReason: patch.noImproveReason } : {}),
          ...(patch.isImprove !== undefined ? { isImprove: patch.isImprove } : {}),
          ...(patch.actualCompleteDate !== undefined ? { actualCompleteDate: patch.actualCompleteDate } : {}),
          ...(patch.isClosed !== undefined ? { isClosed: patch.isClosed } : {}),
          ...(patch.title !== undefined ? { title: patch.title } : {}),
          ...(patch.productModel !== undefined ? { productModel: patch.productModel } : {}),
          ...(patch.category !== undefined ? { category: patch.category } : {}),
          ...(patch.subCategory !== undefined ? { subCategory: patch.subCategory } : {}),
          ...(patch.severity !== undefined ? { severity: patch.severity } : {}),
          ...(patch.priority !== undefined ? { priority: patch.priority } : {}),
          ...(patch.level !== undefined ? { level: patch.level } : {}),
          ...(patch.description !== undefined ? { description: patch.description } : {}),
          version: lockedVersion + 1,
          updatedAt: new Date().toISOString(),
        }).where(and(eq(issues.id, issueId), eq(issues.version, lockedVersion))).returning({ id: issues.id }).execute();
        if (updated.length !== 1) throw new Error('issue version conflict');
      },
      async createAction(input) {
        await tx.insert(rectificationActions).values({
          issueId: input.issueId,
          actionPlan: input.plan,
          planCompleteDate: input.dueAt?.slice(0, 10) ?? null,
          responsiblePerson: input.responsiblePerson,
          responsibleDept: input.responsibleDept,
          note: input.note,
          status: 'in_progress',
          createdBy: input.actorId,
        }).execute();
      },
      async getLatestRectificationAction(issueId) {
        const rows = await tx.select({ id: rectificationActions.id }).from(rectificationActions)
          .where(eq(rectificationActions.issueId, issueId))
          .orderBy(rectificationActions.createdAt)
          .for('update').execute();
        return rows.at(-1)?.id ?? null;
      },
      async createVerification(input) {
        await tx.insert(verifications).values({
          issueId: input.issueId,
          rectificationActionId: input.actionId,
          result: input.result,
          note: input.note,
          verifiedBy: input.actorId ?? null,
        }).execute();
      },
      async completeRectificationAction(actionId, actualCompleteDate) {
        await tx.update(rectificationActions).set({
          status: 'completed', actualCompleteDate, updatedAt: new Date().toISOString(),
        }).where(eq(rectificationActions.id, actionId)).execute();
      },
      async writeAudit(input) {
        await tx.insert(securityAuditLogs).values({
          action: `issue.${input.command}`,
          actorUserId: input.actorId,
          targetType: 'issue', targetId: input.issueId, outcome: 'success',
          metadata: { command: input.command },
        }).execute();
      },
    })),
  };
}

/** Lock, authorize, validate and execute one canonical issue command atomically. */
export async function executeIssueCommand(
  input: IssueCommandInput,
  store: IssueCommandStore = createDatabaseStore(),
): Promise<IssueStatus> {
  const fields = input.fields ?? {};
  const allowedFields = new Set([
    'transition', 'status', 'version',
    'title', 'product_model', 'category', 'sub_category', 'severity', 'priority', 'level', 'description',
    'is_improve', 'no_improve_reason', 'improve_plan', 'responsible_dept', 'responsible_person',
    'plan_complete_date', 'actual_complete_date', 'is_closed', 'verification_note',
  ]);
  const unknown = Object.keys(fields).filter((key) => !allowedFields.has(key));
  if (unknown.length > 0) throw new Error(`unsupported issue command fields: ${unknown.join(', ')}`);
  if ('title' in fields && !optionalString(fields, 'title')) throw new Error('issue title is required');
  return store.transaction(async (tx) => {
    const locked = await tx.lockIssueAndAuthorize(input.issueId, input.actorId);
    if (input.expectedVersion !== undefined && input.expectedVersion !== locked.version) throw new Error('issue version conflict');
    const nextStatus = resolveIssueStatusChange({
      currentStatus: locked.currentStatus,
      requestedStatus: input.requestedStatus,
      transition: input.command,
      role: locked.actorRole,
      fields,
    });
    const patch: IssueCommandPatch = {
      status: nextStatus,
      plan: optionalString(fields, 'improve_plan'),
      dueAt: optionalString(fields, 'plan_complete_date'),
      responsiblePerson: optionalString(fields, 'responsible_person'),
      responsibleDept: optionalString(fields, 'responsible_dept'),
      note: optionalString(fields, 'verification_note'),
      noImproveReason: optionalString(fields, 'no_improve_reason'),
      isImprove: 'is_improve' in fields ? Boolean(fields.is_improve) : undefined,
      actualCompleteDate: optionalString(fields, 'actual_complete_date'),
      title: optionalString(fields, 'title') ?? undefined,
      productModel: optionalString(fields, 'product_model'),
      category: optionalString(fields, 'category'),
      subCategory: optionalString(fields, 'sub_category'),
      severity: optionalString(fields, 'severity'),
      priority: optionalString(fields, 'priority'),
      level: optionalString(fields, 'level'),
      description: optionalString(fields, 'description'),
    };
    if (input.command === 'verify') {
      patch.actualCompleteDate = patch.actualCompleteDate ?? new Date().toISOString().slice(0, 10);
      patch.isClosed = true;
      patch.isImprove = true;
    } else if (input.command === 'waive') {
      patch.isClosed = true;
      patch.isImprove = false;
    } else {
      patch.isClosed = false;
    }
    await tx.updateIssue(input.issueId, patch, locked.version);

    const createsAction = (input.command === 'start_rectify' || input.command === 'return_to_rectifying')
      && locked.currentStatus !== 'rectifying';
    if (createsAction) {
      const plan = optionalString(fields, 'improve_plan') ?? (locked.improvePlan?.trim() || '开始整改');
      await tx.createAction({
        issueId: input.issueId,
        actorId: input.actorId,
        plan,
        dueAt: optionalString(fields, 'plan_complete_date') ?? null,
        responsiblePerson: optionalString(fields, 'responsible_person') ?? null,
        responsibleDept: optionalString(fields, 'responsible_dept') ?? null,
        note: optionalString(fields, 'verification_note') ?? null,
      });
    }
    if (input.command === 'submit_verification' || input.command === 'verify') {
      let actionId = await tx.getLatestRectificationAction(input.issueId);
      if (!actionId && input.command === 'verify') {
        await tx.createAction({
          issueId: input.issueId,
          actorId: input.actorId,
          plan: optionalString(fields, 'improve_plan') ?? (locked.improvePlan?.trim() || 'Directly marked rectified'),
          dueAt: optionalString(fields, 'plan_complete_date') ?? null,
          responsiblePerson: optionalString(fields, 'responsible_person') ?? null,
          responsibleDept: optionalString(fields, 'responsible_dept') ?? null,
          note: optionalString(fields, 'verification_note') ?? null,
        });
        actionId = await tx.getLatestRectificationAction(input.issueId);
      }
      if (!actionId) throw new Error('rectification action required');
      const actualCompleteDate = patch.actualCompleteDate ?? new Date().toISOString().slice(0, 10);
      await tx.createVerification({
        issueId: input.issueId,
        actionId,
        result: input.command === 'verify' ? 'passed' : 'partial',
        note: optionalString(fields, 'verification_note') ?? null,
        actorId: input.actorId,
      });
      if (input.command === 'verify') await tx.completeRectificationAction(actionId, actualCompleteDate);
    }
    await tx.writeAudit({ issueId: input.issueId, actorId: input.actorId, command: input.command });
    return nextStatus;
  });
}
