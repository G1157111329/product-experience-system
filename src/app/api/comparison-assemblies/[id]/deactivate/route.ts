import { NextRequest, NextResponse } from 'next/server';
import { canAccessAssembly, isAuthResponse, requireUser } from '@/lib/server/auth';
import { clearAndArchiveComparisonAssembly } from '@/lib/server/comparison-assembly-deactivation';
import { getSupabaseClient } from '@/storage/database/supabase-client';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const client = getSupabaseClient();
  const user = await requireUser(request, client);
  if (isAuthResponse(user)) return user;
  const { id } = await params;
  if (!(await canAccessAssembly(client, user, id))) {
    return NextResponse.json({ code: 1, message: '无权访问' }, { status: 403 });
  }
  const body = await request.json().catch(() => ({}));
  try {
    const data = await clearAndArchiveComparisonAssembly(
      id,
      typeof body.reason === 'string' && body.reason.trim() ? body.reason.trim() : 'user_clear',
    );
    if (!data) return NextResponse.json({ code: 1, message: '对比矩阵不存在' }, { status: 404 });
    return NextResponse.json({ code: 0, message: '对比矩阵已清空并停用', data });
  } catch (error) {
    return NextResponse.json({ code: 1, message: error instanceof Error ? error.message : '对比矩阵停用失败' }, { status: 500 });
  }
}
