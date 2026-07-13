import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { invokeConfiguredAI, getImageUrlsForAI, type MessageContentPart } from '@/lib/server/ai';
import { getActiveSkillVersion } from '@/lib/server/agent-skills';
import { getDefaultSkillDefinitions, renderPromptTemplate } from '@/lib/agent-skills';
import { canAccessIssue, canAccessIssueReEvaluation, isAuthResponse, requireUser } from '@/lib/server/auth';

type Row = Record<string, unknown>;
type AiMaterial = Row & { material_type: string; file_url?: string | null; file_path?: string | null };

function parseSummary(content: string): string {
  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (typeof parsed.summary === 'string' && parsed.summary.trim()) return parsed.summary.trim();
    }
  } catch {
    // Fall through to plain-text compatibility.
  }
  return content.trim();
}

// AI only produces draft wording. It never saves a score, result, or issue status.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const client = getSupabaseClient();
  const user = await requireUser(request, client);
  if (isAuthResponse(user)) return user;

  try {
    const body = await request.json().catch(() => ({})) as Row;
    const draftMode = body.mode === 'draft';
    let description = typeof body.description === 'string' ? body.description.trim() : '';
    let issue: Row | null = null;
    let materials: AiMaterial[] = [];

    if (draftMode) {
      if (!(await canAccessIssue(client, user, id))) {
        return NextResponse.json({ code: 1, message: '无权评价该问题复测' }, { status: 403 });
      }
      const { data } = await client.from('issues')
        .select('title, level, source, source_type, category, task_id')
        .eq('id', id)
        .single();
      issue = data;
      if (!issue) return NextResponse.json({ code: 1, message: '问题不存在' }, { status: 404 });
      const materialIds = Array.isArray(body.material_ids)
        ? body.material_ids.filter((materialId): materialId is string => typeof materialId === 'string')
        : [];
      if (materialIds.length > 0 && issue?.task_id) {
        const { data: selectedMaterials } = await client.from('materials')
          .select('*')
          .in('id', materialIds)
          .eq('task_id', issue.task_id);
        materials = (selectedMaterials || []) as AiMaterial[];
      }
    } else {
      if (!(await canAccessIssueReEvaluation(client, user, id))) {
        return NextResponse.json({ code: 1, message: '无权评价该问题复测' }, { status: 403 });
      }
      const { data: reEvaluation, error } = await client.from('issue_re_evaluations')
        .select('*')
        .eq('id', id)
        .single();
      if (error || !reEvaluation) {
        return NextResponse.json({ code: 1, message: '复测记录不存在' }, { status: 404 });
      }
      if (!description) description = String(reEvaluation.description || '').trim();
      const { data: issueData } = await client.from('issues')
        .select('title, level, source, source_type, category, task_id')
        .eq('id', reEvaluation.issue_id)
        .single();
      issue = issueData;
      if (!issue) return NextResponse.json({ code: 1, message: '问题不存在' }, { status: 404 });
      const requestedIds = Array.isArray(body.material_ids)
        ? body.material_ids.filter((materialId): materialId is string => typeof materialId === 'string')
        : [];
      const materialQuery = client.from('materials').select('*');
      const { data: selectedMaterials } = requestedIds.length > 0
        ? await materialQuery.in('id', requestedIds).eq('task_id', issue?.task_id)
        : await materialQuery.eq('re_evaluation_id', id);
      materials = (selectedMaterials || []) as AiMaterial[];
    }

    if (!description && materials.length === 0) {
      return NextResponse.json({ code: 1, message: '请先填写复测描述或选择素材' }, { status: 400 });
    }

    const activeSkill = await getActiveSkillVersion(client, 'effect_evaluation');
    const defaultSkill = getDefaultSkillDefinitions().find((skill) => skill.skillKey === 'effect_evaluation');
    const defaultSystemPrompt = `你是一位资深产品体验专家。请根据复测描述和图片生成2至4句话的专业综合评价。只输出JSON：{"summary":"评价文字"}。不要输出分数，不要判断合格、不合格或待定。`;
    const configuredSystemPrompt = activeSkill
      ? String(activeSkill.version.system_prompt || defaultSkill?.systemPrompt || defaultSystemPrompt)
      : (defaultSkill?.systemPrompt || defaultSystemPrompt);
    const systemPrompt = `${configuredSystemPrompt}\n\n硬性要求：只生成评价描述文字；不得给出分数，也不得替用户选择合格、不合格或待定。输出JSON仅允许summary字段。`;
    const userPromptTemplate = activeSkill
      ? String(activeSkill.version.user_prompt_template || defaultSkill?.userPromptTemplate || '')
      : (defaultSkill?.userPromptTemplate || '');

    let snapshot = '';
    if (issue) {
      snapshot += `原始问题：${String(issue.title || '')}\n`;
      if (issue.level) snapshot += `问题等级：${String(issue.level)}\n`;
      if (issue.category) snapshot += `分类：${String(issue.category)}\n`;
    }
    snapshot += `复测描述：${description || '（无描述）'}\n`;
    const userPrompt = userPromptTemplate
      ? renderPromptTemplate(userPromptTemplate, { recipe_snapshot: snapshot })
      : `${snapshot}\n请生成可直接填入评价描述框的综合评价文字，不要给出分数或结果判断。`;

    const content: MessageContentPart[] = [{ type: 'text', text: userPrompt }];
    for (const url of await getImageUrlsForAI(materials)) {
      content.push({ type: 'image_url', image_url: { url, detail: 'high' } });
    }
    const aiContent = await invokeConfiguredAI({
      client,
      messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content }],
      defaultTemperature: 0.7,
      maxTokens: 800,
    });
    const summary = parseSummary(aiContent);
    if (!summary) return NextResponse.json({ code: 1, message: 'AI未返回评价文字' }, { status: 502 });
    return NextResponse.json({ code: 0, message: 'AI评价完成', data: { summary } });
  } catch (error) {
    console.error('[issue-retest-ai] Error:', error);
    return NextResponse.json({ code: 1, message: error instanceof Error ? error.message : 'AI评价失败' }, { status: 500 });
  }
}
