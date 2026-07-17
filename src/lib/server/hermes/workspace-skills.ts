import { and, desc, eq, ilike, or, sql } from 'drizzle-orm';
import { normalizeProjectPhase } from '@/lib/dictionary-types';
import { getDb } from '@/storage/database/pg-db';
import { conversations, experienceTasks } from '@/storage/database/shared/schema';

export type OngoingTaskSummary = {
  id: string;
  taskName: string;
  productModel: string | null;
  projectPhase: string | null;
  status: string;
};

export type CreateTaskInput = {
  taskName: string;
  productCategory?: string | null;
  product?: string | null;
  productModel?: string | null;
  projectType?: string | null;
  projectPhase?: string | null;
  testPurpose?: string | null;
  organizer?: string | null;
  testDate?: string | null;
};

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i;

/** Hermes workspace skill: read the caller's real ongoing tasks (never invent). */
export async function skillListOngoingTasks(platformUserId: string, limit = 20): Promise<OngoingTaskSummary[]> {
  const db = await getDb();
  return db.select({
    id: experienceTasks.id,
    taskName: experienceTasks.taskName,
    productModel: experienceTasks.productModel,
    projectPhase: experienceTasks.projectPhase,
    status: experienceTasks.status,
  }).from(experienceTasks).where(and(
    eq(experienceTasks.createdBy, platformUserId),
    eq(experienceTasks.status, '进行中'),
  )).orderBy(desc(experienceTasks.updatedAt)).limit(limit).execute();
}

export function isOngoingTaskListIntent(content: string) {
  const normalized = content.replace(/\s+/g, '');
  return /(?:我的)?(?:进行中|在办|执行中)(?:体验)?任务(?:列表|清单|有哪些|有什么|呢)?/.test(normalized);
}

export function formatOngoingTaskListReply(tasks: OngoingTaskSummary[]): string {
  if (tasks.length === 0) {
    return '当前没有进行中的任务。直接告诉我要新建的体验计划名称，我会在平台体验计划列表中创建并关联到本会话。';
  }
  const rows = tasks.map((task, index) => {
    const details = [
      task.productModel ? `型号：${task.productModel}` : '',
      task.projectPhase ? `阶段：${task.projectPhase}` : '',
    ].filter(Boolean);
    return `${index + 1}. ${task.taskName}${details.length ? `（${details.join('；')}）` : ''}`;
  });
  return `我的进行中任务（${tasks.length} 项）：\n${rows.join('\n')}\n\n告诉我要处理哪一项，或说明要新建的体验计划，我会在平台上继续操作。`;
}

/** Hermes workspace skill: create an experience task with real platform fields. */
export async function skillCreateTask(platformUserId: string, input: string | CreateTaskInput) {
  const payload: CreateTaskInput = typeof input === 'string'
    ? { taskName: input }
    : input;
  const taskName = payload.taskName.trim().slice(0, 200);
  if (!taskName) throw new Error('缺少体验计划名称');

  const projectPhase = payload.projectPhase
    ? (normalizeProjectPhase(payload.projectPhase) || payload.projectPhase)
    : null;

  const db = await getDb();
  const created = await db.insert(experienceTasks).values({
    taskName,
    productCategory: (payload.productCategory || '待定').slice(0, 100),
    product: payload.product ? payload.product.slice(0, 100) : null,
    productModel: (payload.productModel || '待定').slice(0, 100),
    projectType: payload.projectType || null,
    projectPhase,
    testPurpose: payload.testPurpose || null,
    organizer: payload.organizer || null,
    testDate: payload.testDate || null,
    createdBy: platformUserId,
    status: '待执行',
    taskMode: 'single',
  }).returning({
    id: experienceTasks.id,
    taskName: experienceTasks.taskName,
    product: experienceTasks.product,
    projectType: experienceTasks.projectType,
    projectPhase: experienceTasks.projectPhase,
    status: experienceTasks.status,
  }).execute();
  const task = created[0];
  if (!task) throw new Error('新建体验计划失败');
  return task;
}

export async function skillResolveTask(platformUserId: string, query: string) {
  if (!query) {
    return {
      taskId: null as string | null,
      taskName: null as string | null,
      message: '请说明体验计划名称或 ID，我会关联到当前 Hermes 会话后继续操作。',
    };
  }
  const db = await getDb();
  const byId = UUID_RE.test(query)
    ? await db.select({ id: experienceTasks.id, taskName: experienceTasks.taskName })
      .from(experienceTasks)
      .where(and(eq(experienceTasks.id, query), eq(experienceTasks.createdBy, platformUserId)))
      .limit(1)
      .execute()
    : [];
  const rows = byId.length
    ? byId
    : await db.select({ id: experienceTasks.id, taskName: experienceTasks.taskName })
      .from(experienceTasks)
      .where(and(
        eq(experienceTasks.createdBy, platformUserId),
        or(ilike(experienceTasks.taskName, `%${query}%`), ilike(experienceTasks.productModel, `%${query}%`)),
      ))
      .orderBy(desc(experienceTasks.updatedAt))
      .limit(5)
      .execute();
  if (rows.length === 0) {
    return {
      taskId: null,
      taskName: null,
      message: `未找到与「${query}」匹配的体验计划。可换个名称，或让我新建。`,
    };
  }
  if (rows.length > 1 && !UUID_RE.test(query)) {
    return {
      taskId: null,
      taskName: null,
      message: `找到多个体验计划：${rows.map((item) => item.taskName).join('；')}。请说得更具体一些。`,
    };
  }
  const task = rows[0]!;
  return {
    taskId: task.id,
    taskName: task.taskName,
    message: `已关联体验计划「${task.taskName}」。接下来我会在该计划上生成可确认的操作。`,
  };
}

export async function skillBindConversationTask(conversationId: string, taskId: string, title: string) {
  const db = await getDb();
  const updated = await db.update(conversations).set({
    taskId,
    title,
    updatedAt: sql`NOW()`,
  }).where(eq(conversations.id, conversationId)).returning().execute();
  return updated[0] ?? null;
}

export async function skillUnbindConversationTask(conversationId: string, title = 'Hermes · 未绑定') {
  const db = await getDb();
  const updated = await db.update(conversations).set({
    taskId: null,
    title,
    updatedAt: sql`NOW()`,
  }).where(eq(conversations.id, conversationId)).returning().execute();
  return updated[0] ?? null;
}
