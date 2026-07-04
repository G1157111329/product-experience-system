import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { canAccessAssembly, isAuthResponse, requireUser } from '@/lib/server/auth';
import { writeSecurityAudit } from '@/lib/server/security-audit';
import { executeBatchPaste, type BatchPasteRequest } from '@/lib/matrix/batch-paste';

/**
 * 数据矩阵 - 批量粘贴 (Task 4 / Matrix Batch Paste)
 *
 * POST /api/task-matrices/[id]/batch-commands
 * 薄封装：鉴权 + body 解析 + 调用 executeBatchPaste + 错误→HTTP 状态映射 + 审计。
 * 路由本身不实现任何 orchestrator 逻辑，只把请求转交给 executeBatchPaste。
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const client = getSupabaseClient();
  const user = await requireUser(request, client);
  if (isAuthResponse(user)) return user;

  const { id: assemblyId } = await params;
  if (!(await canAccessAssembly(client, user, assemblyId))) {
    return NextResponse.json({ code: 1, message: '无权访问该矩阵' }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as BatchPasteRequest | null;
  if (!body || !body.clientOperationId || !body.anchor || !Array.isArray(body.commands)) {
    return NextResponse.json({ code: 1, message: '请求格式不正确' }, { status: 400 });
  }

  let result;
  try {
    result = await executeBatchPaste(client, assemblyId, body, { actorId: user.id });
  } catch (err) {
    return NextResponse.json(
      { code: 1, message: err instanceof Error ? err.message : '批量粘贴失败' },
      { status: 500 },
    );
  }

  // Map validation pre-check failures to spec'd HTTP statuses.
  // executeBatchPaste returns status='failed' with all results carrying the same error.code
  // when the geometry/anchor/limit pre-check trips.
  if (result.status === 'failed' && result.results.length > 0 && result.results[0].error) {
    const code = result.results[0].error.code;
    const status =
      code === 'MATRIX_BATCH_LIMIT_EXCEEDED' ? 429 :
      code === 'MATRIX_BATCH_ANCHOR_INVALID' || code === 'MATRIX_BATCH_COMMAND_OUT_OF_RANGE' ? 422 :
      code === 'MATRIX_BATCH_INVALID_SHAPE' ? 400 :
      200; // unknown code — fall through to 200 with the failed result
    if (status !== 200) {
      return NextResponse.json(
        { code: 1, message: result.results[0].error.message || code, data: { code } },
        { status },
      );
    }
  }

  // Audit (best-effort — don't let audit failure lose the result)
  try {
    await writeSecurityAudit(client, {
      request,
      actor: user,
      action: 'matrix_batch.executed',
      outcome: 'success',
      targetType: 'comparison_assembly',
      targetId: assemblyId,
      metadata: {
        clientOperationId: body.clientOperationId,
        commandCount: body.commands.length,
        succeeded: result.results.filter((r) => r.status === 'succeeded').length,
        failed: result.results.filter((r) => r.status !== 'succeeded').length,
        status: result.status,
      },
    });
  } catch {
    /* audit failure must not lose the paste result */
  }

  // 200 for succeeded/partially_succeeded (client inspects result.status + results[]).
  return NextResponse.json({ code: 0, message: 'success', data: result });
}
