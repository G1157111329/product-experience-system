import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { LLMClient, Config, HeaderUtils } from 'coze-coding-dev-sdk';
import { getActiveSkillVersion } from '@/lib/server/agent-skills';
import { getDefaultSkillDefinitions, renderPromptTemplate } from '@/lib/agent-skills';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const client = getSupabaseClient();

  try {
    // Fetch recipe data
    const { data: recipe, error: recipeError } = await client
      .from('recipes')
      .select('*')
      .eq('id', id)
      .single();

    if (recipeError || !recipe) {
      return NextResponse.json({ code: 1, message: '食谱不存在' }, { status: 404 });
    }

    // Fetch recipe steps
    const { data: steps } = await client
      .from('recipe_steps')
      .select('*')
      .eq('recipe_id', id)
      .order('step_number');

    // Build context from steps and effect evaluation
    let contextText = `食谱/功能名称：${recipe.name}\n`;
    if (recipe.ingredients) contextText += `食材/参数：${recipe.ingredients}\n`;

    if (steps && steps.length > 0) {
      contextText += '\n【步骤信息】\n';
      for (const step of steps) {
        contextText += `步骤${step.step_number}：${step.operation || '未描述'}\n`;
      }
    }

    if (recipe.effect_description) {
      contextText += `\n【效果/出品效果评价】\n${recipe.effect_description}\n`;
    }

    if (recipe.effect_ai_result) {
      try {
        const aiResult = typeof recipe.effect_ai_result === 'string'
          ? JSON.parse(recipe.effect_ai_result)
          : recipe.effect_ai_result;
        if (aiResult) {
          contextText += '\n【AI效果评价结果】\n';
          if (aiResult.score) contextText += `综合评分：${aiResult.score}/10\n`;
          if (aiResult.summary) contextText += `评价总结：${aiResult.summary}\n`;
          if (aiResult.dimensions && Array.isArray(aiResult.dimensions)) {
            for (const dim of aiResult.dimensions) {
              contextText += `- ${dim.name || dim.dimension}：${dim.score}/10，${dim.comment || dim.description || ''}\n`;
            }
          }
        }
      } catch { /* ignore parse error */ }
    }

    // Read custom prompt from skill template, fallback to built-in default
    const activeSkill = await getActiveSkillVersion(client, 'problem_detection');
    const defaultSkill = getDefaultSkillDefinitions().find(s => s.skillKey === 'problem_detection');

    const defaultSystemPrompt = `你是一位专业产品评价官，擅长从用户体验角度识别产品问题。

你的任务分两层：

**第一层：负面情绪语言总结**
从步骤描述和效果评价中，识别用户表达中的负面情绪语言（如"不均匀"、"困难"、"无法"、"失败"、"不好"、"差"、"容易溢出"、"需要多次尝试"等），如实总结这些负面表述。如果存在AI效果评价结果，需重点关注评分较低的维度及其评语。

**第二层：期待vs实际体验差距分析**
"问题"本质上是我们对期待的结果和实际的体验之间的差距描述。请你作为一个专业产品评价官，基于该食谱/功能在互联网中用户普遍表达的期待状态，对比步骤描述和效果评价中反映的实际体验，识别出期待与实际之间的差距。AI效果评价结果中评分较低的维度也是问题点的重要参考。

分析维度：
1. 步骤操作是否顺畅、是否符合用户直觉
2. 效果/出品是否达到该类产品在互联网中的用户普遍期待
3. 是否存在用户期待能实现但实际未能满足的功能或效果

请以JSON数组格式输出问题点列表，每个问题点包含text字段（准确的问题描述），严格按以下格式输出：
[
  {"text": "问题描述1"},
  {"text": "问题描述2"}
]

要求：
- 第一层（负面情绪）问题排前面，第二层（期待差距）问题排后面
- 问题描述应简洁明确，一句话概括一个问题
- 不要过度解读，仅基于明确的负面表述和合理的期待差距
- 如果未发现任何问题点，输出空数组 []
- 只输出JSON数组，不要添加任何其他文字或解释`;

    const systemPrompt = activeSkill
      ? String(activeSkill.version.system_prompt || defaultSkill?.systemPrompt || defaultSystemPrompt)
      : (defaultSkill?.systemPrompt || defaultSystemPrompt);

    // Build user prompt from template
    const userPromptTemplate = activeSkill
      ? String(activeSkill.version.user_prompt_template || defaultSkill?.userPromptTemplate || '')
      : (defaultSkill?.userPromptTemplate || '');

    const userPromptText = userPromptTemplate
      ? renderPromptTemplate(userPromptTemplate, { recipe_snapshot: contextText })
      : contextText;

    // Fetch AI config
    const { data: aiConfigData } = await client
      .from('platform_settings')
      .select('value')
      .eq('key', 'ai_config')
      .maybeSingle();

    const aiConfig = (aiConfigData?.value || {}) as {
      provider?: string;
      model?: string;
      temperature?: number;
      custom_api_url?: string;
      custom_api_key?: string;
    };

    const model = aiConfig.model || 'doubao-seed-2-0-pro-260215';
    const temperature = aiConfig.temperature ?? 0.3;

    const customHeaders = HeaderUtils.extractForwardHeaders(request.headers);

    let aiContent = '';

    if (aiConfig.provider === 'custom' && aiConfig.custom_api_url && aiConfig.custom_api_key) {
      const response = await fetch(aiConfig.custom_api_url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${aiConfig.custom_api_key}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPromptText },
          ],
          temperature,
          max_tokens: 2000,
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        console.error('[ai-detect-problems] Custom API error:', response.status, errText);
        return NextResponse.json({ code: 1, message: `AI服务调用失败(${response.status})` }, { status: 500 });
      }

      const result = await response.json();
      aiContent = result.choices?.[0]?.message?.content || '';
    } else {
      const config = new Config();
      const llmClient = new LLMClient(config, customHeaders);

      const messages = [
        { role: 'system' as const, content: systemPrompt },
        { role: 'user' as const, content: userPromptText },
      ];

      const response = await llmClient.invoke(messages, { model, temperature });
      aiContent = response.content || '';
    }

    // Parse AI result
    const problems = parseProblems(aiContent);

    return NextResponse.json({
      code: 0,
      message: 'AI识别完成',
      data: { problems },
    });
  } catch (err) {
    console.error('[ai-detect-problems] Error:', err);
    const message = err instanceof Error ? err.message : 'AI识别失败';
    return NextResponse.json({ code: 1, message }, { status: 500 });
  }
}

interface DetectedProblem {
  text: string;
}

function parseProblems(content: string): DetectedProblem[] {
  try {
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];

    const parsed = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter((item: unknown) => typeof item === 'object' && item !== null && typeof (item as Record<string, unknown>).text === 'string')
      .map((item: Record<string, unknown>) => ({ text: (item as { text: string }).text.trim() }))
      .filter((p: DetectedProblem) => p.text.length > 0);
  } catch {
    return [];
  }
}
