import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { canAccessTask, forbidden, isAuthResponse, requireUser } from '@/lib/server/auth';
import { deleteRecordAtomically, isContentDeletionForbidden } from '@/lib/server/content-delete-service';

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const client = getSupabaseClient();
  const user = await requireUser(request, client);
  if (isAuthResponse(user)) return user;
  const { data: existingRecord } = await client.from('check_records').select('task_id').eq('id', id).maybeSingle();
  if (!existingRecord?.task_id || !(await canAccessTask(client, user, String(existingRecord.task_id)))) return forbidden();

  const body = await request.json();

  const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };
  const allowedFields = [
    'evaluation_result', 'problem_description', 'measurement_value',
    'tester', 'sort_order', 'sensory_dimension', 'test_phase',
    'check_dimension', 'sub_check_dimension', 'check_item', 'check_requirement', 'check_standard',
    'standard_category', 'experience_flow', 'touch_point', 'experience_standard',
    'check_tool', 'problem_level',
  ];

  for (const field of allowedFields) {
    if (body[field] !== undefined) updateData[field] = body[field];
  }

  const { data, error } = await client
    .from('check_records')
    .update(updateData)
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ code: 1, message: error.message }, { status: 500 });

  return NextResponse.json({ code: 0, message: '更新成功', data });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const client = getSupabaseClient();
  const user = await requireUser(request, client);
  if (isAuthResponse(user)) return user;
  const { data: existingRecord } = await client.from('check_records').select('task_id').eq('id', id).maybeSingle();
  if (!existingRecord?.task_id || !(await canAccessTask(client, user, String(existingRecord.task_id)))) return forbidden();

  try {
    const deleted = await deleteRecordAtomically({ recordId: id, actorId: user.id });
    if (!deleted) return NextResponse.json({ code: 1, message: '记录不存在' }, { status: 404 });
  } catch (error) {
    if (isContentDeletionForbidden(error)) return NextResponse.json({ code: 1, message: error.message }, { status: 403 });
    return NextResponse.json({ code: 1, message: error instanceof Error ? error.message : '记录删除事务失败' }, { status: 500 });
  }
  return NextResponse.json({ code: 0, message: '删除成功' });
}
