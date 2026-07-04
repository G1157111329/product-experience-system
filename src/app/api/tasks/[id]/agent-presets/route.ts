import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { extractJsonObject, invokeConfiguredAI } from '@/lib/server/ai';
import { ensureDefaultSkillTemplates, getActiveSkillVersion, logAgentAudit } from '@/lib/server/agent-skills';
import {
  AGENT_SKILL_KEYS,
  normalizePresetSuggestions,
  renderPromptTemplate,
  type AgentSkillKey,
  type NormalizedPresetSuggestions,
} from '@/lib/agent-skills';
import { canAccessTask, isAuthResponse, requireUser } from '@/lib/server/auth';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const client = getSupabaseClient();
  const user = await requireUser(request, client);
  if (isAuthResponse(user)) return user;
  if (!(await canAccessTask(client, user, id))) {
    return NextResponse.json({ code: 1, message: '无权运行该任务Agent' }, { status: 403 });
  }

  const body = await request.json();
  const skillKeys = normalizeSkillKeys(body.skill_keys);
  const actorUserId = user.id;

  await ensureDefaultSkillTemplates(client, actorUserId);

  const { data: task, error: taskError } = await client.from('experience_tasks').select('*').eq('id', id).single();
  if (taskError || !task) return NextResponse.json({ code: 1, message: '任务不存在' }, { status: 404 });

  const { data: allStandards } = await client
    .from('standards')
    .select('id, category, product_category, product');

  const eligibleStandardIds = new Set(
    (allStandards || [])
      .filter((standard: Record<string, unknown>) => isStandardEligibleForTask(standard, task))
      .map((standard: Record<string, unknown>) => String(standard.id))
  );
  const standardById = new Map(
    (allStandards || []).map((standard: Record<string, unknown>) => [String(standard.id), standard])
  );

  const { data: rawStandardItems } = eligibleStandardIds.size > 0
    ? await client
    .from('standard_items')
        .select('id, standard_id, sensory_dimension, test_phase, experience_flow, touch_point, check_dimension, sub_check_dimension, check_item, check_requirement, check_standard, experience_standard, check_tool, problem_level')
        .in('standard_id', Array.from(eligibleStandardIds))
        .limit(60)
    : { data: [] };
  const standardItems = (rawStandardItems || []).map((item: Record<string, unknown>) => ({
    ...item,
    standards: standardById.get(String(item.standard_id)) || null,
  }));

  const { data: recipeLibrary } = await client
    .from('recipe_library')
    .select('*, recipe_library_steps(*)')
    .limit(80);

  const intent = buildIntent(task);
  const merged: NormalizedPresetSuggestions = { standards: [], recipes: [] };
  const auditIds: string[] = [];
  const errors: string[] = [];

  for (const skillKey of skillKeys) {
    const active = await getActiveSkillVersion(client, skillKey);
    if (!active) {
      errors.push(`${skillKey}: 未找到启用的技能模板`);
      continue;
    }

    try {
      const taskSnapshot = buildTaskSnapshot(task, intent, standardItems || [], recipeLibrary || [], body.hotspot_summary || '', {
        includeStandards: skillKey === 'senses_standard_preset',
        includeRecipes: skillKey === 'recipe_scene_preset',
      });
      const userPrompt = renderPromptTemplate(String(active.version.user_prompt_template || ''), {
        task_snapshot: taskSnapshot,
        hotspot_summary: body.hotspot_summary || '',
      });
      const systemPrompt = appendRuntimePresetRules(skillKey, String(active.version.system_prompt || ''));
      const rawContent = await invokeConfiguredAI({
        client,
        defaultTemperature: 0.3,
        maxTokens: 2400,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      });

      const parsed = extractJsonObject<Record<string, unknown>>(rawContent, {});
      const normalized = normalizePresetSuggestions(parsed);
      merged.standards.push(...normalized.standards);
      merged.recipes.push(...normalized.recipes);

      await logAgentAudit(client, {
        skillKey,
        templateId: String(active.template.id),
        versionId: String(active.version.id),
        action: 'run',
        actorUserId,
        taskId: id,
        requestSnapshot: { task_id: id, task_name: task.task_name, skill_key: skillKey },
        responseSnapshot: {
          standard_count: normalized.standards.length,
          recipe_count: normalized.recipes.length,
        },
      });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Agent运行失败';
      errors.push(`${skillKey}: ${errMsg}`);
      await logAgentAudit(client, {
        skillKey,
        templateId: String(active.template.id),
        versionId: String(active.version.id),
        action: 'run',
        actorUserId,
        taskId: id,
        requestSnapshot: { task_id: id, skill_key: skillKey },
        status: 'failed',
        errorMessage: errMsg,
      });
    }
  }

  const hasResults = merged.standards.length > 0 || merged.recipes.length > 0;
  if (!hasResults && errors.length > 0) {
    return NextResponse.json({
      code: 1,
      message: `AI生成失败: ${errors.join('; ')}`,
      data: { intent, suggestions: dedupeSuggestions(merged), errors },
    }, { status: 500 });
  }
  if (!hasResults) {
    return NextResponse.json({
      code: 1,
      message: 'AI未返回可用体验方案，请重试或检查 Prompt 模板与任务基础信息。',
      data: { intent, suggestions: dedupeSuggestions(merged) },
    });
  }

  return NextResponse.json({
    code: 0,
    message: errors.length > 0 ? `部分AI生成失败: ${errors.join('; ')}` : 'AI体验方案已生成',
    data: {
      intent,
      suggestions: dedupeSuggestions(merged),
      audit_ids: auditIds,
      warnings: errors.length > 0 ? errors : undefined,
    },
  });
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const client = getSupabaseClient();
  const user = await requireUser(request, client);
  if (isAuthResponse(user)) return user;
  if (!(await canAccessTask(client, user, id))) {
    return NextResponse.json({ code: 1, message: '无权更新该任务Agent建议' }, { status: 403 });
  }

  const body = await request.json();
  const actorUserId = user.id;
  const action = body.action === 'reject_suggestion' ? 'reject_suggestion' : 'accept_suggestion';

  if (action === 'reject_suggestion') {
    await logAgentAudit(client, {
      skillKey: 'senses_standard_preset',
      action,
      actorUserId,
      taskId: id,
      requestSnapshot: { reason: body.reason || null },
    });
    return NextResponse.json({ code: 0, message: '已拒绝 Agent 建议', data: { records: [], recipes: [] } });
  }

  const createdRecords = await acceptStandardSuggestions(client, id, body.standards || []);
  const createdRecipes = await acceptRecipeSuggestions(client, id, body.recipes || []);

  await client
    .from('experience_tasks')
    .update({ status: '进行中', updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('status', '待执行');

  await logAgentAudit(client, {
    skillKey: 'senses_standard_preset',
    action,
    actorUserId,
    taskId: id,
    requestSnapshot: {
      standards: (body.standards || []).length,
      recipes: (body.recipes || []).length,
    },
    responseSnapshot: {
      records: createdRecords.length,
      recipes: createdRecipes.length,
    },
  });

  return NextResponse.json({
    code: 0,
    message: 'Agent建议已写入草稿',
    data: { records: createdRecords, recipes: createdRecipes },
  });
}

function normalizeSkillKeys(value: unknown): AgentSkillKey[] {
  const keys = Array.isArray(value) ? value : ['senses_standard_preset', 'recipe_scene_preset'];
  return keys.filter((key): key is AgentSkillKey => AGENT_SKILL_KEYS.includes(key as AgentSkillKey));
}

function buildIntent(task: Record<string, unknown>) {
  const purpose = String(task.test_purpose || '');
  return {
    intent_tags: [
      task.project_type ? String(task.project_type) : '体验走查',
      purpose.includes('竞品') ? '竞品研究' : '',
      purpose.includes('稳定') ? '稳定性验证' : '',
    ].filter(Boolean),
    risk_focus: extractKeywords(purpose, ['噪音', '清洁', '稳定', '口感', '操作', '安装', '安全', '效率']),
    scenario_keywords: extractKeywords(purpose, ['早餐', '多人', '快速', '老人', '儿童', '海外', '复测']),
    standard_search_keywords: extractKeywords(purpose, ['视觉', '听觉', '触觉', '嗅觉', '味觉', '清洁', '噪音']),
    recipe_search_keywords: extractKeywords(purpose, ['豆浆', '米糊', '果汁', '米饭', '火锅', '空气炸']),
  };
}

function extractKeywords(text: string, candidates: string[]) {
  return candidates.filter((keyword) => text.includes(keyword));
}

function isStandardEligibleForTask(standard: Record<string, unknown>, task: Record<string, unknown>) {
  const category = String(standard.category || '');
  if (category !== '品类标准') return true;

  const standardCategory = String(standard.product_category || '');
  const standardProduct = String(standard.product || '');
  const taskCategory = String(task.product_category || '');
  const taskProduct = String(task.product || '');

  if (standardCategory && standardCategory !== taskCategory) return false;
  if (standardProduct && standardProduct !== taskProduct) return false;
  return Boolean(standardCategory || standardProduct);
}

function promptText(value: unknown, maxLength = 120) {
  const text = String(value || '-').replace(/\s+/g, ' ').trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}...`;
}

function buildTaskSnapshot(
  task: Record<string, unknown>,
  intent: Record<string, unknown>,
  standardItems: Array<Record<string, unknown>>,
  recipeLibrary: Array<Record<string, unknown>>,
  hotspotSummary: string,
  options: { includeStandards?: boolean; includeRecipes?: boolean } = {},
) {
  const includeStandards = options.includeStandards !== false;
  const includeRecipes = options.includeRecipes !== false;
  const standards = includeStandards ? standardItems.slice(0, 40).map((item) => {
    const stdRef = item.standards as Record<string, unknown> | null;
    const category = promptText(stdRef?.category || item.standard_category || '-', 32);
    return [
      `ID:${item.id}`,
      `类型:${category}`,
      `维度:${item.sensory_dimension || item.check_dimension || '-'}`,
      `阶段:${item.test_phase || '-'}`,
      `流程:${item.experience_flow || '-'}`,
      `检查项:${item.check_item || '-'}`,
      `要求:${item.check_requirement || item.check_standard || item.experience_standard || '-'}`,
    ].join('；');
  }).join('\n') : '';

  const recipesSource = includeRecipes ? recipeLibrary : [];
  const recipes = recipesSource.slice(0, 50).map((recipe) => [
    `名称:${recipe.name || '-'}`,
    `类型:${recipe.recipe_type || '食谱'}`,
    `参数:${recipe.ingredients || '-'}`,
    `步骤:${((recipe.recipe_library_steps || []) as Array<Record<string, unknown>>).map((step) => step.operation).filter(Boolean).join(' / ') || '-'}`,
  ].join('；')).join('\n');

  return [
    `任务:${task.task_name || '-'}`,
    `品类/产品:${task.product_category || '-'} / ${task.product || '-'}`,
    `型号:${task.product_model || '-'}`,
    `项目类型:${task.project_type || '-'} ${task.project_phase || ''}`,
    `目标用户:${task.target_user || '-'}`,
    `体验目的:${task.test_purpose || '-'}`,
    `测试方法:${task.test_method || '-'}`,
    `结构化意图:${JSON.stringify(intent)}`,
    `热点摘要:${hotspotSummary || '暂无'}`,
    includeStandards
      ? '五感建议规则: 优先引用高度匹配的候选标准ID；候选标准不是强制全集。若候选标准不足以覆盖关键体验风险，请输出 standard_category=非标准 且 standard_item_id 留空，禁止强行匹配弱相关标准。'
      : '',
    `候选标准库（优先参考，非强制全集）:\n${standards || '暂无'}`,
    `候选食谱库:\n${recipes || '暂无'}`,
  ].join('\n');
}

function appendRuntimePresetRules(skillKey: AgentSkillKey, systemPrompt: string) {
  if (skillKey !== 'senses_standard_preset') return systemPrompt;
  return [
    systemPrompt,
    '运行时规则: 五感体验建议优先引用高度匹配的候选标准ID；候选标准库不是强制全集。如果候选标准没有覆盖必要体验风险，必须输出 standard_category=非标准 且 standard_item_id 留空。禁止为了凑ID强行匹配弱相关标准。',
  ].filter(Boolean).join('\n\n');
}

function dedupeSuggestions(input: NormalizedPresetSuggestions): NormalizedPresetSuggestions {
  const standardSeen = new Set<string>();
  const recipeSeen = new Set<string>();
  return {
    standards: input.standards.filter((item) => {
      const key = item.standardItemId || `${item.focus}::${item.reason}`;
      if (standardSeen.has(key)) return false;
      standardSeen.add(key);
      return true;
    }),
    recipes: input.recipes.filter((item) => {
      if (recipeSeen.has(item.name)) return false;
      recipeSeen.add(item.name);
      return true;
    }),
  };
}

async function acceptStandardSuggestions(client: ReturnType<typeof getSupabaseClient>, taskId: string, standards: Array<Record<string, unknown>>) {
  const ids = standards.map((item) => String(item.standard_item_id || item.standardItemId || '')).filter(Boolean);

  const { data: existingRecords } = await client.from('check_records').select('id').eq('task_id', taskId);
  let nextSort = existingRecords?.length || 0;
  const created: Record<string, unknown>[] = [];

  const { data: items } = ids.length > 0
    ? await client.from('standard_items').select('*').in('id', ids)
    : { data: [] };
  const itemRows = items || [];
  const foundItemIds = new Set(itemRows.map((item: Record<string, unknown>) => String(item.id || '')).filter(Boolean));
  const generatedSuggestions = standards.filter((item) => {
    const suggestedId = String(item.standard_item_id || item.standardItemId || '').trim();
    return !suggestedId || !foundItemIds.has(suggestedId);
  });
  const standardIds = [...new Set(itemRows.map((item: Record<string, unknown>) => String(item.standard_id || '')).filter(Boolean))];
  const { data: standardRows } = standardIds.length > 0
    ? await client.from('standards').select('id, category').in('id', standardIds)
    : { data: [] };
  const categoryByStandardId = new Map((standardRows || []).map((standard: Record<string, unknown>) => [standard.id, standard.category]));

  const inserts = itemRows.map((item: Record<string, unknown>, index: number) => ({
    task_id: taskId,
    standard_item_id: item.id,
    standard_category: categoryByStandardId.get(item.standard_id) || null,
    sensory_dimension: item.sensory_dimension || null,
    test_phase: item.test_phase || null,
    experience_flow: item.experience_flow || null,
    touch_point: item.touch_point || null,
    check_dimension: item.check_dimension || null,
    sub_check_dimension: item.sub_check_dimension || null,
    check_item: item.check_item || 'AI体验方案检查项',
    check_requirement: item.check_requirement || null,
    check_standard: item.check_standard || null,
    experience_standard: item.experience_standard || null,
    check_tool: item.check_tool || null,
    problem_level: item.problem_level || null,
    evaluation_result: '待定',
    problem_description: null,
    sort_order: nextSort + index,
  }));

  if (inserts.length > 0) {
    const { data } = await client.from('check_records').insert(inserts).select();
    created.push(...(data || []));
    nextSort += inserts.length;
  }

  const generatedInserts = generatedSuggestions
    .map<Record<string, unknown> | null>((item, index) => {
      const focus = String(item.focus || '').trim();
      const reason = String(item.reason || '').trim();
      const title = focus || reason;
      if (!title) return null;
      return {
        task_id: taskId,
        standard_item_id: null,
        standard_category: '非标准',
        check_item: title.substring(0, 200),
        check_requirement: reason || null,
        evaluation_result: '待定',
        problem_description: null,
        sort_order: nextSort + index,
      };
    })
    .filter((item): item is Record<string, unknown> => item !== null);

  if (generatedInserts.length > 0) {
    const { data } = await client.from('check_records').insert(generatedInserts).select();
    created.push(...(data || []));
  }

  return created;
}

async function acceptRecipeSuggestions(client: ReturnType<typeof getSupabaseClient>, taskId: string, recipes: Array<Record<string, unknown>>) {
  const created: Record<string, unknown>[] = [];

  for (const recipe of recipes) {
    const name = String(recipe.name || '').trim();
    if (!name) continue;

    const { data: newRecipe, error } = await client
      .from('recipes')
      .insert({
        task_id: taskId,
        name,
        ingredients: recipe.ingredients || null,
        recipe_type: recipe.recipe_type || recipe.recipeType || '食谱',
      })
      .select()
      .single();

    if (error || !newRecipe) continue;

    const steps = Array.isArray(recipe.steps) ? recipe.steps : [];
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i] && typeof steps[i] === 'object' ? steps[i] as Record<string, unknown> : {};
      const operation = String(step.operation || '').trim();
      if (!operation) continue;
      await client.from('recipe_steps').insert({
        recipe_id: newRecipe.id,
        step_number: i + 1,
        operation,
        problem_point: null,
        problem_points: [],
        sort_order: i,
      });
    }

    created.push(newRecipe);
  }

  return created;
}
