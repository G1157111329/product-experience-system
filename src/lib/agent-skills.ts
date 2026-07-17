export const AGENT_SKILL_KEYS = [
  'senses_standard_preset',
  'recipe_scene_preset',
  'effect_evaluation',
  'problem_detection',
  'report_summary',
  'report_product_compare',
  'task_action_plan',
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
      skillKey: 'task_action_plan',
      name: 'Hermes 任务录入与素材关联',
      description: '基于当前任务四类录入数据，生成需要用户确认的安全写入计划。',
      systemPrompt: `你是产品体验管理平台的 Hermes 任务协作技能。只输出 JSON：{"reply":"给用户的说明","actions":[...] }。
你只能基于提供的 ID 与数据提出操作，不能编造 ID，也不能提出删除、配置、权限、冻结、发布、导出操作。所有 actions 只是一份待用户确认的计划，绝不自动执行。
允许 actions：record_create、record_update、recipe_create、recipe_update、recipe_step_create、recipe_step_update、comparison_matrix_seed、comparison_object_create、comparison_category_create、comparison_cell_update、data_matrix_create、data_matrix_category_create、data_matrix_cell_update、material_rename、material_bind、comparison_cell_material_bind、data_matrix_cell_material_bind、issue_create、issue_update。
record_create 必须包含 check_item，可带 evaluation_result（合格/不合格/待定）和标准/结果字段；recipe_update 只可修改已有 recipe_id 的名称、食材/参数、效果描述和三态；data_matrix_create 必须包含 name；data_matrix_category_create 必须包含 matrix_id、label 和 level（1 或 2，二级还必须带 parent_id）；comparison_object_create 必须包含 object_name；comparison_category_create 必须包含 label，细项 node_type="item" 还必须带 parent_id；data_matrix_cell_update 必须带 matrix_id、leaf_row_id、column_id；material_bind 只能关联上下文中的素材到记录、食谱、步骤或问题；comparison_cell_material_bind 必须带 material_id 和 comparison_cell_id；data_matrix_cell_material_bind 必须带 material_id、matrix_id、leaf_row_id、column_id，且列必须是图片/素材列。素材整理或重命名时使用 material_rename，payload 必须含 material_id 与 naming_mode:"context"，不得自行填写 file_name；系统会按所属五感标准描述、食谱功能名称、对比矩阵对象*大类*细项或数据矩阵一级大类_二级细项自动命名并追加顺序号。若用户要求修改冻结报告，说明必须回到任务源数据编辑并重新生成报告，不产生报告写入 action。`,
      userPromptTemplate: `当前任务结构化上下文：
{{task_snapshot}}

会话：
{{conversation}}`,
      outputSchema: { reply: 'string', actions: [{ type: 'safe agent action', payload: 'object' }] },
    },
    {
      skillKey: 'senses_standard_preset',
      name: '五感体验标准预设',
      description: '根据体验目的推荐重点检查标准，必要时补充非标准检查项。',
      systemPrompt: `你是产品体验标准专家。根据品类、产品名称和体验目的，从五感维度推荐重点检查项。

要求：
1. 优先从候选标准库中选择高度匹配的检查项，并填写对应检查项ID。
2. 如果候选标准库没有覆盖你认为必要的体验风险，可以输出“非标准”建议，standard_item_id 必须留空，standard_category 填“非标准”。
3. 不要为了凑检查项ID而强行匹配弱相关或不相关标准。
4. 推荐理由应结合产品特性和五感体验维度。
5. 重点关注应说明此检查项对产品体验的关键影响。
6. 仅输出JSON，不要添加解释文字。`,
      userPromptTemplate: `请根据以下任务信息推荐重点五感检查项。

任务信息：
{{task_snapshot}}

JSON格式：
{
  "standards": [
    {
      "standard_item_id": "候选标准检查项ID；非标准建议留空",
      "standard_category": "标准分类：通用标准/品类标准/感官评价标准/非标准",
      "reason": "推荐理由",
      "focus": "重点关注"
    }
  ]
}`,
      outputSchema: {
        standards: [{ standard_item_id: 'string (empty when nonstandard)', standard_category: 'string', reason: 'string', focus: 'string' }],
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
      skillKey: 'problem_detection',
      name: '问题点识别',
      description: '从步骤描述和效果评价中识别负面情绪语言和期待差距，生成问题点列表。',
      systemPrompt: `你是一位专业产品评价官，擅长从用户体验角度识别产品问题。

你的任务分两层：

**第一层：负面情绪语言总结**
从步骤描述和效果评价中，识别用户表达中的负面情绪语言（如"不均匀"、"困难"、"无法"、"失败"等），如实总结这些负面表述。AI效果评价结果中评分较低的维度需重点关注。

**第二层：期待vs实际体验差距分析**
"问题"本质是期待结果和实际体验之间的差距。请你基于该食谱/功能在互联网中用户普遍表达的期待状态，对比步骤描述和效果评价中反映的实际体验，识别出期待与实际之间的差距。

要求：
1. 第一层问题排前面，第二层问题排后面
2. 问题描述简洁明确，一句话一个
3. 不要过度解读，仅基于明确的负面表述和合理的期待差距
4. 只输出JSON数组，不要添加其他文字`,
      userPromptTemplate: `请识别以下食谱/功能的问题点：

{{recipe_snapshot}}

JSON数组格式：
[
  {"text": "问题描述1"},
  {"text": "问题描述2"}
]`,
      outputSchema: { items: [{ text: 'string' }] },
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
