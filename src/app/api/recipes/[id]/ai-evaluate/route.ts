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

    const model = aiConfig.model || 'kimi-k2-5-260127';
    const temperature = aiConfig.temperature ?? 0.7;

    // Build the evaluation prompt with 4-dimension framework as internal methodology
    const systemPrompt = `你是一位资深美食评委和小家电产品体验专家。你需要根据提供的食物效果描述和照片，从以下四个维度进行专业评估，但最终只输出一份综合评价。

【评价维度（内部参考框架）】

1. 质感（Texture & Form）
食材经加工后最终呈现的物理形态与口腔触感。关注"细/弹/蓬/脆"等目标质构是否达成，以及形态的完整性或重构程度。
- 破壁机：无粗颗粒，粉感细腻且不卡喉，质地均匀顺滑
- 电饭煲：米粒饱满分明或软糯粘连，弹性与硬度适中
- 电火锅：肉类嫩滑不柴，蔬菜爽脆不蔫
- 空气炸锅：外壳酥脆、内部多汁不干硬

2. 透彻（Thoroughness & Flavor）
热能转化或物理作用是否彻底达到"恰好"状态。涵盖熟化程度、生味的去除、香气的激发以及有无焦苦等负面风味。
- 破壁机：完全熟透，无生涩味、生粉味，无焦糊味
- 电饭煲：无夹生、无硬心，饭香充分释放
- 电火锅：食材快速断生无生腥，久煮汤底不变味
- 全品类：美拉德反应恰到好处，香气足、无生味、无焦败

3. 纯净（Purity & Cleanliness）
成品中不应存在的多余物是否被有效控制或清除。残渣、沉淀、粘锅焦糊、皮籽残留、浮沫等接近"零"的程度。
- 破壁机：无豆渣/玉米皮/沉淀/焦黑糊粒，出浆率高
- 电饭煲：内胆不粘、不结硬焦壳，饭粒不混入焦粒
- 电火锅：锅体不糊底、不起焦渣，汤底少浮沫、无黑渣

4. 恒定（Stability & Consistency）
成品在不同时间、温度、批次下保持理想状态的稳定性。关注分层沉淀、出水、口感衰减、温度均匀性及批次一致性。
- 破壁机：静置无明显分层、沉淀或水析
- 电饭煲：保温后不返生、不干硬，上下层口感一致
- 电火锅：火力均匀，同一锅食材不同位置受热一致
- 全品类：多次制作品质偏差小，用户可预期

【输出格式要求 - 严格遵守】
请从以上四个维度综合考量后，输出一份简洁专业的评价。严格按照以下JSON格式输出，不要添加任何其他文字：

{
  "score": 数字0-10（综合评分，取整数或一位小数）,
  "summary": "综合评价，2-4句话概括食物/功能的整体出品效果，指出亮点和可改进之处"
}`;

    // Build content parts
    const contentParts: Array<{ type: 'text' | 'image_url'; text?: string; image_url?: { url: string; detail?: 'high' | 'low' } }> = [];

    // Add description text
    let descriptionText = `食谱/功能名称：${recipe.name}\n`;
    if (recipe.ingredients) descriptionText += `食材/参数：${recipe.ingredients}\n`;
    if (recipe.effect_description) descriptionText += `效果评价描述：${recipe.effect_description}\n`;
    if (recipe.effect_problem_point) descriptionText += `已知问题点：${recipe.effect_problem_point}\n`;
    descriptionText += '\n请从质感、透彻、纯净、恒定四个维度综合考量，给出整体评分和评价。';

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

    let aiContent = '';

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
      aiContent = result.choices?.[0]?.message?.content || '';
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

      aiContent = response.content || '';
    }

    // Parse the structured AI result
    const parsedResult = parseAiResult(aiContent);
    const overallScore = String(parsedResult.score);

    // Save both score and full AI result to recipe
    await client.from('recipes').update({
      effect_score: overallScore,
      effect_ai_result: parsedResult,
      updated_at: new Date().toISOString(),
    }).eq('id', id);

    return NextResponse.json({
      code: 0,
      message: 'AI评价完成',
      data: { result: parsedResult, score: overallScore, rawContent: aiContent },
    });
  } catch (err) {
    console.error('[ai-evaluate] Error:', err);
    const message = err instanceof Error ? err.message : 'AI评价失败';
    return NextResponse.json({ code: 1, message }, { status: 500 });
  }
}

interface AiEvaluationResult {
  score: number;
  summary: string;
}

/**
 * Parse AI response content into structured evaluation result
 */
function parseAiResult(content: string): AiEvaluationResult {
  const defaultResult: AiEvaluationResult = {
    score: 0,
    summary: '',
  };

  try {
    // Try to extract JSON from the content
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return defaultResult;

    const parsed = JSON.parse(jsonMatch[0]);

    return {
      score: typeof parsed.score === 'number' ? Math.min(10, Math.max(0, Math.round(parsed.score * 10) / 10)) : 0,
      summary: typeof parsed.summary === 'string' ? parsed.summary : '',
    };
  } catch {
    return defaultResult;
  }
}
