import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

// POST: Transfer a task (and all its content) from one user to another
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const client = getSupabaseClient();
  const body = await request.json();
  const { target_user_id, admin_user_id } = body;

  if (!target_user_id) return NextResponse.json({ code: 1, message: '缺少目标用户ID' }, { status: 400 });

  // Verify admin
  if (admin_user_id) {
    const { data: admin } = await client.from('platform_users').select('role, name').eq('id', admin_user_id).maybeSingle();
    if (!admin || admin.role !== 'admin') return NextResponse.json({ code: 1, message: '无权限' }, { status: 403 });
  }

  // Verify target user exists
  const { data: targetUser } = await client.from('platform_users').select('id, name').eq('id', target_user_id).maybeSingle();
  if (!targetUser) return NextResponse.json({ code: 1, message: '目标用户不存在' }, { status: 400 });

  // Verify task exists
  const { data: task } = await client.from('experience_tasks').select('id, created_by').eq('id', id).maybeSingle();
  if (!task) return NextResponse.json({ code: 1, message: '任务不存在' }, { status: 404 });

  if (task.created_by === target_user_id) return NextResponse.json({ code: 1, message: '目标用户与当前用户相同' }, { status: 400 });

  // Update task's created_by
  const { error: taskError } = await client.from('experience_tasks').update({ created_by: target_user_id }).eq('id', id);
  if (taskError) return NextResponse.json({ code: 1, message: taskError.message }, { status: 500 });

  // Materials are linked to task_id, so they automatically move with the task
  // Check records are linked to task_id, so they automatically move with the task
  // Recipes are linked to task_id, so they automatically move with the task

  return NextResponse.json({ code: 0, message: `已转移到 ${targetUser.name || '目标用户'}` });
}
