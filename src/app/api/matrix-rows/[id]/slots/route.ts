import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { canAccessAssembly, isAuthResponse, requireUser } from '@/lib/server/auth';
import { writeSecurityAudit } from '@/lib/server/security-audit';

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
 * 乐观锁：config 中维护一个 `_slot_version` 计数器，每次写入自增。若请求体
 * 携带 `version` 且与当前 `_slot_version` 不匹配，返回 409 MATRIX_VERSION_CONFLICT；
 * 若未携带 `version`，则跳过检查（last-write-wins）。
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

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
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
      { code: 1, message: '该端点仅支持 item/condition 行' },
      { status: 409 },
    );
  }

  const body = (await request.json().catch(() => ({}))) as UpdateSlotsBody;
  const currentConfig = ((row as { config?: Record<string, unknown> }).config ?? {}) as Record<
    string,
    unknown
  >;

  // 乐观锁：读取/初始化 _slot_version，比对请求体中的 version。
  const currentVersionRaw = currentConfig._slot_version;
  const currentVersion = typeof currentVersionRaw === 'number' ? currentVersionRaw : 0;
  if (typeof body.version === 'number' && body.version !== currentVersion) {
    return NextResponse.json(
      {
        code: 1,
        message: '槽位版本冲突，请刷新后重试',
        data: { code: 'MATRIX_VERSION_CONFLICT', currentVersion, expectedVersion: body.version },
      },
      { status: 409 },
    );
  }

  // 合并槽位字段。
  const newConfig: Record<string, unknown> = { ...currentConfig };
  if (body.result && typeof body.result === 'object') {
    const r = body.result;
    if ('status' in r) {
      newConfig.result_status = isNonEmptyString(r.status) ? r.status!.trim() : newConfig.result_status;
    }
    if ('summary' in r) {
      newConfig.result_summary = isNonEmptyString(r.summary) ? r.summary!.trim() : newConfig.result_summary;
    }
  }
  if (body.process && typeof body.process === 'object') {
    // process.note 缺省/空串 → 清空（写 null），与"未提供 note 键"区分开。
    if ('note' in body.process) {
      newConfig.process_note = isNonEmptyString(body.process.note)
        ? body.process.note!.trim()
        : null;
    }
  }

  const newSlotVersion = currentVersion + 1;
  newConfig._slot_version = newSlotVersion;

  const { error: updateErr } = await client
    .from('comparison_item_nodes')
    .update({ config: newConfig })
    .eq('id', rowId);
  if (updateErr) {
    return NextResponse.json({ code: 1, message: updateErr.message }, { status: 500 });
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
      version: newSlotVersion,
      fields: {
        resultStatus: body.result && 'status' in body.result,
        resultSummary: body.result && 'summary' in body.result,
        processNote: body.process && 'note' in body.process,
      },
    },
  });

  return NextResponse.json({
    code: 0,
    message: 'success',
    data: { rowId, version: newSlotVersion },
  });
}
