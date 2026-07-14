import { NextRequest, NextResponse } from 'next/server';
import { canAccessAssembly, isAuthResponse, requireUser } from '@/lib/server/auth';
import { invokeConfiguredAI } from '@/lib/server/ai';
import { getSupabaseClient } from '@/storage/database/supabase-client';

type Row = Record<string, unknown>;

function rows(value: unknown): Row[] {
  return Array.isArray(value) ? value as Row[] : [];
}

/**
 * Generates only the text for a comparison category summary. The client keeps
 * ownership of the draft and its normal blur autosave flow.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const client = getSupabaseClient();
  const user = await requireUser(request, client);
  if (isAuthResponse(user)) return user;

  const { id } = await params;
  const { data: node, error: nodeError } = await client
    .from('comparison_item_nodes')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (nodeError) return NextResponse.json({ code: 1, message: nodeError.message || '读取小结失败' }, { status: 500 });
  if (!node?.assembly_id || node.node_type !== 'summary') {
    return NextResponse.json({ code: 1, message: '小结不存在' }, { status: 404 });
  }

  const assemblyId = String(node.assembly_id);
  if (!(await canAccessAssembly(client, user, assemblyId))) {
    return NextResponse.json({ code: 1, message: '无权访问' }, { status: 403 });
  }

  const [assemblyResult, objectsResult, categoryItemsResult] = await Promise.all([
    client.from('comparison_assemblies').select('*').eq('id', assemblyId).maybeSingle(),
    client.from('comparison_objects').select('*').eq('assembly_id', assemblyId).order('sort_order', { ascending: true }),
    client.from('comparison_item_nodes').select('id, node_label, node_type').eq('assembly_id', assemblyId).eq('parent_id', node.parent_id || ''),
  ]);
  if (assemblyResult.error || objectsResult.error || categoryItemsResult.error) {
    return NextResponse.json({ code: 1, message: '读取对比矩阵数据失败' }, { status: 500 });
  }
  const itemIds = rows(categoryItemsResult.data)
    .filter((item) => item.node_type !== 'summary')
    .map((item) => String(item.id || ''))
    .filter(Boolean);
  const cellsResult = itemIds.length > 0
    ? await client.from('comparison_matrix_cells').select('*').eq('assembly_id', assemblyId).in('item_node_id', itemIds)
    : { data: [], error: null };
  if (cellsResult.error) return NextResponse.json({ code: 1, message: '读取对比矩阵数据失败' }, { status: 500 });

  const snapshot = {
    assembly: assemblyResult.data,
    category: {
      label: node.node_label,
      parent_id: node.parent_id,
      items: rows(categoryItemsResult.data).filter((item) => item.node_type !== 'summary'),
    },
    objects: rows(objectsResult.data).map((item) => ({
      id: item.id,
      name: item.object_name,
      model: item.model,
    })),
    cells: rows(cellsResult.data).map((cell) => ({
      object_id: cell.object_id,
      params: cell.params || {},
      process_notes: cell.process_notes || [],
      effect_summary: cell.effect_summary || '',
      conclusion_tag: cell.conclusion_tag || '',
      problem_points: cell.problem_points || [],
    })),
  };

  try {
    const summary = (await invokeConfiguredAI({
      client,
      messages: [
        { role: 'system', content: '你是严谨的产品体验对比分析助手。只输出可直接填入大类小结输入框的中文正文，不要标题、JSON 或 Markdown。' },
        { role: 'user', content: `请基于以下对比矩阵数据，输出 2-5 句客观小结，明确差异、证据和风险（如数据不足则如实说明）：\n${JSON.stringify(snapshot)}` },
      ],
      defaultTemperature: 0.3,
      maxTokens: 700,
    })).trim();
    if (!summary) return NextResponse.json({ code: 1, message: 'AI 未返回可用小结' }, { status: 502 });
    return NextResponse.json({ code: 0, message: 'success', data: { summary } });
  } catch (error) {
    return NextResponse.json({
      code: 1,
      message: error instanceof Error ? error.message : 'AI 小结生成失败',
    }, { status: 502 });
  }
}
