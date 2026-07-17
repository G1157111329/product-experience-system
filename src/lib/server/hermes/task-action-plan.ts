import { extractJsonObject } from '@/lib/server/ai';
import { stripAssistantReasoning } from '@/lib/assistant-output';
import { normalizeAgentActions, type AgentAction } from '@/lib/agent-actions';
import { renderPromptTemplate } from '@/lib/agent-skills';
import { getActiveSkillVersion, logAgentAudit } from '@/lib/server/agent-skills';
import { findAssemblyForTask } from '@/lib/server/comparison-assembly';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { getV3MatrixProjection } from '@/lib/matrix/projection-v3';
import { cellKey } from '@/lib/matrix/v3-types';
import { executeHermesRun, type HermesRunResult } from './runtime';

type Row = Record<string, unknown>;
type Client = ReturnType<typeof getSupabaseClient>;

export type HermesTaskActionPlan = {
  run: HermesRunResult;
  reply: string;
  actions: AgentAction[];
};

type PlanInput = {
  agentInstanceId: string;
  conversationId: string;
  taskId: string;
  userId: string;
  tenantId?: string;
  historyText: string;
};

/**
 * Hermes task editing skill. It deliberately produces proposals only; callers
 * must render an explicit confirmation step before invoking the action API.
 */
export async function planHermesTaskActions(input: PlanInput): Promise<HermesTaskActionPlan> {
  const client = getSupabaseClient();
  const context = await loadTaskContext(client, input.taskId);
  const skill = await getActiveSkillVersion(client, 'task_action_plan');
  const snapshot = renderContext(context);
  const systemPrompt = typeof skill?.version?.system_prompt === 'string'
    ? skill.version.system_prompt
    : buildSystemPrompt();
  const userPrompt = renderPromptTemplate(
    typeof skill?.version?.user_prompt_template === 'string'
      ? skill.version.user_prompt_template
      : '当前任务结构化上下文：\n{{task_snapshot}}\n\n会话：\n{{conversation}}',
    { task_snapshot: snapshot, conversation: input.historyText },
  );
  const run = await executeHermesRun({
    agentInstanceId: input.agentInstanceId,
    conversationId: input.conversationId,
    trigger: 'manual',
    systemPrompt,
    userPrompt,
    userId: input.userId,
    tenantId: input.tenantId,
    taskId: input.taskId,
  });
  const raw = run.status === 'succeeded' && run.output ? run.output : '';
  const parsed = extractJsonObject<Record<string, unknown>>(raw, {});
  await logAgentAudit(client, {
    skillKey: 'task_action_plan',
    templateId: typeof skill?.template?.id === 'string' ? skill.template.id : null,
    versionId: typeof skill?.version?.id === 'string' ? skill.version.id : null,
    action: 'run', actorUserId: input.userId, taskId: input.taskId,
    requestSnapshot: { run_id: run.runId },
    responseSnapshot: { action_count: Array.isArray(parsed.actions) ? parsed.actions.length : 0 },
    status: run.status === 'succeeded' ? 'success' : 'failed', errorMessage: run.errorCode ?? null,
  }).catch(() => undefined);
  return {
    run,
    reply: stripAssistantReasoning(typeof parsed.reply === 'string' ? parsed.reply : raw) || '未生成可执行建议。',
    actions: normalizeAgentActions(parsed.actions).slice(0, 8),
  };
}

async function loadTaskContext(client: Client, taskId: string) {
  const [taskResult, recordsResult, recipesResult, materialsResult, issuesResult] = await Promise.all([
    client.from('experience_tasks').select('*').eq('id', taskId).maybeSingle(),
    client.from('check_records').select('*').eq('task_id', taskId).order('sort_order', { ascending: true }),
    client.from('recipes').select('*').eq('task_id', taskId).order('sort_order', { ascending: true }),
    client.from('materials').select('*').eq('task_id', taskId).order('created_at', { ascending: false }).limit(60),
    client.from('issues').select('*').eq('task_id', taskId).order('created_at', { ascending: false }).limit(60),
  ]);
  const recipes = rows(recipesResult.data);
  const recipeIds = recipes.map((item) => string(item.id)).filter(Boolean);
  const steps = recipeIds.length
    ? rows((await client.from('recipe_steps').select('*').in('recipe_id', recipeIds).order('step_number', { ascending: true })).data)
    : [];
  const assembly = await findAssemblyForTask(client, taskId);
  const comparison = assembly
    ? await Promise.all([
        client.from('comparison_objects').select('*').eq('assembly_id', assembly.id).order('sort_order', { ascending: true }),
        client.from('comparison_item_nodes').select('*').eq('assembly_id', assembly.id).order('sort_order', { ascending: true }),
        client.from('comparison_matrix_cells').select('*').eq('assembly_id', assembly.id),
      ])
    : null;
  const matrices = rows((await client.from('task_matrices').select('id, name, status').eq('task_id', taskId).order('created_at', { ascending: false }).limit(1)).data);
  const matrix = matrices[0]?.id ? await getV3MatrixProjection(string(matrices[0].id)) : null;
  return {
    task: taskResult.data as Row | null,
    records: rows(recordsResult.data), recipes, steps,
    materials: rows(materialsResult.data), issues: rows(issuesResult.data),
    comparison: comparison ? { assembly, objects: rows(comparison[0].data), nodes: rows(comparison[1].data), cells: rows(comparison[2].data) } : null,
    matrix,
  };
}

