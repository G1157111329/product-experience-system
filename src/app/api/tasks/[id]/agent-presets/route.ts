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

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const client = getSupabaseClient();
  const body = await request.json();
  const skillKeys = normalizeSkillKeys(body.skill_keys);
  const actorUserId = body.user_id || null;

  await ensureDefaultSkillTemplates(client, actorUserId);

  const { data: task, error: taskError } = await client.from('experience_tasks').select('*').eq('id', id).single();
  if (taskError || !task) return NextResponse.json({ code: 1, message: '任务不存在' }, { status: 404 });

  const { data: standardItems } = await client
    .from('standard_items')
    .select('id, standard_id, sensory_dimension, test_phase, experience_flow, touch_point, check_dimension, sub_check_dimension, check_item, check_requirement, check_standard, experience_standard, check_tool, problem_level, standards(id, category)')
    .limit(120);

  const { data: recipeLibrary } = await client
    .from('recipe_library')
    .select('*, recipe_library_steps(*)')
    .limit(80);

  const intent = buildIntent(task);
  const taskSnapshot = buildTaskSnapshot(task, intent, standardItems || [], recipeLibrary || [], body.hotspot_summary || '');
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
      const userPrompt = renderPromptTemplate(String(active.version.user_prompt_template || ''), {
        task_snapshot: taskSnapshot,
        hotspot_summary: body.hotspot_summary || '',
      });
      const rawContent = await invokeConfiguredAI({
        request,
        client,
        defaultTemperature: 0.3,
        maxTokens: 2400,
        messages: [
          { role: 'system', content: String(active.version.system_prompt || '') },
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
  const body = await request.json();
  const actorUserId = body.user_id || null;
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

function buildTaskSnapshot(
  task: Record<string, unknown>,
  intent: Record<string, unknown>,
  standardItems: Array<Record<string, unknown>>,
  recipeLibrary: Array<Record<string, unknown>>,
  hotspotSummary: string,
) {
  const standards = standardItems.slice(0, 80).map((item) => {
    const stdRef = item.standards as Record<string, unknown> | null;
    const category = stdRef?.category || item.standard_category || '-';
    return [
      `ID:${item.id}`,
      `类型:${category}`,
      `维度:${item.sensory_dimension || item.check_dimension || '-'}`,
      `阶段:${item.test_phase || '-'}`,
      `流程:${item.experience_flow || '-'}`,
      `检查项:${item.check_item || '-'}`,
      `要求:${item.check_requirement || item.check_standard || item.experience_standard || '-'}`,
    ].join('；');
  }).join('\n');

  const recipes = recipeLibrary.slice(0, 50).map((recipe) => [
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
    `候选标准:\n${standards || '暂无'}`,
    `候选食谱库:\n${recipes || '暂无'}`,
  ].join('\n');
}

function dedupeSuggestions(input: NormalizedPresetSuggestions): NormalizedPresetSuggestions {
  const standardSeen = new Set<string>();
  const recipeSeen = new Set<string>();
  return {
    standards: input.standards.filter((item) => {
      if (standardSeen.has(item.standardItemId)) return false;
      standardSeen.add(item.standardItemId);
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
  if (ids.length === 0) return [];

  const { data: items } = await client.from('standard_items').select('*').in('id', ids);
  if (!items || items.length === 0) return [];
  const standardIds = [...new Set(items.map((item: Record<string, unknown>) => String(item.standard_id || '')).filter(Boolean))];
  const { data: standardRows } = standardIds.length > 0
    ? await client.from('standards').select('id, category').in('id', standardIds)
    : { data: [] };
  const categoryByStandardId = new Map((standardRows || []).map((standard: Record<string, unknown>) => [standard.id, standard.category]));

  const { data: existingRecords } = await client.from('check_records').select('id').eq('task_id', taskId);
  const baseSort = existingRecords?.length || 0;

  const inserts = items.map((item: Record<string, unknown>, index: number) => ({
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
    sort_order: baseSort + index,
  }));

  const { data } = await client.from('check_records').insert(inserts).select();
  return data || [];
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
