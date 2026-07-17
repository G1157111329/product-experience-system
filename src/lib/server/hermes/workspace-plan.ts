import { extractJsonObject } from '@/lib/server/ai';
import { normalizeProjectPhase } from '@/lib/dictionary-types';
import { normalizeAgentActions, type AgentAction } from '@/lib/agent-actions';
import { sanitizeHermesAssistantReply } from './hermes-platform-contract';
import { executeHermesRun } from './runtime';
import type { CreateTaskInput } from './workspace-skills';

export type WorkspaceIntent = 'list_tasks' | 'create_task' | 'bind_task' | 'clarify' | 'none';

export type WorkspacePlan = {
  reply: string;
  intent: WorkspaceIntent;
  create: CreateTaskInput | null;
  bindQuery: string | null;
  missingFields: string[];
  runId: string | null;
};

const PROJECT_TYPES = ['ODM', 'OEM', '竞品研究', '自研', '前期研究', '改型降本优化', '海外产品', '改型/降本/优化'] as const;

/** Map free-text user/project fields onto platform experience_tasks columns only. */
export function normalizeCreateTaskInput(raw: Record<string, unknown> | null | undefined): CreateTaskInput | null {
  if (!raw || typeof raw !== 'object') return null;
  const taskName = String(raw.task_name || raw.taskName || '').trim();
  if (!taskName) return null;

  let projectType = String(raw.project_type || raw.projectType || '').trim() || null;
  if (projectType === '改型降本优化') projectType = '改型/降本/优化';
  if (projectType && !PROJECT_TYPES.includes(projectType as typeof PROJECT_TYPES[number])) {
    if (/自研/.test(projectType)) projectType = '自研';
  }

  const phaseRaw = String(raw.project_phase || raw.projectPhase || '').trim();
  let projectPhase: string | null = null;
  if (phaseRaw) {
    if (/手板/.test(phaseRaw)) projectPhase = '手板研究';
    else projectPhase = normalizeProjectPhase(phaseRaw) || normalizeProjectPhase(phaseRaw.replace(/阶段$/, '')) || phaseRaw;
  }

  return {
    taskName: taskName.slice(0, 200),
    productCategory: String(raw.product_category || raw.productCategory || '').trim() || null,
    product: String(raw.product || '').trim() || null,
    productModel: String(raw.product_model || raw.productModel || '').trim() || null,
    projectType,
    projectPhase,
    testPurpose: String(raw.test_purpose || raw.testPurpose || '').trim() || null,
    organizer: String(raw.organizer || '').trim() || null,
    testDate: String(raw.test_date || raw.testDate || '').trim() || null,
  };
}

export function buildTaskCreateAction(create: CreateTaskInput): AgentAction {
  return normalizeAgentActions([{
    id: 'workspace-task-create-1',
    type: 'task_create',
    title: '新建体验计划',
    description: `创建体验计划「${create.taskName}」`,
    risk: 'medium',
    idempotency_key: `task_create:${create.taskName}`,
    payload: {
      task_name: create.taskName,
      product_category: create.productCategory || '待定',
      product: create.product || undefined,
      product_model: create.productModel || '待定',
      project_type: create.projectType || undefined,
      project_phase: create.projectPhase || undefined,
      test_purpose: create.testPurpose || undefined,
      organizer: create.organizer || undefined,
      test_date: create.testDate || undefined,
      task_mode: 'single',
    },
  }])[0]!;
}

export function formatCreateTaskPreview(create: CreateTaskInput): string {
  const rows = [
    `任务名称：${create.taskName}`,
    create.productCategory ? `品类：${create.productCategory}` : '',
    create.product ? `产品：${create.product}` : '',
    create.productModel ? `型号：${create.productModel}` : '',
    create.projectType ? `项目类型：${create.projectType}` : '',
    create.projectPhase ? `项目阶段：${create.projectPhase}` : '',
    create.testPurpose ? `体验目的：${create.testPurpose}` : '',
    create.testDate ? `测试日期：${create.testDate}` : '',
  ].filter(Boolean);
  return rows.join('\n');
}

