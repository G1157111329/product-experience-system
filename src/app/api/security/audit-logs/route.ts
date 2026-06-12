import { NextRequest, NextResponse } from 'next/server';
import { isAuthResponse, requireAdmin } from '@/lib/server/auth';
import { getSupabaseClient } from '@/storage/database/supabase-client';

export async function GET(request: NextRequest) {
  const client = getSupabaseClient();
  const admin = await requireAdmin(request, client);
  if (isAuthResponse(admin)) return admin;

  const { searchParams } = request.nextUrl;
  const action = searchParams.get('action');
  const actorUserId = searchParams.get('actor_user_id');
  const targetType = searchParams.get('target_type');
  const outcome = searchParams.get('outcome');
  const limit = Math.min(Math.max(Number(searchParams.get('limit') || 100), 1), 500);

  let query = client
    .from('security_audit_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (action) query = query.eq('action', action);
  if (actorUserId) query = query.eq('actor_user_id', actorUserId);
  if (targetType) query = query.eq('target_type', targetType);
  if (outcome) query = query.eq('outcome', outcome);

  const { data, error } = await query;
  if (error) return NextResponse.json({ code: 1, message: '审计日志查询失败' }, { status: 500 });

  return NextResponse.json({ code: 0, message: 'success', data: data || [] });
}
