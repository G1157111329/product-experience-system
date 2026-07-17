import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { normalizeAgentActions, type AgentAction } from '@/lib/agent-actions';
import { stripAssistantReasoning } from '@/lib/assistant-output';
import { getDb } from '@/storage/database/pg-db';
import {
  conversationMessages,
  conversations,
  platformUsers,
} from '@/storage/database/shared/schema';
import {
  buildInboxMaterialOrganizeActions,
  extractInboundMaterialIds,
  parseExternalChatCommand,
  summarizeActionPlanResults,
} from './external-chat-commands';
import { planHermesTaskActions } from './task-action-plan';
import { executeTaskActionPlanForUser } from './task-action-executor';
import { executeHermesRun } from './runtime';
import {
  buildTaskCreateAction,
  formatCreateTaskPreview,
  normalizeCreateTaskInput,
  planHermesWorkspaceTurn,
} from './workspace-plan';
import { sanitizeHermesAssistantReply } from './hermes-platform-contract';
import {
  describeHermesContext,
  formatComparisonListPrompt,
  formatMatrixListPrompt,
  formatRecipeListPrompt,
  formatSectionWizardPrompt,
  formatTaskPickPrompt,
  parseHermesNavCode,
  requiresMediaListReselect,
  type HermesSessionState,
} from './hermes-session';
import { loadHermesSession, saveHermesSession } from './hermes-session-store';
import {
  claimMaterialsToTask,
  getTaskName,
  listComparisonTargets,
  listDataMatrixTargets,
  listTaskRecipes,
} from './hermes-target-lists';
import {
  formatOngoingTaskListReply,
  isOngoingTaskListIntent,
  skillBindConversationTask,
  skillCreateTask,
  skillListOngoingTasks,
  skillResolveTask,
  skillUnbindConversationTask,
} from './workspace-skills';

export type HermesTurnInput = {
  agentInstanceId: string;
  conversationId: string;
  platformUserId: string;
  content: string;
  /** Already persisted user message event_seq; next writes continue after this. */
  userEventSeq: number;
  messageId?: string | null;
  trigger: 'manual' | 'wecom_ingest' | 'ilink_ingest';
  historyText?: string;
};

export type HermesTurnResult = {
  reply: string;
  taskId: string | null;
  actions: AgentAction[];
  actionPlanMessageId: string | null;
  runId: string | null;
  status: 'succeeded' | 'failed' | 'skipped';
  errorCode?: string | null;
};

/**
 * Shared Hermes turn router for platform AI助手 and WeChat/WeCom.
 * Hermes drives skills/planner and platform writes — not advice-only chat.
 */
