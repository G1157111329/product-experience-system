import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { invokeConfiguredAI } from '@/lib/server/ai';
import { canAccessTask, isAuthResponse, requireUser } from '@/lib/server/auth';

type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
};

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const client = getSupabaseClient();
  const user = await requireUser(request, client);
  if (isAuthResponse(user)) return user;
  if (!(await canAccessTask(client, user, id))) {
    return NextResponse.json({ code: 1, message: '无权访问该任务助手' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const messages = normalizeMessages(body.messages);
    if (messages.length === 0) {
      return NextResponse.json({ code: 1, message: '请输入问题' }, { status: 400 });
    }

    const { data: task, error: taskError } = await client.from('experience_tasks').select('*').eq('id', id).single();
    if (taskError || !task) return NextResponse.json({ code: 1, message: '任务不存在' }, { status: 404 });

    const { data: records } = await client.from('check_records').select('*').eq('task_id', id).order('sort_order', { ascending: true });
    const { data: recipes } = await client.from('recipes').select('*').eq('task_id', id);
    const { data: materials } = await client.from('materials').select('*').eq('task_id', id);
    const { data: summaryRow } = await client
      .from('platform_settings')
      .select('value')
      .eq('key', `ai_sum_${id}`)
      .maybeSingle();

    const context = buildTaskContext({
      task,
      records: records || [],
      recipes: recipes || [],
      materials: materials || [],
      aiSummary: summaryRow?.value || null,
    });

    const rawContent = await invokeConfiguredAI({
      client,
      defaultTemperature: 0.4,
      maxTokens: 1400,
      messages: [
        {
          role: 'system',
          content: `你是产品体验工程师的实时助手。你只服务当前体验任务，不要替用户自动生成模块内容；用户问什么就答什么。

回答原则：
1. 结合任务上下文、五感记录、功能效果、素材情况和AI总结回答。
2. 优先给体验工程师可执行的下一步，例如补拍什么、补哪条记录、如何组织结论。
3. 不要说空泛流程，不要编造不存在的数据。
4. 如果上下文不足，直接说明需要用户补充什么。
5. 回答保持简洁，使用中文。`,
        },
        { role: 'user', content: `当前任务上下文：\n${context}` },
        {
          role: 'user',
          content: messages.map((message) => `${message.role === 'user' ? '体验工程师' : 'AI助手'}：${message.content}`).join('\n\n'),
        },
      ],
    });

    return NextResponse.json({ code: 0, message: 'success', data: { reply: rawContent.trim() } });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'AI回复失败';
    return NextResponse.json({ code: 1, message }, { status: 500 });
  }
}

function normalizeMessages(value: unknown): ChatMessage[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const role = (item as Record<string, unknown>).role;
      const content = (item as Record<string, unknown>).content;
      if ((role !== 'user' && role !== 'assistant') || typeof content !== 'string' || !content.trim()) return null;
      return { role, content: content.trim() };
    })
    .filter((item): item is ChatMessage => Boolean(item))
    .slice(-10);
}

function buildTaskContext({
  task,
  records,
  recipes,
  materials,
  aiSummary,
}: {
  task: Record<string, unknown>;
  records: Array<Record<string, unknown>>;
  recipes: Array<Record<string, unknown>>;
  materials: Array<Record<string, unknown>>;
  aiSummary: unknown;
}) {
  const failedRecords = records.filter((record) => record.evaluation_result === '不合格');
  const unlinkedMaterials = materials.filter((material) => !material.record_id && !material.recipe_step_id && !material.recipe_id);
  const recordLines = records.slice(0, 20).map((record, index) => {
    return `${index + 1}. ${record.check_item || '-'} | ${record.evaluation_result || '-'} | ${record.problem_description || '无问题描述'}`;
  }).join('\n');
  const recipeLines = recipes.slice(0, 15).map((recipe, index) => {
    return `${index + 1}. ${recipe.name || '-'} | ${recipe.recipe_type || '-'} | 效果:${recipe.effect_description || '未填写'} | 问题:${recipe.effect_problem_point || '无'}`;
  }).join('\n');

  return [
    `任务：${task.task_name || '-'}`,
    `品类/产品：${task.product_category || '-'} / ${task.product || '-'}`,
    `型号：${task.product_model || '-'}`,
    `项目类型：${task.project_type || '-'} ${task.project_phase || ''}`,
    `测试目的：${task.test_purpose || '-'}`,
    `五感记录：共${records.length}条，不合格${failedRecords.length}条`,
    recordLines || '暂无五感记录',
    `功能/食谱：共${recipes.length}项`,
    recipeLines || '暂无功能效果',
    `素材：共${materials.length}个，未关联${unlinkedMaterials.length}个`,
    `AI总结：${JSON.stringify(aiSummary || {})}`,
  ].join('\n');
}
