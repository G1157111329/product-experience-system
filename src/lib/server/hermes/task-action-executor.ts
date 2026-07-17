import { and, eq, sql } from 'drizzle-orm';
import {
  normalizeAgentActions,
  type AgentAction,
  type AgentActionResult,
} from '@/lib/agent-actions';
import { createAssemblyFromComparisonTask, findAssemblyForTask } from '@/lib/server/comparison-assembly';
import { createMatrix } from '@/lib/matrix/design-service';
import { ensureV3ViewForMatrix } from '@/lib/matrix/bootstrap-v3';
import { writeSecurityAudit, type SecurityAuditRequestLike } from '@/lib/server/security-audit';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { getDb } from '@/storage/database/pg-db';
import {
  conversations,
  conversationMessages,
  matrixCellValues,
  matrixColumnDefinitions,
  matrixHierarchyNodes,
  matrixLeafRows,
  taskMatrices,
} from '@/storage/database/shared/schema';
import { isAgentActionAllowed } from '@/lib/agent-action-policy';
import { toStoredIssueStatus } from '@/lib/server/issue-state-machine';
import { canAccessConversationRow } from '@/lib/server/agent-access';
import { bindMaterial } from '@/lib/server/material-asset-service';
import type { MaterialLinkTargetType } from '@/lib/server/material-asset-service';
import { buildContextMaterialFileName, materialFileExtension } from '@/lib/material-context-naming';
import { roleForIndex } from '@/lib/comparison-media-role';

type Row = Record<string, unknown>;
type Client = ReturnType<typeof getSupabaseClient>;

const MATRIX_CELL_NODE_TYPES = new Set(['item', 'condition', 'process_node', 'metric', 'issue_group']);
const LEGACY_BIND_TARGET_MAP = {
  record_id: 'record',
  recipe_id: 'recipe',
  recipe_step_id: 'recipe_step',
  issue_id: 'issue',
} as const;

type TaskActionActor = { id: string; role: string; account?: string };

/** Shared executor for platform confirmation and WeChat/WeCom “确认执行”. */
export async function executeTaskActionPlanForUser(input: {
  taskId: string;
  user: TaskActionActor;
  actions: AgentAction[];
  actionPlanMessageId?: string | null;
  request?: SecurityAuditRequestLike;
}): Promise<{
  ok: boolean;
  results: AgentActionResult[];
  actionPlanStatus: 'task_action_plan_applied' | 'task_action_plan_partial' | null;
  message: string;
  conflict?: boolean;
}> {
  const client = getSupabaseClient();
  const actions = normalizeAgentActions(input.actions);
  if (actions.length === 0) {
    return { ok: false, results: [], actionPlanStatus: null, message: '没有可执行动作' };
  }

  if (input.actionPlanMessageId && !(await reserveActionPlan(input.taskId, input.actionPlanMessageId, actions, input.user))) {
    return {
      ok: false,
      results: [],
      actionPlanStatus: null,
      message: '该操作计划已执行、正在执行，或不属于当前任务',
      conflict: true,
    };
  }

  const results: AgentActionResult[] = [];
  for (const action of actions) {
    try {
      if (!isAgentActionAllowed(action.type)) {
        throw new Error('AI助手不允许执行删除或设置类动作');
      }
      const result = await applyAction(client, input.taskId, action, input.user);
      results.push(result);
    } catch (error) {
      results.push({
        id: action.id,
        type: action.type,
        status: 'failed',
        message: error instanceof Error ? error.message : '执行失败',
      });
    }
  }

  const hasFailure = results.some((result) => result.status === 'failed');
  const actionPlanStatus = hasFailure ? 'task_action_plan_partial' : 'task_action_plan_applied';
  if (input.actionPlanMessageId) {
    await persistActionPlanOutcome(input.actionPlanMessageId, input.taskId, actions, results, actionPlanStatus);
  }
  await writeSecurityAudit(client, {
    request: input.request,
    actorUserId: input.user.id,
    actorAccount: input.user.account || null,
    action: 'ai_agent.apply_actions',
    outcome: hasFailure ? 'failed' : 'success',
    targetType: 'experience_task',
    targetId: input.taskId,
    metadata: {
      action_count: actions.length,
      action_types: actions.map((action) => action.type),
      failed_count: results.filter((result) => result.status === 'failed').length,
      source: input.request ? 'platform' : 'external_chat',
    },
  });

  return {
    ok: !hasFailure,
    results,
    actionPlanStatus: input.actionPlanMessageId ? actionPlanStatus : null,
    message: hasFailure ? '部分 AI 动作执行失败' : 'AI 动作已执行',
  };
}
async function reserveActionPlan(
  taskId: string,
  messageId: string,
  actions: AgentAction[],
  user: { id: string; role: string },
) {
  const db = await getDb();
  const rows = await db
    .select({ content: conversationMessages.content, taskId: conversations.taskId, platformUserId: conversations.platformUserId })
    .from(conversationMessages)
    .innerJoin(conversations, eq(conversationMessages.conversationId, conversations.id))
    .where(eq(conversationMessages.id, messageId))
    .limit(1)
    .execute();
  const plan = rows[0];
  if (!plan || plan.taskId !== taskId || !canAccessConversationRow(user, plan)) return false;
  try {
    const stored = JSON.parse(plan.content || '{}') as { actions?: unknown };
    if (JSON.stringify(normalizeAgentActions(stored.actions)) !== JSON.stringify(actions)) return false;
  } catch {
    return false;
  }
  const claimed = await db
    .update(conversationMessages)
    .set({ toolName: 'task_action_plan_applying' })
    .where(and(eq(conversationMessages.id, messageId), eq(conversationMessages.toolName, 'task_action_plan')))
    .returning({ id: conversationMessages.id })
    .execute();
  return claimed.length === 1;
}

async function persistActionPlanOutcome(
  messageId: string,
  taskId: string,
  actions: AgentAction[],
  results: AgentActionResult[],
  toolName: 'task_action_plan_applied' | 'task_action_plan_partial',
) {
  const db = await getDb();
  await db
    .update(conversationMessages)
    .set({ toolName, content: JSON.stringify({ taskId, actions, results }) })
    .where(and(eq(conversationMessages.id, messageId), eq(conversationMessages.toolName, 'task_action_plan_applying')))
    .execute();
}