export async function dispatchHermesTurn(input: HermesTurnInput): Promise<HermesTurnResult> {
  const db = await getDb();
  let conversation = (await db.select().from(conversations)
    .where(eq(conversations.id, input.conversationId)).limit(1).execute())[0];
  if (!conversation) {
    return {
      reply: '会话不存在。',
      taskId: null,
      actions: [],
      actionPlanMessageId: null,
      runId: null,
      status: 'failed',
      errorCode: 'conversation_not_found',
    };
  }

  let nextEventSeq = input.userEventSeq + 1;
  const command = parseExternalChatCommand(input.content);
  const materialIds = extractInboundMaterialIds(input.content);
  let session = await loadHermesSession(conversation.id);
  session = await syncSessionWithConversation(conversation, session);

  let reply = '';
  let actions: AgentAction[] = [];
  let actionPlanMessageId: string | null = null;
  let runId: string | null = null;
  let planToolName: 'task_action_plan' | 'workspace_action_plan' | null = null;
  let allowSuccessClaim = false;
  let handled = false;

  const sessionBranch = await handleHermesSessionNav({
    conversation,
    session,
    platformUserId: input.platformUserId,
    content: input.content,
    materialIds,
    commandKind: command.kind,
  });
  if (sessionBranch) {
    handled = true;
    session = sessionBranch.session;
    conversation = sessionBranch.conversation;
    reply = sessionBranch.reply;
    actions = sessionBranch.actions;
    if (actions.length > 0) planToolName = 'task_action_plan';
    allowSuccessClaim = sessionBranch.allowSuccessClaim;
  }

  if (!handled && isOngoingTaskListIntent(input.content)) {
    const tasks = await skillListOngoingTasks(input.platformUserId);
    reply = formatOngoingTaskListReply(tasks);
    if (session.bindMode !== 'bound') {
      session = {
        ...session,
        bindMode: 'awaiting_task_pick',
        taskId: null,
      };
      reply = `${formatTaskPickPrompt(tasks)}\n\n（也可继续用自然语言说明需求）`;
    }
    handled = true;
  } else if (!handled && command.kind === 'create_task') {
    const created = await skillCreateTask(input.platformUserId, command.taskName);
    const bound = await skillBindConversationTask(
      conversation.id,
      created.id,
      `Hermes · ${created.taskName}`,
    );
    conversation = bound || conversation;
    session = bindSession(session, created.id);
    const claimed = await flushPendingMedia(session, created.id, input.platformUserId);
    if (claimed.actions.length > 0) {
      actions = claimed.actions;
      planToolName = 'task_action_plan';
      session = claimed.session;
    }
    allowSuccessClaim = true;
    reply = [
      `已在平台新建体验计划「${created.taskName}」（ID: ${created.id}），并关联到本会话。`,
      formatSectionWizardPrompt(created.taskName),
      claimed.note,
    ].filter(Boolean).join('\n\n');
    handled = true;
  } else if (!handled && command.kind === 'bind_task') {
    const resolved = await skillResolveTask(input.platformUserId, command.query);
    if (resolved.taskId) {
      const bound = await skillBindConversationTask(
        conversation.id,
        resolved.taskId,
        `Hermes · ${resolved.taskName}`,
      );
      conversation = bound || conversation;
      session = bindSession(session, resolved.taskId);
      const claimed = await flushPendingMedia(session, resolved.taskId, input.platformUserId);
      if (claimed.actions.length > 0) {
        actions = claimed.actions;
        planToolName = 'task_action_plan';
        session = claimed.session;
      }
      allowSuccessClaim = true;
      reply = [
        resolved.message,
        formatSectionWizardPrompt(resolved.taskName || resolved.taskId),
        claimed.note,
      ].filter(Boolean).join('\n\n');
    } else {
      reply = resolved.message;
    }
    handled = true;
  } else if (!handled && command.kind === 'confirm_plan') {
    const confirmed = await confirmLatestHermesPlan({
      conversationId: conversation.id,
      taskId: conversation.taskId || session.taskId,
      platformUserId: input.platformUserId,
    });
    reply = confirmed.reply;
    allowSuccessClaim = Boolean(confirmed.taskId);
    if (confirmed.taskId) {
      conversation = (await db.select().from(conversations)
        .where(eq(conversations.id, conversation.id)).limit(1).execute())[0] || conversation;
      session = bindSession(session, confirmed.taskId);
    }
    handled = true;
  } else if (!handled && (conversation.taskId || session.taskId) && session.bindMode === 'bound') {
    const taskId = conversation.taskId || session.taskId!;
    if (materialIds.length > 0 && !requiresMediaListReselect(session, true)) {
      await claimMaterialsToTask({
        materialIds,
        taskId,
        platformUserId: input.platformUserId,
      });
      actions = buildInboxMaterialOrganizeActions(materialIds);
      planToolName = 'task_action_plan';
      const taskName = await getTaskName(taskId);
      reply = [
        `已收到 ${materialIds.length} 个素材，并生成 ${actions.length} 项入库整理计划。`,
        describeHermesContext(session, taskName),
        '确认后我会写入当前体验计划素材库（按上下文命名）。未超时不重选列表。',
      ].join('\n');
    } else {
      const historyText = input.historyText || await loadHistoryText(conversation.id);
      const plan = await planHermesTaskActions({
        agentInstanceId: input.agentInstanceId,
        conversationId: conversation.id,
        taskId,
        userId: input.platformUserId,
        historyText,
      });
      runId = plan.run.runId;
      reply = stripAssistantReasoning(plan.reply);
      actions = plan.actions;
      if (actions.length > 0) {
        planToolName = 'task_action_plan';
        reply = `${reply}\n\n已生成 ${actions.length} 项待确认操作。确认后由 Hermes 在平台执行。`;
      }
    }
    handled = true;
  } else if (!handled) {
    const tasks = await skillListOngoingTasks(input.platformUserId);
    const historyText = input.historyText || await loadHistoryText(conversation.id);
    const workspace = await planHermesWorkspaceTurn({
      agentInstanceId: input.agentInstanceId,
      conversationId: conversation.id,
      userId: input.platformUserId,
      historyText,
      content: input.content,
      ongoingTaskLines: tasks.map((task, index) => `${index + 1}. ${task.taskName} (${task.id})`).join('\n'),
    });
    runId = workspace.runId;

    if (workspace.intent === 'list_tasks') {
      session = { ...session, bindMode: 'awaiting_task_pick', taskId: null };
      reply = formatTaskPickPrompt(tasks);
    } else if (workspace.intent === 'bind_task' && workspace.bindQuery) {
      const resolved = await skillResolveTask(input.platformUserId, workspace.bindQuery);
      if (resolved.taskId) {
        const bound = await skillBindConversationTask(
          conversation.id,
          resolved.taskId,
          `Hermes · ${resolved.taskName}`,
        );
        conversation = bound || conversation;
        session = bindSession(session, resolved.taskId);
        const claimed = await flushPendingMedia(session, resolved.taskId, input.platformUserId);
        if (claimed.actions.length > 0) {
          actions = claimed.actions;
          planToolName = 'task_action_plan';
          session = claimed.session;
        }
        allowSuccessClaim = true;
        reply = [resolved.message, formatSectionWizardPrompt(resolved.taskName || resolved.taskId), claimed.note]
          .filter(Boolean).join('\n\n');
      } else {
        reply = resolved.message;
      }
    } else if (workspace.intent === 'create_task' && workspace.create?.taskName) {
      actions = [buildTaskCreateAction(workspace.create)];
      planToolName = 'workspace_action_plan';
      reply = [
        sanitizeHermesAssistantReply(stripAssistantReasoning(workspace.reply)),
        '',
        '将按平台体验计划字段创建：',
        formatCreateTaskPreview(workspace.create),
        '',
        '回复「确认」或「确认创建」后，我会写入体验计划列表并关联本会话。在确认前不会假装已创建。',
      ].filter(Boolean).join('\n');
    } else if (workspace.intent === 'clarify' && workspace.missingFields.includes('task_name')) {
      reply = sanitizeHermesAssistantReply(stripAssistantReasoning(workspace.reply));
      reply += `\n\n还需要：${workspace.missingFields.join('、')}（仅平台真实字段）。`;
    } else if (session.bindMode === 'awaiting_task_pick' && materialIds.length === 0 && command.kind === 'none') {
      // Wizard default when still awaiting pick and no other intent
      if (shouldOfferTaskWizard(input.content, workspace.intent)) {
        reply = formatTaskPickPrompt(tasks);
      } else {
        const chat = await executeHermesRun({
          agentInstanceId: input.agentInstanceId,
          conversationId: conversation.id,
          trigger: input.trigger,
          systemPrompt:
            '你是产品体验管理平台的 AI助手（Hermes）。用户若问观点、评价方法、体验思路：用简体中文正常简洁回答。用户若要写入平台数据：引导其回复序号绑定体验计划，或回复「不绑定」进入无绑定记录模式，不要假装已写入。',
          userPrompt: `对话上下文：\n${historyText}\n\n最新用户消息：\n${input.content}`,
          userId: input.platformUserId,
        });
        runId = chat.runId;
        reply = sanitizeHermesAssistantReply(
          stripAssistantReasoning(chat.status === 'succeeded' && chat.output ? chat.output : workspace.reply),
        );
      }
    } else {
      const chat = await executeHermesRun({
        agentInstanceId: input.agentInstanceId,
        conversationId: conversation.id,
        trigger: input.trigger,
        systemPrompt:
          '你是产品体验管理平台的 AI助手（Hermes）。用户若问观点、评价方法、体验思路：用简体中文正常简洁回答。用户若要写入平台数据：引导其说明体验计划名称或回复「确认」执行已有计划，不要假装已写入。',
        userPrompt: `对话上下文：\n${historyText}\n\n最新用户消息：\n${input.content}`,
        userId: input.platformUserId,
      });
      runId = chat.runId;
      reply = sanitizeHermesAssistantReply(
        stripAssistantReasoning(chat.status === 'succeeded' && chat.output ? chat.output : workspace.reply),
      );
    }
  }

  nextEventSeq = await saveHermesSession(conversation.id, session, nextEventSeq);

  if (actions.length > 0 && planToolName) {
    const [savedPlan] = await db.insert(conversationMessages).values({
      conversationId: conversation.id,
      role: 'tool',
      toolName: planToolName,
      toolCallId: runId || input.messageId || null,
      content: JSON.stringify({
        taskId: conversation.taskId || session.taskId,
        reply,
        actions,
      }),
      eventSeq: nextEventSeq,
    }).returning().execute();
    nextEventSeq += 1;
    actionPlanMessageId = savedPlan?.id || null;
  }

  reply = sanitizeHermesAssistantReply(reply, { allowSuccessClaim });

  if (reply) {
    await db.insert(conversationMessages).values({
      conversationId: conversation.id,
      role: 'assistant',
      content: reply.slice(0, 4000),
      toolName: input.trigger === 'manual' ? null : 'external_inbound_reply_pending_delivery',
      eventSeq: nextEventSeq,
    }).execute();
  }

  await db.update(conversations).set({ updatedAt: sql`NOW()` })
    .where(eq(conversations.id, conversation.id)).execute();

  return {
    reply,
    taskId: conversation.taskId || session.taskId,
    actions,
    actionPlanMessageId,
    runId,
    status: 'succeeded',
  };
}

