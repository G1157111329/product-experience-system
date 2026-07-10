export type TaskEditExecution = 'direct' | 'confirm' | 'blocked';

const DIRECT_ACTIONS = new Set([
  'task_create',
  'recipe_create',
  'recipe_step_create',
  'recipe_step_update',
  'comparison_matrix_seed',
  'comparison_cell_update',
  'material_ai_result_update',
  'material_rename',
  'material_bind',
  'issue_create',
  'issue_update',
  'record_update',
  'standard_item_create',
  'data_matrix_cell_update',
]);

const CONFIRM_ACTION_PARTS = /(^|_)(delete|remove|destroy|setting|settings|config|configuration|admin|permission|role|freeze|publish|share|export)(_|$)/i;

export function classifyTaskEditAction(actionType: string): TaskEditExecution {
  const normalized = actionType.trim();
  if (!normalized) return 'blocked';
  if (CONFIRM_ACTION_PARTS.test(normalized)) return 'confirm';
  return DIRECT_ACTIONS.has(normalized) ? 'direct' : 'blocked';
}

export function requiresTaskEditConfirmation(actionType: string): boolean {
  return classifyTaskEditAction(actionType) === 'confirm';
}
