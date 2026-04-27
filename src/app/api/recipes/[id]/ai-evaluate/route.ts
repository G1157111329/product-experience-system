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

    // Build the 4-dimension evaluation prompt
    const systemPrompt = `你是一位资深美食评委和小家电产品体验专家。你需要根据提供的食物效果描述和照片，严格按照四维评价体系进行专业评估。

【四维评价体系】

1. 质感（Texture & Form）— 满分10分
视角定义：食材经加工后最终呈现的物理形态与口腔触感。关注"细/弹/蓬/脆"等目标质构是否达成，以及形态的完整性或重构程度。
- 破壁机（豆浆/玉米汁）：无粗颗粒，粉感细腻且不卡喉，质地均匀顺滑，达到绵密丝滑的流体质感。
- 电饭煲（米饭）：米粒饱满分明或软糯粘连（按品种目标），弹性与硬度适中，无过度破碎或糊烂。
- 电火锅（涮肉/菜）：肉类嫩滑不柴，蔬菜爽脆不蔫，口感保留食材应有的质地。
- 空气炸锅（炸物）：外壳酥脆、内部多汁不干硬，表皮蓬松不僵硬。

2. 透彻（Thoroughness & Flavor）— 满分10分
视角定义：热能转化或物理作用是否彻底达到"恰好"状态。涵盖熟化程度、生味的去除、香气的激发以及有无焦苦等负面风味。
- 破壁机（玉米汁）：玉米完全熟透，淀粉充分糊化；完全无生玉米的青涩味、生粉味；无焦底带来的焦糊味。
- 电饭煲（米饭）：无夹生、无硬心，饭香充分释放；无底部过度受热导致的焦黄或锅巴异味。
- 电火锅（汤底/食材）：涮煮易熟的透彻感，食材快速断生无血水无生腥；久煮汤底不变味、不发苦。
- 烹饪全品类：加热带来的美拉德反应或甜味物质析出恰到好处，做到"香气足、无生味、无焦败"。

3. 纯净（Purity & Cleanliness）— 满分10分
视角定义：成品中不应存在的多余物是否被有效控制或清除。表现为残渣、沉淀、粘锅焦糊、皮籽残留、浮沫等的接近"零"程度，也包括目标产物高效提取、浪费少。
- 破壁机（豆浆）：无肉眼可见豆渣、硬颗粒，杯底沉渣极少；出浆率高，残渣量低，食物原料得到充分利用。
- 破壁机（玉米汁）：无玉米皮、无沉淀、无焦黑糊粒，粉碎彻底且无糊底污染。
- 电饭煲（米饭）：内胆不粘、不结硬焦壳，饭粒不混入焦粒；保温后无干结黄斑。
- 电火锅：锅体不糊底、不起焦渣；汤底少浮沫、无黑渣，涮后汤色保持干净。

4. 恒定（Stability & Consistency）— 满分10分
视角定义：成品在不同时间、温度、批次下保持理想状态的稳定性。关注分层沉淀、出水、口感衰减、温度均匀性及批次一致性。
- 破壁机（豆浆/玉米汁）：静置无明显分层、沉淀或水析；成品状态稳定。
- 电饭煲（米饭）：保温数小时后不返生、不干硬、不变色，同一锅米饭上中下层口感一致。
- 电火锅：持续沸腾期间火力均匀，不忽旺忽弱，同一锅食材不同位置受热一致。
- 所有小家电：多次制作，成品品质偏差小，用户可预期，消除"看运气"的体验。

【输出格式要求 - 严格遵守】
请严格按照以下JSON格式输出，不要添加任何其他文字：

{
  "texture": {
    "score": 数字0-10,
    "comment": "质感评价的具体说明，结合图片和描述分析"
  },
  "thoroughness": {
    "score": 数字0-10,
    "comment": "透彻评价的具体说明，结合图片和描述分析"
  },
  "purity": {
    "score": 数字0-10,
    "comment": "纯净评价的具体说明，结合图片和描述分析"
  },
  "stability": {
    "score": 数字0-10,
    "comment": "恒定评价的具体说明，结合图片和描述分析"
  },
  "overall": {
    "score": 数字0-10（四维加权平均，取整数或一位小数）,
    "summary": "综合评价总结，概括优点和改进方向"
  }
}`;

    // Build content parts
    const contentParts: Array<{ type: 'text' | 'image_url'; text?: string; image_url?: { url: string; detail?: 'high' | 'low' } }> = [];

    // Add description text
    let descriptionText = `食谱/功能名称：${recipe.name}\n`;
    if (recipe.ingredients) descriptionText += `食材/参数：${recipe.ingredients}\n`;
    if (recipe.effect_description) descriptionText += `效果评价描述：${recipe.effect_description}\n`;
    if (recipe.effect_problem_point) descriptionText += `已知问题点：${recipe.effect_problem_point}\n`;
    descriptionText += '\n请根据以上信息和附件图片，按照四维评价体系进行评估。';

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
    const overallScore = String(parsedResult.overall.score);

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

interface DimensionResult {
  score: number;
  comment: string;
}

interface AiEvaluationResult {
  texture: DimensionResult;
  thoroughness: DimensionResult;
  purity: DimensionResult;
  stability: DimensionResult;
  overall: { score: number; summary: string };
}

/**
 * Parse AI response content into structured evaluation result
 */
function parseAiResult(content: string): AiEvaluationResult {
  const defaultResult: AiEvaluationResult = {
    texture: { score: 0, comment: '' },
    thoroughness: { score: 0, comment: '' },
    purity: { score: 0, comment: '' },
    stability: { score: 0, comment: '' },
    overall: { score: 0, summary: '' },
  };

  try {
    // Try to extract JSON from the content
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return defaultResult;

    const parsed = JSON.parse(jsonMatch[0]);

    // Validate and extract each dimension
    const extractDimension = (key: string): DimensionResult => {
      const dim = parsed[key];
      if (!dim || typeof dim !== 'object') return { score: 0, comment: '' };
      return {
        score: typeof dim.score === 'number' ? Math.min(10, Math.max(0, Math.round(dim.score * 10) / 10)) : 0,
        comment: typeof dim.comment === 'string' ? dim.comment : '',
      };
    };

    const texture = extractDimension('texture');
    const thoroughness = extractDimension('thoroughness');
    const purity = extractDimension('purity');
    const stability = extractDimension('stability');

    // Overall
    let overallScore = 0;
    let overallSummary = '';
    if (parsed.overall) {
      if (typeof parsed.overall.score === 'number') {
        overallScore = Math.min(10, Math.max(0, Math.round(parsed.overall.score * 10) / 10));
      } else {
        // Calculate average from 4 dimensions
        overallScore = Math.round((texture.score + thoroughness.score + purity.score + stability.score) / 4 * 10) / 10;
      }
      overallSummary = typeof parsed.overall.summary === 'string' ? parsed.overall.summary : '';
    } else {
      overallScore = Math.round((texture.score + thoroughness.score + purity.score + stability.score) / 4 * 10) / 10;
    }

    return { texture, thoroughness, purity, stability, overall: { score: overallScore, summary: overallSummary } };
  } catch {
    // If JSON parsing fails, return default
    return defaultResult;
  }
}
