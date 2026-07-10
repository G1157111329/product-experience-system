import { NextRequest, NextResponse } from 'next/server';
import { normalizeAgentActions } from '@/lib/agent-actions';
import { stripAssistantReasoning } from '@/lib/assistant-output';
import { extractJsonObject, invokeConfiguredAI } from '@/lib/server/ai';
import { canAccessTask, isAuthResponse, requireUser } from '@/lib/server/auth';
import { findAssemblyForTask } from '@/lib/server/comparison-assembly';
import { getSupabaseClient } from '@/storage/database/supabase-client';

type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
};

type Row = Record<string, unknown>;

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const client = getSupabaseClient();
  const user = await requireUser(request, client);
  if (isAuthResponse(user)) return user;
  if (!(await canAccessTask(client, user, id))) {
    return NextResponse.json({ code: 1, message: '无权访问该任务的 AI 辅助' }, { status: 403 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const messages = normalizeMessages(body.messages);
    if (messages.length === 0) {
      return NextResponse.json({ code: 1, message: '请输入问题' }, { status: 400 });
    }

    const context = await loadTaskAgentContext(client, id);
    if (!context.task) return NextResponse.json({ code: 1, message: '任务不存在' }, { status: 404 });

    const rawContent = await invokeConfiguredAI({
      client,
      defaultTemperature: 0.25,
      maxTokens: 2400,
      messages: [
        { role: 'system', content: buildAgentSystemPrompt() },
        { role: 'user', content: `当前任务上下文：\n${buildTaskContextText(context)}` },
        { role: 'user', content: buildConversationText(messages) },
      ],
    });

    const parsed = parseAgentReply(rawContent);
    return NextResponse.json({
      code: 0,
      message: 'success',
      data: parsed,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'AI 回复失败';
    return NextResponse.json({ code: 1, message }, { status: 500 });
  }
}

function normalizeMessages(value: unknown): ChatMessage[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const row = item as Record<string, unknown>;
      const role = row.role;
      const content = row.content;
      if ((role !== 'user' && role !== 'assistant') || typeof content !== 'string' || !content.trim()) return null;
      return { role, content: content.trim().slice(0, 4000) };
    })
    .filter((item): item is ChatMessage => Boolean(item))
    .slice(-10);
}

function buildAgentSystemPrompt() {
  return `你是产品体验管理平台里的AI助手。你要先理解用户意图，再输出可预览、可确认、可执行的动作计划。

必须只返回 JSON，不要返回 Markdown。JSON 格式：
{
  "reply": "给用户看的中文回复，说明你理解了什么，以及建议执行什么",
  "actions": [
    {
      "id": "短 ID",
      "type": "动作类型",
      "title": "动作标题",
      "description": "执行后会发生什么",
      "risk": "low | medium | high",
      "payload": {}
    }
  ]
}

允许的动作类型和 payload：
1. recipe_create: { "name": "食谱名", "description": "可选说明" }
2. recipe_step_create: { "recipe_id": "必须使用上下文里的食谱ID", "operation": "步骤描述", "problem_point": "可选问题点" }
3. recipe_step_update: { "step_id": "必须使用上下文里的步骤ID", "operation": "新的步骤描述", "problem_point": "可选问题点" }
4. comparison_matrix_seed: {
   "objects": [{ "name": "A对象", "type": "product_model" }],
   "sections": [{ "label": "大类", "items": ["对比项1", "对比项2"] }],
   "cells": [{ "object_name": "A对象", "item_label": "对比项1", "effect_summary": "结论", "process_notes": ["过程"], "problem_points": ["问题"], "manual_score": "8" }]
}
5. comparison_cell_update: { "object_name": "对象名", "item_label": "对比项", "effect_summary": "结论", "process_notes": ["过程"], "problem_points": ["问题"], "manual_score": "0-10可选" }
6. material_ai_result_update: { "material_id": "素材ID", "summary": "图片/视频内容整理", "tags": ["标签"] }
7. material_rename: { "material_id": "素材ID", "file_name": "新素材名称" }
8. material_bind: { "material_id": "素材ID", "record_id | recipe_id | recipe_step_id | issue_id": "绑定目标ID" }
9. issue_create: { "title": "问题标题", "description": "描述", "level": "一类|二类|三类" }
10. issue_update: { "issue_id": "问题ID", "title|description|level|status|improve_plan|responsible_person|verification_note": "新值" }
11. record_update: { "record_id": "体验记录ID", "actual_result|problem_description|evaluation_result|experience_standard|check_standard": "新值" }
12. task_create: { "task_name": "计划名称", "product_category|product|product_model|project_type|project_phase|organizer|test_purpose|task_mode": "可选值" }
13. standard_item_create: { "standard_id": "标准ID", "check_item": "检查条目", "check_requirement|experience_standard|check_standard|sensory_dimension|experience_flow|touch_point|problem_level": "可选值" }
14. data_matrix_cell_update: { "matrix_id": "数据矩阵ID", "leaf_row_id": "行ID", "column_id": "列ID", "value_text|value_number|display_text": "录入值" }

规则：
- 不得生成删除、设置、配置或用户管理动作；覆盖已有步骤、重命名素材必须标记 medium 或 high。
- 如果上下文没有足够 ID，不要编造 ID；可以给 reply 提醒用户先选择或补充信息，actions 返回空数组。
- 对比矩阵允许通过对象名和对比项名称创建或更新，系统会在用户确认后补齐矩阵单元格。
- 素材内容整理只基于上下文里已有文件名、AI结果和用户描述，不要声称看到了没有提供的图片细节。
- 一次最多输出 8 个动作。`;
}

async function loadTaskAgentContext(client: ReturnType<typeof getSupabaseClient>, taskId: string) {
  const [
    taskResult,
    recordsResult,
    recipesResult,
    materialsResult,
    summaryResult,
  ] = await Promise.all([
    client.from('experience_tasks').select('*').eq('id', taskId).maybeSingle(),
    client.from('check_records').select('*').eq('task_id', taskId).order('sort_order', { ascending: true }),
    client.from('recipes').select('*').eq('task_id', taskId).order('sort_order', { ascending: true }),
    client.from('materials').select('*').eq('task_id', taskId).order('created_at', { ascending: false }).limit(60),
    client.from('platform_settings').select('value').eq('key', `ai_sum_${taskId}`).maybeSingle(),
  ]);

  const recipes = asRows(recipesResult.data);
  const recipeIds = recipes.map((recipe) => String(recipe.id || '')).filter(Boolean);
  const recipeSteps = recipeIds.length > 0
    ? asRows((await client
      .from('recipe_steps')
      .select('*')
      .in('recipe_id', recipeIds)
      .order('step_number', { ascending: true })).data)
    : [];

  const assembly = await findAssemblyForTask(client, taskId);
  const matrix = assembly
    ? await loadComparisonMatrix(client, assembly.id)
    : { assembly: null, objects: [], itemNodes: [], cells: [] };

  return {
    task: taskResult.data as Row | null,
    records: asRows(recordsResult.data),
    recipes,
    recipeSteps,
    materials: asRows(materialsResult.data),
    aiSummary: summaryResult.data?.value || null,
    comparison: matrix,
  };
}

async function loadComparisonMatrix(client: ReturnType<typeof getSupabaseClient>, assemblyId: string) {
  const [assemblyResult, objectsResult, nodesResult, cellsResult] = await Promise.all([
    client.from('comparison_assemblies').select('*').eq('id', assemblyId).maybeSingle(),
    client.from('comparison_objects').select('*').eq('assembly_id', assemblyId).order('sort_order', { ascending: true }),
    client.from('comparison_item_nodes').select('*').eq('assembly_id', assemblyId).order('sort_order', { ascending: true }),
    client.from('comparison_matrix_cells').select('*').eq('assembly_id', assemblyId),
  ]);
  return {
    assembly: assemblyResult.data as Row | null,
    objects: asRows(objectsResult.data),
    itemNodes: asRows(nodesResult.data),
    cells: asRows(cellsResult.data),
  };
}

function asRows(value: unknown): Row[] {
  return Array.isArray(value) ? value as Row[] : [];
}

function buildConversationText(messages: ChatMessage[]) {
  return messages
    .map((message) => `${message.role === 'user' ? '用户' : 'AI助手'}：${message.content}`)
    .join('\n\n');
}

function buildTaskContextText(context: Awaited<ReturnType<typeof loadTaskAgentContext>>) {
  const task = context.task || {};
  const failedRecords = context.records.filter((record) => record.evaluation_result === '不合格');
  const stepsByRecipeId = new Map<string, Row[]>();
  for (const step of context.recipeSteps) {
    const recipeId = String(step.recipe_id || '');
    const list = stepsByRecipeId.get(recipeId) || [];
    list.push(step);
    stepsByRecipeId.set(recipeId, list);
  }

  const recipeLines = context.recipes.slice(0, 20).flatMap((recipe, index) => {
    const recipeId = String(recipe.id || '');
    const lines = [
      `${index + 1}. 食谱ID=${recipeId} 名称=${recipe.name || '-'} 类型=${recipe.recipe_type || '-'} 参数=${recipe.ingredients || '-'}`,
    ];
    for (const step of stepsByRecipeId.get(recipeId) || []) {
      lines.push(`   - 步骤ID=${step.id} 序号=${step.step_number || '-'} 内容=${step.operation || '-'} 问题=${step.problem_point || ''}`);
    }
    return lines;
  });

  const materialLines = context.materials.slice(0, 30).map((material, index) => {
    return `${index + 1}. 素材ID=${material.id} 类型=${material.material_type || '-'} 名称=${material.file_name || '-'} AI结果=${JSON.stringify(material.ai_result || {})}`;
  });

  const objectLines = context.comparison.objects.map((object, index) =>
    `${index + 1}. 对象ID=${object.id} 名称=${object.object_name || '-'} 类型=${object.object_type || '-'}`
  );
  const itemLines = context.comparison.itemNodes.map((node, index) =>
    `${index + 1}. 项目ID=${node.id} 类型=${node.node_type || '-'} 名称=${node.node_label || '-'} 父级=${node.parent_id || ''}`
  );

  return [
    `任务ID=${task.id || ''}`,
    `任务=${task.task_name || '-'}`,
    `品类/产品=${task.product_category || '-'} / ${task.product || '-'}`,
    `型号=${task.product_model || '-'}`,
    `项目类型=${task.project_type || '-'} ${task.project_phase || ''}`,
    `测试目的=${task.test_purpose || '-'}`,
    `五感记录=共${context.records.length}条，不合格${failedRecords.length}条`,
    `功能/食谱=共${context.recipes.length}项`,
    recipeLines.join('\n') || '暂无食谱步骤',
    `素材=共${context.materials.length}个`,
    materialLines.join('\n') || '暂无素材',
    `对比矩阵=${context.comparison.assembly ? `组装ID=${context.comparison.assembly.id}` : '尚未初始化'}`,
    `对比对象：\n${objectLines.join('\n') || '暂无对象'}`,
    `对比项目：\n${itemLines.join('\n') || '暂无对比项目'}`,
    `AI总结=${JSON.stringify(context.aiSummary || {})}`,
  ].join('\n');
}

function parseAgentReply(rawContent: string) {
  const parsed = extractJsonObject<Record<string, unknown>>(rawContent, {});
  const reply = stripAssistantReasoning(
    typeof parsed.reply === 'string' && parsed.reply.trim()
      ? parsed.reply
      : rawContent,
  );
  const actions = normalizeAgentActions(parsed.actions).slice(0, 8);
  return {
    reply: reply || '我没有生成有效回复，请换一种描述再试。',
    actions,
  };
}