async function syncSessionWithConversation(
  conversation: typeof conversations.$inferSelect,
  session: HermesSessionState,
): Promise<HermesSessionState> {
  if (session.unboundByIdleTimeout && !session.taskId && conversation.taskId) {
    await skillUnbindConversationTask(conversation.id, 'Hermes · 已超时解绑');
    conversation.taskId = null;
    return session;
  }
  if (
    !session.unboundByIdleTimeout
    && conversation.taskId
    && session.bindMode === 'awaiting_task_pick'
    && !session.taskId
  ) {
    return {
      ...session,
      bindMode: 'bound',
      taskId: conversation.taskId,
    };
  }
  if (session.bindMode === 'bound' && session.taskId && conversation.taskId !== session.taskId) {
    await skillBindConversationTask(conversation.id, session.taskId, `Hermes · ${session.taskId}`);
    conversation.taskId = session.taskId;
  }
  return session;
}

function bindSession(session: HermesSessionState, taskId: string): HermesSessionState {
  return {
    ...session,
    bindMode: 'bound',
    taskId,
    section: null,
    recipeIndex: null,
    comparisonObjectIndex: null,
    comparisonItemIndex: null,
    matrixCategoryIndex: null,
    matrixLeafIndex: null,
    unboundByIdleTimeout: false,
  };
}