async function applyAction(
  client: Client,
  taskId: string,
  action: AgentAction,
  actor: { id: string; role: string },
): Promise<AgentActionResult> {
  switch (action.type) {
    case 'record_create':
      return applyRecordCreate(client, taskId, action);
    case 'recipe_create':
      return applyRecipeCreate(client, taskId, action);
    case 'recipe_update':
      return applyRecipeUpdate(client, taskId, action);
    case 'recipe_step_create':
      return applyRecipeStepCreate(client, taskId, action);
    case 'recipe_step_update':
      return applyRecipeStepUpdate(client, taskId, action);
    case 'comparison_matrix_seed':
      return applyComparisonMatrixSeed(client, taskId, action);
    case 'comparison_cell_update':
      return applyComparisonCellUpdate(client, taskId, action);
    case 'material_ai_result_update':
      return applyMaterialAiResultUpdate(client, taskId, action);
    case 'material_rename':
      return applyMaterialRename(client, taskId, action);
    case 'material_bind':
      return applyMaterialBind(client, taskId, action, actor.id);
    case 'material_organize':
      return applyMaterialOrganize(client, taskId, action, actor.id);
    case 'comparison_cell_material_bind':
      return applyComparisonCellMaterialBind(client, taskId, action, actor.id);
    case 'data_matrix_cell_material_bind':
      return applyDataMatrixCellMaterialBind(client, taskId, action, actor.id);
    case 'issue_create':
      return applyIssueCreate(client, taskId, action);
    case 'issue_update':
      return applyIssueUpdate(client, taskId, action);
    case 'record_update':
      return applyRecordUpdate(client, taskId, action);
    case 'task_create':
      return applyTaskCreate(client, action, actor.id);
    case 'standard_item_create':
      return applyStandardItemCreate(client, action, actor.role);
    case 'data_matrix_cell_update':
      return applyDataMatrixCellUpdate(client, taskId, action, actor.id);
    case 'data_matrix_create':
      return applyDataMatrixCreate(taskId, action, actor.id);
    case 'data_matrix_category_create':
      return applyDataMatrixCategoryCreate(taskId, action, actor.id);
    case 'comparison_object_create':
      return applyComparisonObjectCreate(client, taskId, action);
    case 'comparison_category_create':
      return applyComparisonCategoryCreate(client, taskId, action);
  }
}

async function applyTaskCreate(client: Client, action: AgentAction, actorId: string): Promise<AgentActionResult> {
  const taskName = requiredString(action.payload.task_name, '缺少体验计划名称');
  const { data, error } = await client.from('experience_tasks').insert({
    task_name: taskName,
    product_category: optionalString(action.payload.product_category),
    product: optionalString(action.payload.product),
    product_model: optionalString(action.payload.product_model),
    project_type: optionalString(action.payload.project_type),
    project_phase: optionalString(action.payload.project_phase),
    organizer: optionalString(action.payload.organizer),
    test_purpose: optionalString(action.payload.test_purpose),
    created_by: actorId,
    status: '待执行',
    task_mode: optionalString(action.payload.task_mode) || 'single',
  }).select().single();
  if (error) throw new Error(error.message || '新建体验计划失败');
  return successResult(action, '已新建体验计划', data);
}

async function applyStandardItemCreate(client: Client, action: AgentAction, actorRole: string): Promise<AgentActionResult> {
  if (actorRole !== 'admin') throw new Error('仅管理员可通过AI助手录入标准');
  const standardId = requiredString(action.payload.standard_id, '缺少标准ID');
  const { data: standard } = await client.from('standards').select('id').eq('id', standardId).maybeSingle();
  if (!standard) throw new Error('标准不存在');
  const insert: Row = { standard_id: standardId, sort_order: Number(action.payload.sort_order || 0) };
  for (const key of ['sensory_dimension', 'test_phase', 'experience_flow', 'touch_point', 'check_dimension', 'sub_check_dimension', 'check_item', 'check_requirement', 'experience_standard', 'check_standard', 'measurement_position', 'check_tool', 'problem_level', 'evaluation_prep', 'subjective_rating'] as const) {
    if (action.payload[key] !== undefined) insert[key] = optionalString(action.payload[key]);
  }
  const { data, error } = await client.from('standard_items').insert(insert).select().single();
  if (error) throw new Error(error.message || '新增标准条目失败');
  return successResult(action, '已新增标准条目', data);
}

async function applyDataMatrixCreate(taskId: string, action: AgentAction, actorId: string): Promise<AgentActionResult> {
  const name = requiredString(action.payload.name, '缺少数据矩阵名称');
  const matrix = await createMatrix(taskId, actorId, {
    name,
    description: optionalString(action.payload.description) || undefined,
  });
  const view = await ensureV3ViewForMatrix({ matrixId: matrix.id, userId: actorId });
  return successResult(action, '已新建数据矩阵', { matrix, view_definition_id: view.viewDefinitionId });
}

async function applyDataMatrixCategoryCreate(taskId: string, action: AgentAction, actorId: string): Promise<AgentActionResult> {
  const matrixId = requiredString(action.payload.matrix_id, '缺少数据矩阵ID');
  const label = requiredString(action.payload.label, '缺少数据矩阵分类名称');
  const level = Number(action.payload.level);
  if (level !== 1 && level !== 2) throw new Error('数据矩阵分类层级必须为 1 或 2');
  const parentId = level === 2 ? requiredString(action.payload.parent_id, '二级细项缺少一级分类ID') : null;

  const db = await getDb();
  const [matrix] = await db.select({ id: taskMatrices.id, taskId: taskMatrices.taskId })
    .from(taskMatrices).where(eq(taskMatrices.id, matrixId)).limit(1).execute();
  if (!matrix || matrix.taskId !== taskId) throw new Error('数据矩阵不属于当前任务');
  await ensureV3ViewForMatrix({ matrixId, userId: actorId });

  const nodes = await db.select().from(matrixHierarchyNodes)
    .where(eq(matrixHierarchyNodes.matrixId, matrixId)).execute();
  const parent = parentId ? nodes.find((node) => node.id === parentId) : null;
  if (level === 2 && (!parent || parent.nodeType !== 'level_1' || parent.archivedAt !== null)) {
    throw new Error('二级细项必须归属当前数据矩阵的有效一级分类');
  }
  const existing = nodes.find((node) =>
    node.nodeLabel === label
      && node.parentId === parentId
      && node.nodeType === `level_${level}`
      && node.archivedAt === null,
  );
  if (existing) return successResult(action, '数据矩阵分类已存在', { node: existing, already_created: true });

  const result = await db.transaction(async (transaction) => {
    const siblings = nodes.filter((node) => node.parentId === parentId && node.archivedAt === null);
    const [node] = await transaction.insert(matrixHierarchyNodes).values({
      matrixId,
      parentId,
      level,
      nodeLabel: label,
      nodeType: `level_${level}`,
      sortOrder: Math.max(0, ...siblings.map((sibling) => sibling.sortOrder)) + 1,
      createdBy: actorId,
    }).returning().execute();

    const level1NodeId = level === 1 ? node.id : parent!.id;
    let level2NodeId = level === 2 ? node.id : null;
    let childNode: typeof node | undefined;
    if (level === 1) {
      [childNode] = await transaction.insert(matrixHierarchyNodes).values({
        matrixId,
        parentId: node.id,
        level: 2,
        nodeLabel: '默认细项',
        nodeType: 'level_2',
        sortOrder: 1,
        createdBy: actorId,
      }).returning().execute();
      level2NodeId = childNode.id;
    }
    const [maxRow] = await transaction.select({ maxIndex: sql<number>`COALESCE(MAX(${matrixLeafRows.visibleRowIndex}), 0)` })
      .from(matrixLeafRows).where(eq(matrixLeafRows.matrixId, matrixId)).execute();
    const [leafRow] = await transaction.insert(matrixLeafRows).values({
      matrixId,
      level1NodeId,
      level2NodeId,
      level3NodeId: null,
      visibleRowIndex: Number(maxRow?.maxIndex || 0) + 1,
      groupRowIndex: 1,
      status: 'active',
    }).returning().execute();
    return { node, childNode, leafRow };
  });
  return successResult(action, '已新增数据矩阵分类', result);
}

