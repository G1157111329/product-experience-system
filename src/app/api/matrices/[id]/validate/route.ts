import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { isAuthResponse, requireUser } from '@/lib/server/auth';
import { validateMatrix } from '@/lib/matrix/validation-service';

/** POST /api/matrices/[id]/validate — submit validation */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const client = getSupabaseClient();
  const user = await requireUser(req, client);
  if (isAuthResponse(user)) return user;

  const { id: matrixId } = await params;
  const result = await validateMatrix(matrixId, user.id);
  return NextResponse.json({ code: 0, message: result.passed ? '校验通过' : '存在阻断项', data: result });
}