/**
 * Workspace-level Hermes planner for unbound sessions.
 * Returns structured intent only — never claims a write succeeded.
 */
export async function planHermesWorkspaceTurn(input: {
  agentInstanceId: string;
  conversationId: string;
  userId: string;
  historyText: string;
  content: string;
  ongoingTaskLines: string;
}): Promise<WorkspacePlan> {
  const run = await executeHermesRun({
    agentInstanceId: input.agentInstanceId,
    conversationId: input.conversationId,
    trigger: 'manual',
    systemPrompt: `你是产品体验管理平台 Hermes 工作区规划器。涉及创建/绑定/落库时，只能规划本平台体验计划操作，不得用手工录入或平台外流程代替写入。
观点/分析类问题不在此 JSON 规划器处理（由上层正常对话回答）。
只输出 JSON：{"reply":"给用户的中文说明","intent":"list_tasks|create_task|bind_task|clarify|none","create":null|{"task_name":"","product_category":"","product":"","product_model":"","project_type":"","project_phase":"","test_purpose":"","organizer":"","test_date":""},"bind_query":null|"任务名或ID","missing_fields":[]}

只能使用平台体验计划字段：task_name, product_category, product, product_model, project_type, project_phase, test_purpose, organizer, test_date, task_mode
项目类型仅限：ODM/OEM/竞品研究/自研/前期研究/改型/降本/优化/海外产品
项目阶段仅限：手板研究/试制阶段/试产阶段/量产阶段（手板阶段→手板研究）
禁止为操作索要：参与人、优先级、A/B、外部排期、手工录入说明。
“中式电饭煲”等产品名写入 product。
有 task_name 即可 create_task；不要编造成功写入。
reply 禁止“已成功创建/请到网页录入/联系管理员代建”。`,
    userPrompt: `用户进行中任务：
${input.ongoingTaskLines || '（无）'}

对话上下文：
${input.historyText}

最新用户消息：
${input.content}`,
    userId: input.userId,
  });

  if (run.status !== 'succeeded' || !run.output) {
    return {
      reply: '我可以在平台新建或关联体验计划。请直接给出任务名称，例如：新建任务：测试任务1995。',
      intent: 'clarify',
      create: null,
      bindQuery: null,
      missingFields: ['task_name'],
      runId: run.runId,
    };
  }

  const parsed = extractJsonObject<Record<string, unknown>>(run.output, {});
  const intentRaw = String(parsed.intent || 'none');
  const intent: WorkspaceIntent = (
    intentRaw === 'list_tasks'
    || intentRaw === 'create_task'
    || intentRaw === 'bind_task'
    || intentRaw === 'clarify'
  ) ? intentRaw : 'none';

  const create = normalizeCreateTaskInput(
    parsed.create && typeof parsed.create === 'object'
      ? parsed.create as Record<string, unknown>
      : null,
  );
  const bindQuery = typeof parsed.bind_query === 'string' && parsed.bind_query.trim()
    ? parsed.bind_query.trim()
    : null;
  const missingFields = Array.isArray(parsed.missing_fields)
    ? parsed.missing_fields
      .map((item) => String(item))
      .filter((item) => [
        'task_name', 'product_category', 'product', 'product_model',
        'project_type', 'project_phase', 'test_purpose', 'organizer', 'test_date',
      ].includes(item))
      .slice(0, 8)
    : [];
  const reply = sanitizeHermesAssistantReply(String(parsed.reply || '').trim()
    || (intent === 'create_task' && create
      ? `准备按平台字段创建体验计划「${create.taskName}」。回复「确认」后我会写入体验计划列表。`
      : '请告诉我要新建的体验计划名称，或要关联的已有任务。'));

  return {
    reply: reply.slice(0, 4000),
    intent,
    create,
    bindQuery,
    missingFields,
    runId: run.runId,
  };
}
