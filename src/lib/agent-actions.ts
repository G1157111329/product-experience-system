export const AGENT_ACTION_TYPES = [
  'record_create',
  'recipe_create',
  'recipe_update',
  'recipe_step_create',
  'recipe_step_update',
  'comparison_matrix_seed',
  'comparison_cell_update',
  'material_ai_result_update',
  'material_rename',
  'material_bind',
  'material_organize',
  'comparison_cell_material_bind',
  'data_matrix_cell_material_bind',
  'issue_create',
  'issue_update',
  'record_update',
  'task_create',
  'standard_item_create',
  'data_matrix_cell_update',
  'data_matrix_create',
  'data_matrix_category_create',
  'comparison_object_create',
  'comparison_category_create',
] as const;

export type AgentActionType = typeof AGENT_ACTION_TYPES[number];
export type AgentActionRisk = 'low' | 'medium' | 'high';
export type AgentActionStatus = 'pending' | 'applied' | 'failed' | 'skipped';

export interface AgentAction {
  id: string;
  type: AgentActionType;
  title: string;
  description?: string;
  risk: AgentActionRisk;
  idempotencyKey: string;
  payload: Record<string, unknown>;
}

export interface AgentActionResult {
  id: string;
  type: AgentActionType;
  status: AgentActionStatus;
  message: string;
  data?: unknown;
}

const ACTION_TYPE_SET = new Set<string>(AGENT_ACTION_TYPES);
const ACTION_ENVELOPE_FIELDS = new Set([
  'id', 'type', 'action', 'title', 'description', 'risk', 'idempotency_key', 'idempotencyKey',
  'payload', 'params', 'arguments',
]);

export const AGENT_ACTION_LABELS: Record<AgentActionType, string> = {
  recipe_create: '新建食谱',
  recipe_step_create: '新增食谱步骤',
  recipe_step_update: '修改食谱步骤',
  comparison_matrix_seed: '填充对比矩阵',
  comparison_cell_update: '更新矩阵单元格',
  material_ai_result_update: '整理素材内容',
  material_rename: '重命名素材',
  material_bind: '绑定素材',
  material_organize: '整理素材入库',
  comparison_cell_material_bind: '绑定对比矩阵单元格素材',
  data_matrix_cell_material_bind: '绑定数据矩阵单元格素材',
  issue_create: '新增问题点',
  issue_update: '修改问题点',
  record_update: '修改五感体验记录',
  record_create: '新增五感体验记录',
  recipe_update: '修改食谱/功能',
  task_create: '新建体验计划',
  standard_item_create: '新增标准条目',
  data_matrix_cell_update: '编辑数据矩阵单元格',
  data_matrix_create: '新建数据矩阵',
  data_matrix_category_create: '新增数据矩阵分类',
  comparison_object_create: '新增对比对象',
  comparison_category_create: '新增对比分类',
};

