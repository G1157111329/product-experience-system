import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { isAuthResponse, requireUser } from '@/lib/server/auth';
import { confirmDesignVersion } from '@/lib/matrix/design-service';

/** POST /api/matrix-design-versions/[id]/confirm — confirm design version */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const client = getSupabaseClient();
  const user = await requireUser(req, client);
  if (isAuthResponse(user)) return user;

  const { id: versionId } = await params;

  try {
    const version = await confirmDesignVersion(versionId, user.id);
    return NextResponse.json({ code: 0, message: '设计已确认', data: version });
  } catch (err) {
    const e = err as Error & { code?: string };
    return NextResponse.json({ code: 1, message: e.message }, { status: e.code === 'DESIGN_010' ? 409 : 500 });
  }
}