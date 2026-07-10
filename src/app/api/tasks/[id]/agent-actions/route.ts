import { NextRequest, NextResponse } from 'next/server';
import {
  normalizeAgentActions,
  type AgentAction,
  type AgentActionResult,
} from '@/lib/agent-actions';
import {
  canAccessTask,
  isAuthResponse,
  requireUser,
} from '@/lib/server/auth';
import { createAssemblyFromComparisonTask, findAssemblyForTask } from '@/lib/server/comparison-assembly';
import { writeSecurityAudit } from '@/lib/server/security-audit';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { isAgentActionAllowed } from '@/lib/agent-action-policy';
import { toStoredIssueStatus } from '@/lib/server/issue-state-machine';

type Row = Record<string, unknown>;
type Client = ReturnType<typeof getSupabaseClient>;

const MATRIX_CELL_NODE_TYPES = new Set(['item', 'condition', 'process_node', 'metric', 'issue_group']);

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: taskId } = await params;
  const client = getSupabaseClient();
  const user = await requireUser(request, client);
  if (isAuthResponse(user)) return user;
  if (!(await canAccessTask(client, user, taskId))) {
    return NextResponse.json({ code: 1, message: '无权执行该任务的 AI 动作' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const actions = normalizeAgentActions((body as Record<string, unknown>).actions);
  if (actions.length === 0) {
    return NextResponse.json({ code: 1, message: '没有可执行动作' }, { status: 400 });
  }

  const results: AgentActionResult[] = [];
  for (const action of actions) {
    try {
      if (!isAgentActionAllowed(action.type)) {
        throw new Error('AI助手不允许执行删除或设置类动作');
      }
      const result = await applyAction(client, taskId, action, user);
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
  await writeSecurityAudit(client, {
    request,
    actor: user,
    action: 'ai_agent.apply_actions',
    outcome: hasFailure ? 'failed' : 'success',
    targetType: 'experience_task',
    targetId: taskId,
    metadata: {
      action_count: actions.length,
      action_types: actions.map((action) => action.type),
      failed_count: results.filter((result) => result.status === 'failed').length,
    },
  });

  return NextResponse.json({
    code: hasFailure ? 1 : 0,
    message: hasFailure ? '部分 AI 动作执行失败' : 'AI 动作已执行',
    data: { results },
  }, { status: hasFailure ? 207 : 200 });
}

async function applyAction(
  client: Client,
  taskId: string,
  action: AgentAction,
  actor: { id: string; role: string },
): Promise<AgentActionResult> {
  switch (action.type) {
    case 'recipe_create':
      return applyRecipeCreate(client, taskId, action);
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
      return applyMaterialBind(client, taskId, action);
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
    description: optionalString(action.payload.description),
  }).select().single();
  if (error) throw new Error(error.message || '新建食谱失败');
  return successResult(action, '已新建食谱', data);
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
      problem_point: optionalString(action.payload.problem_point),
      problem_points: [],
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
  if (action.payload.problem_point !== undefined) update.problem_point = optionalString(action.payload.problem_point);
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

async function applyMaterialRename(client: Client, taskId: string, action: AgentAction): Promise<AgentActionResult> {
  const materialId = requiredString(action.payload.material_id, '缺少素材ID');
  await assertMaterialInTask(client, materialId, taskId);
  const fileName = requiredString(action.payload.file_name, '缺少新素材名称').slice(0, 180);

  const { data, error } = await client
    .from('materials')
    .update({ file_name: fileName })
    .eq('id', materialId)
    .select()
    .single();
  if (error) throw new Error(error.message || '重命名素材失败');
  return successResult(action, '已重命名素材', data);
}

async function applyMaterialBind(client: Client, taskId: string, action: AgentAction): Promise<AgentActionResult> {
  const materialId = requiredString(action.payload.material_id, '缺少素材ID');
  await assertMaterialInTask(client, materialId, taskId);
  const allowedTargets = ['record_id', 'recipe_id', 'recipe_step_id', 'issue_id'] as const;
  const update: Row = {};
  for (const key of allowedTargets) {
    if (action.payload[key] !== undefined) update[key] = optionalString(action.payload[key]);
  }
  if (Object.keys(update).length === 0) throw new Error('缺少素材绑定目标');
  if (typeof update.record_id === 'string') {
    const { data } = await client.from('check_records').select('id, task_id').eq('id', update.record_id).maybeSingle();
    if (!data || data.task_id !== taskId) throw new Error('体验记录不属于当前任务');
  }
  if (typeof update.recipe_id === 'string') await assertRecipeInTask(client, update.recipe_id, taskId);
  if (typeof update.recipe_step_id === 'string') await assertRecipeStepInTask(client, update.recipe_step_id, taskId);
  if (typeof update.issue_id === 'string') {
    const { data } = await client.from('issues').select('id, task_id').eq('id', update.issue_id).maybeSingle();
    if (!data || data.task_id !== taskId) throw new Error('问题不属于当前任务');
  }
  const { data, error } = await client.from('materials').update(update).eq('id', materialId).select().single();
  if (error) throw new Error(error.message || '绑定素材失败');
  return successResult(action, '已绑定素材', data);
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
