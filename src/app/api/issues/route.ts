import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

export async function GET(request: NextRequest) {
  const client = getSupabaseClient();
  const { searchParams } = new URL(request.url);
  const task_id = searchParams.get('task_id');
  const status = searchParams.get('status');
  const severity = searchParams.get('severity');
  const keyword = searchParams.get('keyword');

  let query = client.from('issues').select('*', { count: 'exact' });
  if (task_id) query = query.eq('task_id', task_id);
  if (status) query = query.eq('status', status);
  if (severity) query = query.eq('level', severity); // map severity filter to level
  if (keyword) query = query.ilike('title', `%${keyword}%`);

  const { data, error, count } = await query.order('created_at', { ascending: false }).limit(100);
  if (error) return NextResponse.json({ code: 1, message: error.message }, { status: 500 });

  return NextResponse.json({ code: 0, message: 'success', data: { list: data, total: count } });
}

export async function POST(request: NextRequest) {
  const client = getSupabaseClient();
  const body = await request.json();

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
