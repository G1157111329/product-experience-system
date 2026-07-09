import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { canAccessAssembly, isAuthResponse, requireUser } from '@/lib/server/auth';

type ComparisonItemNodeSortRow = {
  id: string;
  parent_id?: string | null;
  node_type?: string | null;
  depth?: number | null;
  sort_order?: number | null;
};

const COMPARISON_CHILD_ITEM_TYPES = ['item', 'condition', 'metric', 'process_node', 'issue_group'];

function numericSortOrder(node: ComparisonItemNodeSortRow | null | undefined) {
  return typeof node?.sort_order === 'number' ? node.sort_order : -1;
}

function nextTopLevelSort(nodes: ComparisonItemNodeSortRow[]) {
  return Math.max(-1, ...nodes.map(numericSortOrder)) + 1;
}

function nextChildSort(parent: ComparisonItemNodeSortRow, nodes: ComparisonItemNodeSortRow[], nodeType: string) {
  const siblings = nodes.filter((node) => node.parent_id === parent.id);
  const siblingSorts = siblings.map(numericSortOrder).filter((sort) => sort >= 0);

  if (COMPARISON_CHILD_ITEM_TYPES.includes(nodeType)) {
    const summarySorts = siblings
      .filter((node) => node.node_type === 'summary')
      .map(numericSortOrder)
      .filter((sort) => sort >= 0);
    if (summarySorts.length > 0) return Math.min(...summarySorts);
  }

  if (siblingSorts.length > 0) return Math.max(...siblingSorts) + 1;
  return numericSortOrder(parent) + 1;
}

async function shiftSortOrdersFrom(
  client: ReturnType<typeof getSupabaseClient>,
  assemblyId: string,
  nodes: ComparisonItemNodeSortRow[],
  insertionSort: number,
) {
  const affected = nodes
    .filter((node) => numericSortOrder(node) >= insertionSort)
    .sort((a, b) => numericSortOrder(b) - numericSortOrder(a));

  for (const node of affected) {
    const { error } = await client
      .from('comparison_item_nodes')
      .update({ sort_order: numericSortOrder(node) + 1, updated_at: new Date().toISOString() })
      .eq('assembly_id', assemblyId)
      .eq('id', node.id);
    if (error) throw new Error(error.message);
  }
}

async function getAssemblyNodes(client: ReturnType<typeof getSupabaseClient>, assemblyId: string) {
  const { data, error } = await client
    .from('comparison_item_nodes')
    .select('id,parent_id,node_type,depth,sort_order')
    .eq('assembly_id', assemblyId)
    .order('sort_order', { ascending: true });
  if (error) throw new Error(error.message);
  return (data || []) as ComparisonItemNodeSortRow[];
}

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

  let depth = typeof body.depth === 'number' ? body.depth : 0;
  let nextSort = 0;
  try {
    const nodes = await getAssemblyNodes(client, body.assembly_id);

    if (body.parent_id) {
      const parent = nodes.find((node) => node.id === body.parent_id) || null;
      if (!parent) {
        return NextResponse.json({ code: 1, message: '父级大类不存在' }, { status: 404 });
      }
      depth = (parent.depth ?? -1) + 1;
      nextSort = nextChildSort(parent, nodes, body.node_type);
      await shiftSortOrdersFrom(client, body.assembly_id, nodes, nextSort);
    } else {
      nextSort = nextTopLevelSort(nodes);
    }
  } catch (error) {
    return NextResponse.json({
      code: 1,
      message: `计算排序失败: ${error instanceof Error ? error.message : 'unknown'}`,
    }, { status: 500 });
  }

  const insertRow: Record<string, unknown> = {
    assembly_id: body.assembly_id,
    parent_id: body.parent_id ?? null,
    node_type: body.node_type,
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
