import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { canAccessTask, forbidden, isAuthResponse, requireUser } from '@/lib/server/auth';
import { writeSecurityAudit } from '@/lib/server/security-audit';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const client = getSupabaseClient();
  const user = await requireUser(request, client);
  if (isAuthResponse(user)) return user;
  if (!(await canAccessTask(client, user, id))) return forbidden();

  const { data: task, error: taskError } = await client
    .from('experience_tasks')
    .select('*')
    .eq('id', id)
    .single();

  if (taskError) return NextResponse.json({ code: 1, message: '任务不存在' }, { status: 404 });

  const { data: records, error: recordsError } = await client
    .from('check_records')
    .select('*')
    .eq('task_id', id)
    .order('sort_order', { ascending: true });

  if (recordsError) return NextResponse.json({ code: 1, message: '检查记录查询失败' }, { status: 500 });

  const { data: materials, error: materialsError } = await client
    .from('materials')
    .select('*')
    .eq('task_id', id);

  if (materialsError) return NextResponse.json({ code: 1, message: '素材查询失败' }, { status: 500 });

  const materialsByRecordId = new Map<string, Record<string, unknown>[]>();
  for (const material of materials || []) {
    const recordId = String((material as Record<string, unknown>).record_id || '');
    if (!recordId) continue;
    const current = materialsByRecordId.get(recordId) || [];
    current.push(material as Record<string, unknown>);
    materialsByRecordId.set(recordId, current);
  }

  const recordsWithMaterials = ((records || []) as Array<Record<string, unknown>>).map((record) => ({
    ...record,
    materials: materialsByRecordId.get(String(record.id || '')) || [],
  }));

  const { data: issues, error: issuesError } = await client
    .from('issues')
    .select('*')
    .eq('task_id', id)
    .order('created_at', { ascending: false });

  if (issuesError) return NextResponse.json({ code: 1, message: '问题查询失败' }, { status: 500 });

  return NextResponse.json({
    code: 0,
    message: 'success',
    data: { ...task, records: recordsWithMaterials, issues: issues || [] },
  });
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const client = getSupabaseClient();
  const user = await requireUser(request, client);
  if (isAuthResponse(user)) return user;
  if (!(await canAccessTask(client, user, id))) return forbidden();

  const body = await request.json();
  const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };
  const allowedFields = [
    'task_name', 'product_category', 'product', 'product_model', 'project_number', 'project_type', 'project_phase',
    'test_date', 'organizer', 'target_user', 'test_purpose', 'test_method',
    'assigned_to', 'selected_standards', 'status',
  ];

  for (const field of allowedFields) {
    if (body[field] !== undefined) {
      updateData[field] = field === 'test_date' && body[field] === '' ? null : body[field];
    }
  }

  const { data, error } = await client
    .from('experience_tasks')
    .update(updateData)
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ code: 1, message: '更新失败' }, { status: 500 });
  return NextResponse.json({ code: 0, message: '更新成功', data });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const client = getSupabaseClient();
  const user = await requireUser(request, client);
  if (isAuthResponse(user)) return user;
  if (!(await canAccessTask(client, user, id))) return forbidden();

  const { error } = await client.from('experience_tasks').delete().eq('id', id);
  if (error) return NextResponse.json({ code: 1, message: '删除失败' }, { status: 500 });
  await writeSecurityAudit(client, {
    request,
    actor: user,
    action: 'task.delete',
    outcome: 'success',
    targetType: 'experience_task',
    targetId: id,
  });
  return NextResponse.json({ code: 0, message: '删除成功' });
}
