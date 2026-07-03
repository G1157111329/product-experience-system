import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { canAccessAssembly, isAuthResponse, requireUser } from '@/lib/server/auth';
import { writeSecurityAudit } from '@/lib/server/security-audit';
import { mergeNodeConfig } from '@/lib/matrix/slot-helpers';

/**
 * 数据矩阵 - 记录行元数据 PATCH (Task 7 / Data Matrix Input View)
 *
 * PATCH /api/matrix-rows/[id]
 * 更新某记录行的主体标签/键、排序。仅支持 node_type ∈ ('item','condition')。
 * 分组（section）请走 groups 端点。
 *
 * 字段映射：
 *  - subjectLabel → node_label（列字段，不在 config 内）
 *  - sortOrder    → sort_order（列字段，不在 config 内）
 *  - subjectKey   → config.subject_key（jsonb，通过 mergeNodeConfig 写入）
 *
 * 重要（并发）：subjectKey 走 mergeNodeConfig，因此它会读取当前 config、仅浅合并
 * subject_key、自增 _slot_version 后写回。这确保元数据 PATCH 不会整体覆写 config
 * 从而吞掉并发写入的 result_status / result_summary / process_note 槽位字段，也使
 * 本端点参与与 /api/matrix-rows/[id]/slots 相同的 _slot_version 协议。
 *
 * 副作用：本端点的成功写会自增 _slot_version，即便前端未传 version。前端在元数据
 * 编辑完成后应刷新其持有的槽位版本，否则下一次槽位写可能因版本不匹配而 409。
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

  // 解析行所在组装与节点类型（鉴权 + 类型校验）。
  const { data: row, error: rowErr } = await client
    .from('comparison_item_nodes')
    .select('assembly_id, node_type')
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

  // 构建仅 config-affecting 的 partial（只有 subjectKey 落在 config 上）。
  const configPartial: Record<string, unknown> = {};
  if (typeof body.subjectKey === 'string' && body.subjectKey.trim()) {
    configPartial.subject_key = body.subjectKey.trim();
  }

  // 单独更新 node_label / sort_order（这些不在 config 内）。
  const nodeUpdate: Record<string, unknown> = {};
  if (typeof body.subjectLabel === 'string' && body.subjectLabel.trim()) {
    nodeUpdate.node_label = body.subjectLabel.trim();
  }
  if (typeof body.sortOrder === 'number' && Number.isFinite(body.sortOrder)) {
    nodeUpdate.sort_order = body.sortOrder;
  }

  if (Object.keys(configPartial).length === 0 && Object.keys(nodeUpdate).length === 0) {
    return NextResponse.json(
      { code: 1, message: '没有可更新的字段' },
      { status: 400 },
    );
  }

  let configVersion: number | undefined;
  const touchedFields: string[] = [];

  if (Object.keys(configPartial).length > 0) {
    let result;
    try {
      result = await mergeNodeConfig(client, { rowId, partial: configPartial });
    } catch (err) {
      const message = err instanceof Error ? err.message : '元数据更新失败';
      return NextResponse.json({ code: 1, message }, { status: 500 });
    }
    if (!result.ok) {
      return NextResponse.json(
        {
          code: 1,
          message: '版本冲突，请刷新后重试',
          data: { code: result.code, currentVersion: result.currentVersion },
        },
        { status: 409 },
      );
    }
    configVersion = result.newVersion;
    touchedFields.push(...Object.keys(configPartial));
  }

  if (Object.keys(nodeUpdate).length > 0) {
    const { error: nuErr } = await client
      .from('comparison_item_nodes')
      .update(nodeUpdate)
      .eq('id', rowId);
    if (nuErr) {
      return NextResponse.json({ code: 1, message: nuErr.message }, { status: 500 });
    }
    touchedFields.push(...Object.keys(nodeUpdate));
  }

  await writeSecurityAudit(client, {
    request,
    actor: user,
    action: 'matrix_row.updated',
    outcome: 'success',
    targetType: 'comparison_item_node',
    targetId: rowId,
    metadata: { assemblyId, fields: touchedFields, slotVersion: configVersion },
  });

  return NextResponse.json({
    code: 0,
    message: 'success',
    data: { rowId, version: configVersion },
  });
}
