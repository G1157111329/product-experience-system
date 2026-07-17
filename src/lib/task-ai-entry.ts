export const TASK_AI_ENTRY_OPTIONS = [
  {
    id: 'senses',
    label: 'AI五感体验',
    description: '生成当前任务的重点五感检查草案',
  },
  {
    id: 'recipes',
    label: '食谱功能AI探索',
    description: '生成可执行的食谱或功能探索草案',
  },
] as const;

export type TaskAiEntryId = (typeof TASK_AI_ENTRY_OPTIONS)[number]['id'];

const ENTRY_PROMPTS: Record<TaskAiEntryId, string> = {
  senses: '请基于当前任务生成 AI五感体验 探索草案：给出重点检查项、检验要求及范围、检查标准或非标准描述，并说明推荐理由。请先以待确认的操作清单呈现，不要直接写入任务。',
  recipes: '请基于当前任务生成 食谱功能AI探索 草案：给出建议的食谱/功能名称、食材或参数、推荐原因及步骤。请先以待确认的操作清单呈现，不要直接写入任务。',
};

/** Returns a user-editable draft only; sending always remains a user action. */
export function getTaskAiEntryPrompt(entry: TaskAiEntryId): string {
  return ENTRY_PROMPTS[entry];
}
