export const AGENT_SKILL_KEYS = [
  'senses_standard_preset',
  'recipe_scene_preset',
  'effect_evaluation',
  'report_summary',
] as const;

export type AgentSkillKey = typeof AGENT_SKILL_KEYS[number];

export interface DefaultSkillDefinition {
  skillKey: AgentSkillKey;
  name: string;
  description: string;
  systemPrompt: string;
  userPromptTemplate: string;
  outputSchema: Record<string, unknown>;
}

export interface NormalizedStandardSuggestion {
  standardItemId: string;
  standardCategory?: string;
  reason: string;
  focus: string;
}

export interface NormalizedRecipeSuggestion {
  name: string;
  recipeType: string;
  ingredients: string;
  reason: string;
  steps: Array<{ operation: string }>;
}

export interface NormalizedPresetSuggestions {
  standards: NormalizedStandardSuggestion[];
  recipes: NormalizedRecipeSuggestion[];
}

export function getDefaultSkillDefinitions(): DefaultSkillDefinition[] {
  return [
    {
      skillKey: 'senses_standard_preset',
      name: '五感体验标准预设',
      description: '根据体验目的推荐重点检查标准。',
      systemPrompt: '你是产品体验标准专家。请根据任务目的筛选重点检查项，必须输出 JSON。',
      userPromptTemplate: '请根据任务信息推荐重点五感检查项：{{task_snapshot}}',
      outputSchema: {
        standards: [{ standard_item_id: 'string', standard_category: 'string', reason: 'string', focus: 'string' }],
      },
    },
    {
      skillKey: 'recipe_scene_preset',
      name: '食谱/功能/场景筛选',
      description: '根据体验目的推荐食谱、功能或使用场景。',
      systemPrompt: '你是产品体验场景规划专家。请根据品类、产品和体验目的推荐功能场景，必须输出 JSON。',
      userPromptTemplate: '请根据任务信息、食谱库和热点摘要推荐功能场景：{{task_snapshot}}',
      outputSchema: {
        recipes: [{ name: 'string', recipe_type: 'string', ingredients: 'string', reason: 'string', steps: [{ operation: 'string' }] }],
      },
    },
    {
      skillKey: 'effect_evaluation',
      name: '效果评价',
      description: '根据效果描述和素材生成综合评分与总结。',
      systemPrompt: '你是资深美食评委和小家电产品体验专家。请基于内部四维方法论输出综合评分和总结，必须输出 JSON。',
      userPromptTemplate: '请评价该食谱/功能效果：{{recipe_snapshot}}',
      outputSchema: { score: 8.5, summary: 'string' },
    },
    {
      skillKey: 'report_summary',
      name: '报告总体总结',
      description: '根据任务事实和历史报告生成报告总评。',
      systemPrompt: '你是资深产品体验负责人。请基于事实证据生成体验报告总评，必须输出 JSON。',
      userPromptTemplate: '请总结该体验任务：{{report_snapshot}}',
      outputSchema: {
        tag: 'string',
        satisfaction_score: 8,
        summary: 'string',
        strengths: ['string'],
        risks: ['string'],
        historical_position: 'string',
        suggestions: ['string'],
      },
    },
  ];
}

export function renderPromptTemplate(template: string, values: Record<string, unknown>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => String(values[key] ?? ''));
}

export function normalizePresetSuggestions(input: unknown): NormalizedPresetSuggestions {
  const value = input && typeof input === 'object' ? input as Record<string, unknown> : {};
  const standardsRaw = Array.isArray(value.standards) ? value.standards : [];
  const recipesRaw = Array.isArray(value.recipes) ? value.recipes : [];

  return {
    standards: standardsRaw
      .map((item) => {
        const row = item && typeof item === 'object' ? item as Record<string, unknown> : {};
        return {
          standardItemId: String(row.standard_item_id || row.standardItemId || ''),
          standardCategory: row.standard_category ? String(row.standard_category) : undefined,
          reason: String(row.reason || ''),
          focus: String(row.focus || ''),
        };
      })
      .filter((item) => item.standardItemId),
    recipes: recipesRaw
      .map((item) => {
        const row = item && typeof item === 'object' ? item as Record<string, unknown> : {};
        const stepsRaw = Array.isArray(row.steps) ? row.steps : [];
        return {
          name: String(row.name || ''),
          recipeType: String(row.recipe_type || row.recipeType || '食谱'),
          ingredients: String(row.ingredients || ''),
          reason: String(row.reason || ''),
          steps: stepsRaw
            .map((step) => {
              const stepRow = step && typeof step === 'object' ? step as Record<string, unknown> : {};
              return { operation: String(stepRow.operation || '') };
            })
            .filter((step) => step.operation),
        };
      })
      .filter((item) => item.name),
  };
}
