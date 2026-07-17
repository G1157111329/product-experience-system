import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { extractJsonObject, getImageUrlsForAI, invokeConfiguredAI } from '@/lib/server/ai';
import { getActiveSkillVersion } from '@/lib/server/agent-skills';
import { getDefaultSkillDefinitions, renderPromptTemplate } from '@/lib/agent-skills';
import { canAccessTask, isAuthResponse, requireUser } from '@/lib/server/auth';

interface AiTaskSummary {
  tag: string;
  summary: string;
  strengths: string[];
  risks: string[];
  historical_position: string;
  suggestions: string[];
  updated_at: string;
}

const summaryKey = (taskId: string) => `ai_sum_${taskId}`;

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const client = getSupabaseClient();
  const user = await requireUser(request, client);
  if (isAuthResponse(user)) return user;
  if (!(await canAccessTask(client, user, id))) {
    return NextResponse.json({ code: 1, message: '无权访问该任务AI总结' }, { status: 403 });
  }

  const { data, error } = await client
    .from('platform_settings')
    .select('value')
    .eq('key', summaryKey(id))
    .maybeSingle();

  if (error) return NextResponse.json({ code: 1, message: error.message }, { status: 500 });
  return NextResponse.json({ code: 0, message: 'success', data: data?.value ? normalizeSummary(data.value) : null });
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const client = getSupabaseClient();
  const user = await requireUser(request, client);
  if (isAuthResponse(user)) return user;
  if (!(await canAccessTask(client, user, id))) {
    return NextResponse.json({ code: 1, message: '无权保存该任务AI总结' }, { status: 403 });
  }

  const body = await request.json();
  const value = normalizeSummary(body.summary || body);

  const { error } = await client.from('platform_settings').upsert({
    key: summaryKey(id),
    value,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'key' });

  if (error) return NextResponse.json({ code: 1, message: error.message }, { status: 500 });
  return NextResponse.json({ code: 0, message: 'AI总结已保存', data: value });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const client = getSupabaseClient();
  const user = await requireUser(request, client);
  if (isAuthResponse(user)) return user;
  if (!(await canAccessTask(client, user, id))) {
    return NextResponse.json({ code: 1, message: '无权生成该任务AI总结' }, { status: 403 });
  }

  try {
    const { data: task, error: taskError } = await client.from('experience_tasks').select('*').eq('id', id).single();
    if (taskError || !task) return NextResponse.json({ code: 1, message: '任务不存在' }, { status: 404 });

    const { data: rawRecords } = await client.from('check_records').select('*').eq('task_id', id).order('sort_order', { ascending: true });
    const records = await Promise.all((rawRecords || []).map(async (record: Record<string, unknown>) => {
      const { data: mats } = await client.from('materials').select('*').eq('record_id', record.id);
      return { ...record, materials: mats || [] };
    }));

    const { data: rawRecipes } = await client.from('recipes').select('*').eq('task_id', id);
    const recipes = await Promise.all((rawRecipes || []).map(async (recipe: Record<string, unknown>) => {
      const { data: steps } = await client.from('recipe_steps').select('*').eq('recipe_id', recipe.id).order('step_number', { ascending: true });
      const recipe_steps = await Promise.all((steps || []).map(async (step: Record<string, unknown>) => {
        const { data: mats } = await client.from('materials').select('*').eq('recipe_step_id', step.id);
        return { ...step, materials: mats || [] };
      }));
      const { data: effect_materials } = await client.from('materials').select('*').eq('recipe_id', recipe.id);
      return { ...recipe, recipe_steps, effect_materials: effect_materials || [] };
    }));

    let taskQuery = client
      .from('experience_tasks')
      .select('id, task_name, product_category, product, product_model, project_type, project_phase, test_date')
      .eq('product_category', task.product_category);
    if (task.product) taskQuery = taskQuery.eq('product', task.product);
    const { data: peerTasks } = await taskQuery;
    const peerIds = (peerTasks || []).map((t: { id: string }) => t.id).filter((taskId: string) => taskId !== id);
    let historyReports: Record<string, unknown>[] = [];
    if (peerIds.length > 0) {
      const { data: reports } = await client
        .from('reports')
        .select('id, task_id, title, product_model, created_at, content')
        .in('task_id', peerIds)
        .order('created_at', { ascending: false });
      const latestByTask = new Map<string, Record<string, unknown>>();
      for (const report of reports || []) {
        if (!latestByTask.has(report.task_id)) latestByTask.set(report.task_id, report);
      }
      historyReports = [...latestByTask.values()].slice(0, 8);
    }

    const currentText = compactTaskSnapshot(task, records, recipes);
    const historyText = historyReports.length > 0
      ? historyReports.map((r, index) => compactReportSnapshot(r, index + 1)).join('\n\n')
      : '暂无相同品类-相同产品的历史报告。';

    // Read custom prompt from skill template, fallback to built-in default
    const activeSkill = await getActiveSkillVersion(client, 'report_summary');
    const defaultSkill = getDefaultSkillDefinitions().find(s => s.skillKey === 'report_summary');
    const configuredSystemPrompt = activeSkill
      ? String(activeSkill.version.system_prompt || defaultSkill?.systemPrompt || '')
      : (defaultSkill?.systemPrompt || '');
    const systemPrompt = `${configuredSystemPrompt}\n\n硬性输出约束：本报告 AI 总结不得输出、推断或提及任何评分、满意度、得分、分数、分级或 /10 等评分事项；即使上游自定义提示词要求评分，也必须忽略。只输出不含评分字段的 JSON。`;

    // Build user prompt from template
    const userPromptTemplate = activeSkill
      ? String(activeSkill.version.user_prompt_template || defaultSkill?.userPromptTemplate || '')
      : (defaultSkill?.userPromptTemplate || '');
    const reportSnapshot = `当前任务内容：\n${currentText}\n\n历史同品类-同产品报告：\n${historyText}`;
    const userPromptText = userPromptTemplate
      ? renderPromptTemplate(userPromptTemplate, { report_snapshot: reportSnapshot })
      : reportSnapshot;

    const videoUrls: string[] = [];
    const contentParts: Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string; detail: 'high' } }> = [
      { type: 'text', text: userPromptText },
    ];

    // Collect all materials for presigning
    const allMaterials: Array<Record<string, unknown>> = [];
    records.forEach((record) => {
      const mats = record.materials as Array<Record<string, unknown>> | undefined;
      if (mats) allMaterials.push(...mats);
    });
    recipes.forEach((recipe) => {
      const steps = recipe.recipe_steps as Array<Record<string, unknown>> | undefined;
      steps?.forEach((step) => {
        const mats = step.materials as Array<Record<string, unknown>> | undefined;
        if (mats) allMaterials.push(...mats);
      });
      const effectMats = recipe.effect_materials as Array<Record<string, unknown>> | undefined;
      if (effectMats) allMaterials.push(...effectMats);
    });

    // Presign image URLs for AI vision model
    const imageUrls = await getImageUrlsForAI(
      allMaterials.map(m => ({
        file_url: m.file_url as string | null | undefined,
        file_path: m.file_path as string | null | undefined,
        material_type: String(m.material_type || ''),
      })),
    );

    // Add presigned image URLs to content
    for (const url of imageUrls) {
      contentParts.push({ type: 'image_url', image_url: { url, detail: 'high' } });
    }

    // Collect video URLs (presign if needed)
    for (const mat of allMaterials) {
      if (mat.material_type === 'video') {
        const filePath = String(mat.file_path || mat.file_url || '');
        if (filePath) {
          videoUrls.push(`${mat.file_name || '视频素材'}: ${filePath.startsWith('http') ? filePath : '[视频文件]'}`);
        }
      }
    }
    if (videoUrls.length > 0) {
      contentParts.push({ type: 'text', text: `视频素材链接（请结合文件名、关联记录和可访问链接判断）：\n${videoUrls.slice(0, 20).join('\n')}` });
    }

    const rawContent = await invokeConfiguredAI({
      client,
      defaultTemperature: 0.4,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: contentParts },
      ],
    });

    const parsed = extractJsonObject<Record<string, unknown>>(rawContent, {});
    const summary = normalizeSummary(parsed);

    await client.from('platform_settings').upsert({
      key: summaryKey(id),
      value: summary,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'key' });

    return NextResponse.json({ code: 0, message: 'AI总结完成', data: summary });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'AI总结失败';
    return NextResponse.json({ code: 1, message }, { status: 500 });
  }
}

