import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { canAccessAssembly, isAuthResponse, requireUser } from '@/lib/server/auth';
import { writeSecurityAudit } from '@/lib/server/security-audit';

/**
 * 数据矩阵 - 记录行（item 节点）CRUD (Task 7 / Data Matrix Input View)
 *
 * POST /api/task-matrices/[id]/rows
 * 在指定分组下新增一条记录行（comparison_item_nodes 中 node_type='item'，
 * parent_id 指向某 section 节点）。三槽位（result/process）初始为 null，
 * 通过 PATCH /api/matrix-rows/[id]/slots 写入。
 *
 * Body: {
 *   groupId: string;
 *   subjectKey: string;
 *   subjectLabel: string;
 *   testObjectId?: string;
 *   level3Key?: string;
 *   level3Label?: string;
 * }
 */

interface CreateRowBody {
  groupId?: string;
  subjectKey?: string;
  subjectLabel?: string;
  testObjectId?: string;
  level3Key?: string;
  level3Label?: string;
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

  const body = (await request.json().catch(() => ({}))) as CreateRowBody;
  const groupId = typeof body.groupId === 'string' ? body.groupId.trim() : '';
  const subjectKey = typeof body.subjectKey === 'string' ? body.subjectKey.trim() : '';
  const subjectLabel = typeof body.subjectLabel === 'string' ? body.subjectLabel.trim() : '';
  if (!groupId || !subjectKey || !subjectLabel) {
    return NextResponse.json(
      { code: 1, message: '缺少必填字段 (groupId/subjectKey/subjectLabel)' },
      { status: 400 },
    );
  }
  const testObjectId =
    typeof body.testObjectId === 'string' && body.testObjectId.trim()
      ? body.testObjectId.trim()
      : null;
  const level3Key =
    typeof body.level3Key === 'string' && body.level3Key.trim() ? body.level3Key.trim() : '';
  const level3Label =
    typeof body.level3Label === 'string' && body.level3Label.trim() ? body.level3Label.trim() : '';

  // 1. 校验父节点存在、属于本组装、且为 section 类型。
  const { data: parent, error: parentErr } = await client
    .from('comparison_item_nodes')
    .select('id, assembly_id, node_type')
    .eq('id', groupId)
    .maybeSingle();
  if (parentErr) {
    return NextResponse.json({ code: 1, message: parentErr.message }, { status: 500 });
  }
  if (!parent || (parent as { assembly_id?: string }).assembly_id !== id) {
    return NextResponse.json(
      { code: 1, message: '未找到分组' },
      { status: 404 },
    );
  }
  if ((parent as { node_type?: string }).node_type !== 'section') {
    return NextResponse.json(
      { code: 1, message: '父节点不是分组 (section)，无法在此新增行' },
      { status: 409 },
    );
  }

  // 2. 计算下一个 sort_order：同一父节点下 item/condition 兄弟的最大 sort_order + 1。
  //    与 comparison-item-nodes/route.ts 的 item 类型兄弟算法一致。
  const { data: sibling, error: sibErr } = await client
    .from('comparison_item_nodes')
    .select('sort_order')
    .eq('assembly_id', id)
    .eq('parent_id', groupId)
    .in('node_type', ['item', 'condition'])
    .order('sort_order', { ascending: false })
    .maybeSingle();
  if (sibErr) {
    return NextResponse.json({ code: 1, message: sibErr.message }, { status: 500 });
  }
  const nextSort = ((sibling?.sort_order as number | null) ?? -1) + 1;

  // 3. 组装 config：subject_key、可选 test_object_id、可选 level3 轴信息，
  //    三槽位初始为 null。三槽位后续由 slots 端点写入。
  const config = {
    subject_key: subjectKey,
    test_object_id: testObjectId,
    level3: level3Key ? { key: level3Key, label: level3Label } : null,
    result_status: null,
    result_summary: null,
    process_note: null,
  };

  const insertRow = {
    assembly_id: id,
    parent_id: groupId,
    node_type: 'item',
    node_label: subjectLabel,
    shared_recipe: {},
    config,
    sort_order: nextSort,
    depth: 1,
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
  const rowId = String((inserted as { id: string }).id);

  await writeSecurityAudit(client, {
    request,
    actor: user,
    action: 'matrix_row.created',
    outcome: 'success',
    targetType: 'comparison_item_node',
    targetId: rowId,
    metadata: { assemblyId: id, groupId, subjectKey },
  });

  return NextResponse.json({
    code: 0,
    message: '新增记录行成功',
    data: { rowId },
  });
}
