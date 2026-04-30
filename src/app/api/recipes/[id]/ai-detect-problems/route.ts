import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { LLMClient, Config, HeaderUtils } from 'coze-coding-dev-sdk';

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
        // Include step problem points
        if (step.problem_points && Array.isArray(step.problem_points) && step.problem_points.length > 0) {
          for (const pp of step.problem_points) {
            if (pp.text) contextText += `  - 步骤问题点：${pp.text}\n`;
          }
        }
        if (step.problem_point && !step.problem_points?.length) {
          contextText += `  - 步骤问题点：${step.problem_point}\n`;
        }
      }
    }

    if (recipe.effect_description) {
      contextText += `\n【效果/出品效果评价】\n${recipe.effect_description}\n`;
    }

    if (recipe.effect_problem_point) {
      contextText += `已知问题点：${recipe.effect_problem_point}\n`;
    }

    const systemPrompt = `你是一位产品体验专家，擅长从用户描述中识别负面情绪和问题点。
根据提供的食谱步骤描述和效果评价信息，识别出所有潜在的问题点和负面体验。

请仔细分析以下内容：
1. 步骤描述中的负面表述（如"不均匀"、"困难"、"无法"、"失败"、"不好"、"差"等）
2. 效果评价中的负面描述
3. 隐含的问题（如"需要多次尝试"、"容易溢出"等暗示操作不顺畅的表述）

请以JSON数组格式输出问题点列表，每个问题点包含text字段（准确的问题描述），严格按以下格式输出：
[
  {"text": "问题描述1"},
  {"text": "问题描述2"}
]

如果未发现任何问题点，输出空数组 []。
注意：只输出JSON数组，不要添加任何其他文字或解释。每个问题描述应简洁明确，一句话概括一个问题。`;

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

    const model = aiConfig.model || 'doubao-seed-2-0-lite-260215';
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
            { role: 'user', content: contextText },
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
        { role: 'user' as const, content: contextText },
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
