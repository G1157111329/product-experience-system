export const AGENT_SKILL_KEYS = [
  'senses_standard_preset',
  'recipe_scene_preset',
  'effect_evaluation',
  'report_summary',
  'report_product_compare',
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
      systemPrompt: `你是产品体验标准专家。根据品类、产品名称和体验目的，从五感维度推荐重点检查项。

要求：
1. 每个推荐必须包含检查项ID（如数据库中有的话）、标准分类、推荐理由和重点关注。
2. 推荐理由应结合产品特性和五感体验维度。
3. 重点关注应说明此检查项对产品体验的关键影响。
4. 仅输出JSON，不要添加解释文字。`,
      userPromptTemplate: `请根据以下任务信息推荐重点五感检查项。

任务信息：
{{task_snapshot}}

JSON格式：
{
  "standards": [
    {
      "standard_item_id": "检查项ID（如有）",
      "standard_category": "标准分类：通用标准/品类标准/感官评价标准",
      "reason": "推荐理由",
      "focus": "重点关注"
    }
  ]
}`,
      outputSchema: {
        standards: [{ standard_item_id: 'string', standard_category: 'string', reason: 'string', focus: 'string' }],
      },
    },
    {
      skillKey: 'recipe_scene_preset',
      name: '食谱/功能/场景筛选',
      description: '根据体验目的推荐食谱、功能或使用场景。',
      systemPrompt: `你是产品体验场景规划专家。根据品类、产品名称、型号和体验目的，推荐可执行的功能/食谱场景草案。

要求：
1. 每个推荐必须包含具体的功能/食谱名称、类型（食谱/功能）、食材/参数、推荐理由和操作步骤。
2. 步骤应描述用户实际操作流程，每步一个操作动作。
3. 推荐理由应结合产品特性和用户体验场景。
4. 仅输出JSON，不要添加解释文字。`,
      userPromptTemplate: `请根据以下任务信息推荐功能/食谱场景草案。

任务信息：
{{task_snapshot}}

JSON格式：
{
  "recipes": [
    {
      "name": "功能/食谱名称",
      "recipe_type": "食谱或功能",
      "ingredients": "食材/参数",
      "reason": "推荐理由",
      "steps": [
        {"operation": "具体操作步骤1"},
        {"operation": "具体操作步骤2"}
      ]
    }
  ]
}`,
      outputSchema: {
        recipes: [{ name: 'string', recipe_type: 'string', ingredients: 'string', reason: 'string', steps: [{ operation: 'string' }] }],
      },
    },
    {
      skillKey: 'effect_evaluation',
      name: '效果评价',
      description: '根据效果描述和素材生成综合评分与总结。',
      systemPrompt: `你是资深美食评委和小家电产品体验专家。请基于四维评价体系（质感/透彻/纯净/恒定）对食谱/功能效果进行综合评价。

要求：
1. 综合评分范围0-10分，取一位小数。
2. 总结评语应描述实际效果表现，2-4句话。
3. 内部四维评价仅作为方法论参考，对外只输出综合评分和总结。
4. 仅输出JSON，不要添加解释文字。`,
      userPromptTemplate: `请评价该食谱/功能效果：

{{recipe_snapshot}}

JSON格式：
{
  "score": 8.5,
  "summary": "2-4句话的综合评价"
}`,
      outputSchema: { score: 8.5, summary: 'string' },
    },
    {
      skillKey: 'report_summary',
      name: '报告总体总结',
      description: '根据任务事实和历史报告生成报告总评。',
      systemPrompt: `你是资深产品体验负责人。请基于检查记录、问题清单和功能效果等事实证据，生成体验报告总评。

要求：
1. 评分范围0-10分，取整数。
2. 总结需基于事实证据，2-4句话概括整体体验。
3. 优势、风险、建议各2-5条，必须描述产品体验本身。
4. 历史定位说明当前产品与同类或前代的体验差异。
5. 仅输出JSON，不要添加解释文字。`,
      userPromptTemplate: `请总结该体验任务：

{{report_snapshot}}

JSON格式：
{
  "tag": "一句话标签（如：体验良好/需重点整改）",
  "satisfaction_score": 8,
  "summary": "2-4句话整体体验总结",
  "strengths": ["体验优势1", "体验优势2"],
  "risks": ["体验风险1", "体验风险2"],
  "historical_position": "与同类或前代产品的体验对比",
  "suggestions": ["优化建议1", "优化建议2"]
}`,
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
    {
      skillKey: 'report_product_compare',
      name: '产品体验对比',
      description: '基于两份体验报告对比两款产品的满意度、优劣势、关键差异和优化建议。',
      systemPrompt: `你是产品体验对比分析专家。用户选择两份体验报告，是为了比较两款产品的体验表现差异，而不是评价报告写得好不好。请把A/B报告视为两款产品的体验证据来源，输出产品优劣势对比。

要求：
1. 以产品体验满意度为核心，分别给A/B产品0-10分。
2. 输出VS总结形式，指出哪款产品体验表现更优或是否接近。
3. 对比维度包括五感体验、功能效果、问题数量与严重度、用户使用流程、产品短板和整改风险。
4. 优势、差异、风险必须描述产品体验本身，避免使用"报告更完整/信息更完整/报告质量"等报告评价口径。
5. 如果某份报告数据较少，只能说明"该产品当前证据不足"，不要把报告不完整当成产品优势或劣势。
6. 仅输出JSON，不要添加解释文字。`,
      userPromptTemplate: `请基于以下两份报告证据，生成产品体验对比结果。

报告A：
{{report_a}}

报告B：
{{report_b}}

JSON格式：
{
  "winner_report_id": "体验表现更优的产品对应报告id，接近则为null",
  "satisfaction_a": 0-10数字,
  "satisfaction_b": 0-10数字,
  "headline": "一句话产品体验VS结论",
  "summary": "2-4句话说明两款产品的体验表现差异",
  "report_a_advantages": ["A产品体验优势1", "A产品体验优势2"],
  "report_b_advantages": ["B产品体验优势1", "B产品体验优势2"],
  "key_differences": ["产品体验关键差异1", "产品体验关键差异2"],
  "risks": ["共同或主要体验风险1", "风险2"],
  "recommendation": "面向产品优化、验证或选型的下一步建议"
}`,
      outputSchema: {
        winner_report_id: 'string | null',
        satisfaction_a: 8,
        satisfaction_b: 7,
        headline: 'string',
        summary: 'string',
        report_a_advantages: ['string'],
        report_b_advantages: ['string'],
        key_differences: ['string'],
        risks: ['string'],
        recommendation: 'string',
      },
    },
  ];
}

/**
 * 根据 skill_key 获取默认的 user_prompt_template
 * 用户仅输入 system prompt，user prompt template 由系统自动生成
 */
export function getDefaultUserPromptTemplate(skillKey: string): string {
  const defaults = getDefaultSkillDefinitions();
  const found = defaults.find(d => d.skillKey === skillKey);
  return found?.userPromptTemplate || `请根据以下信息执行任务。

任务信息：
{{task_snapshot}}

仅输出JSON格式结果。`;
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
      .filter((item) => item.standardItemId || item.reason || item.focus),
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
