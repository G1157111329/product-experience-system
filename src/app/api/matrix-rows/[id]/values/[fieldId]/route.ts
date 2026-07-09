import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { isAuthResponse, requireUser } from '@/lib/server/auth';
import { updateFieldValue } from '@/lib/matrix/value-service';

/** PATCH /api/matrix-rows/[id]/values/[fieldId] — update field value (PRD §12.3) */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; fieldId: string }> }) {
  const client = getSupabaseClient();
  const user = await requireUser(req, client);
  if (isAuthResponse(user)) return user;

  const { id: rowId, fieldId } = await params;
  const body = await req.json().catch(() => ({}));

  try {
    const result = await updateFieldValue(rowId, fieldId, body);
    return NextResponse.json({ code: 0, message: 'success', data: result });
  } catch (err) {
    const e = err as Error & { code?: string };
    const status = e.code === 'SAVE_409' ? 409 : e.code === 'VALUE_001' || e.code === 'VALUE_002' || e.code === 'VALUE_003' ? 400 : 500;
    return NextResponse.json({ code: 1, message: e.message }, { status });
  }
}