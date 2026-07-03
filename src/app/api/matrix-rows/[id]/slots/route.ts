import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { canAccessAssembly, isAuthResponse, requireUser } from '@/lib/server/auth';
import { writeSecurityAudit } from '@/lib/server/security-audit';
import { mergeNodeConfig } from '@/lib/matrix/slot-helpers';

/**
 * 数据矩阵 - 三槽位 PATCH (Task 7 / Data Matrix Input View)
 *
 * PATCH /api/matrix-rows/[id]/slots
 * 更新某记录行的结果槽位 (result.status / result.summary) 与处理槽位 (process.note)。
 * 仅支持 node_type ∈ ('item','condition')。
 *
 * 三槽位存储在节点 config 的 jsonb 字段上（result_status / result_summary /
 * process_note），而非 check_records —— check_records 写入推迟到后续任务。
 * projection.ts 已支持从 config 读取这些字段作为权威来源。
 *
 * 乐观锁：所有 config 写入统一走 mergeNodeConfig（见 slot-helpers.ts），该助手
 * 读取 config + _slot_version、浅合并、自增版本、写回并复读校验。若请求体携带
 * `version` 且与当前 `_slot_version` 不匹配（或在写后被并发覆盖），返回
 * 409 MATRIX_VERSION_CONFLICT；若未携带 `version`，则跳过前置检查
 * （last-write-wins），但仍会复读检测并发覆盖。
 *
 * 注意：矩阵行的元数据 PATCH（/api/matrix-rows/[id]）也通过 mergeNodeConfig
 * 写 config（subject_key），因此它同样会自增 _slot_version —— 前端在做完元数据
 * 编辑后应刷新其槽位版本，避免下一次槽位写触发 409。
 *
 * 清空语义：result.status / result.summary / process.note 均为 "提供键即写"。
 * 提供空串/缺省 → 写 null（清空），与"未提供键"区分开。
 *
 * Body: {
 *   result?: { status?: string; summary?: string };
 *   process?: { note?: string };
 *   version?: number;
 * }
 */

interface SlotResult {
  status?: string;
  summary?: string;
}
interface SlotProcess {
  note?: string;
}
interface UpdateSlotsBody {
  result?: SlotResult;
  process?: SlotProcess;
  version?: number;
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
      { code: 1, message: '该端点仅支持 item/condition 行' },
      { status: 409 },
    );
  }

  const body = (await request.json().catch(() => ({}))) as UpdateSlotsBody;

  // 仅收集"提供了键"的字段做浅合并。空串/缺省 → 清空（写 null）。
  const partial: Record<string, unknown> = {};
  if (body.result && typeof body.result === 'object') {
    const r = body.result;
    if (r.status !== undefined) partial.result_status = r.status && r.status.trim() ? r.status.trim() : null;
    if (r.summary !== undefined) partial.result_summary = r.summary && r.summary.trim() ? r.summary.trim() : null;
  }
  if (body.process && typeof body.process === 'object') {
    if (body.process.note !== undefined) {
      partial.process_note =
        body.process.note && body.process.note.trim() ? body.process.note.trim() : null;
    }
  }

  if (Object.keys(partial).length === 0) {
    return NextResponse.json({ code: 1, message: '没有可更新的槽位字段' }, { status: 400 });
  }

  let result;
  try {
    result = await mergeNodeConfig(client, {
      rowId,
      expectedVersion: typeof body.version === 'number' ? body.version : undefined,
      partial,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : '槽位更新失败';
    return NextResponse.json({ code: 1, message }, { status: 500 });
  }

  if (!result.ok) {
    return NextResponse.json(
      {
        code: 1,
        message: '槽位版本冲突，请刷新后重试',
        data: { code: result.code, currentVersion: result.currentVersion },
      },
      { status: 409 },
    );
  }

  await writeSecurityAudit(client, {
    request,
    actor: user,
    action: 'matrix_slot.updated',
    outcome: 'success',
    targetType: 'comparison_item_node',
    targetId: rowId,
    metadata: {
      assemblyId,
      version: result.newVersion,
      fields: {
        resultStatus: body.result && body.result.status !== undefined,
        resultSummary: body.result && body.result.summary !== undefined,
        processNote: body.process && body.process.note !== undefined,
      },
    },
  });

  return NextResponse.json({
    code: 0,
    message: 'success',
    data: { rowId, version: result.newVersion },
  });
}
