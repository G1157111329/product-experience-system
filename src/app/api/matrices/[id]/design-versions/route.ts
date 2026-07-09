import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { isAuthResponse, requireUser } from '@/lib/server/auth';
import { createDesignVersion } from '@/lib/matrix/design-service';

/** POST /api/matrices/[id]/design-versions — create design version with sections & fields */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const client = getSupabaseClient();
  const user = await requireUser(req, client);
  if (isAuthResponse(user)) return user;

  const { id: matrixId } = await params;
  const body = await req.json().catch(() => ({}));

  try {
    const result = await createDesignVersion(matrixId, user.id, body);
    return NextResponse.json({ code: 0, message: '设计版本创建成功', data: result }, { status: 201 });
  } catch (err) {
    const e = err as Error & { code?: string };
    const status = e.code === 'DESIGN_007' ? 400 : 500;
    return NextResponse.json({ code: 1, message: e.message }, { status });
  }
}