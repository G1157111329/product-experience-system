import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { isAuthResponse, requireAdmin } from '@/lib/server/auth';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const client = getSupabaseClient();
  const admin = await requireAdmin(request, client);
  if (isAuthResponse(admin)) return admin;

  const body = await request.json();
  const { target_user_id } = body;

  if (!target_user_id) return NextResponse.json({ code: 1, message: '缺少目标用户ID' }, { status: 400 });

  const { data: targetUser } = await client.from('platform_users').select('id, name').eq('id', target_user_id).maybeSingle();
  if (!targetUser) return NextResponse.json({ code: 1, message: '目标用户不存在' }, { status: 404 });

  const { data: task } = await client.from('experience_tasks').select('id, created_by').eq('id', id).maybeSingle();
  if (!task) return NextResponse.json({ code: 1, message: '任务不存在' }, { status: 404 });
  if (task.created_by === target_user_id) {
    return NextResponse.json({ code: 1, message: '目标用户已是该体验计划当前归属人' }, { status: 400 });
  }

  const { error: taskError } = await client.from('experience_tasks').update({ created_by: target_user_id }).eq('id', id);
  if (taskError) return NextResponse.json({ code: 1, message: '转移任务失败' }, { status: 500 });

  return NextResponse.json({ code: 0, message: `已转移给 ${targetUser.name || '目标用户'}` });
}
