import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { isAuthResponse, requireUser } from '@/lib/server/auth';
import { createRow, getGroupById, getRowsByGroup } from '@/lib/matrix/group-row-service';

/** GET /api/matrix-groups/[id]/rows — list rows */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const client = getSupabaseClient();
  const user = await requireUser(_req, client);
  if (isAuthResponse(user)) return user;

  const { id: groupId } = await params;
  const rows = await getRowsByGroup(groupId);
  return NextResponse.json({ code: 0, message: 'success', data: rows });
}

/** POST /api/matrix-groups/[id]/rows — create row */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const client = getSupabaseClient();
  const user = await requireUser(req, client);
  if (isAuthResponse(user)) return user;

  const { id: groupId } = await params;
  const body = await req.json().catch(() => ({}));
  if (!body.rowLabel?.trim()) {
    return NextResponse.json({ code: 1, message: '行名称不能为空' }, { status: 400 });
  }

  const group = await getGroupById(groupId);
  if (!group) return NextResponse.json({ code: 1, message: '分组不存在' }, { status: 404 });

  const row = await createRow(groupId, group.matrixId, body.rowLabel.trim(), body.description);
  return NextResponse.json({ code: 0, message: 'success', data: row }, { status: 201 });
}