async function flushPendingMedia(
  session: HermesSessionState,
  taskId: string,
  platformUserId: string,
): Promise<{ session: HermesSessionState; actions: AgentAction[]; note: string }> {
  const pending = session.pendingMediaIds || [];
  if (pending.length === 0) {
    return { session, actions: [], note: '' };
  }
  await claimMaterialsToTask({ materialIds: pending, taskId, platformUserId });
  const actions = buildInboxMaterialOrganizeActions(pending);
  return {
    session: { ...session, pendingMediaIds: [] },
    actions,
    note: `先前待归位素材 ${pending.length} 个已生成入库计划，确认后写入该体验计划。`,
  };
}

function shouldOfferTaskWizard(content: string, intent: string): boolean {
  if (intent === 'list_tasks') return true;
  const text = content.trim();
  if (!text) return true;
  if (/^(你好|您好|在吗|开始|录入|帮我|助手)([！!。.\s]*)$/u.test(text)) return true;
  if (/^(我的)?(进行中)?(体验)?(计划|任务)?列表?$/u.test(text)) return true;
  return false;
}

async function handleHermesSessionNav(input: {
  conversation: typeof conversations.$inferSelect;
  session: HermesSessionState;
  platformUserId: string;
  content: string;
  materialIds: string[];
  commandKind: string;
}): Promise<{
  session: HermesSessionState;
  conversation: typeof conversations.$inferSelect;
  reply: string;
  actions: AgentAction[];
  allowSuccessClaim: boolean;
} | null> {
  if (input.commandKind !== 'none') return null;
  const nav = parseHermesNavCode(input.content);
  let session = input.session;
  let conversation = input.conversation;

  // Media reselect ONLY after timeout unbind / awaiting pick
  if (requiresMediaListReselect(session, input.materialIds.length > 0)) {
    const tasks = await skillListOngoingTasks(input.platformUserId);
    session = {
      ...session,
      bindMode: 'awaiting_task_pick',
      pendingMediaIds: [...new Set([...session.pendingMediaIds, ...input.materialIds])].slice(0, 40),
    };
    return {
      session,
      conversation,
      reply: [
        `已收到 ${input.materialIds.length} 个素材，先保存在对话收件箱。`,
        '因未绑定或超时解绑，请先选择体验计划后再归位（仅此时重选列表）：',
        formatTaskPickPrompt(tasks),
      ].join('\n\n'),
      actions: [],
      allowSuccessClaim: false,
    };
  }

  if (session.bindMode === 'awaiting_task_pick') {
    if (nav.kind === 'decline_bind') {
      session = {
        ...session,
        bindMode: 'unbound_recording',
        taskId: null,
        section: null,
        unboundByIdleTimeout: false,
      };
      if (conversation.taskId) {
        const unbound = await skillUnbindConversationTask(conversation.id, 'Hermes · 无绑定记录');
        conversation = unbound || conversation;
      }
      return {
        session,
        conversation,
        reply: [
          '已进入无绑定记录模式。',
          '文字继续保留在本对话；图片/视频先入个人收件箱，绑定体验计划后再归位。',
          '随时回复「我的进行中任务列表」或序号重新绑定。',
        ].join('\n'),
        actions: [],
        allowSuccessClaim: false,
      };
    }

    const pickIndex = nav.kind === 'task_pick'
      ? nav.index
      : nav.kind === 'section'
        ? nav.section
        : null;
    if (pickIndex) {
      const tasks = await skillListOngoingTasks(input.platformUserId);
      const task = tasks[pickIndex - 1];
      if (!task) {
        return {
          session,
          conversation,
          reply: `序号 ${pickIndex} 无效。\n\n${formatTaskPickPrompt(tasks)}`,
          actions: [],
          allowSuccessClaim: false,
        };
      }
      const bound = await skillBindConversationTask(
        conversation.id,
        task.id,
        `Hermes · ${task.taskName}`,
      );
      conversation = bound || conversation;
      session = bindSession(session, task.id);
      const claimed = await flushPendingMedia(session, task.id, input.platformUserId);
      session = claimed.session;
      return {
        session,
        conversation,
        reply: [
          `已绑定「${task.taskName}」。`,
          formatSectionWizardPrompt(task.taskName),
          claimed.note,
        ].filter(Boolean).join('\n\n'),
        actions: claimed.actions,
        allowSuccessClaim: true,
      };
    }
    return null;
  }

  if (session.bindMode === 'unbound_recording') {
    if (input.materialIds.length > 0) {
      session = {
        ...session,
        pendingMediaIds: [...new Set([...session.pendingMediaIds, ...input.materialIds])].slice(0, 40),
      };
      return {
        session,
        conversation,
        reply: `已收到 ${input.materialIds.length} 个素材，仍留在无绑定收件箱。绑定体验计划后会生成归位计划。回复「我的进行中任务列表」选择计划。`,
        actions: [],
        allowSuccessClaim: false,
      };
    }
    if (nav.kind === 'task_pick' || nav.kind === 'section') {
      session = { ...session, bindMode: 'awaiting_task_pick' };
      const tasks = await skillListOngoingTasks(input.platformUserId);
      const pickIndex = nav.kind === 'task_pick' ? nav.index : nav.section;
      const task = tasks[pickIndex - 1];
      if (!task) {
        return {
          session,
          conversation,
          reply: formatTaskPickPrompt(tasks),
          actions: [],
          allowSuccessClaim: false,
        };
      }
      const bound = await skillBindConversationTask(
        conversation.id,
        task.id,
        `Hermes · ${task.taskName}`,
      );
      conversation = bound || conversation;
      session = bindSession(session, task.id);
      const claimed = await flushPendingMedia(session, task.id, input.platformUserId);
      session = claimed.session;
      return {
        session,
        conversation,
        reply: [
          `已绑定「${task.taskName}」。`,
          formatSectionWizardPrompt(task.taskName),
          claimed.note,
        ].filter(Boolean).join('\n\n'),
        actions: claimed.actions,
        allowSuccessClaim: true,
      };
    }
    return null;
  }

  if (session.bindMode !== 'bound' || !session.taskId) return null;
  const taskId = session.taskId;

  // Bound: numeric section / target codes
  if (nav.kind === 'section') {
    session = {
      ...session,
      section: nav.section,
      recipeIndex: null,
      comparisonObjectIndex: null,
      comparisonItemIndex: null,
      matrixCategoryIndex: null,
      matrixLeafIndex: null,
    };
    const taskName = await getTaskName(taskId) || taskId;
    if (nav.section === 1) {
      return {
        session,
        conversation,
        reply: [
          describeHermesContext(session, taskName),
          '五感体验：可直接描述检查项/问题，或发图进入任务素材库。素材未超时不重选列表。',
        ].join('\n'),
        actions: [],
        allowSuccessClaim: false,
      };
    }
    if (nav.section === 2) {
      const recipes = await listTaskRecipes(taskId);
      return {
        session,
        conversation,
        reply: [describeHermesContext(session, taskName), formatRecipeListPrompt(recipes)].join('\n\n'),
        actions: [],
        allowSuccessClaim: false,
      };
    }
    if (nav.section === 3) {
      const targets = await listComparisonTargets(taskId);
      return {
        session,
        conversation,
        reply: [describeHermesContext(session, taskName), formatComparisonListPrompt(targets)].join('\n\n'),
        actions: [],
        allowSuccessClaim: false,
      };
    }
    const targets = await listDataMatrixTargets(taskId);
    return {
      session,
      conversation,
      reply: [describeHermesContext(session, taskName), formatMatrixListPrompt(targets)].join('\n\n'),
      actions: [],
      allowSuccessClaim: false,
    };
  }

  if (nav.kind === 'recipe') {
    const recipes = await listTaskRecipes(taskId);
    const row = recipes[nav.recipeIndex - 1];
    if (!row) {
      return {
        session,
        conversation,
        reply: `食谱序号 ${nav.recipeIndex} 无效。\n\n${formatRecipeListPrompt(recipes)}`,
        actions: [],
        allowSuccessClaim: false,
      };
    }
    session = { ...session, section: 2, recipeIndex: nav.recipeIndex };
    return {
      session,
      conversation,
      reply: `已定位食谱/功能「${row.name}」（码 2${nav.recipeIndex}）。可描述效果/步骤或发图，确认后写入该条目上下文。`,
      actions: [],
      allowSuccessClaim: false,
    };
  }

  if (nav.kind === 'comparison_object' || nav.kind === 'comparison_cell') {
    const targets = await listComparisonTargets(taskId);
    const object = targets.objects[nav.objectIndex - 1];
    if (!object) {
      return {
        session,
        conversation,
        reply: `对比对象序号无效。\n\n${formatComparisonListPrompt(targets)}`,
        actions: [],
        allowSuccessClaim: false,
      };
    }
    if (nav.kind === 'comparison_object') {
      session = {
        ...session,
        section: 3,
        comparisonObjectIndex: nav.objectIndex,
        comparisonItemIndex: null,
      };
      return {
        session,
        conversation,
        reply: [
          `已定位对比对象「${object.name}」（码 3${nav.objectIndex}）。`,
          '继续回复 3xy 选择细项，例如 311；或直接发图进入该对象上下文。',
          formatComparisonListPrompt(targets),
        ].join('\n\n'),
        actions: [],
        allowSuccessClaim: false,
      };
    }
    const item = targets.items[nav.itemIndex - 1];
    if (!item) {
      return {
        session,
        conversation,
        reply: `对比细项序号无效。\n\n${formatComparisonListPrompt(targets)}`,
        actions: [],
        allowSuccessClaim: false,
      };
    }
    session = {
      ...session,
      section: 3,
      comparisonObjectIndex: nav.objectIndex,
      comparisonItemIndex: nav.itemIndex,
    };
    return {
      session,
      conversation,
      reply: `已定位对比「${object.name}」×「${item.label}」（码 3${nav.objectIndex}${nav.itemIndex}）。可描述问题或发图，确认后写入该单元格。`,
      actions: [],
      allowSuccessClaim: false,
    };
  }

  if (nav.kind === 'matrix_category' || nav.kind === 'matrix_leaf') {
    const targets = await listDataMatrixTargets(taskId);
    const category = targets.categories[nav.categoryIndex - 1];
    if (!category) {
      return {
        session,
        conversation,
        reply: `数据矩阵大类序号无效。\n\n${formatMatrixListPrompt(targets)}`,
        actions: [],
        allowSuccessClaim: false,
      };
    }
    if (nav.kind === 'matrix_category') {
      session = {
        ...session,
        section: 4,
        matrixCategoryIndex: nav.categoryIndex,
        matrixLeafIndex: null,
      };
      return {
        session,
        conversation,
        reply: [
          `已定位一级大类「${category.label}」（码 4${nav.categoryIndex}）。`,
          '继续回复 4xy 选择细项，例如 411；或直接发图进入该大类上下文。',
          formatMatrixListPrompt(targets),
        ].join('\n\n'),
        actions: [],
        allowSuccessClaim: false,
      };
    }
    const leaf = targets.leaves[nav.leafIndex - 1];
    if (!leaf) {
      return {
        session,
        conversation,
        reply: `数据矩阵细项序号无效。\n\n${formatMatrixListPrompt(targets)}`,
        actions: [],
        allowSuccessClaim: false,
      };
    }
    session = {
      ...session,
      section: 4,
      matrixCategoryIndex: nav.categoryIndex,
      matrixLeafIndex: nav.leafIndex,
    };
    return {
      session,
      conversation,
      reply: `已定位数据矩阵「${category.label}」×「${leaf.label}」（码 4${nav.categoryIndex}${nav.leafIndex}）。可录入数值/评价或发图，确认后写入该行。`,
      actions: [],
      allowSuccessClaim: false,
    };
  }

  return null;
}