async function applyDataMatrixCellUpdate(client: Client, taskId: string, action: AgentAction, actorId: string): Promise<AgentActionResult> {
  const matrixId = requiredString(action.payload.matrix_id, '缺少数据矩阵ID');
  const leafRowId = requiredString(action.payload.leaf_row_id, '缺少矩阵行ID');
  const columnId = requiredString(action.payload.column_id, '缺少矩阵列ID');
  const [{ data: matrix }, { data: row }, { data: column }] = await Promise.all([
    client.from('task_matrices').select('id, task_id').eq('id', matrixId).maybeSingle(),
    client.from('matrix_leaf_rows').select('id, matrix_id').eq('id', leafRowId).maybeSingle(),
    client.from('matrix_column_definitions').select('id, matrix_id').eq('id', columnId).maybeSingle(),
  ]);
  if (!matrix || matrix.task_id !== taskId || row?.matrix_id !== matrixId || column?.matrix_id !== matrixId) {
    throw new Error('矩阵、行或列不属于当前任务');
  }
  const valueText = optionalString(action.payload.value_text);
  const valueNumber = action.payload.value_number === undefined ? null : String(action.payload.value_number);
  const { data, error } = await client.from('matrix_cell_values').upsert({
    matrix_id: matrixId,
    leaf_row_id: leafRowId,
    column_id: columnId,
    value_text: valueText,
    value_number: valueNumber,
    display_text: optionalString(action.payload.display_text),
    value_state: valueText !== null || valueNumber !== null ? 'filled' : 'empty',
    updated_by: actorId,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'matrix_id,leaf_row_id,column_id' }).select().single();
  if (error) throw new Error(error.message || '编辑数据矩阵单元格失败');
  return successResult(action, '已编辑数据矩阵单元格', data);
}

async function applyRecipeCreate(client: Client, taskId: string, action: AgentAction): Promise<AgentActionResult> {
  const name = requiredString(action.payload.name, '缺少食谱名称');
  const { data, error } = await client.from('recipes').insert({
    task_id: taskId,
    name,
    recipe_type: optionalString(action.payload.recipe_type) || '食谱',
    effect_status: 'pending',
    ingredients: optionalString(action.payload.ingredients) || optionalString(action.payload.description),
    effect_description: optionalString(action.payload.effect_description) || optionalString(action.payload.effect),
  }).select().single();
  if (error) throw new Error(error.message || '新建食谱失败');
  return successResult(action, '已新建食谱', data);
}

async function applyRecipeUpdate(client: Client, taskId: string, action: AgentAction): Promise<AgentActionResult> {
  const recipeId = requiredString(action.payload.recipe_id, '缺少食谱ID');
  await assertRecipeInTask(client, recipeId, taskId);
  const update: Row = { updated_at: new Date().toISOString() };
  for (const key of ['name', 'ingredients', 'recipe_type', 'effect_description', 'effect_status'] as const) {
    if (action.payload[key] !== undefined) update[key] = optionalString(action.payload[key]);
  }
  if (action.payload.effect !== undefined && action.payload.effect_description === undefined) {
    update.effect_description = optionalString(action.payload.effect);
  }
  if (Object.keys(update).length === 1) throw new Error('没有可更新的食谱字段');
  const { data, error } = await client.from('recipes').update(update).eq('id', recipeId).select().single();
  if (error) throw new Error(error.message || '修改食谱失败');
  return successResult(action, '已修改食谱/功能', data);
}

async function applyRecipeStepCreate(client: Client, taskId: string, action: AgentAction): Promise<AgentActionResult> {
  const recipeId = requiredString(action.payload.recipe_id, '缺少食谱ID');
  const operation = requiredString(action.payload.operation, '缺少步骤描述');
  await assertRecipeInTask(client, recipeId, taskId);

  const { data: latestStep } = await client
    .from('recipe_steps')
    .select('step_number, sort_order')
    .eq('recipe_id', recipeId)
    .order('step_number', { ascending: false })
    .maybeSingle();
  const nextNumber = Number(latestStep?.step_number || 0) + 1;

  const { data, error } = await client
    .from('recipe_steps')
    .insert({
      recipe_id: recipeId,
      step_number: nextNumber,
      operation,
      sort_order: Number(latestStep?.sort_order || latestStep?.step_number || 0) + 1,
    })
    .select()
    .single();
  if (error) throw new Error(error.message || '新增食谱步骤失败');
  return successResult(action, '已新增食谱步骤', data);
}

async function applyRecipeStepUpdate(client: Client, taskId: string, action: AgentAction): Promise<AgentActionResult> {
  const stepId = requiredString(action.payload.step_id, '缺少步骤ID');
  await assertRecipeStepInTask(client, stepId, taskId);

  const update: Row = { updated_at: new Date().toISOString() };
  if (action.payload.operation !== undefined) update.operation = requiredString(action.payload.operation, '步骤描述不能为空');
  if (Object.keys(update).length === 1) throw new Error('没有可更新的步骤字段');

  const { data, error } = await client.from('recipe_steps').update(update).eq('id', stepId).select().single();
  if (error) throw new Error(error.message || '修改食谱步骤失败');
  return successResult(action, '已修改食谱步骤', data);
}

