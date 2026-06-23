import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { canAccessAssembly, isAuthResponse, requireUser } from '@/lib/server/auth';

/**
 * GET /api/comparison-item-nodes?assembly_id=xxx
 * 列出某组装下的所有项目节点（按 sort_order 排序）
 */
export async function GET(request: NextRequest) {
  const client = getSupabaseClient();
  const user = await requireUser(request, client);
  if (isAuthResponse(user)) return user;

  const { searchParams } = new URL(request.url);
  const assemblyId = searchParams.get('assembly_id');
  if (!assemblyId) {
    return NextResponse.json({ code: 1, message: '请提供 assembly_id' }, { status: 400 });
  }
  const accessible = await canAccessAssembly(client, user, assemblyId);
  if (!accessible) {
    return NextResponse.json({ code: 1, message: '无权访问' }, { status: 403 });
  }

  const { data, error } = await client
    .from('comparison_item_nodes')
    .select('*')
    .eq('assembly_id', assemblyId)
    .order('sort_order', { ascending: true });

  if (error) {
    return NextResponse.json({ code: 1, message: '查询失败' }, { status: 500 });
  }
  return NextResponse.json({ code: 0, message: 'success', data });
}

/**
 * POST /api/comparison-item-nodes
 * 新增对比项目节点
 * body: {
 *   assembly_id, parent_id?, node_type, node_label,
 *   shared_recipe?, config?, depth?, is_collapsed?
 * }
 */
export async function POST(request: NextRequest) {
  const client = getSupabaseClient();
  const user = await requireUser(request, client);
  if (isAuthResponse(user)) return user;

  const body = await request.json();
  if (typeof body.assembly_id !== 'string' || typeof body.node_type !== 'string' || typeof body.node_label !== 'string') {
    return NextResponse.json({ code: 1, message: '缺少必填字段' }, { status: 400 });
  }
  const accessible = await canAccessAssembly(client, user, body.assembly_id);
  if (!accessible) {
    return NextResponse.json({ code: 1, message: '无权访问' }, { status: 403 });
  }

  // 计算 sort_order（追加到末尾）和 depth
  const { data: existing } = await client
    .from('comparison_item_nodes')
    .select('sort_order, depth')
    .eq('assembly_id', body.assembly_id)
    .order('sort_order', { ascending: false })
    .maybeSingle();
  const nextSort = (existing?.sort_order ?? -1) + 1;

  let depth = typeof body.depth === 'number' ? body.depth : 0;
  if (body.parent_id) {
    const { data: parent } = await client
      .from('comparison_item_nodes')
      .select('depth')
      .eq('id', body.parent_id)
      .maybeSingle();
    depth = (parent?.depth ?? -1) + 1;
  }

  const insertRow: Record<string, unknown> = {
    assembly_id: body.assembly_id,
    parent_id: body.parent_id ?? null,
    node_type: body.node_type, // section | item | condition | process_node | metric | summary | issue_group
    node_label: body.node_label,
    shared_recipe: body.shared_recipe ?? {},
    config: body.config ?? {},
    sort_order: nextSort,
    depth,
    is_collapsed: body.is_collapsed ?? false,
  };

  const { data, error } = await client.from('comparison_item_nodes').insert(insertRow).select().single();
  if (error) {
    return NextResponse.json({ code: 1, message: `创建失败: ${error.message}` }, { status: 500 });
  }
  return NextResponse.json({ code: 0, message: '创建成功', data });
}