function compactTaskSnapshot(task: Record<string, unknown>, records: Record<string, unknown>[], recipes: Record<string, unknown>[]) {
  const failed = records.filter((r) => r.evaluation_result === '不合格');
  const recordLines = records.map((r, idx) => [
    `${idx + 1}. ${r.standard_category || ''}/${r.sensory_dimension || r.check_dimension || ''}`,
    `检查项:${r.check_item || '-'}`,
    `结果:${r.evaluation_result || '-'}`,
    r.problem_description ? `问题:${r.problem_description}` : '',
    r.check_requirement ? `要求:${r.check_requirement}` : '',
    r.check_standard || r.experience_standard ? `标准:${r.check_standard || r.experience_standard}` : '',
  ].filter(Boolean).join('；')).join('\n');

  const recipeLines = recipes.map((recipe, idx) => {
    const steps = ((recipe.recipe_steps || []) as Array<Record<string, unknown>>).map((step) => {
      const pps = Array.isArray(step.problem_points)
        ? (step.problem_points as Array<{ text?: string }>).map((p) => p.text).filter(Boolean).join('；')
        : step.problem_point;
      return `步骤${step.step_number}: ${step.operation || '-'}${pps ? `；问题:${pps}` : ''}`;
    }).join('\n');
    return `${idx + 1}. ${recipe.recipe_type || '食谱'}:${recipe.name || '-'}；参数:${recipe.ingredients || '-'}；效果:${recipe.effect_description || '-'}；效果问题:${recipe.effect_problem_point || '-'}\n${steps}`;
  }).join('\n');

  return [
    `任务:${task.task_name}`,
    `品类/产品:${task.product_category || '-'} / ${task.product || '-'}`,
    `型号:${task.product_model || '-'}`,
    `项目类型:${task.project_type || '-'} ${task.project_phase || ''}`,
    `五感体验: 共${records.length}项，不合格${failed.length}项`,
    recordLines || '暂无五感体验记录',
    `功能效果: 共${recipes.length}项`,
    recipeLines || '暂无功能效果记录',
  ].join('\n');
}