async function applyComparisonMatrixSeed(client: Client, taskId: string, action: AgentAction): Promise<AgentActionResult> {
  const assemblyId = await ensureTaskAssembly(client, taskId);
  const createdObjects = await ensureComparisonObjects(client, assemblyId, taskId, action.payload.objects);
  const createdNodes = await ensureComparisonSections(client, assemblyId, action.payload.sections);
  await completeMissingCells(client, assemblyId);

  const cells = Array.isArray(action.payload.cells) ? action.payload.cells : [];
  const updatedCells: Row[] = [];
  for (const cellPayload of cells) {
    if (!cellPayload || typeof cellPayload !== 'object') continue;
    const updated = await upsertComparisonCellByLabels(client, assemblyId, cellPayload as Row);
    if (updated) updatedCells.push(updated);
  }

  return successResult(action, '已填充对比矩阵', {
    assembly_id: assemblyId,
    created_objects: createdObjects.length,
    created_nodes: createdNodes.length,
    updated_cells: updatedCells.length,
  });
}

async function applyComparisonCellUpdate(client: Client, taskId: string, action: AgentAction): Promise<AgentActionResult> {
  const assemblyId = await ensureTaskAssembly(client, taskId);
  const data = await upsertComparisonCellByLabels(client, assemblyId, action.payload);
  if (!data) throw new Error('未找到可更新的矩阵单元格');
  return successResult(action, '已更新矩阵单元格', data);
}

async function applyComparisonObjectCreate(client: Client, taskId: string, action: AgentAction): Promise<AgentActionResult> {
  const objectName = requiredString(action.payload.object_name || action.payload.name, '缺少对比对象名称');
  const assemblyId = await ensureTaskAssembly(client, taskId);
  const { data: existing } = await client.from('comparison_objects').select('*')
    .eq('assembly_id', assemblyId).eq('object_name', objectName).maybeSingle();
  if (existing) return successResult(action, '对比对象已存在', { object: existing, already_created: true });

  const { data: latest } = await client.from('comparison_objects').select('sort_order')
    .eq('assembly_id', assemblyId).order('sort_order', { ascending: false }).maybeSingle();
  const { data, error } = await client.from('comparison_objects').insert({
    assembly_id: assemblyId,
    task_id: taskId,
    object_name: objectName,
    object_type: optionalString(action.payload.object_type) || 'product_model',
    comparison_factor: optionalString(action.payload.comparison_factor),
    model: optionalString(action.payload.model),
    brand: optionalString(action.payload.brand),
    specification: optionalString(action.payload.specification),
    custom_fields: {},
    sort_order: Number(latest?.sort_order || 0) + 1,
  }).select().single();
  if (error) throw new Error(error.message || '创建对比对象失败');
  await completeMissingCells(client, assemblyId);
  return successResult(action, '已新增对比对象', data);
}

async function applyComparisonCategoryCreate(client: Client, taskId: string, action: AgentAction): Promise<AgentActionResult> {
  const label = requiredString(action.payload.label || action.payload.node_label, '缺少对比分类名称');
  const nodeType = action.payload.node_type === 'item' ? 'item' : 'section';
  const parentId = nodeType === 'item'
    ? requiredString(action.payload.parent_id, '对比细项缺少分类ID')
    : null;
  const assemblyId = await ensureTaskAssembly(client, taskId);
  if (parentId) {
    const { data: parent } = await client.from('comparison_item_nodes').select('id, assembly_id, node_type')
      .eq('id', parentId).maybeSingle();
    if (!parent || parent.assembly_id !== assemblyId || parent.node_type !== 'section') {
      throw new Error('对比细项必须归属当前对比矩阵的分类');
    }
  }
  const created = await ensureComparisonNode(client, assemblyId, label, nodeType, parentId);
  await completeMissingCells(client, assemblyId);
  return successResult(action, created.created ? '已新增对比分类' : '对比分类已存在', {
    node: created.node,
    already_created: !created.created,
  });
}

async function applyMaterialAiResultUpdate(client: Client, taskId: string, action: AgentAction): Promise<AgentActionResult> {
  const materialId = requiredString(action.payload.material_id, '缺少素材ID');
  await assertMaterialInTask(client, materialId, taskId);
  const summary = requiredString(action.payload.summary, '缺少素材整理内容');
  const tags = Array.isArray(action.payload.tags)
    ? action.payload.tags.map((item) => String(item || '').trim()).filter(Boolean).slice(0, 20)
    : [];

  const { data: material } = await client
    .from('materials')
    .select('ai_result')
    .eq('id', materialId)
    .maybeSingle();
  const previous = material?.ai_result && typeof material.ai_result === 'object' ? material.ai_result as Row : {};

  const { data, error } = await client
    .from('materials')
    .update({
      ai_analysis_status: 'generated',
      ai_result: {
        ...previous,
        agent_summary: summary,
        agent_tags: tags,
        agent_updated_at: new Date().toISOString(),
      },
    })
    .eq('id', materialId)
    .select()
    .single();
  if (error) throw new Error(error.message || '整理素材内容失败');
  return successResult(action, '已写入素材 AI 整理结果', data);
}

function textValue(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function nextContextSequence(existingNames: unknown[], baseName: string, extension: string) {
  const escapedBase = baseName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const escapedExtension = extension.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`^${escapedBase}(\\d+)\\.${escapedExtension}$`, 'i');
  return existingNames.reduce<number>((max, value) => {
    const sequence = textValue(value).match(pattern)?.[1];
    return sequence ? Math.max(max, Number(sequence)) : max;
  }, 0) + 1;
}

