import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { canAccessAssembly, isAuthResponse, requireUser } from '@/lib/server/auth';
import { buildMatrixReadProjection } from '@/lib/matrix/projection';

/**
 * 数据矩阵 - 提交前校验 (Task 7 / Data Matrix Input View)
 *
 * POST /api/task-matrices/[id]/validate
 * 基于读投影执行 spec §12.1 的阻塞/告警检查。第一版校验从宽：
 *   - 硬阻塞 (blocking)：必填观测维度缺失、计算指标 calculation_failed。
 *   - 警告 (warnings)：其余（如已录入指标但无结果状态）。
 *
 * 阈值检查与 result-required 标志尚未接线（第一版无阈值接线，schema 也暂无
 * result-required 字段），故这些规则在后续任务接入。
 *
 * 返回 { code:0, message:'success', data: { blocking: [...], warnings: [...] } }
 * 每条形如 { rowId, dimensionKey?, code, message }。
 *
 * 代码：
 *   - MATRIX_REQUIRED_METRIC_MISSING（阻塞）
 *   - MATRIX_CALCULATION_FAILED（阻塞）
 *   - MATRIX_RESULT_MISSING（告警）
 */

interface ValidationEntry {
  rowId: string;
  dimensionKey?: string;
  code: string;
  message: string;
}

interface ValidationResult {
  blocking: ValidationEntry[];
  warnings: ValidationEntry[];
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

  let projection;
  try {
    projection = await buildMatrixReadProjection(client, id, { userId: user.id });
  } catch (err) {
    return NextResponse.json(
      { code: 1, message: err instanceof Error ? err.message : '加载矩阵失败' },
      { status: 500 },
    );
  }

  const blocking: ValidationEntry[] = [];
  const warnings: ValidationEntry[] = [];

  // 预先索引维度：必填观测维度集合、计算维度集合。
  const requiredObservedKeys = new Set(
    projection.schema.dimensions
      .filter((d) => d.required === true && d.columnGroup === 'observed')
      .map((d) => d.dimensionKey),
  );
  const calculatedKeys = new Set(
    projection.schema.dimensions
      .filter((d) => d.columnGroup === 'calculated')
      .map((d) => d.dimensionKey),
  );

  for (const group of projection.groups) {
    for (const row of group.rows) {
      // (a) 阻塞：必填观测维度缺失（state === 'missing'）。
      for (const dimKey of requiredObservedKeys) {
        const m = row.metrics[dimKey];
        if (m && m.state === 'missing') {
          blocking.push({
            rowId: row.id,
            dimensionKey: dimKey,
            code: 'MATRIX_REQUIRED_METRIC_MISSING',
            message: `必填观测维度 "${dimKey}" 缺失`,
          });
        }
      }

      // (b) 阻塞：计算指标 calculation_failed。
      for (const dimKey of calculatedKeys) {
        const m = row.metrics[dimKey];
        if (m && m.state === 'calculation_failed') {
          blocking.push({
            rowId: row.id,
            dimensionKey: dimKey,
            code: 'MATRIX_CALCULATION_FAILED',
            message: `计算维度 "${dimKey}" 计算失败：${m.errorCode ?? '未知错误'}`,
          });
        }
      }

      // 警告：已录入任何有效指标但未填结果状态（软检查）。
      const hasAnyValue = Object.values(row.metrics).some(
        (m) => m.state === 'valid' || m.state === 'pending',
      );
      if (hasAnyValue && !row.slots.result.status) {
        warnings.push({
          rowId: row.id,
          code: 'MATRIX_RESULT_MISSING',
          message: '该行已录入指标但未填写结果状态',
        });
      }
    }
  }

  const result: ValidationResult = { blocking, warnings };
  return NextResponse.json({ code: 0, message: 'success', data: result });
}
