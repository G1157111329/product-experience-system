import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { isAuthResponse, requireUser } from '@/lib/server/auth';
import { updateRow } from '@/lib/matrix/group-row-service';

/** PATCH /api/matrix-rows/[id] — update row */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const client = getSupabaseClient();
  const user = await requireUser(req, client);
  if (isAuthResponse(user)) return user;

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const row = await updateRow(id, body);
  return NextResponse.json({ code: 0, message: 'success', data: row });
}