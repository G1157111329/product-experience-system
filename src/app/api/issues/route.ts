import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { canAccessTask, canReadReport, forbidden, isAuthResponse, requireUser } from '@/lib/server/auth';

export async function GET(request: NextRequest) {
  const client = getSupabaseClient();
  const user = await requireUser(request, client);
  if (isAuthResponse(user)) return user;

  const { searchParams } = new URL(request.url);
  const task_id = searchParams.get('task_id');
  const status = searchParams.get('status');
  const severity = searchParams.get('severity');
  const keyword = searchParams.get('keyword');
  const source_report_id = searchParams.get('source_report_id');
  const task_ids = searchParams.get('task_ids'); // comma-separated, for user data isolation
  const limit = Math.min(500, Math.max(1, parseInt(searchParams.get('limit') || '100', 10)));
  const offset = Math.max(0, parseInt(searchParams.get('offset') || '0', 10) || 0);

  let query = client.from('issues').select('*', { count: 'exact' });
  if (task_id) query = query.eq('task_id', task_id);
  if (source_report_id) {
    if (!(await canReadReport(client, user, source_report_id))) return forbidden();
    query = query.eq('source_report_id', source_report_id);
  }
  if (status) query = query.eq('status', status);
  if (severity) query = query.eq('level', severity);
  if (keyword) query = query.ilike('title', `%${keyword}%`);
  if (task_ids) {
    const ids = task_ids.split(',').filter(Boolean);
    if (ids.length > 0) query = query.in('task_id', ids);
  }
  if (user.role !== 'admin' && !source_report_id) {
    const { data: userTasks } = await client.from('experience_tasks').select('id').eq('created_by', user.id);
    const userTaskIds = (userTasks || []).map((task: { id: string }) => task.id);
    if (userTaskIds.length === 0) return NextResponse.json({ code: 0, message: 'success', data: { list: [], total: 0 } });
    query = query.in('task_id', userTaskIds);
  }

  const { data, error, count } = await query.order('created_at', { ascending: false }).range(offset, offset + limit - 1);
  if (error) return NextResponse.json({ code: 1, message: error.message }, { status: 500 });

  return NextResponse.json({ code: 0, message: 'success', data: { list: data, total: count, limit, offset } });
}

export async function POST(request: NextRequest) {
  const client = getSupabaseClient();
  const user = await requireUser(request, client);
  if (isAuthResponse(user)) return user;

  const body = await request.json();
  if (!body.task_id || !(await canAccessTask(client, user, body.task_id))) return forbidden();

  const { data, error } = await client.from('issues').insert({
    task_id: body.task_id,
    record_id: body.record_id || null,
    title: body.title,
    product_model: body.product_model || null,
    category: body.category || null,
    sub_category: body.sub_category || null,
    severity: body.severity || '一般',
    priority: body.priority || 'P2',
    level: body.level || '二类',
    source: body.source || null,
    source_report_id: body.source_report_id || null,
    source_type: body.source_type || null,
    description: body.description || null,
    is_improve: body.is_improve ?? true,
    no_improve_reason: body.no_improve_reason || null,
    improve_plan: body.improve_plan || null,
    responsible_dept: body.responsible_dept || null,
    responsible_person: body.responsible_person || null,
    plan_complete_date: body.plan_complete_date || null,
    status: '待整改',
  }).select().single();

  if (error) return NextResponse.json({ code: 1, message: error.message }, { status: 500 });
  return NextResponse.json({ code: 0, message: '创建成功', data });
}
