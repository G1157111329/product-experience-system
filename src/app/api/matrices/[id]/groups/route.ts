import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { isAuthResponse, requireUser } from '@/lib/server/auth';
import { createGroup, getGroupsByMatrix } from '@/lib/matrix/group-row-service';

/** GET /api/matrices/[id]/groups — list groups */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const client = getSupabaseClient();
  const user = await requireUser(_req, client);
  if (isAuthResponse(user)) return user;

  const { id: matrixId } = await params;
  const groups = await getGroupsByMatrix(matrixId);
  return NextResponse.json({ code: 0, message: 'success', data: groups });
}

/** POST /api/matrices/[id]/groups — create group */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const client = getSupabaseClient();
  const user = await requireUser(req, client);
  if (isAuthResponse(user)) return user;

  const { id: matrixId } = await params;
  const body = await req.json().catch(() => ({}));
  if (!body.groupLabel?.trim()) {
    return NextResponse.json({ code: 1, message: '分组名称不能为空' }, { status: 400 });
  }

  try {
    const group = await createGroup(matrixId, body.groupLabel.trim(), body.description);
    return NextResponse.json({ code: 0, message: 'success', data: group }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ code: 1, message: (err as Error).message }, { status: 409 });
  }
}