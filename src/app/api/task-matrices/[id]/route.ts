import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { canAccessAssembly, isAuthResponse, requireUser } from '@/lib/server/auth';
import { buildMatrixReadProjection } from '@/lib/matrix/projection';

/**
 * 数据矩阵 - 投影读取 API (Task 7 / Data Matrix Input View)
 *
 * GET /api/task-matrices/[id]
 * 返回指定 data_matrix 实例的窗口化读投影（结构化 DTO），供前端矩阵网格渲染。
 * [id] 为 comparison_assemblies 中 matrix_role='data_matrix' 的 assembly_id。
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const client = getSupabaseClient();
  const user = await requireUser(request, client);
  if (isAuthResponse(user)) return user;

  const { id } = await params;
  if (!(await canAccessAssembly(client, user, id))) {
    return NextResponse.json({ code: 1, message: '无权访问该矩阵' }, { status: 403 });
  }

  try {
    const projection = await buildMatrixReadProjection(client, id, { userId: user.id });
    return NextResponse.json({ code: 0, message: 'success', data: projection });
  } catch (err) {
    return NextResponse.json(
      { code: 1, message: err instanceof Error ? err.message : '加载矩阵失败' },
      { status: 500 },
    );
  }
}
