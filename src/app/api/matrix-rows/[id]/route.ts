import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { canAccessAssembly, isAuthResponse, requireUser } from '@/lib/server/auth';
import { writeSecurityAudit } from '@/lib/server/security-audit';

/**
 * 数据矩阵 - 记录行元数据 PATCH (Task 7 / Data Matrix Input View)
 *
 * PATCH /api/matrix-rows/[id]
 * 更新某记录行的主体标签/键、排序。仅支持 node_type ∈ ('item','condition')。
 * 分组（section）请走 groups 端点。
 *
 * Body: { subjectLabel?: string; subjectKey?: string; sortOrder?: number }
 */

interface UpdateRowBody {
  subjectLabel?: string;
  subjectKey?: string;
  sortOrder?: number;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const client = getSupabaseClient();
  const user = await requireUser(request, client);
  if (isAuthResponse(user)) return user;

  const { id: rowId } = await params;

  // 解析行所在组装、节点类型与当前 config。
  const { data: row, error: rowErr } = await client
    .from('comparison_item_nodes')
    .select('assembly_id, node_type, config')
    .eq('id', rowId)
    .maybeSingle();
  if (rowErr) {
    return NextResponse.json({ code: 1, message: rowErr.message }, { status: 500 });
  }
  if (!row) {
    return NextResponse.json({ code: 1, message: '未找到记录行' }, { status: 404 });
  }

  const assemblyId = String((row as { assembly_id: string }).assembly_id);
  if (!(await canAccessAssembly(client, user, assemblyId))) {
    return NextResponse.json({ code: 1, message: '无权访问该矩阵' }, { status: 403 });
  }

  const nodeType = String((row as { node_type?: string }).node_type ?? '');
  if (nodeType !== 'item' && nodeType !== 'condition') {
    return NextResponse.json(
      { code: 1, message: '该端点仅支持 item/condition 行；分组请走 groups 端点' },
      { status: 409 },
    );
  }

  const body = (await request.json().catch(() => ({}))) as UpdateRowBody;
  const updatePayload: Record<string, unknown> = {};
  const currentConfig = ((row as { config?: Record<string, unknown> }).config ?? {}) as Record<
    string,
    unknown
  >;
  let touchedConfig = false;

  if (typeof body.subjectLabel === 'string' && body.subjectLabel.trim()) {
    updatePayload.node_label = body.subjectLabel.trim();
  }
  if (typeof body.subjectKey === 'string' && body.subjectKey.trim()) {
    currentConfig.subject_key = body.subjectKey.trim();
    touchedConfig = true;
  }
  if (typeof body.sortOrder === 'number' && Number.isFinite(body.sortOrder)) {
    updatePayload.sort_order = body.sortOrder;
  }
  if (touchedConfig) {
    updatePayload.config = currentConfig;
  }

  if (Object.keys(updatePayload).length === 0) {
    return NextResponse.json(
      { code: 1, message: '没有可更新的字段' },
      { status: 400 },
    );
  }

  const { error: updateErr } = await client
    .from('comparison_item_nodes')
    .update(updatePayload)
    .eq('id', rowId);
  if (updateErr) {
    return NextResponse.json({ code: 1, message: updateErr.message }, { status: 500 });
  }

  await writeSecurityAudit(client, {
    request,
    actor: user,
    action: 'matrix_row.updated',
    outcome: 'success',
    targetType: 'comparison_item_node',
    targetId: rowId,
    metadata: { assemblyId, fields: Object.keys(updatePayload) },
  });

  return NextResponse.json({
    code: 0,
    message: 'success',
    data: { rowId },
  });
}