async function resolveContextMaterialBase(client: Client, material: Row): Promise<string> {
  if (textValue(material.record_id)) {
    const { data } = await client.from('check_records')
      .select('check_item, touch_point, experience_standard, check_standard')
      .eq('id', material.record_id).maybeSingle();
    return textValue(data?.check_item) || textValue(data?.touch_point) || textValue(data?.experience_standard) || textValue(data?.check_standard) || '五感体验';
  }

  const recipeId = textValue(material.recipe_id);
  if (recipeId) {
    const { data } = await client.from('recipes').select('name').eq('id', recipeId).maybeSingle();
    return textValue(data?.name) || '食谱功能';
  }
  if (textValue(material.recipe_step_id)) {
    const { data: step } = await client.from('recipe_steps').select('recipe_id').eq('id', material.recipe_step_id).maybeSingle();
    if (step?.recipe_id) {
      const { data } = await client.from('recipes').select('name').eq('id', step.recipe_id).maybeSingle();
      return textValue(data?.name) || '食谱功能';
    }
  }

  if (textValue(material.comparison_cell_id)) {
    const { data: cell } = await client.from('comparison_matrix_cells')
      .select('assembly_id, object_id, item_node_id').eq('id', material.comparison_cell_id).maybeSingle();
    if (cell) {
      const [{ data: object }, { data: nodes }] = await Promise.all([
        client.from('comparison_objects').select('object_name').eq('id', cell.object_id).maybeSingle(),
        client.from('comparison_item_nodes').select('id, parent_id, node_label').eq('assembly_id', cell.assembly_id),
      ]);
      const nodeRows = (nodes || []) as Row[];
      const byId = new Map<string, Row>(nodeRows.map((node) => [String(node.id), node]));
      const detail = byId.get(String(cell.item_node_id));
      let top = detail;
      while (top?.parent_id && byId.get(String(top.parent_id))) top = byId.get(String(top.parent_id));
      const labels = [textValue(object?.object_name), textValue(top?.node_label), textValue(detail?.node_label)]
        .filter((value, index, values) => Boolean(value) && values.indexOf(value) === index);
      if (labels.length) return labels.join('*');
    }
    return '对比矩阵素材';
  }

  const { data: link } = await client.from('material_links')
    .select('target_id').eq('material_id', material.id).eq('target_type', 'dynamic_matrix_cell_value').limit(1).maybeSingle();
  if (link?.target_id) {
    const { data: cell } = await client.from('matrix_cell_values')
      .select('matrix_id, leaf_row_id').eq('id', link.target_id).maybeSingle();
    if (cell) {
      const { data: leaf } = await client.from('matrix_leaf_rows')
        .select('level_1_node_id, level_2_node_id').eq('id', cell.leaf_row_id).maybeSingle();
      if (leaf?.level_1_node_id) {
        const leafRow = leaf as Row;
        const level1NodeId = textValue(leafRow.level_1_node_id);
        const level2NodeId = textValue(leafRow.level_2_node_id);
        const nodeIds = [level1NodeId, level2NodeId].filter(Boolean);
        const { data: nodes } = await client.from('matrix_hierarchy_nodes').select('id, node_label').in('id', nodeIds);
        const labels = new Map<string, string>(((nodes || []) as Row[]).map((node) => [String(node.id), textValue(node.node_label)]));
        const level1 = labels.get(level1NodeId) || '一级大类';
        const level2 = level2NodeId ? labels.get(level2NodeId) : '';
        return level2 ? `${level1}_${level2}` : level1;
      }
    }
    return '数据矩阵素材';
  }

  return '素材';
}

async function applyMaterialRename(client: Client, taskId: string, action: AgentAction): Promise<AgentActionResult> {
  const materialId = requiredString(action.payload.material_id, '缺少素材ID');
  await assertMaterialInTask(client, materialId, taskId);
  const { data: material } = await client.from('materials')
    .select('id, task_id, record_id, recipe_id, recipe_step_id, comparison_cell_id, material_type, file_name, file_path')
    .eq('id', materialId).maybeSingle();
  if (!material) throw new Error('素材不存在');

  const useContextName = action.payload.naming_mode === 'context';
  let fileName = useContextName
    ? ''
    : requiredString(action.payload.file_name, '缺少新素材名称').slice(0, 180);
  if (useContextName) {
    const baseName = await resolveContextMaterialBase(client, material as Row);
    const { data: taskMaterials } = await client.from('materials').select('file_name').eq('task_id', taskId).limit(5000);
    const extension = materialFileExtension(textValue(material.file_name) || textValue(material.file_path), material.material_type === 'video' ? 'video' : 'image');
    fileName = buildContextMaterialFileName({
      baseName,
      extension,
      sequence: nextContextSequence(((taskMaterials || []) as Row[]).map((item) => item.file_name), baseName, extension),
    });
  }

  const { data, error } = await client
    .from('materials')
    .update({ file_name: fileName })
    .eq('id', materialId)
    .select()
    .single();
  if (error) throw new Error(error.message || '重命名素材失败');
  return successResult(action, useContextName ? '已按所属场景与顺序重命名素材' : '已重命名素材', data);
}

async function applyMaterialBind(
  client: Client,
  taskId: string,
  action: AgentAction,
  actorId: string,
): Promise<AgentActionResult> {
  const materialId = requiredString(action.payload.material_id, '缺少素材ID');
  await claimMaterialForTask(client, materialId, taskId, actorId);

  const targets: Array<{ legacyKey: keyof typeof LEGACY_BIND_TARGET_MAP; targetType: MaterialLinkTargetType; targetId: string }> = [];
  for (const [legacyKey, targetType] of Object.entries(LEGACY_BIND_TARGET_MAP) as Array<[keyof typeof LEGACY_BIND_TARGET_MAP, MaterialLinkTargetType]>) {
    const targetId = optionalString(action.payload[legacyKey]);
    if (!targetId) continue;
    if (legacyKey === 'record_id') {
      const { data } = await client.from('check_records').select('id, task_id').eq('id', targetId).maybeSingle();
      if (!data || data.task_id !== taskId) throw new Error('体验记录不属于当前任务');
    }
    if (legacyKey === 'recipe_id') await assertRecipeInTask(client, targetId, taskId);
    if (legacyKey === 'recipe_step_id') await assertRecipeStepInTask(client, targetId, taskId);
    if (legacyKey === 'issue_id') {
      const { data } = await client.from('issues').select('id, task_id').eq('id', targetId).maybeSingle();
      if (!data || data.task_id !== taskId) throw new Error('问题不属于当前任务');
    }
    targets.push({ legacyKey, targetType, targetId });
  }
  if (targets.length === 0) throw new Error('缺少素材绑定目标');

  const linkIds: string[] = [];
  const legacyPatch: Row = { task_id: taskId, status: 'bound' };
  for (const target of targets) {
    const { linkId } = await bindMaterial({
      materialId,
      targetType: target.targetType,
      targetId: target.targetId,
      bindingMethod: 'agent_suggested',
      boundBy: actorId,
    });
    linkIds.push(linkId);
    legacyPatch[target.legacyKey] = target.targetId;
  }
  const { data, error } = await client.from('materials').update(legacyPatch).eq('id', materialId).select().single();
  if (error) throw new Error(error.message || '绑定素材失败');
  return successResult(action, '已绑定素材', { ...data, link_ids: linkIds });
}

/**
 * Claim WeChat/iLink inbox media into the current task, optionally bind a target,
 * then rename with the context template. This is the Hermes “现场素材整理入库” base action.
 */
