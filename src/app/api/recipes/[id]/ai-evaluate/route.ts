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

    // Fetch effect materials
    const { data: effectMaterials } = await client
      .from('materials')
      .select('*')
      .eq('recipe_id', id);

    const materials = effectMaterials || [];

    if (!recipe.effect_description && materials.length === 0) {
      return NextResponse.json({ code: 1, message: '请先填写效果评价描述或上传附件素材' }, { status: 400 });
    }

    // Fetch AI config from platform_settings
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

    const model = aiConfig.model || 'doubao-seed-1-6-vision-250815';
    const temperature = aiConfig.temperature ?? 0.7;

    // Build the prompt
    const systemPrompt = `你是一位资深美食评委和产品体验专家，拥有丰富的食物品鉴和产品功能评估经验。
你的任务是根据提供的食物效果描述和照片，从视觉效果和功能效果两个维度进行专业评价。

评价标准（满分10分）：
- 10分：完美，无可挑剔
- 8-9分：优秀，超出预期
- 6-7分：良好，符合标准
- 4-5分：一般，有改进空间
- 1-3分：较差，需要显著改进

请按以下格式输出：
1. 视觉效果评价：对食物/产品外观、色泽、摆盘等的评价
2. 功能效果评价：对产品功能表现、操作便利性等的评价
3. 综合评分：X分（仅输出一个0-10的整数分数）

最后一行必须只包含分数，格式为"综合评分：X分"`;

    // Build content parts
    const contentParts: Array<{ type: 'text' | 'image_url'; text?: string; image_url?: { url: string; detail?: 'high' | 'low' } }> = [];

    // Add description text
    let descriptionText = `食谱/功能名称：${recipe.name}\n`;
    if (recipe.ingredients) descriptionText += `食材/参数：${recipe.ingredients}\n`;
    if (recipe.effect_description) descriptionText += `效果评价描述：${recipe.effect_description}\n`;
    descriptionText += '\n请根据以上信息和附件图片进行评价。';

    contentParts.push({ type: 'text', text: descriptionText });

    // Add image materials
    for (const mat of materials) {
      if (mat.material_type === 'image' && mat.file_url) {
        contentParts.push({
          type: 'image_url',
          image_url: { url: mat.file_url, detail: 'high' },
        });
      }
    }

    const customHeaders = HeaderUtils.extractForwardHeaders(request.headers);

    // Use custom API or built-in SDK
    if (aiConfig.provider === 'custom' && aiConfig.custom_api_url && aiConfig.custom_api_key) {
      // Custom OpenAI-compatible API
      const response = await fetch(aiConfig.custom_api_url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${aiConfig.custom_api_key}`,
        },
        body: JSON.stringify({
          model: model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: contentParts },
          ],
          temperature,
          max_tokens: 2000,
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        console.error('[ai-evaluate] Custom API error:', response.status, errText);
        return NextResponse.json({ code: 1, message: `AI服务调用失败(${response.status})` }, { status: 500 });
      }

      const result = await response.json();
      const aiContent = result.choices?.[0]?.message?.content || '';
      const score = extractScore(aiContent);

      // Save score to recipe
      await client.from('recipes').update({
        effect_score: score,
        updated_at: new Date().toISOString(),
      }).eq('id', id);

      return NextResponse.json({
        code: 0,
        message: 'AI评价完成',
        data: { content: aiContent, score },
      });
    } else {
      // Use built-in coze-coding-dev-sdk
      const config = new Config();
      const llmClient = new LLMClient(config, customHeaders);

      const messages = [
        { role: 'system' as const, content: systemPrompt },
        { role: 'user' as const, content: contentParts },
      ];

      const response = await llmClient.invoke(messages, {
        model,
        temperature,
      });

      const aiContent = response.content || '';
      const score = extractScore(aiContent);

      // Save score to recipe
      await client.from('recipes').update({
        effect_score: score,
        updated_at: new Date().toISOString(),
      }).eq('id', id);

      return NextResponse.json({
        code: 0,
        message: 'AI评价完成',
        data: { content: aiContent, score },
      });
    }
  } catch (err) {
    console.error('[ai-evaluate] Error:', err);
    const message = err instanceof Error ? err.message : 'AI评价失败';
    return NextResponse.json({ code: 1, message }, { status: 500 });
  }
}

/**
 * Extract score from AI response content
 * Matches patterns like "综合评分：8分", "综合评分：8.5分", or just "8分" at the end
 */
function extractScore(content: string): string {
  // Try to match "综合评分：X分" pattern
  const match = content.match(/综合评分[：:]\s*(\d+(?:\.\d+)?)\s*分/);
  if (match) {
    const num = parseFloat(match[1]);
    // Clamp to 0-10 and round to 1 decimal
    const clamped = Math.min(10, Math.max(0, num));
    return clamped % 1 === 0 ? clamped.toFixed(0) : clamped.toFixed(1);
  }

  // Fallback: try to find any number followed by "分" in the last few lines
  const lines = content.trim().split('\n');
  const lastLines = lines.slice(-3);
  for (const line of lastLines) {
    const fallbackMatch = line.match(/(\d+(?:\.\d+)?)\s*分/);
    if (fallbackMatch) {
      const num = parseFloat(fallbackMatch[1]);
      const clamped = Math.min(10, Math.max(0, num));
      return clamped % 1 === 0 ? clamped.toFixed(0) : clamped.toFixed(1);
    }
  }

  return '0';
}
