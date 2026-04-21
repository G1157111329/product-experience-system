import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

export async function GET(request: NextRequest) {
  const client = getSupabaseClient();
  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status');
  const product_category = searchParams.get('product_category');
  const keyword = searchParams.get('keyword');
  const created_by = searchParams.get('created_by');
  const page = parseInt(searchParams.get('page') || '1');
  const pageSize = parseInt(searchParams.get('pageSize') || '20');

  let query = client.from('experience_tasks').select('*', { count: 'exact' });

  if (status) query = query.eq('status', status);
  if (product_category) query = query.eq('product_category', product_category);
  if (keyword) query = query.or(`task_name.ilike.%${keyword}%,product_model.ilike.%${keyword}%`);
  if (created_by) query = query.eq('created_by', created_by);

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  query = query.order('created_at', { ascending: false }).range(from, to);

  const { data, error, count } = await query;
  if (error) return NextResponse.json({ code: 1, message: error.message }, { status: 500 });

  return NextResponse.json({
    code: 0,
    message: 'success',
    data: { list: data, total: count, page, pageSize },
  });
}

export async function POST(request: NextRequest) {
  const client = getSupabaseClient();
  const body = await request.json();

  const { data, error } = await client.from('experience_tasks').insert({
    task_name: body.task_name,
    product_category: body.product_category,
    product_model: body.product_model,
    project_type: body.project_type || null,
    project_phase: body.project_phase || null,
    test_date: body.test_date || null,
    organizer: body.organizer || null,
    created_by: body.created_by || null,
    target_user: body.target_user || null,
    test_purpose: body.test_purpose || null,
    test_method: body.test_method || null,
    assigned_to: body.assigned_to || null,
    selected_standards: body.selected_standards || null,
    status: '待执行',
  }).select().single();

  if (error) return NextResponse.json({ code: 1, message: error.message }, { status: 500 });
  return NextResponse.json({ code: 0, message: '创建成功', data });
}