async function loadHistoryText(conversationId: string) {
  const db = await getDb();
  const history = await db.select({
    role: conversationMessages.role,
    content: conversationMessages.content,
  }).from(conversationMessages)
    .where(eq(conversationMessages.conversationId, conversationId))
    .orderBy(desc(conversationMessages.eventSeq))
    .limit(20)
    .execute();
  return history.reverse().map((item) => `${item.role}: ${item.content || ''}`).join('\n').slice(0, 6000);
}

export async function confirmLatestHermesPlan(input: {
  conversationId: string;
  taskId: string | null;
  platformUserId: string;
}): Promise<{ reply: string; taskId: string | null }> {
  const db = await getDb();
  const pending = await db.select({
    id: conversationMessages.id,
    toolName: conversationMessages.toolName,
    content: conversationMessages.content,
  }).from(conversationMessages).where(and(
    eq(conversationMessages.conversationId, input.conversationId),
    inArray(conversationMessages.toolName, ['task_action_plan', 'workspace_action_plan']),
  )).orderBy(desc(conversationMessages.eventSeq)).limit(1).execute();
  const planMessage = pending[0];
  if (!planMessage?.content) {
    return { reply: '当前没有待确认的操作计划。请先说明要新建或处理的内容。', taskId: input.taskId };
  }

  let actions = normalizeAgentActions([]);
  try {
    const parsed = JSON.parse(planMessage.content) as { actions?: unknown };
    actions = normalizeAgentActions(parsed.actions);
  } catch {
    return { reply: '待确认操作计划已损坏，请重新说明需求生成新计划。', taskId: input.taskId };
  }
  if (actions.length === 0) {
    return { reply: '待确认操作计划为空，请重新说明需求。', taskId: input.taskId };
  }

  if (planMessage.toolName === 'workspace_action_plan') {
    const createAction = actions.find((action) => action.type === 'task_create');
    const create = normalizeCreateTaskInput(createAction?.payload || null);
    if (!create?.taskName) {
      return { reply: '待确认的新建计划缺少任务名称，请重新说明后生成。', taskId: input.taskId };
    }
    const claimed = await db.update(conversationMessages).set({
      toolName: 'workspace_action_plan_applying',
    }).where(and(
      eq(conversationMessages.id, planMessage.id),
      eq(conversationMessages.toolName, 'workspace_action_plan'),
    )).returning({ id: conversationMessages.id }).execute();
    if (claimed.length !== 1) {
      return { reply: '该新建计划已执行或正在执行。', taskId: input.taskId };
    }

    try {
      const created = await skillCreateTask(input.platformUserId, create);
      await skillBindConversationTask(input.conversationId, created.id, `Hermes · ${created.taskName}`);
      await db.update(conversationMessages).set({
        toolName: 'workspace_action_plan_applied',
        content: JSON.stringify({
          create,
          result: created,
        }),
      }).where(eq(conversationMessages.id, planMessage.id)).execute();
      return {
        reply: [
          `已在平台体验计划列表新建「${created.taskName}」。`,
          `ID：${created.id}`,
          created.product ? `产品：${created.product}` : '',
          created.projectType ? `项目类型：${created.projectType}` : '',
          created.projectPhase ? `项目阶段：${created.projectPhase}` : '',
          `状态：${created.status}`,
          '本会话已关联该体验计划，可继续让我录入或整理素材。',
        ].filter(Boolean).join('\n'),
        taskId: created.id,
      };
    } catch (error) {
      await db.update(conversationMessages).set({
        toolName: 'workspace_action_plan',
      }).where(eq(conversationMessages.id, planMessage.id)).execute();
      return {
        reply: `新建体验计划失败：${error instanceof Error ? error.message : '未知错误'}。请稍后重试。`,
        taskId: input.taskId,
      };
    }
  }

  if (!input.taskId) {
    return { reply: '请先关联或新建体验计划，再确认执行。', taskId: null };
  }

  const users = await db.select({
    id: platformUsers.id,
    role: platformUsers.role,
    account: platformUsers.account,
  }).from(platformUsers).where(eq(platformUsers.id, input.platformUserId)).limit(1).execute();
  const actor = users[0];
  if (!actor) return { reply: '无法确认执行：平台账号不存在。', taskId: input.taskId };

  const executed = await executeTaskActionPlanForUser({
    taskId: input.taskId,
    user: { id: actor.id, role: actor.role, account: actor.account },
    actions,
    actionPlanMessageId: planMessage.id,
  });
  if (executed.conflict) return { reply: executed.message, taskId: input.taskId };
  return { reply: summarizeActionPlanResults(executed.results), taskId: input.taskId };
}