async function applyMaterialOrganize(
  client: Client,
  taskId: string,
  action: AgentAction,
  actorId: string,
): Promise<AgentActionResult> {
  const materialId = requiredString(action.payload.material_id, '缺少素材ID');
  await claimMaterialForTask(client, materialId, taskId, actorId);

  const hasBindTarget = ['record_id', 'recipe_id', 'recipe_step_id', 'issue_id', 'comparison_cell_id']
    .some((key) => optionalString(action.payload[key]));
  if (hasBindTarget && optionalString(action.payload.comparison_cell_id)) {
    await applyComparisonCellMaterialBind(client, taskId, {
      ...action,
      payload: { ...action.payload, material_id: materialId },
    }, actorId);
  } else if (hasBindTarget) {
    await applyMaterialBind(client, taskId, {
      ...action,
      payload: { ...action.payload, material_id: materialId },
    }, actorId);
  }

  const renameResult = await applyMaterialRename(client, taskId, {
    ...action,
    payload: {
      material_id: materialId,
      naming_mode: action.payload.naming_mode === 'manual' ? undefined : 'context',
      file_name: action.payload.file_name,
    },
  });
  return successResult(action, '已整理素材到当前任务素材库', renameResult.data);
}

/**
 * Add one task material to an existing comparison cell without replacing the
 * cell's other attachments. Uses material_links as the source of truth and
 * keeps one legacy FK for older readers.
 */
async function applyComparisonCellMaterialBind(
  client: Client,
  taskId: string,
  action: AgentAction,
  actorId: string,
): Promise<AgentActionResult> {
  const materialId = requiredString(action.payload.material_id, '缺少素材ID');
  const cellId = requiredString(action.payload.comparison_cell_id, '缺少对比矩阵单元格ID');
  await claimMaterialForTask(client, materialId, taskId, actorId);

  const assembly = await findAssemblyForTask(client, taskId);
  if (!assembly) throw new Error('当前任务没有可用的对比矩阵');
  const { data: cell } = await client
    .from('comparison_matrix_cells')
    .select('id, assembly_id')
    .eq('id', cellId)
    .maybeSingle();
  if (!cell || cell.assembly_id !== assembly.id) throw new Error('对比矩阵单元格不属于当前任务');

  const { linkId } = await bindMaterial({
    materialId,
    targetType: 'comparison_cell',
    targetId: cellId,
    bindingMethod: 'agent_suggested',
    boundBy: actorId,
  });

  const { data: latest } = await client
    .from('materials')
    .select('media_display_order')
    .eq('comparison_cell_id', cellId)
    .order('media_display_order', { ascending: false })
    .limit(1)
    .maybeSingle();
  const displayOrder = Number(latest?.media_display_order ?? -1) + 1;
  const { data, error } = await client
    .from('materials')
    .update({
      task_id: taskId,
      comparison_cell_id: cellId,
      comparison_assembly_id: assembly.id,
      media_display_order: displayOrder,
      media_role: roleForIndex(displayOrder),
      status: 'bound',
    })
    .eq('id', materialId)
    .select()
    .single();
  if (error) throw new Error(error.message || '关联对比矩阵单元格素材失败');
  return successResult(action, '已关联对比矩阵单元格素材', { ...data, link_id: linkId });
}

/** Bind a task material to a V3 data-matrix media column via material_links. */
async function applyDataMatrixCellMaterialBind(
  client: Client,
  taskId: string,
  action: AgentAction,
  actorId: string,
): Promise<AgentActionResult> {
  const materialId = requiredString(action.payload.material_id, '缺少素材ID');
  const matrixId = requiredString(action.payload.matrix_id, '缺少数据矩阵ID');
  const leafRowId = requiredString(action.payload.leaf_row_id, '缺少数据矩阵行ID');
  const columnId = requiredString(action.payload.column_id, '缺少数据矩阵列ID');
  await assertMaterialInTask(client, materialId, taskId);

  const db = await getDb();
  const [matrixRows, leafRows, columnRows] = await Promise.all([
    db.select({ id: taskMatrices.id, taskId: taskMatrices.taskId }).from(taskMatrices)
      .where(eq(taskMatrices.id, matrixId)).limit(1).execute(),
    db.select({ id: matrixLeafRows.id }).from(matrixLeafRows)
      .where(sql`${matrixLeafRows.id} = ${leafRowId} AND ${matrixLeafRows.matrixId} = ${matrixId}`).limit(1).execute(),
    db.select({ id: matrixColumnDefinitions.id, dataType: matrixColumnDefinitions.dataType }).from(matrixColumnDefinitions)
      .where(sql`${matrixColumnDefinitions.id} = ${columnId} AND ${matrixColumnDefinitions.matrixId} = ${matrixId}`).limit(1).execute(),
  ]);
  if (matrixRows[0]?.taskId !== taskId || leafRows.length === 0 || columnRows.length === 0) {
    throw new Error('数据矩阵、行或列不属于当前任务');
  }
  if (!['image_slot', 'media_slot'].includes(columnRows[0].dataType)) {
    throw new Error('该数据矩阵列不支持素材关联');
  }

  const [cell] = await db
    .insert(matrixCellValues)
    .values({
      matrixId,
      leafRowId,
      columnId,
      valueState: 'empty',
      version: 1,
      updatedBy: actorId,
    })
    .onConflictDoUpdate({
      target: [matrixCellValues.matrixId, matrixCellValues.leafRowId, matrixCellValues.columnId],
      set: { updatedAt: sql`NOW()` },
    })
    .returning({ id: matrixCellValues.id })
    .execute();
  if (!cell?.id) throw new Error('无法创建数据矩阵单元格');

  const { linkId } = await bindMaterial({
    materialId,
    targetType: 'dynamic_matrix_cell_value',
    targetId: cell.id,
    bindingMethod: 'agent_suggested',
    boundBy: actorId,
  });
  return successResult(action, '已关联数据矩阵单元格素材', {
    material_id: materialId,
    matrix_id: matrixId,
    leaf_row_id: leafRowId,
    column_id: columnId,
    cell_id: cell.id,
    link_id: linkId,
  });
}

async function applyIssueCreate(client: Client, taskId: string, action: AgentAction): Promise<AgentActionResult> {
  const title = requiredString(action.payload.title, '缺少问题标题');
  const { data, error } = await client.from('issues').insert({
    task_id: taskId,
    title,
    description: optionalString(action.payload.description),
    level: optionalString(action.payload.level) || '二类',
    source: optionalString(action.payload.source) || 'AI助手',
    status: 'open',
  }).select().single();
  if (error) throw new Error(error.message || '新增问题点失败');
  return successResult(action, '已新增问题点，状态为待整改', data);
}