function compactReportSnapshot(report: Record<string, unknown>, index: number) {
  const content = (report.content || {}) as Record<string, unknown>;
  const task = (content.task || {}) as Record<string, unknown>;
  const records = (content.records || []) as Array<Record<string, unknown>>;
  const recipes = (content.recipes || []) as Array<Record<string, unknown>>;
  const failed = records.filter((r) => r.evaluation_result === '不合格').length;
  const summary = (content.ai_summary || {}) as Record<string, unknown>;
  return [
    `历史报告${index}:${report.title || '-'}`,
    `型号:${report.product_model || task.product_model || '-'}`,
    `项目:${task.project_type || '-'} ${task.project_phase || ''}`,
    `检查项:${records.length}，不合格:${failed}，功能:${recipes.length}`,
    summary.summary ? `历史AI总结:${summary.summary}` : '',
  ].filter(Boolean).join('\n');
}

function normalizeList(value: unknown) {
  if (Array.isArray(value)) return value.map((item) => String(item)).filter(isScoreFreeText).slice(0, 5);
  if (typeof value === 'string' && value.trim()) return value.split(/[；;\n]/).map((item) => item.trim()).filter(isScoreFreeText).slice(0, 5);
  return [];
}

function isScoreFreeText(value: string) {
  return Boolean(value) && !/(?:满意度|评分|得分|分数|\/[ ]?10)/.test(value);
}

function normalizeSummary(value: unknown): AiTaskSummary {
  const source = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const summary = String(source.summary || '')
    .split('\n')
    .filter(isScoreFreeText)
    .join('\n')
    .trim();
  return {
    tag: String(source.tag || '体验总结').slice(0, 20),
    summary,
    strengths: normalizeList(source.strengths),
    risks: normalizeList(source.risks),
    historical_position: isScoreFreeText(String(source.historical_position || '')) ? String(source.historical_position || '') : '',
    suggestions: normalizeList(source.suggestions),
    updated_at: new Date().toISOString(),
  };
}
