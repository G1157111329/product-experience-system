import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const client = getSupabaseClient();

  const { data: task, error: taskError } = await client
    .from('experience_tasks')
    .select('*')
    .eq('id', id)
    .single();

  if (taskError) return NextResponse.json({ code: 1, message: taskError.message }, { status: 404 });

  // 获取关联的检查记录
  const { data: records, error: recordsError } = await client
    .from('check_records')
    .select('*')
    .eq('task_id', id)
    .order('sort_order', { ascending: true });

  if (recordsError) return NextResponse.json({ code: 1, message: recordsError.message }, { status: 500 });

  // 获取关联的问题
  const { data: issues, error: issuesError } = await client
    .from('issues')
    .select('*')
    .eq('task_id', id)
    .order('created_at', { ascending: false });

  if (issuesError) return NextResponse.json({ code: 1, message: issuesError.message }, { status: 500 });

  return NextResponse.json({
    code: 0,
    message: 'success',
    data: { ...task, records: records || [], issues: issues || [] },
  });
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const client = getSupabaseClient();
  const body = await request.json();

  const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };
  const allowedFields = [
    'task_name', 'product_category', 'product', 'product_model', 'project_type', 'project_phase',
    'test_date', 'organizer', 'target_user', 'test_purpose', 'test_method',
    'assigned_to', 'selected_standards', 'status',
  ];

  for (const field of allowedFields) {
    if (body[field] !== undefined) updateData[field] = body[field];
  }

  const { data, error } = await client
    .from('experience_tasks')
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
  const { error } = await client.from('experience_tasks').delete().eq('id', id);
  if (error) return NextResponse.json({ code: 1, message: error.message }, { status: 500 });
  return NextResponse.json({ code: 0, message: '删除成功' });
}
