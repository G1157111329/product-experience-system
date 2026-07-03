import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { canAccessAssembly, isAuthResponse, requireUser } from '@/lib/server/auth';
import { writeSecurityAudit } from '@/lib/server/security-audit';

/**
 * 数据矩阵 - 分组（section）CRUD (Task 7 / Data Matrix Input View)
 *
 * POST /api/task-matrices/[id]/groups
 * 在指定矩阵下新增一个分组（comparison_item_nodes 中 node_type='section' 的顶层节点）。
 *
 * Body: { label: string; conditionSummary?: string }
 */

interface CreateGroupBody {
  label?: string;
  conditionSummary?: string;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const client = getSupabaseClient();
  const user = await requireUser(request, client);
  if (isAuthResponse(user)) return user;

  const { id } = await params;
  if (!(await canAccessAssembly(client, user, id))) {
    return NextResponse.json({ code: 1, message: '无权访问该矩阵' }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as CreateGroupBody;
  const label = typeof body.label === 'string' ? body.label.trim() : '';
  if (!label) {
    return NextResponse.json({ code: 1, message: '缺少分组名称 (label)' }, { status: 400 });
  }
  const conditionSummary =
    typeof body.conditionSummary === 'string' && body.conditionSummary.trim()
      ? body.conditionSummary.trim()
      : null;

  // 计算下一个 sort_order：取该组装下顶层 section 节点的最大 sort_order + 1。
  // 与 comparison-item-nodes/route.ts 顶层节点的算法一致（.is('parent_id', null)），
  // 但此处额外按 node_type='section' 收窄，避免与非 section 顶层节点冲突。
  const { data: lastSection, error: orderErr } = await client
    .from('comparison_item_nodes')
    .select('sort_order')
    .eq('assembly_id', id)
    .eq('node_type', 'section')
    .is('parent_id', null)
    .order('sort_order', { ascending: false })
    .maybeSingle();
  if (orderErr) {
    return NextResponse.json({ code: 1, message: orderErr.message }, { status: 500 });
  }
  const nextSort = ((lastSection?.sort_order as number | null) ?? -1) + 1;

  const insertRow = {
    assembly_id: id,
    parent_id: null,
    node_type: 'section',
    node_label: label,
    shared_recipe: {},
    config: { conditionSummary },
    sort_order: nextSort,
    depth: 0,
    is_collapsed: false,
  };

  const { data: inserted, error: insErr } = await client
    .from('comparison_item_nodes')
    .insert(insertRow)
    .select('id')
    .single();
  if (insErr) {
    return NextResponse.json({ code: 1, message: insErr.message }, { status: 500 });
  }
  const groupId = String((inserted as { id: string }).id);

  await writeSecurityAudit(client, {
    request,
    actor: user,
    action: 'matrix_group.created',
    outcome: 'success',
    targetType: 'comparison_item_node',
    targetId: groupId,
    metadata: { assemblyId: id, label },
  });

  return NextResponse.json({
    code: 0,
    message: '新增分组成功',
    data: { groupId },
  });
}