export const AGENT_ACTION_RISK_LABELS: Record<AgentActionRisk, string> = {
  low: '低风险',
  medium: '需确认',
  high: '高风险',
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function actionPayloadFromRow(row: Record<string, unknown>): Record<string, unknown> {
  const nested = row.payload ?? row.params ?? row.arguments;
  if (nested && typeof nested === 'object' && !Array.isArray(nested)) return asRecord(nested);
  return Object.fromEntries(Object.entries(row).filter(([key]) => !ACTION_ENVELOPE_FIELDS.has(key)));
}

function normalizeRisk(value: unknown, fallback: AgentActionRisk): AgentActionRisk {
  return value === 'low' || value === 'medium' || value === 'high' ? value : fallback;
}

function fallbackRisk(type: AgentActionType): AgentActionRisk {
  if (
    type.endsWith('_update')
    || type === 'comparison_cell_update'
    || type === 'material_rename'
    || type === 'material_bind'
    || type === 'material_organize'
    || type === 'comparison_cell_material_bind'
    || type === 'data_matrix_cell_material_bind'
  ) return 'medium';
  return 'low';
}

export function normalizeAgentActions(input: unknown): AgentAction[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((item, index): AgentAction | null => {
      const row = asRecord(item);
      const type = String(row.action || row.type || '');
      if (!ACTION_TYPE_SET.has(type)) return null;
      const actionType = type as AgentActionType;
      const title = String(row.title || AGENT_ACTION_LABELS[actionType]).trim();
      const action: AgentAction = {
        id: String(row.id || `${actionType}_${index + 1}`),
        type: actionType,
        title: title || AGENT_ACTION_LABELS[actionType],
        risk: normalizeRisk(row.risk, fallbackRisk(actionType)),
        idempotencyKey: String(row.idempotency_key || row.id || `${actionType}_${index + 1}`),
        payload: normalizeActionPayload(actionType, actionPayloadFromRow(row)),
      };
      if (!hasExecutablePlanPayload(action.type, action.payload)) return null;
      if (row.description) action.description = String(row.description).slice(0, 500);
      return action;
    })
    .filter((item): item is AgentAction => Boolean(item))
    .slice(0, 20);
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function hasUsableText(value: unknown): boolean {
  if (typeof value !== 'string' || !value.trim()) return false;
  return !/(请(?:补充|填写|选择)|待(?:补充|填写)|\uff08[^）]*\uff09|\([^)]*\))/.test(value);
}

function hasUuid(value: unknown): boolean {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

/**
 * Plans are untrusted model output. Keep incomplete suggestions visible in the
 * reply text, but never place placeholders or malformed material bindings in
 * the user-confirmable action queue.
 */
function hasExecutablePlanPayload(type: AgentActionType, payload: Record<string, unknown>): boolean {
  if (type === 'record_create') return hasUsableText(payload.check_item);
  if (type === 'recipe_create') return hasUsableText(payload.name);
  if (type === 'data_matrix_create') return hasUsableText(payload.name);
  if (type === 'data_matrix_category_create') {
    const level = Number(payload.level);
    return hasUuid(payload.matrix_id)
      && hasUsableText(payload.label)
      && (level === 1 || (level === 2 && hasUuid(payload.parent_id)));
  }
  if (type === 'comparison_object_create') return hasUsableText(payload.object_name || payload.name);
  if (type === 'comparison_category_create') {
    return hasUsableText(payload.label || payload.node_label)
      && (payload.node_type !== 'item' || hasUuid(payload.parent_id));
  }
  if (type === 'material_organize') {
    return hasUuid(payload.material_id);
  }
  if (type === 'comparison_cell_material_bind') {
    return hasUuid(payload.material_id) && hasUuid(payload.comparison_cell_id);
  }
  if (type === 'data_matrix_cell_material_bind') {
    return hasUuid(payload.material_id)
      && hasUuid(payload.matrix_id)
      && hasUuid(payload.leaf_row_id)
      && hasUuid(payload.column_id);
  }
  return true;
}

function normalizeActionPayload(type: AgentActionType, payload: Record<string, unknown>): Record<string, unknown> {
  const normalized = { ...payload };
  const copyAlias = (target: string, ...aliases: string[]) => {
    if (normalized[target] !== undefined) return;
    const value = aliases.map((key) => normalized[key]).find((item) => item !== undefined);
    if (value !== undefined) normalized[target] = value;
  };

  if (type === 'record_create' || type === 'record_update') {
    copyAlias('check_item', '检查项');
    copyAlias('check_standard', '标准', '检查标准');
    copyAlias('actual_result', '结果', '检查结果');
    copyAlias('evaluation_result', '评价结果', '状态');
  }
  if (type === 'recipe_create' || type === 'recipe_update') {
    copyAlias('name', '名称', '食谱名称', '功能名称');
    copyAlias('recipe_type', '食谱类型', '类型', 'type');
    copyAlias('description', '效果描述', '食材/参数', '食材', 'effect');
    copyAlias('ingredients', 'ingredients', 'parameters');
    copyAlias('effect_description', 'effect_description', 'effect');
  }
  if (type === 'data_matrix_create') {
    copyAlias('name', 'matrix_name');
    copyAlias('description', 'matrix_description');
  }
  if (type === 'data_matrix_category_create') {
    copyAlias('matrix_id', 'matrixId');
    copyAlias('parent_id', 'parentId');
    copyAlias('label', 'node_label', 'name');
  }
  if (type === 'comparison_object_create') {
    copyAlias('object_name', 'name');
    copyAlias('object_type', 'type');
  }
  if (type === 'comparison_category_create') {
    copyAlias('label', 'node_label', 'name');
    copyAlias('parent_id', 'parentId');
    copyAlias('node_type', 'type');
  }
  if (type === 'data_matrix_cell_update') {
    copyAlias('matrix_id', 'matrixId');
    copyAlias('leaf_row_id', 'leafRowId');
    copyAlias('column_id', 'columnId');
    copyAlias('value_text', 'value');
  }
  if (type === 'material_rename' || type === 'material_organize') {
    copyAlias('naming_mode', '命名方式', 'rename_mode');
    if (normalized.auto_name === true || normalized.context_name === true) normalized.naming_mode = 'context';
    if (type === 'material_organize' && normalized.naming_mode === undefined) normalized.naming_mode = 'context';
    copyAlias('material_id', 'materialId');
    if (normalized.material_id === undefined && Array.isArray(normalized.material_ids)) {
      const firstId = normalized.material_ids.find((item) => typeof item === 'string' && UUID_PATTERN.test(item));
      if (typeof firstId === 'string') normalized.material_id = firstId;
    }
    const bindTarget = asRecord(normalized.bind_target ?? normalized.bindTarget);
    const bindTargetType = String(bindTarget.target_type || bindTarget.targetType || '');
    const bindTargetId = bindTarget.target_id ?? bindTarget.targetId;
    if (normalized.record_id === undefined && (hasUuid(bindTarget.record_id) || (bindTargetType === 'record' && hasUuid(bindTargetId)))) {
      normalized.record_id = bindTarget.record_id ?? bindTargetId;
    }
    if (normalized.recipe_id === undefined && (hasUuid(bindTarget.recipe_id) || (bindTargetType === 'recipe' && hasUuid(bindTargetId)))) {
      normalized.recipe_id = bindTarget.recipe_id ?? bindTargetId;
    }
    if (normalized.recipe_step_id === undefined && (hasUuid(bindTarget.recipe_step_id) || (bindTargetType === 'recipe_step' && hasUuid(bindTargetId)))) {
      normalized.recipe_step_id = bindTarget.recipe_step_id ?? bindTargetId;
    }
    if (normalized.issue_id === undefined && (hasUuid(bindTarget.issue_id) || (bindTargetType === 'issue' && hasUuid(bindTargetId)))) {
      normalized.issue_id = bindTarget.issue_id ?? bindTargetId;
    }
    if (normalized.comparison_cell_id === undefined && (hasUuid(bindTarget.comparison_cell_id) || (bindTargetType === 'comparison_cell' && hasUuid(bindTargetId)))) {
      normalized.comparison_cell_id = bindTarget.comparison_cell_id ?? bindTargetId;
    }
    copyAlias('record_id', 'recordId');
    copyAlias('recipe_id', 'recipeId');
    copyAlias('recipe_step_id', 'recipeStepId');
    copyAlias('issue_id', 'issueId');
    copyAlias('comparison_cell_id', 'comparisonCellId');
  }
  return normalized;
}

export function summarizeAgentAction(action: AgentAction): string {
  const payload = action.payload;
  switch (action.type) {
    case 'recipe_create':
      return String(payload.name || action.description || '');
    case 'recipe_step_create':
      return String(payload.operation || payload.recipe_name || action.description || '');
    case 'recipe_step_update':
      return String(payload.operation || payload.step_id || action.description || '');
    case 'comparison_matrix_seed': {
      const objects = Array.isArray(payload.objects) ? payload.objects.length : 0;
      const sections = Array.isArray(payload.sections) ? payload.sections.length : 0;
      return `${objects} 个对象，${sections} 组对比项`;
    }
    case 'comparison_cell_update':
      return [payload.object_name, payload.item_label].filter(Boolean).join(' / ');
    case 'material_ai_result_update':
      return String(payload.summary || payload.material_id || action.description || '');
    case 'material_rename':
      return payload.naming_mode === 'context'
        ? `按所属场景命名：${String(payload.material_id || '')}`
        : String(payload.file_name || payload.material_id || action.description || '');
    case 'material_bind':
      return String(payload.material_id || action.description || '');
    case 'material_organize':
      return payload.naming_mode === 'context'
        ? `整理并按场景命名：${String(payload.material_id || '')}`
        : String(payload.material_id || action.description || '');
    case 'comparison_cell_material_bind':
      return [payload.material_id, payload.comparison_cell_id].filter(Boolean).join(' / ');
    case 'data_matrix_cell_material_bind':
      return [payload.material_id, payload.leaf_row_id, payload.column_id].filter(Boolean).join(' / ');
    case 'issue_create':
    case 'issue_update':
      return String(payload.title || payload.issue_id || action.description || '');
    case 'record_update':
    case 'record_create':
      return String(payload.check_item || payload.record_id || action.description || '');
    case 'recipe_update':
      return String(payload.name || payload.recipe_id || action.description || '');
    case 'task_create':
      return String(payload.task_name || action.description || '');
    case 'standard_item_create':
      return String(payload.check_item || payload.standard_id || action.description || '');
    case 'data_matrix_cell_update':
      return String(payload.display_text || payload.value_text || payload.leaf_row_id || action.description || '');
    case 'data_matrix_create':
      return String(payload.name || action.description || '');
    case 'data_matrix_category_create':
    case 'comparison_category_create':
      return String(payload.label || action.description || '');
    case 'comparison_object_create':
      return String(payload.object_name || action.description || '');
  }
}
