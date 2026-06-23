import { NextRequest, NextResponse } from 'next/server';
import { canAccessAssembly, isAuthResponse, requireUser } from '@/lib/server/auth';
import { extractJsonObject, getImageUrlsForAI, invokeConfiguredAI, type MessageContentPart } from '@/lib/server/ai';
import { getSupabaseClient } from '@/storage/database/supabase-client';

type Row = Record<string, unknown>;

type CellAiOutput = {
  score: number | null;
  summary: string;
  conclusion_tag: string;
  problem_points: string[];
  confidence: string;
};

function asRows(value: unknown): Row[] {
  return Array.isArray(value) ? value as Row[] : [];
}

function normalizeList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => typeof item === 'string' ? item : JSON.stringify(item)).filter(Boolean);
}

function normalizeScore(value: unknown) {
  const score = Number(value);
  if (!Number.isFinite(score)) return null;
  return Math.min(10, Math.max(0, Math.round(score * 10) / 10));
}

function parseCellAiOutput(content: string): CellAiOutput {
  const parsed = extractJsonObject<Record<string, unknown>>(content, {});
  return {
    score: normalizeScore(parsed.score),
    summary: typeof parsed.summary === 'string' ? parsed.summary : '',
    conclusion_tag: typeof parsed.conclusion_tag === 'string' ? parsed.conclusion_tag : '',
    problem_points: Array.isArray(parsed.problem_points)
      ? parsed.problem_points.map((item) => String(item || '').trim()).filter(Boolean)
      : [],
    confidence: typeof parsed.confidence === 'string' ? parsed.confidence : 'medium',
  };
}

async function loadAccessibleCell(client: ReturnType<typeof getSupabaseClient>, request: NextRequest, cellId: string) {
  const user = await requireUser(request, client);
  if (isAuthResponse(user)) return { response: user };

  const { data: cell, error } = await client
    .from('comparison_matrix_cells')
    .select('*')
    .eq('id', cellId)
    .maybeSingle();
  if (error) {
    return { response: NextResponse.json({ code: 1, message: error.message || '查询单元格失败' }, { status: 500 }) };
  }
  if (!cell?.assembly_id) {
    return { response: NextResponse.json({ code: 1, message: '单元格不存在' }, { status: 404 }) };
  }

  const assemblyId = String(cell.assembly_id);
  if (!(await canAccessAssembly(client, user, assemblyId))) {
    return { response: NextResponse.json({ code: 1, message: '无权访问' }, { status: 403 }) };
  }
  return { user, cell: cell as Row, assemblyId };
}

function buildInputSnapshot(cell: Row, node: Row | null, object: Row | null, materials: Row[]) {
  const inlineMedia = materials.filter((material) => material.media_role !== 'appendix');
  const appendixMedia = materials.filter((material) => material.media_role === 'appendix');
  return {
    cell_id: cell.id,
    assembly_id: cell.assembly_id,
    item_node: node,
    object,
    params: cell.params || {},
    process_notes: normalizeList(cell.process_notes),
    effect_summary: cell.effect_summary || '',
    manual_score: cell.manual_score || null,
    conclusion_tag: cell.conclusion_tag || null,
    problem_points: normalizeList(cell.problem_points),
    media: {
      inline_media: inlineMedia,
      appendix_media: appendixMedia,
    },
  };
}

function buildPrompt(inputSnapshot: Row) {
  return `你是产品体验对比矩阵的格子级分析助手。请只分析当前单元格，不扩展到整行或整份报告。

请基于以下 JSON 输入，输出严格 JSON，不要添加解释文字：
${JSON.stringify(inputSnapshot, null, 2)}

输出格式：
{
  "score": 0-10 的数字或 null,
  "summary": "2-4 句话总结该对象在该项目下的表现、证据和差异",
  "conclusion_tag": "best | acceptable | average | risk | retest 之一",
  "problem_points": ["可人工确认的问题点"],
  "confidence": "low | medium | high"
}`;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const client = getSupabaseClient();
  const { id: cellId } = await params;
  const access = await loadAccessibleCell(client, request, cellId);
  if (access.response) return access.response;

  const { data, error } = await client
    .from('comparison_ai_results')
    .select('*')
    .eq('level', 'cell')
    .eq('target_id', cellId)
    .order('created_at', { ascending: false });
  if (error) {
    return NextResponse.json({ code: 1, message: error.message || '读取 AI 结果失败' }, { status: 500 });
  }
  return NextResponse.json({ code: 0, message: 'success', data: data || [] });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const client = getSupabaseClient();
  const { id: cellId } = await params;
  const access = await loadAccessibleCell(client, request, cellId);
  if (access.response) return access.response;

  const cell = access.cell;
  const [nodeResult, objectResult, materialsResult] = await Promise.all([
    client.from('comparison_item_nodes').select('*').eq('id', cell.item_node_id).maybeSingle(),
    client.from('comparison_objects').select('*').eq('id', cell.object_id).maybeSingle(),
    client.from('materials').select('*').eq('comparison_cell_id', cellId).order('media_display_order', { ascending: true }),
  ]);
  const materials = asRows(materialsResult.data);
  const inputSnapshot = buildInputSnapshot(cell, nodeResult.data as Row | null, objectResult.data as Row | null, materials);
  const contentParts: MessageContentPart[] = [{ type: 'text', text: buildPrompt(inputSnapshot) }];

  for (const url of await getImageUrlsForAI(materials as Array<{ file_url?: string | null; file_path?: string | null; material_type: string }>)) {
    contentParts.push({ type: 'image_url', image_url: { url, detail: 'high' } });
  }

  let aiContent = '';
  try {
    aiContent = await invokeConfiguredAI({
    client,
    messages: [
      { role: 'system', content: '你是严谨的产品体验工程分析助手，输出必须是可解析 JSON。' },
      { role: 'user', content: contentParts },
    ],
    defaultTemperature: 0.3,
    maxTokens: 1200,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Cell AI generation failed';
    return NextResponse.json({ code: 1, message }, { status: 502 });
  }
  const output = parseCellAiOutput(aiContent);

  const { data: aiResult, error } = await client
    .from('comparison_ai_results')
    .insert({
      assembly_id: access.assemblyId,
      level: 'cell',
      target_id: cellId,
      skill_key: 'comparison_cell_ai',
      input_snapshot: inputSnapshot,
      output: { ...output, raw_content: aiContent },
      status: 'generated',
      created_by: access.user.id,
    })
    .select()
    .single();
  if (error || !aiResult) {
    return NextResponse.json({ code: 1, message: error?.message || '保存 AI 结果失败' }, { status: 500 });
  }

  await client
    .from('comparison_matrix_cells')
    .update({ ai_status: 'generated', updated_at: new Date().toISOString() })
    .eq('id', cellId);

  return NextResponse.json({
    code: 0,
    message: 'Cell AI 已生成，等待人工确认',
    data: aiResult,
  });
}