function renderContext(context: Awaited<ReturnType<typeof loadTaskContext>>) {
  const task = context.task ?? {};
  const recipeSteps = new Map<string, Row[]>();
  for (const step of context.steps) {
    const id = string(step.recipe_id); recipeSteps.set(id, [...(recipeSteps.get(id) ?? []), step]);
  }
  const lines = [
    `任务 ID=${string(task.id)}；名称=${string(task.task_name)}；品类=${string(task.product_category)}；产品=${string(task.product)}；型号=${string(task.product_model)}`,
    '五感体验记录：',
    ...context.records.slice(0, 40).map((item) => `- record_id=${string(item.id)}；检查项=${string(item.check_item)}；结果=${string(item.evaluation_result)}；描述=${string(item.problem_description || item.actual_result)}`),
    '单一食谱/功能：',
    ...context.recipes.slice(0, 24).flatMap((item) => [
      `- recipe_id=${string(item.id)}；名称=${string(item.name)}；状态=${string(item.effect_status)}；效果=${string(item.effect_description)}`,
      ...(recipeSteps.get(string(item.id)) ?? []).map((step) => `  step_id=${string(step.id)}；${string(step.operation)}`),
    ]),
    '素材：',
    ...context.materials.slice(0, 60).map((item) => `- material_id=${string(item.id)}；名称=${string(item.file_name)}；类型=${string(item.material_type)}`),
    '问题：',
    ...context.issues.slice(0, 40).map((item) => `- issue_id=${string(item.id)}；${string(item.title)}；${string(item.status)}`),
  ];
  if (context.comparison) {
    lines.push(`对比矩阵 assembly_id=${context.comparison.assembly?.id ?? ''}`);
    lines.push(...context.comparison.objects.map((item) => `- object_id=${string(item.id)}；对象=${string(item.object_name)}`));
    lines.push(...context.comparison.nodes.map((item) => `- comparison_item_id=${string(item.id)}；项目=${string(item.node_label)}`));
    lines.push(...context.comparison.cells.map((item) => `- comparison_cell_id=${string(item.id)}；object_id=${string(item.object_id)}；comparison_item_id=${string(item.item_node_id)}`));
  }
  if (context.matrix) {
    lines.push(`数据矩阵 matrix_id=${context.matrix.matrix.id}；名称=${context.matrix.matrix.name}`);
    lines.push(...context.matrix.columns.map((column) => `- column_id=${column.id}；列=${column.columnLabel}；类型=${column.dataType}`));
    lines.push(...context.matrix.rows.slice(0, 100).map((row) => {
      const values = context.matrix!.columns.slice(0, 24).map((column) => context.matrix!.cells[cellKey(row.id, column.id)]).filter(Boolean)
        .map((cell) => `${cell!.columnId}=${cell!.displayText || cell!.valueText || cell!.valueNumber || ''}`).filter(Boolean).join('；');
      return `- leaf_row_id=${row.id}；${values}`;
    }));
  }
  return lines.filter(Boolean).join('\n');
}

function buildSystemPrompt() {
  return `你是产品体验管理平台的 Hermes 任务协作技能。只输出 JSON：{"reply":"给用户的说明","actions":[...] }。
你只能基于提供的 ID 与数据提出操作，不能编造 ID，也不能提出删除、配置、权限、冻结、发布、导出操作。所有 actions 只是一份待用户确认的计划，绝不自动执行。所有 reply、操作标题和操作说明必须使用简体中文；仅在必要时保留 ID、文件名、公式和数字。
允许 actions：record_create、record_update、recipe_create、recipe_update、recipe_step_create、recipe_step_update、comparison_matrix_seed、comparison_object_create、comparison_category_create、comparison_cell_update、data_matrix_create、data_matrix_category_create、data_matrix_cell_update、material_rename、material_bind、comparison_cell_material_bind、data_matrix_cell_material_bind、issue_create、issue_update。
record_create 必须包含 check_item，可带 evaluation_result（合格/不合格/待定）和标准/结果字段；recipe_update 只可修改已有 recipe_id 的名称、食材/参数、效果描述和三态；data_matrix_create 必须包含 name；data_matrix_category_create 必须包含 matrix_id、label 和 level（1 或 2，二级还必须带 parent_id）；comparison_object_create 必须包含 object_name；comparison_category_create 必须包含 label，细项 node_type="item" 还必须带 parent_id；data_matrix_cell_update 必须带 matrix_id、leaf_row_id、column_id；material_bind 只能关联上下文中的素材到记录、食谱、步骤或问题；comparison_cell_material_bind 必须带 material_id 和 comparison_cell_id；data_matrix_cell_material_bind 必须带 material_id、matrix_id、leaf_row_id、column_id，且列必须是图片/素材列。素材整理或重命名时使用 material_rename，payload 必须含 material_id 与 naming_mode:"context"，不得自行填写 file_name；系统会按所属五感标准描述、食谱功能名称、对比矩阵对象*大类*细项或数据矩阵一级大类_二级细项自动命名并追加顺序号。若用户要求修改冻结报告，说明必须回到任务源数据编辑并重新生成报告，不产生报告写入 action。`;
}

function rows(value: unknown): Row[] { return Array.isArray(value) ? value as Row[] : []; }
function string(value: unknown): string { return typeof value === 'string' ? value : value == null ? '' : String(value); }