async function applyIssueUpdate(client: Client, taskId: string, action: AgentAction): Promise<AgentActionResult> {
  const issueId = requiredString(action.payload.issue_id, '缺少问题ID');
  const { data: issue } = await client.from('issues').select('id, task_id').eq('id', issueId).maybeSingle();
  if (!issue || issue.task_id !== taskId) throw new Error('问题不属于当前任务');
  const update: Row = { updated_at: new Date().toISOString() };
  for (const key of ['title', 'description', 'level', 'status', 'improve_plan', 'responsible_person', 'verification_note'] as const) {
    if (action.payload[key] !== undefined) {
      update[key] = key === 'status'
        ? toStoredIssueStatus(String(action.payload[key] || ''))
        : optionalString(action.payload[key]);
    }
  }
  if (Object.keys(update).length === 1) throw new Error('没有可更新的问题字段');
  const { data, error } = await client.from('issues').update(update).eq('id', issueId).select().single();
  if (error) throw new Error(error.message || '修改问题点失败');
  return successResult(action, '已修改问题点', data);
}

async function applyRecordUpdate(client: Client, taskId: string, action: AgentAction): Promise<AgentActionResult> {
  const recordId = requiredString(action.payload.record_id, '缺少体验记录ID');
  const { data: record } = await client.from('check_records').select('id, task_id').eq('id', recordId).maybeSingle();
  if (!record || record.task_id !== taskId) throw new Error('体验记录不属于当前任务');
  const update: Row = { updated_at: new Date().toISOString() };
  for (const key of ['actual_result', 'problem_description', 'evaluation_result', 'experience_standard', 'check_standard'] as const) {
    if (action.payload[key] !== undefined) update[key] = optionalString(action.payload[key]);
  }
  if (Object.keys(update).length === 1) throw new Error('没有可更新的体验记录字段');
  const { data, error } = await client.from('check_records').update(update).eq('id', recordId).select().single();
  if (error) throw new Error(error.message || '修改五感体验记录失败');
  return successResult(action, '已修改五感体验记录', data);
}

async function applyRecordCreate(client: Client, taskId: string, action: AgentAction): Promise<AgentActionResult> {
  const checkItem = requiredString(action.payload.check_item, '缺少检查项');
  const insert: Row = {
    task_id: taskId,
    check_item: checkItem,
    evaluation_result: optionalString(action.payload.evaluation_result) || '待定',
  };
  for (const key of ['standard_item_id', 'standard_category', 'sensory_dimension', 'test_phase', 'experience_flow', 'touch_point', 'check_dimension', 'sub_check_dimension', 'check_requirement', 'check_standard', 'experience_standard', 'actual_result', 'problem_description', 'measurement_position', 'measurement_value', 'tester', 'recipe_id', 'recipe_step_id'] as const) {
    if (action.payload[key] !== undefined) insert[key] = optionalString(action.payload[key]);
  }
  if (typeof insert.recipe_id === 'string') await assertRecipeInTask(client, insert.recipe_id, taskId);
  if (typeof insert.recipe_step_id === 'string') await assertRecipeStepInTask(client, insert.recipe_step_id, taskId);
  const { data, error } = await client.from('check_records').insert(insert).select().single();
  if (error) throw new Error(error.message || '新增五感体验记录失败');
  return successResult(action, '已新增五感体验记录', data);
}

async function assertRecipeInTask(client: Client, recipeId: string, taskId: string) {
  const { data: recipe } = await client.from('recipes').select('id, task_id').eq('id', recipeId).maybeSingle();
  if (!recipe || recipe.task_id !== taskId) throw new Error('食谱不属于当前任务');
}

async function assertRecipeStepInTask(client: Client, stepId: string, taskId: string) {
  const { data: step } = await client.from('recipe_steps').select('id, recipe_id').eq('id', stepId).maybeSingle();
  if (!step?.recipe_id) throw new Error('步骤不存在');
  const { data: recipe } = await client.from('recipes').select('id, task_id').eq('id', step.recipe_id).maybeSingle();
  if (!recipe || recipe.task_id !== taskId) throw new Error('步骤不属于当前任务');
}

async function assertMaterialInTask(client: Client, materialId: string, taskId: string) {
  const { data: material } = await client.from('materials').select('id, task_id').eq('id', materialId).maybeSingle();
  if (!material || material.task_id !== taskId) throw new Error('素材不属于当前任务');
}

/** Allow task materials, or claim the actor's unbound WeChat/iLink inbox media into this task. */
async function claimMaterialForTask(client: Client, materialId: string, taskId: string, actorId: string) {
  const { data: material } = await client
    .from('materials')
    .select('id, task_id, created_by')
    .eq('id', materialId)
    .maybeSingle();
  if (!material) throw new Error('素材不存在');
  if (material.task_id === taskId) return material;
  if (material.task_id && material.task_id !== taskId) throw new Error('素材已归属其他体验计划');
  if (material.created_by !== actorId) throw new Error('只能整理本人微信/企微回传的素材');
  const { error } = await client.from('materials').update({ task_id: taskId }).eq('id', materialId);
  if (error) throw new Error(error.message || '素材入库失败');
  return { ...material, task_id: taskId };
}

async function ensureTaskAssembly(client: Client, taskId: string) {
  const existing = await findAssemblyForTask(client, taskId);
  if (existing) return existing.id;
  const created = await createAssemblyFromComparisonTask(client, taskId, {
    name: `AI 辅助对比矩阵`,
    layoutType: 'image_matrix',
    comparisonIntent: 'AI Agent assisted comparison matrix',
  });
  return created.id;
}

async function ensureComparisonObjects(client: Client, assemblyId: string, taskId: string, value: unknown) {
  if (!Array.isArray(value)) return [];
  const created: Row[] = [];
  for (const item of value.slice(0, 12)) {
    const row = item && typeof item === 'object' ? item as Row : {};
    const name = optionalString(row.name || row.object_name);
    if (!name) continue;
    const { data: existing } = await client
      .from('comparison_objects')
      .select('*')
      .eq('assembly_id', assemblyId)
      .eq('object_name', name)
      .maybeSingle();
    if (existing) continue;
    const { data, error } = await client
      .from('comparison_objects')
      .insert({
        assembly_id: assemblyId,
        task_id: taskId,
        object_name: name,
        object_type: optionalString(row.type || row.object_type) || 'product_model',
        comparison_factor: optionalString(row.comparison_factor),
        model: optionalString(row.model),
        brand: optionalString(row.brand),
        specification: optionalString(row.specification),
        custom_fields: {},
      })
      .select()
      .single();
    if (error) throw new Error(error.message || `创建对比对象失败：${name}`);
    created.push(data as Row);
  }
  return created;
}

