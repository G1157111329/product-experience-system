import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { invokeConfiguredAI, getImageUrlsForAI, type MessageContentPart } from '@/lib/server/ai';
import { getActiveSkillVersion } from '@/lib/server/agent-skills';
import { getDefaultSkillDefinitions, renderPromptTemplate } from '@/lib/agent-skills';

// POST /api/issue-re-evaluations/[id]/ai-evaluate — AI evaluate a re-evaluation
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const client = getSupabaseClient();

  try {
    // Fetch re-evaluation data
    const { data: reEval, error: reEvalError } = await client
      .from('issue_re_evaluations')
      .select('*')
      .eq('id', id)
      .single();

    if (reEvalError || !reEval) {
      return NextResponse.json({ code: 1, message: '复评估记录不存在' }, { status: 404 });
    }

    // Fetch related issue for context
    const { data: issue } = await client
      .from('issues')
      .select('title, level, source, source_type, category')
      .eq('id', reEval.issue_id)
      .single();

    // Fetch materials for this re-evaluation
    const { data: materials } = await client
      .from('materials')
      .select('*')
      .eq('re_evaluation_id', id);

    const mats = materials || [];

    if (!reEval.description && mats.length === 0) {
      return NextResponse.json({ code: 1, message: '请先填写复评估描述或上传附件素材' }, { status: 400 });
    }

    // Read custom prompt from skill template, fallback to built-in default
    const activeSkill = await getActiveSkillVersion(client, 'effect_evaluation');
    const defaultSkill = getDefaultSkillDefinitions().find(s => s.skillKey === 'effect_evaluation');

    const defaultSystemPrompt = `你是一位资深产品体验专家和美食评委。你需要根据提供的功能效果复测描述和照片，从以下四个维度进行专业评估，但最终只输出一份综合评价。

【评价维度（内部参考框架）】

1. 质感（Texture & Form）
食材经加工后最终呈现的物理形态与口腔触感。关注"细/弹/蓬/脆"等目标质构是否达成，以及形态的完整性或重构程度。

2. 透彻（Thoroughness & Flavor）
热能转化或物理作用是否彻底达到"恰好"状态。涵盖熟化程度、生味的去除、香气的激发以及有无焦苦等负面风味。

3. 纯净（Purity & Cleanliness）
成品中不应存在的多余物是否被有效控制或清除。残渣、沉淀、粘锅焦糊、皮籽残留、浮沫等接近"零"的程度。

4. 恒定（Stability & Consistency）
成品在不同时间、温度、批次下保持理想状态的稳定性。关注分层沉淀、出水、口感衰减、温度均匀性及批次一致性。

【输出格式要求 - 严格遵守】
请从以上四个维度综合考量后，输出一份简洁专业的评价。严格按照以下JSON格式输出，不要添加任何其他文字：

{
  "score": 数字0-10（综合评分，取整数或一位小数）,
  "summary": "综合评价，2-4句话概括复测的效果整体表现，指出改善情况和仍存在的问题"
}`;

    const systemPrompt = activeSkill
      ? String(activeSkill.version.system_prompt || defaultSkill?.systemPrompt || defaultSystemPrompt)
      : (defaultSkill?.systemPrompt || defaultSystemPrompt);

    // Build user prompt from template
    const userPromptTemplate = activeSkill
      ? String(activeSkill.version.user_prompt_template || defaultSkill?.userPromptTemplate || '')
      : (defaultSkill?.userPromptTemplate || '');

    // Build context for template rendering
    let reEvalSnapshot = '';
    if (issue) {
      reEvalSnapshot += `原始问题：${issue.title}\n`;
      if (issue.level) reEvalSnapshot += `问题等级：${issue.level}\n`;
      if (issue.category) reEvalSnapshot += `分类：${issue.category}\n`;
    }
    reEvalSnapshot += `复测描述：${reEval.description || '（无描述）'}\n`;

    const userPromptText = userPromptTemplate
      ? renderPromptTemplate(userPromptTemplate, { recipe_snapshot: reEvalSnapshot })
      : `${reEvalSnapshot}\n请从质感、透彻、纯净、恒定四个维度综合考量复测效果，给出整体评分和评价。`;

    // Build content parts
    const contentParts: MessageContentPart[] = [];
    contentParts.push({ type: 'text', text: userPromptText });

    // Add image materials (presign S3 keys to http URLs for AI vision model)
    const imageUrls = await getImageUrlsForAI(mats);
    for (const url of imageUrls) {
      contentParts.push({
        type: 'image_url' as const,
        image_url: { url, detail: 'high' as const },
      });
    }

    const aiContent = await invokeConfiguredAI({
      client,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: contentParts },
      ],
      defaultTemperature: 0.7,
      maxTokens: 2000,
    });

    // Parse result
    const parsedResult = parseAiResult(aiContent);
    const overallScore = String(parsedResult.score);

    // Save AI result to re-evaluation
    await client.from('issue_re_evaluations').update({
      ai_result: parsedResult,
    }).eq('id', id);

    return NextResponse.json({
      code: 0,
      message: 'AI评价完成',
      data: { result: parsedResult, score: overallScore, rawContent: aiContent },
    });
  } catch (err) {
    console.error('[issue-re-eval-ai] Error:', err);
    const message = err instanceof Error ? err.message : 'AI评价失败';
    return NextResponse.json({ code: 1, message }, { status: 500 });
  }
}

interface AiEvaluationResult {
  score: number;
  summary: string;
}

function parseAiResult(content: string): AiEvaluationResult {
  const defaultResult: AiEvaluationResult = { score: 0, summary: '' };
  try {
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