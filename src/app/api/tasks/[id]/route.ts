import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { canAccessTask, forbidden, isAuthResponse, requireUser } from '@/lib/server/auth';
import { writeSecurityAudit } from '@/lib/server/security-audit';
import { sortMaterialsByBinding } from '@/lib/stable-display-order';

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
    .order('created_at', { ascending: true })
    .order('id', { ascending: true });

  if (recordsError) return NextResponse.json({ code: 1, message: '检查记录查询失败' }, { status: 500 });

  const { data: materials, error: materialsError } = await client
    .from('materials')
    .select('*')
    .eq('task_id', id);

  if (materialsError) return NextResponse.json({ code: 1, message: '素材查询失败' }, { status: 500 });

  const recordRows = (records || []) as Array<Record<string, unknown>>;
  const materialRows = (materials || []) as Array<Record<string, unknown>>;
  const recordIds = recordRows.map((record) => String(record.id || '')).filter(Boolean);
  const { data: recordLinks, error: recordLinksError } = recordIds.length
    ? await client
      .from('material_links')
      .select('id, material_id, target_id, binding_order, bound_at, created_at')
      .eq('target_type', 'record')
      .in('target_id', recordIds)
    : { data: [], error: null };
  if (recordLinksError) return NextResponse.json({ code: 1, message: '绱犳潗缁戝畾鏌ヨ澶辫触' }, { status: 500 });

  const materialById = new Map(materialRows.map((material) => [String(material.id || ''), material]));
  type OrderedMaterialRow = Record<string, unknown> & { id: string; bindingOrder?: number | null; linkedAt?: string | null };
  const materialsByRecordId = new Map<string, OrderedMaterialRow[]>();
  for (const material of materialRows) {
    const recordId = String(material.record_id || '');
    if (!recordId) continue;
    const current = materialsByRecordId.get(recordId) || [];
    current.push({ ...material, id: String(material.id || '') });
    materialsByRecordId.set(recordId, current);
  }
  for (const link of recordLinks || []) {
    const recordId = String(link.target_id || '');
    const material = materialById.get(String(link.material_id));
    if (!recordId || !material) continue;
    const current = materialsByRecordId.get(recordId) || [];
    const next = current.filter((item) => String(item.id) !== String(material.id));
    next.push({
      ...material,
      id: String(material.id),
      bindingOrder: link.binding_order,
      linkedAt: link.bound_at || link.created_at,
    });
    materialsByRecordId.set(recordId, next);
  }

  const recordsWithMaterials = recordRows.map((record) => ({
    ...record,
    materials: sortMaterialsByBinding(materialsByRecordId.get(String(record.id || '')) || []),
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