async function ensureComparisonSections(client: Client, assemblyId: string, value: unknown) {
  if (!Array.isArray(value)) return [];
  const created: Row[] = [];
  for (const item of value.slice(0, 12)) {
    const section = item && typeof item === 'object' ? item as Row : {};
    const sectionLabel = optionalString(section.label || section.node_label);
    if (!sectionLabel) continue;
    const parent = await ensureComparisonNode(client, assemblyId, sectionLabel, 'section', null);
    if (parent.created) created.push(parent.node);

    const items = Array.isArray(section.items) ? section.items : [];
    for (const child of items.slice(0, 30)) {
      const label = typeof child === 'string'
        ? child
        : optionalString((child as Row | null)?.label || (child as Row | null)?.node_label);
      if (!label) continue;
      const node = await ensureComparisonNode(client, assemblyId, label, 'item', String(parent.node.id));
      if (node.created) created.push(node.node);
    }
  }
  return created;
}

async function ensureComparisonNode(
  client: Client,
  assemblyId: string,
  label: string,
  nodeType: 'section' | 'item' | 'summary',
  parentId: string | null,
) {
  let query = client
    .from('comparison_item_nodes')
    .select('*')
    .eq('assembly_id', assemblyId)
    .eq('node_label', label)
    .eq('node_type', nodeType);
  if (parentId) query = query.eq('parent_id', parentId);
  const { data: existing } = await query.maybeSingle();
  if (existing) return { node: existing as Row, created: false };

  const { data: latest } = await client
    .from('comparison_item_nodes')
    .select('sort_order')
    .eq('assembly_id', assemblyId)
    .order('sort_order', { ascending: false })
    .maybeSingle();
  const { data, error } = await client
    .from('comparison_item_nodes')
    .insert({
      assembly_id: assemblyId,
      parent_id: parentId,
      node_type: nodeType,
      node_label: label,
      shared_recipe: {},
      config: {},
      sort_order: Number(latest?.sort_order || 0) + 1,
      depth: parentId ? 1 : 0,
      is_collapsed: false,
    })
    .select()
    .single();
  if (error) throw new Error(error.message || `创建对比项目失败：${label}`);
  return { node: data as Row, created: true };
}

async function completeMissingCells(client: Client, assemblyId: string) {
  const [objectsResult, nodesResult, cellsResult] = await Promise.all([
    client.from('comparison_objects').select('*').eq('assembly_id', assemblyId),
    client.from('comparison_item_nodes').select('*').eq('assembly_id', assemblyId),
    client.from('comparison_matrix_cells').select('*').eq('assembly_id', assemblyId),
  ]);
  const objects = asRows(objectsResult.data);
  const nodes = asRows(nodesResult.data).filter((node) => MATRIX_CELL_NODE_TYPES.has(String(node.node_type || 'item')));
  const existing = new Set(asRows(cellsResult.data).map((cell) => `${cell.item_node_id}::${cell.object_id}`));
  const missing: Row[] = [];
  for (const node of nodes) {
    for (const object of objects) {
      const key = `${node.id}::${object.id}`;
      if (existing.has(key)) continue;
      missing.push({
        assembly_id: assemblyId,
        item_node_id: node.id,
        object_id: object.id,
        params: {},
        process_notes: [],
        problem_points: [],
        metric_values: {},
        media_display_config: {},
      });
    }
  }
  if (missing.length > 0) {
    const { error } = await client.from('comparison_matrix_cells').insert(missing);
    if (error) throw new Error(error.message || '补齐矩阵单元格失败');
  }
}

async function upsertComparisonCellByLabels(client: Client, assemblyId: string, payload: Row) {
  const objectName = requiredString(payload.object_name, '缺少对比对象名称');
  const itemLabel = requiredString(payload.item_label, '缺少对比项目名称');
  const { data: object } = await client
    .from('comparison_objects')
    .select('*')
    .eq('assembly_id', assemblyId)
    .eq('object_name', objectName)
    .maybeSingle();
  const { data: node } = await client
    .from('comparison_item_nodes')
    .select('*')
    .eq('assembly_id', assemblyId)
    .eq('node_label', itemLabel)
    .maybeSingle();
  if (!object || !node) throw new Error(`矩阵对象或项目不存在：${objectName} / ${itemLabel}`);

  await completeMissingCells(client, assemblyId);
  const { data: cell } = await client
    .from('comparison_matrix_cells')
    .select('*')
    .eq('assembly_id', assemblyId)
    .eq('object_id', object.id)
    .eq('item_node_id', node.id)
    .maybeSingle();
  if (!cell) return null;

  const update: Row = { updated_at: new Date().toISOString() };
  if (payload.effect_summary !== undefined) update.effect_summary = optionalString(payload.effect_summary);
  if (payload.process_notes !== undefined) update.process_notes = normalizeStringList(payload.process_notes);
  if (payload.problem_points !== undefined) update.problem_points = normalizeStringList(payload.problem_points);
  if (payload.manual_score !== undefined) update.manual_score = normalizeScore(payload.manual_score);
  if (payload.conclusion_tag !== undefined) update.conclusion_tag = optionalString(payload.conclusion_tag);
  if (Object.keys(update).length === 1) throw new Error('没有可更新的矩阵单元格字段');

  const { data, error } = await client
    .from('comparison_matrix_cells')
    .update(update)
    .eq('id', cell.id)
    .select()
    .single();
  if (error) throw new Error(error.message || '更新矩阵单元格失败');
  return data as Row;
}

function asRows(value: unknown): Row[] {
  return Array.isArray(value) ? value as Row[] : [];
}

function successResult(action: AgentAction, message: string, data?: unknown): AgentActionResult {
  return { id: action.id, type: action.type, status: 'applied', message, data };
}

function requiredString(value: unknown, message: string) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) throw new Error(message);
  return text;
}

function optionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function normalizeStringList(value: unknown) {
  if (Array.isArray(value)) return value.map((item) => String(item || '').trim()).filter(Boolean).slice(0, 100);
  if (typeof value === 'string') return value.split('\n').map((line) => line.trim()).filter(Boolean).slice(0, 100);
  return [];
}

function normalizeScore(value: unknown) {
  if (value === null || value === undefined || value === '') return null;
  const score = Number(String(value).trim());
  if (!Number.isFinite(score) || score < 0 || score > 10) throw new Error('评分必须是 0-10 的数字');
  return String(score);
}
