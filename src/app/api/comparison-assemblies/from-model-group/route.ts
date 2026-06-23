import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { isAuthResponse, requireUser } from '@/lib/server/auth';
import { createAssemblyFromModelGroup } from '@/lib/server/comparison-assembly';

/**
 * POST /api/comparison-assemblies/from-model-group
 * 型号报告组生成组装（型号自动归集）
 * body: { product_model: string, name? }
 */
export async function POST(request: NextRequest) {
  const client = getSupabaseClient();
  const user = await requireUser(request, client);
  if (isAuthResponse(user)) return user;

  const body = await request.json();
  if (typeof body.product_model !== 'string' || !body.product_model.trim()) {
    return NextResponse.json({ code: 1, message: '请提供 product_model' }, { status: 400 });
  }

  try {
    const assembly = await createAssemblyFromModelGroup(client, body.product_model, {
      createdBy: user.id,
      name: body.name,
    });
    return NextResponse.json({ code: 0, message: '创建成功', data: assembly });
  } catch (err) {
    return NextResponse.json(
      { code: 1, message: err instanceof Error ? err.message : '创建失败' },
      { status: 500 }
    );
  }
}