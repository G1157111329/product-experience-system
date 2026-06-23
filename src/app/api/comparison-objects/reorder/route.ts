import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { canAccessAssembly, isAuthResponse, requireUser } from '@/lib/server/auth';

/**
 * POST /api/comparison-objects/reorder
 * body: { assembly_id: string, ordered_ids: string[] }
 */
export async function POST(request: NextRequest) {
  const client = getSupabaseClient();
  const user = await requireUser(request, client);
  if (isAuthResponse(user)) return user;

  const body = await request.json();
  const { assembly_id, ordered_ids } = body;
  if (typeof assembly_id !== 'string' || !Array.isArray(ordered_ids)) {
    return NextResponse.json({ code: 1, message: '参数错误' }, { status: 400 });
  }
  const accessible = await canAccessAssembly(client, user, assembly_id);
  if (!accessible) {
    return NextResponse.json({ code: 1, message: '无权访问' }, { status: 403 });
  }

  for (let i = 0; i < ordered_ids.length; i++) {
    const objectId = String(ordered_ids[i]);
    await client.from('comparison_objects').update({ sort_order: i }).eq('id', objectId);
  }
  return NextResponse.json({ code: 0, message: '排序成功' });
}