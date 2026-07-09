import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { isAuthResponse, requireUser } from '@/lib/server/auth';
import { getMatrixReadProjection } from '@/lib/matrix/projection-v2';

/** GET /api/matrices/[id] — full read projection */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const client = getSupabaseClient();
  const user = await requireUser(_req, client);
  if (isAuthResponse(user)) return user;

  const { id } = await params;
  try {
    const projection = await getMatrixReadProjection(id);
    if (!projection) {
      return NextResponse.json({ code: 1, message: '矩阵不存在' }, { status: 404 });
    }
    return NextResponse.json({ code: 0, message: 'success', data: projection });
  } catch (err) {
    return NextResponse.json({ code: 1, message: (err as Error).message }, { status: 500 });
  }
}

/** PATCH /api/matrices/[id] — update name/description/comparability */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const client = getSupabaseClient();
  const user = await requireUser(req, client);
  if (isAuthResponse(user)) return user;

  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.name !== undefined) updates.name = body.name;
  if (body.description !== undefined) updates.description = body.description;
  if (body.comparabilityStatus !== undefined) updates.comparability_status = body.comparabilityStatus;
  if (body.comparabilityStatement !== undefined) updates.comparability_statement = body.comparabilityStatement;

  const { data, error } = await client.from('task_matrices').update(updates).eq('id', id).select().single();
  if (error) return NextResponse.json({ code: 1, message: error.message }, { status: 500 });

  return NextResponse.json({ code: 0, message: 'success', data });
}