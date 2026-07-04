export const AGENT_ACTION_TYPES = [
  'recipe_step_create',
  'recipe_step_update',
  'recipe_step_delete',
  'comparison_matrix_seed',
  'comparison_cell_update',
  'material_ai_result_update',
  'material_rename',
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

export const AGENT_ACTION_LABELS: Record<AgentActionType, string> = {
  recipe_step_create: '新增食谱步骤',
  recipe_step_update: '修改食谱步骤',
  recipe_step_delete: '删除食谱步骤',
  comparison_matrix_seed: '填充对比矩阵',
  comparison_cell_update: '更新矩阵单元格',
  material_ai_result_update: '整理素材内容',
  material_rename: '重命名素材',
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

function normalizeRisk(value: unknown, fallback: AgentActionRisk): AgentActionRisk {
  return value === 'low' || value === 'medium' || value === 'high' ? value : fallback;
}

function fallbackRisk(type: AgentActionType): AgentActionRisk {
  if (type === 'recipe_step_delete') return 'high';
  if (type === 'recipe_step_update' || type === 'comparison_cell_update' || type === 'material_rename') return 'medium';
  return 'low';
}

export function normalizeAgentActions(input: unknown): AgentAction[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((item, index): AgentAction | null => {
      const row = asRecord(item);
      const type = String(row.type || '');
      if (!ACTION_TYPE_SET.has(type)) return null;
      const actionType = type as AgentActionType;
      const title = String(row.title || AGENT_ACTION_LABELS[actionType]).trim();
      const action: AgentAction = {
        id: String(row.id || `${actionType}_${index + 1}`),
        type: actionType,
        title: title || AGENT_ACTION_LABELS[actionType],
        risk: normalizeRisk(row.risk, fallbackRisk(actionType)),
        payload: asRecord(row.payload),
      };
      if (row.description) action.description = String(row.description).slice(0, 500);
      return action;
    })
    .filter((item): item is AgentAction => Boolean(item))
    .slice(0, 20);
}

export function summarizeAgentAction(action: AgentAction): string {
  const payload = action.payload;
  switch (action.type) {
    case 'recipe_step_create':
      return String(payload.operation || payload.recipe_name || action.description || '');
    case 'recipe_step_update':
      return String(payload.operation || payload.step_id || action.description || '');
    case 'recipe_step_delete':
      return String(payload.step_label || payload.step_id || action.description || '');
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
      return String(payload.file_name || payload.material_id || action.description || '');
  }
}
